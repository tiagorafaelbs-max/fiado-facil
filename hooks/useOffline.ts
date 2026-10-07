import { useState, useEffect, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import { Alert, Platform } from 'react-native'
import { supabase } from '../lib/supabase'
import { reconciliarPagoCliente } from '../lib/reconciliacao'

const FILA_KEY = '@fiado_fila_offline'

export interface OperacaoOffline {
  id: string
  tabela: string
  operacao: 'insert' | 'update' | 'delete'
  dados: Record<string, any>
  criado_em: string
}

// Trava da fila: serializa só as operações de AsyncStorage (ler+anexar no
// enfileirar; reler+remover ids no fim da sincronização) -- de propósito NÃO cobre
// as chamadas de rede da sincronização. Cobrir a sincronização inteira (como a
// primeira versão desta correção fazia) resolvia a perda de lançamento, mas fazia
// um enfileirarOperacao() durante uma sincronização esperar a rede terminar: com
// conexão ruim, o "Salvar" de uma venda offline travava dezenas de segundos ou
// indefinidamente (achado do Fiscal/Tiago revisando o commit 1530f6a). Como só as
// leituras/escritas no AsyncStorage passam pela trava (rápidas, sem I/O de rede),
// enfileirar nunca fica bloqueado por uma sincronização em andamento.
let travaDaFila: Promise<unknown> = Promise.resolve()

function comTravaDaFila<T>(tarefa: () => Promise<T>): Promise<T> {
  const resultado = travaDaFila.then(tarefa, tarefa)
  // Nunca deixa uma tarefa rejeitada travar a fila pra sempre -- a próxima tarefa
  // sempre roda, independente do resultado da anterior.
  travaDaFila = resultado.catch(() => {})
  return resultado
}

// Avisa as telas quando a fila muda: 'enfileirou' (nova operação local, a tela
// pode mostrar o lançamento como pendente) e 'sincronizou' (itens foram pro banco,
// a tela precisa recarregar saldo/histórico -- achado do Tiago: depois de religar a
// internet a fila sincronizava, mas a tela do cliente ficava com o saldo antigo).
export type EventoFila = 'enfileirou' | 'sincronizou'
const ouvintesDaFila = new Set<(evento: EventoFila) => void>()

export function assinarEventosDaFila(ouvinte: (evento: EventoFila) => void): () => void {
  ouvintesDaFila.add(ouvinte)
  return () => { ouvintesDaFila.delete(ouvinte) }
}

function emitirEventoDaFila(evento: EventoFila) {
  ouvintesDaFila.forEach(ouvinte => {
    try { ouvinte(evento) } catch { /* um ouvinte quebrado não pode travar os outros */ }
  })
}

export function enfileirarOperacao(op: Omit<OperacaoOffline, 'id' | 'criado_em'>): Promise<void> {
  return comTravaDaFila(async () => {
    const fila = await carregarFila()
    const nova: OperacaoOffline = {
      ...op,
      id: Math.random().toString(36).slice(2),
      criado_em: new Date().toISOString(),
    }
    await AsyncStorage.setItem(FILA_KEY, JSON.stringify([...fila, nova]))
  }).then(() => emitirEventoDaFila('enfileirou'))
}

// Lançamentos (venda/pagamento) deste cliente que ainda estão só na fila local.
export async function listarLancamentosPendentes(clienteId: string): Promise<OperacaoOffline[]> {
  const fila = await carregarFila()
  return fila.filter(op =>
    op.operacao === 'insert' &&
    (op.tabela === 'vendas' || op.tabela === 'pagamentos') &&
    op.dados.cliente_id === clienteId
  )
}

async function carregarFila(): Promise<OperacaoOffline[]> {
  try {
    const raw = await AsyncStorage.getItem(FILA_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

const TIMEOUT_SYNC_MS = 15000

function sinalComTimeout(ms: number = TIMEOUT_SYNC_MS): AbortSignal {
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}

// Exportado pro caminho "online" de criar()/registrarPagamento() em
// useVendas.ts -- achado do Fiscal: sem timeout nenhum, um wifi conectado mas
// sem internet de verdade travava o insert por dezenas de segundos (timeout de
// TCP do sistema) em vez de cair pra fila offline.
export function sinalComTimeoutDeEscrita(): AbortSignal {
  return sinalComTimeout(8000)
}

async function sincronizarFilaInterno(): Promise<number> {
  // Leitura solta, sem trava: é só um retrato do que tentar processar agora -- não
  // gera escrita baseada nela (a escrita final relê o estado atual de verdade).
  const fila = await carregarFila()
  if (fila.length === 0) return 0

  // A fila é uma só por aparelho. Em celular compartilhado, o lançamento de um funcionário que saiu NÃO pode
  // ser enviado com o login de outra pessoa: o banco grava o autor pelo login (criado_por = auth.uid()) e a
  // autoria sairia errada. Cada operação só sincroniza na sessão de quem a criou; as outras ficam na fila até
  // essa pessoa entrar de novo. Sem sessão não há o que enviar.
  const { data: { session } } = await supabase.auth.getSession()
  const meuId = session?.user?.id
  if (!meuId) return 0

  let sincronizados = 0
  const idsSincronizados = new Set<string>()
  // Pagamentos que o banco recusou por a venda escolhida não existir mais: reenviados sem venda_id (viram pagamento normal).
  const pagamentosSoltos: number[] = []
  // Clientes afetados por venda/pagamento sincronizado com sucesso — precisam
  // ter a flag `pago` recalculada (FIFO) contra o estado real do banco, algo
  // que não dava para fazer enquanto a operação só existia na fila local.
  const clientesParaReconciliar = new Set<string>()

  for (const op of fila) {
    if (typeof op.dados.criado_por === 'string' && op.dados.criado_por !== meuId) continue
    try {
      if (op.operacao === 'insert') {
        // Remove o id local (não é UUID válido) — Supabase gera o UUID real ao inserir
        const { id: localId, ...dadosSemId } = op.dados
        const payload = typeof localId === 'string' && localId.startsWith('local_') ? dadosSemId : op.dados
        // upsert com onConflict em client_op_id: se essa operação já foi enviada com
        // sucesso numa tentativa anterior (mas a confirmação de rede se perdeu, fazendo
        // o app achar que falhou), o conflito é ignorado em vez de criar um registro
        // duplicado — client_op_id é gerado uma única vez no aparelho, não a cada retry.
        // Só vendas/pagamentos passam por aqui hoje; ambos têm a coluna.
        const { error } = await supabase
          .from(op.tabela)
          .upsert(payload, { onConflict: 'client_op_id', ignoreDuplicates: true })
          .abortSignal(sinalComTimeout())
        if (error?.code === '23514' && /venda escolhida/i.test(error.message ?? '') && op.tabela === 'pagamentos' && payload.venda_id) {
          // 23514 = a venda escolhida foi apagada (ou não é deste cliente) antes de sincronizar. Sem isto a operação
          // ficaria na fila para sempre e o dinheiro nunca entraria: reenvia SEM venda_id (o client_op_id é o mesmo,
          // então não duplica) e avisa o usuário no fim.
          const { venda_id: _removida, ...semVenda } = payload
          const reenvio = await supabase
            .from(op.tabela)
            .upsert(semVenda, { onConflict: 'client_op_id', ignoreDuplicates: true })
            .abortSignal(sinalComTimeout())
          if (reenvio.error) throw reenvio.error
          pagamentosSoltos.push(Number(payload.valor ?? 0))
        } else if (error) {
          throw error
        }
        if ((op.tabela === 'vendas' || op.tabela === 'pagamentos') && payload.cliente_id) {
          clientesParaReconciliar.add(payload.cliente_id)
        }
      } else if (op.operacao === 'update') {
        const { id, ...dados } = op.dados
        const { error } = await supabase.from(op.tabela).update(dados).eq('id', id).abortSignal(sinalComTimeout())
        if (error) throw error
      } else if (op.operacao === 'delete') {
        const { error } = await supabase.from(op.tabela).delete().eq('id', op.dados.id).abortSignal(sinalComTimeout())
        if (error) throw error
      }
      sincronizados++
      idsSincronizados.add(op.id)
    } catch {
      // permanece na fila — não marca como sincronizado (cobre erro real e timeout)
    }
  }

  // Só esta releitura+remoção final passa pela trava -- rápida, sem chamada de rede,
  // então nunca atrasa um enfileirarOperacao() concorrente. Relê o estado atual em vez
  // de reescrever a partir do snapshot do início: preserva tanto o que falhou quanto
  // qualquer operação enfileirada durante o loop de rede acima.
  await comTravaDaFila(async () => {
    const filaAtual = await carregarFila()
    const restantes = filaAtual.filter(op => !idsSincronizados.has(op.id))
    await AsyncStorage.setItem(FILA_KEY, JSON.stringify(restantes))
  })

  if (pagamentosSoltos.length > 0 && Platform.OS !== 'web') {
    const total = pagamentosSoltos.reduce((a, b) => a + b, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    Alert.alert(
      'Pagamento ajustado',
      `A venda escolhida foi apagada antes de sincronizar. ${pagamentosSoltos.length === 1 ? 'O pagamento' : 'Os pagamentos'} de ${total} ${pagamentosSoltos.length === 1 ? 'foi registrado' : 'foram registrados'} como pagamento normal (parcela mais antiga).`,
    )
  }

  for (const clienteId of clientesParaReconciliar) {
    try {
      await reconciliarPagoCliente(clienteId)
    } catch {
      // Reconciliação falhou (ex: rede caiu de novo) — o próximo ajuste de
      // pagamento no app recalcula tudo de novo, não é uma perda permanente.
    }
  }

  return sincronizados
}

// Uma sincronização por vez no app inteiro: se já existe uma em andamento (ex: 4 telas
// com useOffline() monitorando a mesma conexão voltar ao mesmo tempo), as chamadas
// seguintes recebem a MESMA promise em vez de disparar uma sincronização concorrente.
// Não precisa da trava de AsyncStorage aqui -- sincronizarFilaInterno já usa a trava
// só no trecho que de fato escreve, então isto é só o dedup da corrida em si.
let sincronizacaoEmAndamento: Promise<number> | null = null

export function sincronizarFila(): Promise<number> {
  if (sincronizacaoEmAndamento) return sincronizacaoEmAndamento
  // O evento sai UMA vez por sincronização real (aqui, não por chamador) e só depois
  // da reconciliação do `pago` dentro de sincronizarFilaInterno -- as telas que
  // recarregam já enxergam saldo e histórico finais.
  sincronizacaoEmAndamento = sincronizarFilaInterno()
    .then(qtd => {
      if (qtd > 0) emitirEventoDaFila('sincronizou')
      return qtd
    })
    .finally(() => {
      sincronizacaoEmAndamento = null
    })
  return sincronizacaoEmAndamento
}

// Checagem local (NetInfo lê o estado que o SO já mantém, sem round-trip de
// rede) -- usada nos pontos que decidem "enfileira ou tenta direto" ANTES de
// qualquer chamada de rede, ao contrário de verificarConectividade() abaixo
// (que faz um fetch real e pode demorar vários segundos quando a rede está
// instável, não só totalmente desligada). Achado do Tiago: pagamento/venda
// offline demorava 10-15s e se perdia se o app fosse fechado nesse meio-tempo
// -- a demora era ANTES de enfileirar, então nada tinha sido salvo ainda.
export async function estaOnlineRapido(): Promise<boolean> {
  try {
    const estado = await NetInfo.fetch()
    // isInternetReachable também entra: isConnected só diz se há uma interface
    // de rede (ex: wifi conectado sem internet de verdade) -- achado do Fiscal,
    // sem isso o caminho "direto" (sem timeout) seria tentado num wifi morto.
    if (estado.isConnected === false || estado.isInternetReachable === false) return false
    return true
  } catch {
    // NetInfo indisponível por algum motivo -- assume online e deixa a
    // tentativa de rede real decidir (comportamento de antes desta função existir).
    return true
  }
}

export async function verificarConectividade(): Promise<boolean> {
  try {
    // Usa AbortController manual — compatível com Hermes/Android
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    await fetch('https://www.google.com', { method: 'HEAD', signal: controller.signal })
    clearTimeout(timer)
    return true
  } catch {
    return false
  }
}

export function useOffline() {
  const [online, setOnline] = useState(true)
  const [pendentes, setPendentes] = useState(0)
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Atualiza contagem de pendentes
  const atualizarPendentes = async () => {
    const fila = await carregarFila()
    setPendentes(fila.length)
    return fila.length
  }

  useEffect(() => {
    if (Platform.OS === 'web') {
      const atualizar = () => setOnline(navigator.onLine)
      window.addEventListener('online', atualizar)
      window.addEventListener('offline', atualizar)
      setOnline(navigator.onLine)
      atualizarPendentes()
      return () => {
        window.removeEventListener('online', atualizar)
        window.removeEventListener('offline', atualizar)
      }
    }

    // Nativo: checar imediatamente + poll a cada 10s
    const verificar = async () => {
      const conectado = await verificarConectividade()
      setOnline(conectado)
    }

    verificar() // check imediato — sem esperar 10s para saber se está offline
    intervaloRef.current = setInterval(verificar, 10000)
    atualizarPendentes()

    return () => { if (intervaloRef.current) clearInterval(intervaloRef.current) }
  }, [])

  // Ao voltar online: sempre tenta sincronizar fila
  useEffect(() => {
    if (!online) return
    const tentar = async () => {
      const qtd = await atualizarPendentes()
      if (qtd > 0) {
        try {
          await sincronizarFila()
        } catch (e: any) {
          // sincronizarFilaInterno já trata erro por operação -- isto é só uma rede
          // de segurança contra uma falha inesperada não capturada lá dentro, pra
          // não virar uma promise rejeitada sem dono (observação do Fiscal).
          console.warn('[offline] sincronizarFila falhou:', e?.message ?? e)
        }
        await atualizarPendentes()
      }
    }
    tentar()
  }, [online])

  return { online, pendentes }
}

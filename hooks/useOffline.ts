import { useState, useEffect, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { supabase } from '../lib/supabase'
import { reconciliarPagoCliente } from '../lib/reconciliacao'

const FILA_KEY = '@fiado_fila_offline'

interface OperacaoOffline {
  id: string
  tabela: string
  operacao: 'insert' | 'update' | 'delete'
  dados: Record<string, any>
  criado_em: string
}

// Trava global da fila: serializa TODO acesso de leitura+escrita (enfileirar E
// sincronizar) numa fila de promises só. Sem isso, useOffline() montado em 4 telas
// ao mesmo tempo dispara sincronizarFila() concorrente em cada uma, e um
// enfileirarOperacao() no meio de uma sincronização corre pra gravar a fila ao mesmo
// tempo que o setItem(restantes) do final da sincronização -- quem grava por último
// vence, e a operação enfileirada no meio some (achado do Tiago, bloqueante pro 1.0.12).
let travaDaFila: Promise<unknown> = Promise.resolve()

function comTravaDaFila<T>(tarefa: () => Promise<T>): Promise<T> {
  const resultado = travaDaFila.then(tarefa, tarefa)
  // Nunca deixa uma tarefa rejeitada travar a fila pra sempre -- a próxima tarefa
  // sempre roda, independente do resultado da anterior.
  travaDaFila = resultado.catch(() => {})
  return resultado
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
  })
}

async function carregarFila(): Promise<OperacaoOffline[]> {
  try {
    const raw = await AsyncStorage.getItem(FILA_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

async function sincronizarFilaInterno(): Promise<number> {
  const fila = await carregarFila()
  if (fila.length === 0) return 0

  let sincronizados = 0
  const idsSincronizados = new Set<string>()
  // Clientes afetados por venda/pagamento sincronizado com sucesso — precisam
  // ter a flag `pago` recalculada (FIFO) contra o estado real do banco, algo
  // que não dava para fazer enquanto a operação só existia na fila local.
  const clientesParaReconciliar = new Map<string, string>() // cliente_id -> usuario_id

  for (const op of fila) {
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
        if (error) throw error
        if ((op.tabela === 'vendas' || op.tabela === 'pagamentos') && payload.cliente_id && payload.usuario_id) {
          clientesParaReconciliar.set(payload.cliente_id, payload.usuario_id)
        }
      } else if (op.operacao === 'update') {
        const { id, ...dados } = op.dados
        const { error } = await supabase.from(op.tabela).update(dados).eq('id', id)
        if (error) throw error
      } else if (op.operacao === 'delete') {
        const { error } = await supabase.from(op.tabela).delete().eq('id', op.dados.id)
        if (error) throw error
      }
      sincronizados++
      idsSincronizados.add(op.id)
    } catch {
      // permanece na fila — não marca como sincronizado
    }
  }

  // Relê a fila atual em vez de reescrever a partir do snapshot do início: mesmo com
  // a trava, o loop acima faz vários `await` (chamadas de rede), então preserva
  // qualquer operação que tenha entrado nesse meio tempo — remove só os ids que de
  // fato sincronizaram com sucesso, nunca sobrescreve a fila inteira.
  const filaAtual = await carregarFila()
  const restantes = filaAtual.filter(op => !idsSincronizados.has(op.id))
  await AsyncStorage.setItem(FILA_KEY, JSON.stringify(restantes))

  for (const [clienteId, usuarioId] of clientesParaReconciliar) {
    try {
      await reconciliarPagoCliente(clienteId, usuarioId)
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
let sincronizacaoEmAndamento: Promise<number> | null = null

export function sincronizarFila(): Promise<number> {
  if (sincronizacaoEmAndamento) return sincronizacaoEmAndamento
  sincronizacaoEmAndamento = comTravaDaFila(sincronizarFilaInterno).finally(() => {
    sincronizacaoEmAndamento = null
  })
  return sincronizacaoEmAndamento
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
        await sincronizarFila()
        await atualizarPendentes()
      }
    }
    tentar()
  }, [online])

  return { online, pendentes }
}

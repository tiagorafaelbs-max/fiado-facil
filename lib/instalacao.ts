import AsyncStorage from '@react-native-async-storage/async-storage'
import { lerInfoApp, type InfoApp } from './dispositivo'
import { aparelhoJaTeveConta } from './primeiroAcesso'
import { gerarUUID } from './uuid'
import { supabase } from './supabase'

// Funil ANÔNIMO (docs/release/DESENHO-instalacoes-app.md). Grava em public.instalacoes_app: só um ID aleatório da
// instalação, a etapa, a plataforma e a versão do app (+ um código curto de erro em "detalhe"). Sem e-mail, nome,
// telefone, modelo, IP nem vínculo com a conta. O banco só aceita INSERT por anon (sem SELECT/UPDATE): por isso o
// insert NUNCA pede a linha de volta (nada de .select()) e "já gravou" (23505) é sucesso.
// Falha em silêncio e tenta de novo na próxima vez: medir não pode atrapalhar o app.

// 1) Funil de INSTALAÇÃO: só aparelho novo, cada etapa uma vez na vida da instalação.
export type EtapaFunil = 'abriu' | 'cadastro' | 'conta' | 'entrou'

// 2) Funil de COMPRA: TODO aparelho (novo ou antigo), no máximo 1 linha por etapa por dia.
export type EventoCompra =
  | 'limite'           // bateu o limite do grátis (detalhe: clientes | cobrancas)
  | 'planos'           // abriu a tela Planos
  | 'compra'           // tocou em Assinar
  | 'compra_cancelou'  // fechou a tela de compra da loja
  | 'compra_erro'      // erro na compra (detalhe: código do erro)
  | 'compra_ok'        // compra confirmada e Pro ativado
  | 'loja_erro'        // a loja não devolveu os produtos/preço (detalhe: motivo)

const CHAVE_ID = '@fiado_instalacao_id'
const CHAVE_ETAPAS = '@fiado_etapas_enviadas'
const CHAVE_NOVA = '@fiado_instalacao_nova'   // '1' = aparelho NOVO no 1º uso (entra no funil de instalação); '0' = já usava o app antes
const CHAVE_EVENTOS_DIA = '@fiado_eventos_do_dia'
const TIMEOUT_MS = 6000

const emAndamento = new Set<string>()
let preparacao: Promise<boolean> | null = null

// Decide UMA vez se esta instalação entra no funil de instalação: só aparelho novo (sem conta anterior neste aparelho).
// Quem já usava o app antes desta versão não conta como "abriu", senão o funil misturaria base antiga com novatos.
async function instalacaoNova(): Promise<boolean> {
  if (!preparacao) {
    preparacao = (async () => {
      const guardado = await AsyncStorage.getItem(CHAVE_NOVA)
      if (guardado === '1') return true
      if (guardado === '0') return false
      // Quem já tem sessão ativa é usuário antigo, mesmo sem as marcas locais (ex.: ainda não fez o tour):
      // um aparelho realmente novo decide no "abriu", antes de qualquer sessão.
      const { data: { session } } = await supabase.auth.getSession()
      const nova = !session && !(await aparelhoJaTeveConta())
      await AsyncStorage.setItem(CHAVE_NOVA, nova ? '1' : '0')
      return nova
    })().catch(() => false)
  }
  return preparacao
}

async function lerOuCriarId(): Promise<string> {
  const atual = await AsyncStorage.getItem(CHAVE_ID)
  if (atual) return atual
  const novo = gerarUUID()
  await AsyncStorage.setItem(CHAVE_ID, novo)
  return novo
}

async function lerEnviadas(): Promise<EtapaFunil[]> {
  try {
    const bruto = await AsyncStorage.getItem(CHAVE_ETAPAS)
    const lista = bruto ? JSON.parse(bruto) : []
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}

// Só o que o banco aceita em "detalhe": letras, números e _ . : - (até 60). Nunca texto livre.
export function limparDetalhe(d?: unknown): string | null {
  if (d === undefined || d === null) return null
  const s = String(d).replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 60)
  return s.length > 0 ? s : null
}

// Dia de São Paulo (UTC-3, sem horário de verão), o mesmo critério do gatilho do banco.
export function diaDeSaoPaulo(agora = Date.now()): string {
  return new Date(agora - 3 * 3600 * 1000).toISOString().slice(0, 10)
}

// Insert único: devolve true se a linha ficou gravada (ou já estava: 23505).
async function enviar(info: InfoApp, etapa: string, detalhe: string | null): Promise<boolean> {
  const instalacao_id = await lerOuCriarId()
  const controlador = new AbortController()
  const timer = setTimeout(() => controlador.abort(), TIMEOUT_MS)
  let erro: { code?: string } | null = null
  try {
    const linha: Record<string, unknown> = {
      instalacao_id,
      etapa,
      plataforma: info.plataforma,
      versao_app: info.versao_app ?? '0',
      build: info.build,
      runtime_version: info.runtime_version,
    }
    if (detalhe) linha.detalhe = detalhe
    const resp = await supabase.from('instalacoes_app').insert(linha).abortSignal(controlador.signal)
    erro = resp.error
  } finally {
    clearTimeout(timer)
  }
  return !erro || erro.code === '23505'
}

export async function registrarEtapa(etapa: EtapaFunil): Promise<void> {
  if (emAndamento.has(etapa)) return
  emAndamento.add(etapa)
  try {
    const info = lerInfoApp()
    if (!info) return                                   // web
    if (!(await instalacaoNova())) return               // já usava o app: fora do funil
    const enviadas = await lerEnviadas()
    if (enviadas.includes(etapa)) return

    if (await enviar(info, etapa, null)) {
      await AsyncStorage.setItem(CHAVE_ETAPAS, JSON.stringify([...enviadas, etapa]))
    }
  } catch {
    // sem rede, tempo esgotado, limite do freio (54000): tenta de novo na próxima abertura
  } finally {
    emAndamento.delete(etapa)
  }
}

// Funil de compra: vale para TODO aparelho, no máximo 1 linha por etapa por dia (o banco também garante, pela chave
// instalacao_id + etapa + dia). Falhas não marcam como enviado: tenta de novo na próxima vez que o evento acontecer.
export async function registrarEvento(etapa: EventoCompra, detalhe?: unknown): Promise<void> {
  const chave = 'ev:' + etapa
  if (emAndamento.has(chave)) return
  emAndamento.add(chave)
  try {
    const info = lerInfoApp()
    if (!info) return
    const hoje = diaDeSaoPaulo()
    let feitos: string[] = []
    try {
      const bruto = await AsyncStorage.getItem(CHAVE_EVENTOS_DIA)
      const lido = bruto ? JSON.parse(bruto) : null
      if (lido && lido.dia === hoje && Array.isArray(lido.feitos)) feitos = lido.feitos
    } catch { /* recomeça */ }
    if (feitos.includes(etapa)) return

    if (await enviar(info, etapa, limparDetalhe(detalhe))) {
      await AsyncStorage.setItem(CHAVE_EVENTOS_DIA, JSON.stringify({ dia: hoje, feitos: [...feitos, etapa] }))
    }
  } catch {
    // silencioso
  } finally {
    emAndamento.delete(chave)
  }
}

// Atalho para chamar de qualquer tela sem await e sem nunca lançar.
export function evento(etapa: EventoCompra, detalhe?: unknown): void {
  registrarEvento(etapa, detalhe).catch(() => {})
}

// Chamado ao abrir o app (antes de qualquer login).
export function iniciarFunilInstalacao(): void {
  registrarEtapa('abriu').catch(() => {})
}

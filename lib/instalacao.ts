import AsyncStorage from '@react-native-async-storage/async-storage'
import { lerInfoApp } from './dispositivo'
import { aparelhoJaTeveConta } from './primeiroAcesso'
import { gerarUUID } from './uuid'
import { supabase } from './supabase'

// Funil ANÔNIMO instalou → abriu → cadastro → conta → entrou (docs/release/DESENHO-instalacoes-app.md).
// Grava em public.instalacoes_app: só um ID aleatório da instalação, a etapa, a plataforma e a versão do app.
// Sem e-mail, nome, telefone, modelo, IP nem vínculo com a conta. O banco só aceita INSERT por anon (sem
// SELECT/UPDATE): por isso o insert NUNCA pede a linha de volta (nada de .select()) e "já gravou" (23505) é sucesso.
// Falha em silêncio e tenta de novo na próxima vez: medir não pode atrapalhar o app.

export type EtapaFunil = 'abriu' | 'cadastro' | 'conta' | 'entrou'

const CHAVE_ID = '@fiado_instalacao_id'
const CHAVE_ETAPAS = '@fiado_etapas_enviadas'
const CHAVE_NOVA = '@fiado_instalacao_nova'   // '1' = aparelho NOVO no 1º uso (entra no funil); '0' = já usava o app antes
const TIMEOUT_MS = 6000

const emAndamento = new Set<EtapaFunil>()
let preparacao: Promise<boolean> | null = null

// Decide UMA vez se esta instalação entra no funil: só aparelho novo (sem conta anterior neste aparelho).
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

export async function registrarEtapa(etapa: EtapaFunil): Promise<void> {
  if (emAndamento.has(etapa)) return
  emAndamento.add(etapa)
  try {
    const info = lerInfoApp()
    if (!info) return                                   // web
    if (!(await instalacaoNova())) return               // já usava o app: fora do funil
    const enviadas = await lerEnviadas()
    if (enviadas.includes(etapa)) return

    const instalacao_id = await lerOuCriarId()
    const controlador = new AbortController()
    const timer = setTimeout(() => controlador.abort(), TIMEOUT_MS)
    let erro: { code?: string } | null = null
    try {
      const resp = await supabase
        .from('instalacoes_app')
        .insert({
          instalacao_id,
          etapa,
          plataforma: info.plataforma,
          versao_app: info.versao_app ?? '0',
          build: info.build,
          runtime_version: info.runtime_version,
        })
        .abortSignal(controlador.signal)
      erro = resp.error
    } finally {
      clearTimeout(timer)
    }

    // 23505 = esta etapa desta instalação já estava gravada: conta como enviada.
    if (!erro || erro.code === '23505') {
      await AsyncStorage.setItem(CHAVE_ETAPAS, JSON.stringify([...enviadas, etapa]))
    }
  } catch {
    // sem rede, tempo esgotado, limite do freio (54000): tenta de novo na próxima abertura
  } finally {
    emAndamento.delete(etapa)
  }
}

// Chamado ao abrir o app (antes de qualquer login).
export function iniciarFunilInstalacao(): void {
  registrarEtapa('abriu').catch(() => {})
}

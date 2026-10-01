import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import { supabase } from './supabase'

// Cacheado por userId (quem está logado, dono ou funcionário) -- escrito sempre
// que a resolução online der certo, lido quando o aparelho está offline pra evitar
// a query de rede que hoje trava a tela (achado do Tiago: "pagamento offline demora
// 10-15s e se perde" e "Início zerado offline" vêm do mesmo lugar -- toda escrita
// offline e a tela inicial dependem de resolverTenantId() antes de mais nada).
const CONTEXTO_CACHE_PREFIX = '@fiado_contexto_equipe:'

export interface Permissoes {
  excluir_venda: boolean
  editar_venda: boolean
}

export const PERMISSOES_PADRAO: Permissoes = {
  excluir_venda: false,
  editar_venda: true,
}

export interface ContextoEquipe {
  tenantId: string
  souFuncionario: boolean
  nomeExibicao: string | null
  permissoes: Permissoes
}

// Resolve o id do "dono" (tenant) de quem está logado agora.
// Se for um funcionário ativo, retorna o dono_id da conta a que pertence.
// Se for o próprio dono (ou ninguém cadastrado em membros_equipe), retorna o próprio id —
// idêntico ao comportamento atual, então nenhum código existente quebra.
export async function obterContextoEquipe(userId: string): Promise<ContextoEquipe> {
  const cacheKey = CONTEXTO_CACHE_PREFIX + userId

  // NetInfo é local (não bate na rede) -- checar antes evita a query de rede sem
  // timeout abaixo travar a tela por vários segundos enquanto o aparelho está
  // sabidamente offline. isInternetReachable entra também -- achado do Fiscal:
  // isConnected sozinho não cobre wifi conectado sem internet de verdade, e sem
  // isso essa query (sem timeout, GET com retry automático do postgrest-js)
  // ficava presa por 7s+ antes mesmo de decidir enfileirar o pagamento.
  const estadoRede = await NetInfo.fetch().catch(() => null)
  if (estadoRede && (estadoRede.isConnected === false || estadoRede.isInternetReachable === false)) {
    const doCache = await lerContextoDoCache(cacheKey, userId)
    if (doCache) return doCache
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4500)
    const { data, error } = await supabase
      .from('membros_equipe')
      .select('dono_id, nome, permissoes')
      .eq('membro_id', userId)
      .eq('status', 'ativo')
      .abortSignal(controller.signal)
      .maybeSingle()
    clearTimeout(timer)
    if (error) throw error

    const contexto: ContextoEquipe = !data
      ? { tenantId: userId, souFuncionario: false, nomeExibicao: null, permissoes: PERMISSOES_PADRAO }
      : {
          tenantId: data.dono_id,
          souFuncionario: true,
          nomeExibicao: data.nome,
          permissoes: { ...PERMISSOES_PADRAO, ...(data.permissoes ?? {}) },
        }

    AsyncStorage.setItem(cacheKey, JSON.stringify(contexto)).catch(() => {})
    return contexto
  } catch {
    // Rede falhou mesmo com NetInfo achando que tinha conexão (ex: wifi sem
    // internet real) -- mesmo fallback do caminho offline acima.
    const doCache = await lerContextoDoCache(cacheKey, userId)
    if (doCache) return doCache
    return { tenantId: userId, souFuncionario: false, nomeExibicao: null, permissoes: PERMISSOES_PADRAO }
  }
}

async function lerContextoDoCache(cacheKey: string, userId: string): Promise<ContextoEquipe | null> {
  try {
    const cache = await AsyncStorage.getItem(cacheKey)
    if (cache) return JSON.parse(cache)
  } catch { /* sem cache -- quem chamou decide o fallback */ }
  return null
}

// Atalho para os call sites que só precisam do id do tenant (a maioria dos hooks de dados).
export async function resolverTenantId(userId: string): Promise<string> {
  const ctx = await obterContextoEquipe(userId)
  return ctx.tenantId
}

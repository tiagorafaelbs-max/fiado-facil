import { supabase } from './supabase'

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
  const { data } = await supabase
    .from('membros_equipe')
    .select('dono_id, nome, permissoes')
    .eq('membro_id', userId)
    .eq('status', 'ativo')
    .maybeSingle()

  if (!data) {
    return { tenantId: userId, souFuncionario: false, nomeExibicao: null, permissoes: PERMISSOES_PADRAO }
  }

  return {
    tenantId: data.dono_id,
    souFuncionario: true,
    nomeExibicao: data.nome,
    permissoes: { ...PERMISSOES_PADRAO, ...(data.permissoes ?? {}) },
  }
}

// Atalho para os call sites que só precisam do id do tenant (a maioria dos hooks de dados).
export async function resolverTenantId(userId: string): Promise<string> {
  const ctx = await obterContextoEquipe(userId)
  return ctx.tenantId
}

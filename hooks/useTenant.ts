import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { obterContextoEquipe, PERMISSOES_PADRAO, type ContextoEquipe } from '../lib/tenant'

const PADRAO: ContextoEquipe = {
  tenantId: '',
  souFuncionario: false,
  nomeExibicao: null,
  permissoes: PERMISSOES_PADRAO,
}

// Expõe o contexto de equipe de quem está logado: se é o dono ou um funcionário,
// qual é o tenant (dono da conta) a usar em todas as queries, e as permissões dele.
export function useTenant() {
  const [contexto, setContexto] = useState<ContextoEquipe>(PADRAO)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let ativo = true

    const carregar = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        if (ativo) { setContexto(PADRAO); setCarregando(false) }
        return
      }
      const ctx = await obterContextoEquipe(session.user.id)
      if (ativo) { setContexto(ctx); setCarregando(false) }
    }

    carregar()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => carregar())
    return () => { ativo = false; subscription.unsubscribe() }
  }, [])

  return { ...contexto, carregando }
}

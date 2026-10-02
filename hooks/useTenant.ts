import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { obterContextoEquipe, PERMISSOES_PADRAO, type ContextoEquipe } from '../lib/tenant'

const PADRAO: ContextoEquipe = {
  tenantId: '',
  souFuncionario: false,
  nomeExibicao: null,
  permissoes: PERMISSOES_PADRAO,
  papelConfirmado: false,
}

// Expõe o contexto de equipe de quem está logado: se é o dono ou um funcionário,
// qual é o tenant (dono da conta) a usar em todas as queries, e as permissões dele.
export function useTenant() {
  const [contexto, setContexto] = useState<ContextoEquipe>(PADRAO)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let ativo = true
    let tentativaDeNovo: ReturnType<typeof setTimeout> | null = null
    // Descarta resposta velha: carregar() roda no mount e de novo no INITIAL_SESSION;
    // uma resposta lenta/falha não pode sobrescrever uma mais nova já confirmada.
    let sequencia = 0

    const carregar = async () => {
      const minha = ++sequencia
      if (tentativaDeNovo) { clearTimeout(tentativaDeNovo); tentativaDeNovo = null }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        if (ativo && minha === sequencia) { setContexto(PADRAO); setCarregando(false) }
        return
      }
      const ctx = await obterContextoEquipe(session.user.id)
      if (!ativo || minha !== sequencia) return
      // Só troca o estado se algo mudou: no retry de 6s (papel não confirmado) um objeto novo
      // a cada tentativa re-renderizaria todas as telas que usam useTenant à toa.
      setContexto(prev =>
        prev.tenantId === ctx.tenantId && prev.souFuncionario === ctx.souFuncionario &&
        prev.papelConfirmado === ctx.papelConfirmado && prev.nomeExibicao === ctx.nomeExibicao &&
        JSON.stringify(prev.permissoes) === JSON.stringify(ctx.permissoes)
          ? prev
          : ctx,
      )
      setCarregando(false)
      // Papel não confirmado (sem cache e sem rede): tenta de novo até confirmar --
      // "assim que o papel carregar como dono, os totais aparecem".
      if (!ctx.papelConfirmado) tentativaDeNovo = setTimeout(carregar, 6000)
    }

    carregar()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => carregar())
    return () => {
      ativo = false
      if (tentativaDeNovo) clearTimeout(tentativaDeNovo)
      subscription.unsubscribe()
    }
  }, [])

  // Totais agregados (total em aberto, total de Cobranças, relatórios) só aparecem com
  // o papel CONFIRMADO como dono: enquanto carrega, ou se não deu pra confirmar
  // (sem cache e sem rede), ficam escondidos. Só EXIBIÇÃO -- ações não dependem disto.
  const podeVerTotais = !carregando && contexto.papelConfirmado && !contexto.souFuncionario
  return { ...contexto, carregando, podeVerTotais }
}

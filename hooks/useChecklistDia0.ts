import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const JANELA_DIAS = 2

interface EstadoChecklist {
  visivel: boolean
  primeiroCliente: boolean
  primeiraVenda: boolean
  segundoCliente: boolean
  segundaVenda: boolean
  carregando: boolean
}

const ESTADO_INICIAL: EstadoChecklist = {
  visivel: false, primeiroCliente: false, primeiraVenda: false,
  segundoCliente: false, segundaVenda: false, carregando: true,
}

// Checklist leve do primeiro dia (aprovado 29/09): mostra "1º cliente · 1ª venda ·
// 2º cliente · 2ª venda" só nos primeiros dias de uso e some sozinho quando os 4
// passos são concluídos ou quando o usuário dispensa. checklist_dia0_completado_em
// registra quem/quando completou, para medir ativação depois.
export function useChecklistDia0(tenantId: string | undefined) {
  const [estado, setEstado] = useState<EstadoChecklist>(ESTADO_INICIAL)

  const carregar = useCallback(async () => {
    if (!tenantId) return
    const [
      { data: perfil, error: erroPerfil },
      { count: totalClientes, error: erroClientes },
      { count: totalVendas, error: erroVendas },
    ] = await Promise.all([
      supabase.from('perfis')
        .select('criado_em, checklist_dia0_completado_em, checklist_dia0_dispensado')
        .eq('id', tenantId).single(),
      supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('usuario_id', tenantId),
      supabase.from('vendas').select('id', { count: 'exact', head: true }).eq('usuario_id', tenantId),
    ])
    // Falha de rede: mantém o estado (visível ou não) como estava, em vez de
    // recalcular com contagens zeradas por falha e mostrar "primeiros passos"
    // pra uma conta que já tem clientes/vendas de verdade (achado do Tiago).
    if (erroPerfil || erroClientes || erroVendas) {
      setEstado(prev => ({ ...prev, carregando: false }))
      return
    }

    const clientes = totalClientes ?? 0
    const vendas = totalVendas ?? 0
    const passos = {
      primeiroCliente: clientes >= 1,
      primeiraVenda: vendas >= 1,
      segundoCliente: clientes >= 2,
      segundaVenda: vendas >= 2,
    }
    const todosCompletos = passos.primeiroCliente && passos.primeiraVenda && passos.segundoCliente && passos.segundaVenda

    if (todosCompletos && !perfil?.checklist_dia0_completado_em) {
      await supabase.from('perfis')
        .update({ checklist_dia0_completado_em: new Date().toISOString() })
        .eq('id', tenantId)
    }

    const dentroDaJanela = perfil?.criado_em
      ? Date.now() - new Date(perfil.criado_em).getTime() < JANELA_DIAS * 24 * 60 * 60 * 1000
      : true
    const visivel = dentroDaJanela && !perfil?.checklist_dia0_dispensado && !todosCompletos

    setEstado({ ...passos, visivel, carregando: false })
  }, [tenantId])

  useEffect(() => { carregar() }, [carregar])

  const dispensar = useCallback(async () => {
    if (!tenantId) return
    setEstado(prev => ({ ...prev, visivel: false }))
    await supabase.from('perfis').update({ checklist_dia0_dispensado: true }).eq('id', tenantId)
  }, [tenantId])

  return { ...estado, dispensar, recarregar: carregar }
}

import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { resolverTenantId } from '../lib/tenant'
import type { Cliente } from '../types'

export function useClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const buscar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { setCarregando(false); return }
      const tenantId = await resolverTenantId(session.user.id)
      const { data, error } = await supabase
        .from('clientes_com_saldo')
        .select('*')
        .eq('usuario_id', tenantId)
        .eq('ativo', true)
        .order('nome')

      if (error) throw error
      // Vencidos sempre no topo, depois alfabético
      const sorted = (data ?? []).sort((a: any, b: any) => {
        if (a.status_pagamento === 'vencido' && b.status_pagamento !== 'vencido') return -1
        if (a.status_pagamento !== 'vencido' && b.status_pagamento === 'vencido') return 1
        return 0
      })
      setClientes(sorted)
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }, [])

  const criar = useCallback(async (dados: Omit<Cliente, 'id' | 'usuario_id' | 'criado_em' | 'ativo'>) => {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) throw new Error('Sessão expirada. Faça login novamente.')
    const tenantId = await resolverTenantId(user.id)

    // Verificar limite do plano gratuito (plano é sempre o da conta/tenant, não de quem está logado)
    const { data: perfil } = await supabase.from('perfis').select('plano').eq('id', tenantId).single()
    if (perfil?.plano === 'gratuito') {
      const { count } = await supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('usuario_id', tenantId).eq('ativo', true)
      if ((count ?? 0) >= 10) throw new Error('Você atingiu o limite de 10 clientes do plano gratuito. Faça upgrade para Pro e tenha clientes ilimitados.')
    }

    const { data, error } = await supabase
      .from('clientes')
      .insert({ ...dados, usuario_id: tenantId, ativo: true })
      .select()
      .single()

    if (error) throw error
    await buscar()
    return data
  }, [buscar])

  const atualizar = useCallback(async (id: string, dados: Partial<Cliente>) => {
    const { error } = await supabase
      .from('clientes')
      .update(dados)
      .eq('id', id)

    if (error) throw error
    await buscar()
  }, [buscar])

  const arquivar = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('clientes')
      .update({ ativo: false })
      .eq('id', id)

    if (error) throw error
    await buscar()
  }, [buscar])

  const excluir = useCallback(async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) throw new Error('Sessão expirada. Entre novamente.')
    const uid = await resolverTenantId(session.user.id)
    // Ordem importa: exclui vendas PRIMEIRO (é o passo protegido pela permissão
    // excluir_venda) e aborta imediatamente se falhar — nunca chega a apagar
    // pagamentos reais se o funcionário não tiver permissão para o cliente inteiro.
    const { error: erroVendas } = await supabase.from('vendas').delete().eq('cliente_id', id).eq('usuario_id', uid)
    if (erroVendas) throw new Error('Sem permissão para excluir as vendas deste cliente.')
    const { error: erroPagamentos } = await supabase.from('pagamentos').delete().eq('cliente_id', id).eq('usuario_id', uid)
    if (erroPagamentos) throw erroPagamentos
    const { error } = await supabase.from('clientes').delete().eq('id', id).eq('usuario_id', uid)
    if (error) throw error
    await buscar()
  }, [buscar])

  return { clientes, carregando, erro, buscar, criar, atualizar, arquivar, excluir }
}

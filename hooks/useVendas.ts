import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { enfileirarOperacao, verificarConectividade } from './useOffline'
import type { Venda, Pagamento } from '../types'

// Traduz erros crus do Postgres para mensagens em português.
function traduzErroBanco(msg: string): string {
  if (/vendas_datas_plausiveis/.test(msg)) {
    return 'A data informada tem um ano inválido. Confira a data de venda e de vencimento.'
  }
  return msg
}

// Reconcilia a flag `vendas.pago` de um cliente por alocação FIFO dos pagamentos
// (mesma ordem da view clientes_com_saldo: vencimento, depois data da venda).
// Fecha vendas cobertas pelo crédito e REABRE vendas que deixaram de estar
// cobertas (ex.: após excluir um pagamento ou editar valor). Mantém a flag
// coerente com o status calculado pela view.
async function reconciliarPagoCliente(clienteId: string, uid: string) {
  const [{ data: vendas }, { data: pagamentos }] = await Promise.all([
    supabase
      .from('vendas')
      .select('id, valor, pago')
      .eq('cliente_id', clienteId)
      .eq('usuario_id', uid)
      .order('data_vencimento', { ascending: true, nullsFirst: false })
      .order('data_venda', { ascending: true })
      .order('id', { ascending: true }),
    supabase
      .from('pagamentos')
      .select('valor')
      .eq('cliente_id', clienteId)
      .eq('usuario_id', uid),
  ])
  if (!vendas) return

  let credito = (pagamentos ?? []).reduce((s: number, p: { valor: number }) => s + p.valor, 0)
  const fechar: string[] = []
  const reabrir: string[] = []
  for (const v of vendas as Array<{ id: string; valor: number; pago: boolean }>) {
    if (credito >= v.valor) {
      credito -= v.valor
      if (!v.pago) fechar.push(v.id)
    } else if (v.pago) {
      reabrir.push(v.id)
    }
  }
  if (fechar.length) await supabase.from('vendas').update({ pago: true }).in('id', fechar)
  if (reabrir.length) await supabase.from('vendas').update({ pago: false }).in('id', reabrir)
}

export function useVendas(clienteId?: string) {
  const [vendas, setVendas] = useState<Venda[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const buscar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { setCarregando(false); return }
      let query = supabase
        .from('vendas')
        .select('*, cliente:clientes(id, nome, telefone)')
        .eq('usuario_id', session.user.id)
        .order('data_venda', { ascending: false })

      if (clienteId) {
        query = query.eq('cliente_id', clienteId)
      }

      const { data, error } = await query
      if (error) throw error
      setVendas(data ?? [])
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }, [clienteId])

  const criar = useCallback(async (dados: {
    cliente_id: string
    descricao: string
    valor: number
    data_vencimento?: string
    data_venda?: string
    categoria: string
    foto_url?: string
  }) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) throw new Error('Sessão expirada. Faça login novamente.')

    const payload: Record<string, unknown> = {
      cliente_id: dados.cliente_id,
      descricao: dados.descricao,
      valor: dados.valor,
      categoria: dados.categoria,
      usuario_id: session.user.id,
      data_venda: dados.data_venda ?? new Date().toISOString().split('T')[0],
      pago: false,
    }
    if (dados.data_vencimento) payload.data_vencimento = dados.data_vencimento
    if (dados.foto_url) payload.foto_url = dados.foto_url

    const online = await verificarConectividade()
    if (!online) {
      // Sem internet: gera UUID local e enfileira para sincronização automática
      const idLocal = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`
      await enfileirarOperacao({ tabela: 'vendas', operacao: 'insert', dados: { ...payload, id: idLocal } })
      // Retorna placeholder — UI mostrará sucesso e sincronizará ao reconectar
      return { id: idLocal, ...payload } as unknown as Venda
    }

    const { data, error } = await supabase
      .from('vendas')
      .insert(payload)
      .select()
      .single()

    if (error) throw new Error(traduzErroBanco(error.message))
    await buscar()
    return data
  }, [buscar])

  const registrarPagamento = useCallback(async (params: {
    cliente_id: string
    valor: number
    venda_id?: string
    observacao?: string
    data_pagamento?: string
  }) => {
    const online = await verificarConectividade()
    if (!online) throw new Error('Sem conexão com a internet. Conecte-se e tente registrar o pagamento novamente.')

    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) throw new Error('Sessão expirada. Faça login novamente.')

    const { data_pagamento, ...rest } = params
    const { error } = await supabase
      .from('pagamentos')
      .insert({
        ...rest,
        usuario_id: user.id,
        data_pagamento: data_pagamento ?? new Date().toISOString().split('T')[0],
      })

    if (error) throw error

    // Reconcilia a flag `pago` das vendas do cliente por alocação FIFO.
    await reconciliarPagoCliente(params.cliente_id, user.id)

    await buscar()
  }, [buscar])

  const excluirVenda = useCallback(async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) throw new Error('Sessão expirada. Faça login novamente.')
    const { data: alvo } = await supabase.from('vendas').select('cliente_id').eq('id', id).eq('usuario_id', uid).single()
    const { error } = await supabase.from('vendas').delete().eq('id', id).eq('usuario_id', uid)
    if (error) throw error
    if (alvo?.cliente_id) await reconciliarPagoCliente(alvo.cliente_id, uid)
    await buscar()
  }, [buscar])

  const editarVenda = useCallback(async (id: string, dados: { descricao?: string; valor?: number; data_vencimento?: string | null; data_venda?: string | null; categoria?: string }) => {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) throw new Error('Sessão expirada. Faça login novamente.')
    const { error } = await supabase.from('vendas').update(dados).eq('id', id).eq('usuario_id', uid)
    if (error) throw new Error(traduzErroBanco(error.message))
    const { data: alvo } = await supabase.from('vendas').select('cliente_id').eq('id', id).eq('usuario_id', uid).single()
    if (alvo?.cliente_id) await reconciliarPagoCliente(alvo.cliente_id, uid)
    await buscar()
  }, [buscar])

  const excluirPagamento = useCallback(async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) throw new Error('Sessão expirada. Faça login novamente.')
    const { data: alvo } = await supabase.from('pagamentos').select('cliente_id').eq('id', id).eq('usuario_id', uid).single()
    const { error } = await supabase.from('pagamentos').delete().eq('id', id).eq('usuario_id', uid)
    if (error) throw error
    if (alvo?.cliente_id) await reconciliarPagoCliente(alvo.cliente_id, uid)
    await buscar()
  }, [buscar])

  return { vendas, carregando, erro, buscar, criar, registrarPagamento, excluirVenda, editarVenda, excluirPagamento }
}

import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { enfileirarOperacao, verificarConectividade } from './useOffline'
import { resolverTenantId } from '../lib/tenant'
import { reconciliarPagoCliente } from '../lib/reconciliacao'
import { gerarUUID } from '../lib/uuid'
import type { Venda, Pagamento } from '../types'

// Traduz erros crus do Postgres para mensagens em português.
function traduzErroBanco(msg: string): string {
  if (/vendas_datas_plausiveis/.test(msg)) {
    return 'A data informada tem um ano inválido. Confira a data de venda e de vencimento.'
  }
  return msg
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
      const tenantId = await resolverTenantId(session.user.id)
      let query = supabase
        .from('vendas')
        .select('*, cliente:clientes(id, nome, telefone)')
        .eq('usuario_id', tenantId)
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
    const tenantId = await resolverTenantId(session.user.id)

    const payload: Record<string, unknown> = {
      cliente_id: dados.cliente_id,
      descricao: dados.descricao,
      valor: dados.valor,
      categoria: dados.categoria,
      usuario_id: tenantId,
      criado_por: session.user.id,
      client_op_id: gerarUUID(),
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
    // Cliente pode ter crédito sobrando (pagou adiantado) que cobre esta venda nova.
    await reconciliarPagoCliente(dados.cliente_id, tenantId)
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
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) throw new Error('Sessão expirada. Faça login novamente.')
    const tenantId = await resolverTenantId(user.id)

    const { data_pagamento, ...rest } = params
    const payload = {
      ...rest,
      usuario_id: tenantId,
      criado_por: user.id,
      // Gerado sempre (online e offline), não só na fila: mantém um único caminho
      // de código e protege também um futuro retry no caminho online, sem custo —
      // é só mais uma coluna preenchida, nunca gera colisão real.
      client_op_id: gerarUUID(),
      data_pagamento: data_pagamento ?? new Date().toISOString().split('T')[0],
    }

    const online = await verificarConectividade()
    if (!online) {
      // Sem internet: enfileira e sincroniza ao reconectar. A reconciliação do
      // FIFO (flag `pago`) acontece em useOffline.ts logo após sincronizar,
      // não aqui — offline não há como recalcular contra o estado real do banco.
      await enfileirarOperacao({ tabela: 'pagamentos', operacao: 'insert', dados: payload })
      return
    }

    const { error } = await supabase.from('pagamentos').insert(payload)
    if (error) throw error

    // Reconcilia a flag `pago` das vendas do cliente por alocação FIFO.
    await reconciliarPagoCliente(params.cliente_id, tenantId)

    await buscar()
  }, [buscar])

  const excluirVenda = useCallback(async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) throw new Error('Sessão expirada. Faça login novamente.')
    const uid = await resolverTenantId(session.user.id)
    const { data: alvo } = await supabase.from('vendas').select('cliente_id').eq('id', id).eq('usuario_id', uid).single()
    // .select() no delete é obrigatório aqui: a RLS de funcionário agora recusa
    // excluir venda sem a permissão `excluir_venda`, e um delete recusado pela RLS
    // não retorna erro -- só afeta 0 linhas em silêncio. Sem o .select(), o código
    // seguiria como se tivesse apagado.
    const { data: apagada, error } = await supabase.from('vendas').delete().eq('id', id).eq('usuario_id', uid).select().maybeSingle()
    if (error) throw new Error(traduzErroBanco(error.message))
    if (!apagada) throw new Error('Você não tem permissão para excluir esta venda.')
    if (alvo?.cliente_id) await reconciliarPagoCliente(alvo.cliente_id, uid)
    await buscar()
  }, [buscar])

  const editarVenda = useCallback(async (id: string, dados: { descricao?: string; valor?: number; data_vencimento?: string | null; data_venda?: string | null; categoria?: string }) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) throw new Error('Sessão expirada. Faça login novamente.')
    const uid = await resolverTenantId(session.user.id)
    // .select() obrigatório pelo mesmo motivo do excluirVenda -- a RLS de
    // funcionário só permite editar venda própria, do dia, com a permissão ligada;
    // fora disso o update afeta 0 linhas sem erro nenhum.
    const { data: atualizada, error } = await supabase.from('vendas').update(dados).eq('id', id).eq('usuario_id', uid).select().maybeSingle()
    if (error) throw new Error(traduzErroBanco(error.message))
    if (!atualizada) throw new Error('Você não tem permissão para editar esta venda.')
    const { data: alvo } = await supabase.from('vendas').select('cliente_id').eq('id', id).eq('usuario_id', uid).single()
    if (alvo?.cliente_id) await reconciliarPagoCliente(alvo.cliente_id, uid)
    await buscar()
  }, [buscar])

  const excluirPagamento = useCallback(async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) throw new Error('Sessão expirada. Faça login novamente.')
    const uid = await resolverTenantId(session.user.id)
    const { data: alvo } = await supabase.from('pagamentos').select('cliente_id').eq('id', id).eq('usuario_id', uid).single()
    // Mesmo motivo do excluirVenda: a RLS de funcionário exige a permissão
    // `excluir_venda` (reaproveitada pra pagamentos) pra apagar.
    const { data: apagado, error } = await supabase.from('pagamentos').delete().eq('id', id).eq('usuario_id', uid).select().maybeSingle()
    if (error) throw error
    if (!apagado) throw new Error('Você não tem permissão para excluir este pagamento.')
    if (alvo?.cliente_id) await reconciliarPagoCliente(alvo.cliente_id, uid)
    await buscar()
  }, [buscar])

  return { vendas, carregando, erro, buscar, criar, registrarPagamento, excluirVenda, editarVenda, excluirPagamento }
}

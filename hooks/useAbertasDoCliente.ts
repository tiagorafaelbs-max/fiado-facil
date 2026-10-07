import { useCallback, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { listarAbertas, type ItemAberto, type PagamentoAlocavel, type VendaAlocavel } from '../lib/alocacao'
import { assinarEventosDaFila, listarLancamentosPendentes } from './useOffline'
import { useTenant } from './useTenant'

const chaveCache = (clienteId: string) => `@fiado_aberto_cliente:${clienteId}`

// Vendas em aberto de UM cliente, com o que falta de cada uma (alocação do app = a do banco), para a tela
// "Registrar pagamento → escolher venda". Guarda a última lista no aparelho: sem internet ela continua
// aparecendo, e os pagamentos que estão só na fila entram na conta.
export function useAbertasDoCliente(clienteId: string | undefined) {
  const { tenantId } = useTenant()
  const [vendas, setVendas] = useState<VendaAlocavel[]>([])
  const [pagamentos, setPagamentos] = useState<PagamentoAlocavel[]>([])
  const [filaPagamentos, setFilaPagamentos] = useState<PagamentoAlocavel[]>([])
  const [vendasNaFila, setVendasNaFila] = useState(0)
  const [carregou, setCarregou] = useState(false)

  const carregar = useCallback(async () => {
    if (!clienteId || !tenantId) return
    // client_op_id dos pagamentos que o servidor (ou a cópia local) já tem: um pagamento que já chegou ao servidor mas ainda
    // não saiu da fila não pode contar duas vezes.
    let opsDoServidor = new Set<string>()
    try {
      const [{ data: v, error: ev }, { data: p, error: ep }] = await Promise.all([
        supabase.from('vendas').select('id, descricao, valor, data_venda, data_vencimento').eq('cliente_id', clienteId).eq('usuario_id', tenantId),
        supabase.from('pagamentos').select('valor, venda_id, client_op_id').eq('cliente_id', clienteId).eq('usuario_id', tenantId),
      ])
      if (ev || ep) throw ev ?? ep
      setVendas((v ?? []) as VendaAlocavel[])
      setPagamentos((p ?? []).map(x => ({ valor: x.valor, venda_id: x.venda_id })) as PagamentoAlocavel[])
      opsDoServidor = new Set((p ?? []).map(x => x.client_op_id).filter(Boolean) as string[])
      setCarregou(true)
      AsyncStorage.setItem(chaveCache(clienteId), JSON.stringify({ v, p })).catch(() => {})
    } catch {
      // sem rede: usa a última cópia deste aparelho
      try {
        const bruto = await AsyncStorage.getItem(chaveCache(clienteId))
        if (bruto) {
          const { v, p } = JSON.parse(bruto)
          setVendas(v ?? []); setPagamentos((p ?? []).map((x: any) => ({ valor: x.valor, venda_id: x.venda_id }))); setCarregou(true)
          opsDoServidor = new Set((p ?? []).map((x: any) => x.client_op_id).filter(Boolean))
        }
      } catch { /* sem cópia: a lista fica indisponível */ }
    }
    // o que ainda está só na fila (pagamentos entram na conta; vendas só são contadas)
    try {
      const fila = await listarLancamentosPendentes(clienteId)
      setFilaPagamentos(fila
        .filter(op => op.tabela === 'pagamentos' && !(op.dados.client_op_id && opsDoServidor.has(op.dados.client_op_id)))
        .map(op => ({ valor: Number(op.dados.valor ?? 0), venda_id: op.dados.venda_id ?? null })))
      setVendasNaFila(fila.filter(op => op.tabela === 'vendas').length)
    } catch { /* ignora */ }
  }, [clienteId, tenantId])

  useEffect(() => { carregar() }, [carregar])
  // a fila mudou (enfileirou / sincronizou): recarrega para não ficar com lista velha
  useEffect(() => assinarEventosDaFila(() => { carregar() }), [carregar])

  const abertas: ItemAberto[] = useMemo(
    () => listarAbertas(vendas, [...pagamentos, ...filaPagamentos]),
    [vendas, pagamentos, filaPagamentos],
  )

  return { abertas, vendasNaFila, carregou, recarregar: carregar }
}

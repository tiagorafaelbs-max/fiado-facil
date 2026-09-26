import { supabase } from './supabase'

// Reconcilia a flag `vendas.pago` de um cliente por alocação FIFO dos pagamentos
// (mesma ordem da view clientes_com_saldo: vencimento, depois data da venda).
// Fecha vendas cobertas pelo crédito e REABRE vendas que deixaram de estar
// cobertas (ex.: após excluir um pagamento ou editar valor). Mantém a flag
// coerente com o status calculado pela view.
//
// Vive em módulo próprio (não em useVendas.ts) porque também é chamada por
// useOffline.ts após sincronizar a fila — evita import circular entre os dois hooks.
export async function reconciliarPagoCliente(clienteId: string, uid: string) {
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
  // Prefixo FIFO: assim que uma venda não couber no crédito, todas as seguintes
  // ficam descobertas (mesma semântica de `acumulado <= total_pago` da view).
  let coberto = true
  for (const v of vendas as Array<{ id: string; valor: number; pago: boolean }>) {
    coberto = coberto && credito >= v.valor
    if (coberto) {
      credito -= v.valor
      if (!v.pago) fechar.push(v.id)
    } else if (v.pago) {
      reabrir.push(v.id)
    }
  }
  if (fechar.length) await supabase.from('vendas').update({ pago: true }).in('id', fechar).eq('usuario_id', uid)
  if (reabrir.length) await supabase.from('vendas').update({ pago: false }).in('id', reabrir).eq('usuario_id', uid)
}

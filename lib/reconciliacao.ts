import { supabase } from './supabase'

// Reconcilia a flag `vendas.pago` de um cliente por alocação FIFO dos pagamentos
// (mesma ordem da view clientes_com_saldo: vencimento efetivo (data_vencimento ou data da venda + 30 dias), depois data da venda) via
// RPC SECURITY DEFINER -- o update direto daqui (antes) tocava vendas.pago de
// vendas de QUALQUER dia/autor do cliente, o que a nova RLS de funcionário passou
// a recusar em silêncio (só edita venda própria, do mesmo dia): uma venda antiga
// do dono, quitada por um pagamento que o funcionário registrou, ficava presa em
// pago=false e continuava aparecendo como "em aberto" em Cobranças, notificações,
// painel, ranking e no extrato do WhatsApp -- risco de cobrar quem já pagou
// (achado do Tiago, 29/09). A RPC roda como o dono da função, então recalcula e
// grava pra qualquer papel (dono ou funcionário) que tenha acesso ao cliente.
//
// Vive em módulo próprio (não em useVendas.ts) porque também é chamada por
// useOffline.ts após sincronizar a fila — evita import circular entre os dois hooks.
export async function reconciliarPagoCliente(clienteId: string) {
  const { error } = await supabase.rpc('reconciliar_pago_cliente', { p_cliente_id: clienteId })
  if (error) throw error
}

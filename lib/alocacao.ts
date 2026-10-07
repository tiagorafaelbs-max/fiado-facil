import { vencimentoEfetivoISO } from './vencimento'

// Alocação dos pagamentos de UM cliente nas vendas dele — espelho em JS do que o banco faz em
// reconciliar_pago_cliente() e na view clientes_com_saldo (migration pagamento_direcionado_a_venda.sql):
//   1) pagamento com venda_id quita PRIMEIRO essa venda, até o valor dela;
//   2) o que sobra dele e os pagamentos sem venda_id seguem a ordem FIFO (vencimento efetivo, data da venda, id),
//      cobrindo só o que ainda falta de cada venda.
// Sem nenhum venda_id o resultado é o FIFO de sempre.

export interface VendaAlocavel {
  id: string
  valor: number
  data_venda: string
  data_vencimento?: string | null
}

export interface PagamentoAlocavel {
  valor: number
  venda_id?: string | null
}

export interface AlocacaoVenda {
  id: string
  valor: number
  dirigido: number    // quanto pagamentos "escolhendo esta venda" quitaram (nunca passa do valor da venda)
  pago: number        // dirigido + a parte coberta pelo FIFO
  restante: number    // valor - pago
  quitada: boolean    // mesmo critério do vendas.pago do banco
}

// Em centavos para não carregar erro de ponto flutuante nas comparações.
const cent = (n: number) => Math.round(n * 100)

export function alocarPagamentos(vendas: VendaAlocavel[], pagamentos: PagamentoAlocavel[]): Map<string, AlocacaoVenda> {
  const ids = new Set(vendas.map(v => v.id))
  const dirigidoPorVenda = new Map<string, number>()
  let totalPago = 0
  for (const p of pagamentos) {
    const c = cent(p.valor)
    totalPago += c
    // venda_id que não é deste cliente (ou já apagada) conta como pagamento solto, igual ao banco (SET NULL).
    if (p.venda_id && ids.has(p.venda_id)) dirigidoPorVenda.set(p.venda_id, (dirigidoPorVenda.get(p.venda_id) ?? 0) + c)
  }

  const ordenadas = [...vendas].sort((a, b) => {
    const ea = vencimentoEfetivoISO(a.data_venda, a.data_vencimento)
    const eb = vencimentoEfetivoISO(b.data_venda, b.data_vencimento)
    if (ea !== eb) return ea < eb ? -1 : 1
    if (a.data_venda !== b.data_venda) return a.data_venda < b.data_venda ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  const linhas = ordenadas.map(v => {
    const valor = cent(v.valor)
    const dirigido = Math.min(dirigidoPorVenda.get(v.id) ?? 0, valor)
    return { v, valor, dirigido, resto: valor - dirigido }
  })

  // dinheiro "solto": o total pago menos o que já quitou a venda escolhida (a sobra do direcionado volta para cá)
  let solto = totalPago - linhas.reduce((s, l) => s + l.dirigido, 0)
  const resultado = new Map<string, AlocacaoVenda>()
  for (const l of linhas) {
    const cobertoPeloFifo = Math.min(l.resto, Math.max(0, solto))
    solto -= cobertoPeloFifo
    const pago = l.dirigido + cobertoPeloFifo
    resultado.set(l.v.id, {
      id: l.v.id,
      valor: l.valor / 100,
      dirigido: l.dirigido / 100,
      pago: pago / 100,
      restante: (l.valor - pago) / 100,
      // igual ao SQL: (resto = 0 e houve direcionado) ou o FIFO cobriu todo o resto
      quitada: (l.resto === 0 && l.dirigido > 0) || cobertoPeloFifo === l.resto,
    })
  }
  return resultado
}

// Venda com pagamento direcionado que ainda não quitou: o texto "R$ X pagos de R$ Y" do histórico.
export function parcialDirecionada(a: AlocacaoVenda | undefined): { pago: number; de: number } | null {
  if (!a || a.quitada || a.dirigido <= 0) return null
  return { pago: a.dirigido, de: a.valor }
}

import { alocarPagamentos, type PagamentoAlocavel, type VendaAlocavel } from './alocacao'
import { vencimentoEfetivoISO } from './vencimento'

// Itens em aberto de um cliente para o EXTRATO (WhatsApp e PDF): o que ainda falta de cada venda/parcela (mesma alocação
// do banco, lib/alocacao.ts), com data da compra e vencimento, na ordem FIFO (vencimento efetivo). "Vencida" exige data
// real de vencimento anterior a hoje; venda sem vencimento aparece como "sem vencimento" e nunca como vencida.

export interface ItemExtrato {
  id: string
  descricao: string
  falta: number               // o que ainda falta desta venda/parcela
  dataVenda: string           // yyyy-mm-dd
  vencimento: string | null   // yyyy-mm-dd ou null (sem vencimento)
  vencida: boolean            // vencimento real antes de hoje
  venceHoje: boolean
}

export interface ResumoExtrato {
  itens: ItemExtrato[]
  vencidoAteHoje: number      // soma do que já venceu (vencimento antes de hoje)
  totalAberto: number         // soma do que falta de todos os itens em aberto
}

const cent = (n: number) => Math.round(n * 100)

export function montarItensExtrato(
  vendas: (VendaAlocavel & { data_venda: string })[],
  pagamentos: PagamentoAlocavel[],
  hojeISO: string,
): ResumoExtrato {
  const reais = vendas.filter(v => !v.id.startsWith('local_'))
  const alocacao = alocarPagamentos(reais, pagamentos)
  const itens: ItemExtrato[] = []
  for (const v of reais) {
    const a = alocacao.get(v.id)
    if (!a || a.quitada || cent(a.restante) <= 0) continue
    const venc = v.data_vencimento ? v.data_vencimento.slice(0, 10) : null
    itens.push({
      id: v.id,
      descricao: v.descricao?.trim() || 'Venda',
      falta: a.restante,
      dataVenda: v.data_venda.slice(0, 10),
      vencimento: venc,
      vencida: !!venc && venc < hojeISO,
      venceHoje: venc === hojeISO,
    })
  }
  const porId = new Map(reais.map(v => [v.id, v]))
  itens.sort((a, b) => {
    const va = porId.get(a.id)!, vb = porId.get(b.id)!
    const ea = vencimentoEfetivoISO(va.data_venda.slice(0, 10), a.vencimento), eb = vencimentoEfetivoISO(vb.data_venda.slice(0, 10), b.vencimento)
    if (ea !== eb) return ea < eb ? -1 : 1
    if (a.dataVenda !== b.dataVenda) return a.dataVenda < b.dataVenda ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  return {
    itens,
    vencidoAteHoje: itens.filter(i => i.vencida).reduce((s, i) => s + cent(i.falta), 0) / 100,
    totalAberto: itens.reduce((s, i) => s + cent(i.falta), 0) / 100,
  }
}

export function dataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

export function diaMesBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}` : iso
}

// Texto da situação do vencimento de um item, igual no WhatsApp e no PDF.
export function textoVencimento(i: ItemExtrato): string {
  if (!i.vencimento) return 'sem vencimento'
  if (i.vencida) return `⚠ venceu em ${diaMesBR(i.vencimento)}`
  if (i.venceHoje) return 'vence hoje'
  return `vence em ${diaMesBR(i.vencimento)}`
}

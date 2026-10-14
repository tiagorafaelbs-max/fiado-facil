import { alocarPagamentos, type PagamentoAlocavel, type VendaAlocavel } from './alocacao'

// O que cobrar de um cliente que tem parcelas/vendas com vencimentos diferentes: só o que JÁ venceu (até hoje),
// já descontando os pagamentos com a mesma alocação do banco (lib/alocacao.ts: app = banco).
// Venda sem data de vencimento ("Sem vencimento") nunca é vencida: fica só no saldo total.

export interface ItemCobranca {
  descricao: string
  restante: number      // o que ainda falta desta venda/parcela (depois dos pagamentos)
  vencimento: string    // yyyy-mm-dd
}

export interface DetalheCobranca {
  vencidos: ItemCobranca[]        // do mais antigo para o mais novo
  valorVencido: number
  proxima: ItemCobranca | null    // próxima a vencer (só usada quando nada venceu)
}

const cent = (n: number) => Math.round(n * 100)

export function calcularDetalheCobranca(
  vendas: VendaAlocavel[],
  pagamentos: PagamentoAlocavel[],
  hojeISO: string,
): DetalheCobranca | null {
  const alocacao = alocarPagamentos(vendas, pagamentos)
  const abertas: (ItemCobranca & { data_venda: string })[] = []
  for (const v of vendas) {
    const a = alocacao.get(v.id)
    const venc = v.data_vencimento ? v.data_vencimento.slice(0, 10) : null
    if (!a || a.quitada || cent(a.restante) <= 0 || !venc) continue
    abertas.push({ descricao: v.descricao?.trim() || 'Venda', restante: a.restante, vencimento: venc, data_venda: v.data_venda })
  }
  // nenhuma venda em aberto com vencimento: comportamento de sempre (saldo total)
  if (abertas.length === 0) return null

  abertas.sort((a, b) =>
    a.vencimento !== b.vencimento ? (a.vencimento < b.vencimento ? -1 : 1) : (a.data_venda < b.data_venda ? -1 : a.data_venda > b.data_venda ? 1 : 0))
  const limpa = ({ descricao, restante, vencimento }: ItemCobranca & { data_venda: string }): ItemCobranca => ({ descricao, restante, vencimento })
  const vencidos = abertas.filter(i => i.vencimento <= hojeISO).map(limpa)
  const proxima = abertas.find(i => i.vencimento > hojeISO)
  return {
    vencidos,
    valorVencido: vencidos.reduce((s, i) => s + cent(i.restante), 0) / 100,
    proxima: proxima ? limpa(proxima) : null,
  }
}

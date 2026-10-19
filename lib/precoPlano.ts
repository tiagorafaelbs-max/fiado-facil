// Preço do plano mostrado na tela Planos: só usa o preço da LOJA quando a moeda é BRL.
// Conta de teste/loja de outro país devolve "$2.99" (ou outra moeda) enquanto a cobrança real é em reais:
// nesse caso a tela mantém o texto fixo ("R$ 19,90/mês" e "R$ 149,90/ano").

export interface ProdutoLoja {
  displayPrice?: string | null
  localizedPrice?: string | null
  currency?: string | null
  subscriptionOffers?: { currency?: string | null }[] | null
  subscriptionOfferDetailsAndroid?: { pricingPhases?: { pricingPhaseList?: { priceCurrencyCode?: string | null }[] } }[] | null
}

export function moedaDoProduto(p: ProdutoLoja): string | null {
  const m =
    p.currency ??
    p.subscriptionOffers?.[0]?.currency ??
    p.subscriptionOfferDetailsAndroid?.[0]?.pricingPhases?.pricingPhaseList?.[0]?.priceCurrencyCode ??
    null
  return m ? String(m).toUpperCase() : null
}

export type EscolhaPreco =
  | { tipo: 'loja'; preco: string }            // BRL: mostra o preço da loja
  | { tipo: 'fixo'; moeda: string | null }     // outra moeda ou desconhecida: mantém o texto fixo

export function escolherPreco(p: ProdutoLoja): EscolhaPreco {
  const preco = p.displayPrice ?? p.localizedPrice ?? ''
  const moeda = moedaDoProduto(p)
  if (moeda === 'BRL' && preco) return { tipo: 'loja', preco }
  return { tipo: 'fixo', moeda }
}

// "R$ 1.499,00" / "R$ 149,90" / "149,90" -> número. Formato não reconhecido -> null (a tela cai nos textos padrão).
export function numeroDoPrecoBRL(texto: string): number | null {
  const m = /(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})\b/.exec(texto)
  if (!m) return null
  const n = Number(m[1].replace(/\./g, '') + '.' + m[2])
  return Number.isFinite(n) && n > 0 ? n : null
}

export function formatarPrecoBRL(n: number): string {
  const [inteiro, cent] = n.toFixed(2).split('.')
  return 'R$ ' + inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + cent
}

// Valor do plano anual dividido por 12 e quanto isso economiza frente a 12 mensalidades. Sempre texto SECUNDÁRIO na tela:
// o valor efetivamente cobrado (anual) é o mais destacado (Apple 3.1.2 / Google).
export function equivalenteMensal(precoAnual: string, precoMensal: string): { porMes: string; economiaPct: number } | null {
  const anual = numeroDoPrecoBRL(precoAnual)
  const mensal = numeroDoPrecoBRL(precoMensal)
  if (!anual || !mensal) return null
  const economia = Math.round((1 - anual / (mensal * 12)) * 100)
  if (economia <= 0) return null   // só fala em economia se ela existe de verdade
  return { porMes: formatarPrecoBRL(Math.floor((anual / 12) * 100) / 100), economiaPct: economia }
}

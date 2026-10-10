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

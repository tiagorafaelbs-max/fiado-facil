// Escolha da oferta de assinatura do Google Play (pura, sem react-native: testável em Node).

export interface OfertaGoogle {
  token: string
  planoBase: string
  idOferta: string | null     // null = oferta padrão do plano base (sem promoção)
  fases: number               // fases de preço (teste/introdutório + regular)
}

// Escolhe a oferta para comprar: a do plano base esperado, preferindo a padrão (sem promoção) e,
// entre promoções, a de menos fases. Pura para ser testável.
export function escolherOferta(ofertas: OfertaGoogle[], planoBase: string): OfertaGoogle | null {
  const doPlano = ofertas.filter(o => o.planoBase === planoBase)
  const candidatas = doPlano.length > 0 ? doPlano : ofertas
  if (candidatas.length === 0) return null
  return [...candidatas].sort((a, b) => (a.idOferta === null ? 0 : 1) - (b.idOferta === null ? 0 : 1) || a.fases - b.fases)[0]
}

// A v15 do react-native-iap expõe as ofertas em `subscriptionOffers` (novo) e em
// `subscriptionOfferDetailsAndroid` (antigo); aceita os dois.
export function ofertasDoProduto(produto: any): OfertaGoogle[] {
  const novas = (produto?.subscriptionOffers ?? []).filter((o: any) => o?.offerTokenAndroid)
  if (novas.length > 0) {
    return novas.map((o: any) => ({
      token: o.offerTokenAndroid,
      planoBase: o.basePlanIdAndroid ?? '',
      idOferta: o.id && o.id !== o.basePlanIdAndroid ? o.id : null,
      fases: o.pricingPhasesAndroid?.pricingPhaseList?.length ?? 1,
    }))
  }
  return (produto?.subscriptionOfferDetailsAndroid ?? []).map((o: any) => ({
    token: o.offerToken,
    planoBase: o.basePlanId ?? '',
    idOferta: o.offerId ?? null,
    fases: o.pricingPhases?.pricingPhaseList?.length ?? 1,
  }))
}

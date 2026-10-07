// Regras PURAS do Google Play Billing (sem Deno, sem rede): interpretam a resposta de
// purchases.subscriptionsv2.get e decidem se uma gravação é segura. Ficam separadas para
// serem testadas em Node (scripts/teste-google-play.js) sem precisar do Deno nem do Google.

export const SKU_MENSAL = 'com.fiadofacil.app.pro.monthly'
export const SKU_ANUAL = 'com.fiadofacil.app.pro.annual'
export const SKUS = [SKU_MENSAL, SKU_ANUAL]

export type StatusAssinatura = 'active' | 'grace_period' | 'paused' | 'expired' | 'cancelled' | 'pending'

// Só o que usamos da resposta da API (https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2)
export interface AssinaturaV2 {
  subscriptionState?: string
  startTime?: string
  linkedPurchaseToken?: string
  acknowledgementState?: string
  testPurchase?: unknown
  lineItems?: { productId?: string; expiryTime?: string }[]
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string }
}

export interface Interpretada {
  status: StatusAssinatura
  produto: string                    // SKU
  planId: 'pro_monthly' | 'pro_annual'
  cancelAtPeriodEnd: boolean
  inicio: string | null
  fimPeriodo: string | null
  fimCarencia: string | null
  contaOfuscada: string | null       // user.id gravado na compra (obfuscatedAccountId)
  tokenAnterior: string | null       // linkedPurchaseToken: compra que esta substitui
  precisaReconhecer: boolean         // acknowledge pendente (o Google estorna em 3 dias)
  teste: boolean
}

export const concedeAcesso = (s: StatusAssinatura) => s === 'active' || s === 'grace_period'

const TRES_DIAS = 3 * 24 * 3600 * 1000

// null = não reconhecemos o estado/produto/validade: o chamador NÃO grava nada.
export function interpretar(sub: AssinaturaV2, agora = Date.now()): Interpretada | null {
  const item = (sub.lineItems ?? []).find(i => i.productId && SKUS.includes(i.productId))
  if (!item?.productId) return null
  const fim = item.expiryTime ? Date.parse(item.expiryTime) : NaN
  const fimOk = Number.isFinite(fim)

  let status: StatusAssinatura
  let cancelAtPeriodEnd = false
  switch (sub.subscriptionState) {
    case 'SUBSCRIPTION_STATE_ACTIVE': status = 'active'; break
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD': status = 'grace_period'; break
    case 'SUBSCRIPTION_STATE_CANCELED':
      // Cancelou a renovação, mas pagou o período: segue com acesso até expiryTime.
      status = fimOk && fim > agora ? 'active' : 'cancelled'
      cancelAtPeriodEnd = status === 'active'
      break
    case 'SUBSCRIPTION_STATE_ON_HOLD':
    case 'SUBSCRIPTION_STATE_PAUSED': status = 'paused'; break
    case 'SUBSCRIPTION_STATE_EXPIRED': status = 'expired'; break
    case 'SUBSCRIPTION_STATE_PENDING': status = 'pending'; break
    case 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED': status = 'cancelled'; break
    default: return null
  }
  // Acesso sem data de validade seria eterno na view active_subscriptions (NULL = sem fim): recusa.
  if (concedeAcesso(status) && !fimOk) return null

  // Carência: o expiryTime já pode ter passado; dá uma folga curta e deixa a notificação seguinte
  // (ON_HOLD/EXPIRED) corrigir. Nunca fica aberto: a carência real do Google é de dias.
  const fimCarencia = status === 'grace_period' ? new Date(Math.max(fimOk ? fim : 0, agora + TRES_DIAS)).toISOString() : null

  return {
    status,
    produto: item.productId,
    planId: item.productId === SKU_ANUAL ? 'pro_annual' : 'pro_monthly',
    cancelAtPeriodEnd,
    inicio: sub.startTime ?? null,
    fimPeriodo: fimOk ? new Date(fim).toISOString() : null,
    fimCarencia,
    contaOfuscada: sub.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    tokenAnterior: sub.linkedPurchaseToken ?? null,
    precisaReconhecer: sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING' && concedeAcesso(status),
    teste: sub.testPurchase != null,
  }
}

export interface LinhaAtual { provider_subscription_id: string; status: string }

// Trava contra rebaixar quem paga. Qualquer escrita em subscriptions pode mexer em perfis.plano
// (trigger sync_perfil_plano), então um evento que NÃO concede acesso só vale se for da MESMA
// assinatura gravada; o de outra compra (token antigo substituído, tentativa abandonada) é ignorado
// quando o usuário já tem acesso por outro meio (assinatura ativa, Pro da Apple ou manual).
export function decidirEscrita(args: {
  status: StatusAssinatura
  token: string
  linha: LinhaAtual | null
  planoPerfil: string | null
}): 'gravar' | 'ignorar' {
  const { status, token, linha, planoPerfil } = args
  if (concedeAcesso(status)) return 'gravar'
  const mesma = linha?.provider_subscription_id === token
  if (mesma) return 'gravar'
  const protegido = planoPerfil === 'pro' || (linha != null && (linha.status === 'active' || linha.status === 'grace_period'))
  return protegido ? 'ignorar' : 'gravar'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const ehUuid = (v: string | null | undefined): v is string => !!v && UUID.test(v)

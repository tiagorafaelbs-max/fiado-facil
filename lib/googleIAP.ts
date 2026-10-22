import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  fetchProducts,
  requestPurchase,
  getAvailablePurchases,
  finishTransaction,
  type Purchase,
} from 'react-native-iap'
import { supabase } from './supabase'
import { SKU_MENSAL, SKU_ANUAL, MODULOS_CACHE_KEY, garantirConexaoIAP, comReconexaoIAP, comTempoIAP } from './appleIAP'
import { escolherOferta, ofertasDoProduto } from './googleOfertas'

const isAndroid = Platform.OS === 'android'

// IDs dos planos base criados no Play Console (docs/release/PASSO-A-PASSO-google-play-billing.md).
const PLANO_BASE: Record<string, string> = { [SKU_MENSAL]: 'mensal', [SKU_ANUAL]: 'anual' }

// Abre a tela de compra do Google Play. O resultado chega pelo purchaseUpdatedListener.
// obfuscatedAccountId = id do usuário Supabase: é o que o servidor confere para saber de quem é a compra.
export async function comprarAssinaturaGoogle(sku: string): Promise<void> {
  if (!isAndroid) return
  const conectado = await garantirConexaoIAP()
  if (!conectado) throw new Error('loja_indisponivel')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('sem_sessao')

  // Conexão com o Google Play caída (not-prepared / service-disconnected): religa e repete 1 vez, em cada passo.
  const produtos = (await comReconexaoIAP(() => comTempoIAP(fetchProducts({ skus: [sku], type: 'subs' })))) ?? []
  const produto = (produtos as any[]).find(p => (p.id ?? p.productId) === sku)
  const oferta = produto ? escolherOferta(ofertasDoProduto(produto), PLANO_BASE[sku]) : null
  if (!oferta) throw new Error('oferta_indisponivel')

  await comReconexaoIAP(() => requestPurchase({
    request: {
      google: {
        skus: [sku],
        subscriptionOffers: [{ sku, offerToken: oferta.token }],
        obfuscatedAccountId: session.user.id,
      },
    },
    type: 'subs',
  }))
}

export type ResultadoVerificacao = 'ok' | 'pendente' | 'recusada' | 'falha'

// Envia a compra ao servidor, que consulta o Google, confere a conta e ativa o Pro. Retenta em
// erro de rede/5xx (compra confirmada não pode ficar presa por falha transitória).
export async function enviarParaVerificacaoGoogle(purchase: Purchase): Promise<ResultadoVerificacao> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = (purchase as any).purchaseToken
  if (!session || !token) return 'falha'

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
  const body = JSON.stringify({ purchaseToken: token, productId: purchase.productId })

  const TENTATIVAS = 3
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/google-play-verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body,
      })
      if (resp.status === 202) return 'pendente'
      if (resp.ok) {
        await AsyncStorage.removeItem(MODULOS_CACHE_KEY)
        return 'ok'
      }
      if (resp.status < 500) {
        console.warn('[IAP] google-play-verify recusou a compra, http', resp.status)
        return 'recusada'
      }
    } catch (e: any) {
      if (tentativa === TENTATIVAS) console.warn('[IAP] google-play-verify falhou:', e?.message ?? e)
    }
    if (tentativa < TENTATIVAS) await new Promise(r => setTimeout(r, tentativa * 1500))
  }
  return 'falha'
}

// Depois que o SERVIDOR ativou (e reconheceu a compra), avisa a loja deste lado também. Se o
// servidor já reconheceu, o Google responde "já reconhecida": não é erro.
export async function concluirCompraGoogle(purchase: Purchase): Promise<void> {
  try {
    await finishTransaction({ purchase, isConsumable: false })
  } catch {
    // já reconhecida pelo servidor
  }
}

export function compraDoPlano(compras: Purchase[] | undefined | null): Purchase | undefined {
  return compras?.find(
    p => (p.productId === SKU_MENSAL || p.productId === SKU_ANUAL) && String(p.purchaseState) !== 'pending',
  )
}

// Há uma compra do nosso plano ainda PENDENTE no Google Play (ex.: Pix aguardando confirmação)?
export async function compraPendenteGoogle(): Promise<boolean> {
  if (!isAndroid) return false
  try {
    const conectado = await garantirConexaoIAP()
    if (!conectado) return false
    const compras = (await comReconexaoIAP(() => getAvailablePurchases())) as Purchase[] | undefined
    return !!compras?.some(p => (p.productId === SKU_MENSAL || p.productId === SKU_ANUAL) && String(p.purchaseState) === 'pending')
  } catch {
    return false
  }
}

// Silenciosa (sem alertas): compra paga que o app não chegou a ativar (app fechado no meio, rede
// caiu). Só roda para quem ainda não é Pro: o Pro já ativo é mantido pelos avisos do Google (RTDN).
let reconciliando: Promise<boolean> | null = null

export function verificarComprasGooglePendentes(): Promise<boolean> {
  if (!isAndroid) return Promise.resolve(false)
  // Abrir o app, voltar ao primeiro plano e entrar na conta podem chamar quase juntos: uma por vez.
  if (!reconciliando) reconciliando = reconciliarGoogle().finally(() => { reconciliando = null })
  return reconciliando
}

async function reconciliarGoogle(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return false
    const { data: perfil } = await supabase.from('perfis').select('plano').eq('id', session.user.id).maybeSingle()
    if (perfil?.plano === 'pro') return false

    const conectado = await garantirConexaoIAP()
    if (!conectado) return false
    const compra = compraDoPlano((await comReconexaoIAP(() => getAvailablePurchases())) as Purchase[])
    if (!compra) return false
    const r = await enviarParaVerificacaoGoogle(compra)
    if (r === 'ok') await concluirCompraGoogle(compra)
    return r === 'ok'
  } catch (e: any) {
    console.warn('[IAP] verificarComprasGooglePendentes falhou:', e?.message ?? e)
    return false
  }
}

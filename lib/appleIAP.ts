import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  initConnection,
  getAvailablePurchases,
  type Purchase,
} from 'react-native-iap'
import { supabase } from './supabase'

const isIOS = Platform.OS === 'ios'

export const SKU_MENSAL = 'com.fiadofacil.app.pro.monthly'
export const SKU_ANUAL  = 'com.fiadofacil.app.pro.annual'
export const SKUS       = [SKU_MENSAL, SKU_ANUAL]

export const MODULOS_CACHE_KEY = '@fiado_modulos'

// Estado de conexão IAP compartilhado entre a tela de planos e a verificação em
// segundo plano (app open / retorno aos planos) -- react-native-iap não tolera bem
// múltiplas conexões concorrentes abertas/fechadas por telas diferentes.
let iapPronto = false
let iapIniciando: Promise<void> | null = null

export async function garantirConexaoIAP(): Promise<boolean> {
  if (!isIOS) return false
  if (iapPronto) return true
  if (!iapIniciando) {
    iapIniciando = (async () => {
      await initConnection()
      iapPronto = true
    })().catch((e) => {
      console.warn('[IAP] initConnection falhou:', e?.message ?? e)
    }).finally(() => {
      iapIniciando = null
    })
  }
  await iapIniciando
  return iapPronto
}

// Envia um purchase pro backend ativar o plano, com retentativa automática --
// cobre falhas de rede transitórias que antes deixavam a compra "presa" até o
// usuário lembrar de tocar em "Restaurar compras".
export async function enviarParaVerificacaoApple(purchase: Purchase): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return false

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
  const body = JSON.stringify({
    receipt: (purchase as any).purchaseToken ?? (purchase as any).transactionReceipt,
    productId: purchase.productId,
  })

  const TENTATIVAS = 3
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/apple-iap-verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body,
      })
      if (resp.ok) {
        await AsyncStorage.removeItem(MODULOS_CACHE_KEY)
        return true
      }
      // Erro 4xx (recibo inválido, produto errado etc.) não se resolve tentando de
      // novo -- só vale retentar em erro do servidor (5xx) ou falha de rede (catch abaixo).
      if (resp.status < 500) {
        console.warn('[IAP] apple-iap-verify recusou a compra:', await resp.text())
        return false
      }
      if (tentativa === TENTATIVAS) {
        console.warn('[IAP] apple-iap-verify retornou erro após retentativas:', await resp.text())
      }
    } catch (e: any) {
      if (tentativa === TENTATIVAS) {
        console.warn('[IAP] apple-iap-verify falhou após retentativas:', e?.message ?? e)
      }
    }
    if (tentativa < TENTATIVAS) {
      await new Promise((r) => setTimeout(r, tentativa * 1500))
    }
  }
  return false
}

// Verifica silenciosamente (sem alertas ao usuário) se há uma assinatura Apple ativa
// que o app ainda não processou -- cobre dois casos:
// 1) Backfill: os assinantes de antes do vínculo apple_original_transaction_id
//    existir precisam dele gravado, senão apple-server-notifications não consegue
//    revogar o Pro quando a assinatura expirar/for cancelada.
// 2) Ativação perdida: o purchaseUpdatedListener não disparou (app fechado entre a
//    compra e o evento, StoreKit demorou pra resolver, etc.) -- achado real: compra
//    confirmada às 03:31 UTC só processada às 04:47:54 (29/09).
// Chamada ao abrir o app e ao voltar à tela de planos.
export async function verificarComprasApplePendentes(): Promise<boolean> {
  if (!isIOS) return false
  const conectado = await garantirConexaoIAP()
  if (!conectado) return false

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return false

    const { data: perfil } = await supabase
      .from('perfis')
      .select('plano, apple_original_transaction_id')
      .eq('id', session.user.id)
      .maybeSingle()

    // Já pro e já vinculado -- nada a reconciliar.
    if (perfil?.plano === 'pro' && perfil.apple_original_transaction_id) return false

    const compras = (await getAvailablePurchases()) as Purchase[] | undefined
    const ativa = compras?.find((p) => p.productId === SKU_MENSAL || p.productId === SKU_ANUAL)
    if (!ativa) return false

    return await enviarParaVerificacaoApple(ativa)
  } catch (e: any) {
    console.warn('[IAP] verificarComprasApplePendentes falhou:', e?.message ?? e)
    return false
  }
}

import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  initConnection,
  endConnection,
  getAvailablePurchases,
  type Purchase,
} from 'react-native-iap'
import { supabase } from './supabase'
import { evento } from './instalacao'

const isIOS = Platform.OS === 'ios'
const isAndroid = Platform.OS === 'android'

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
  if (!isIOS && !isAndroid) return false
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

// ── Reconexão da loja (Android) ──
// O BillingClient do Google Play se desconecta sozinho (app em 2º plano, rede, Play Store atualizando) e o módulo nativo
// continua achando que está "inicializado": chamar initConnection de novo NÃO reconecta (devolve true na hora). Só
// endConnection + initConnection religa de verdade. Atenção: endConnection LIMPA todos os ouvintes de compra do JS; por
// isso quem registra ouvintes (tela Planos) assina aoReconectarIAP para registrá-los de novo depois de religar.
const ouvintesReconexao = new Set<() => void>()
export function aoReconectarIAP(cb: () => void): () => void {
  ouvintesReconexao.add(cb)
  return () => { ouvintesReconexao.delete(cb) }
}

let reconectando: Promise<boolean> | null = null
export function reconectandoIAP(): boolean { return reconectando !== null }

export function codigoErroIAP(e: any): string {
  const code = typeof e?.code === 'string' && e.code ? e.code : ''
  if (code) return code
  const msg = String(e?.message ?? '').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 30)
  return msg || 'desconhecido'
}

// A loja não está pronta (conexão caiu): vale reconectar e repetir UMA vez.
export function erroDeConexaoIAP(e: any): boolean {
  const code = String(e?.code ?? '').toLowerCase()
  if (code === 'not-prepared' || code === 'service-disconnected') return true
  return /not.?prepared|billing.?client.?not.?ready|service.?disconnected|billingclient.*(not|disconnected)/i.test(String(e?.message ?? ''))
}

export function reconectarIAP(): Promise<boolean> {
  if (!isAndroid) return garantirConexaoIAP()
  if (!reconectando) {
    reconectando = (async () => {
      iapPronto = false
      iapIniciando = null
      try { await endConnection() } catch { /* já estava fechada */ }
      const ok = await garantirConexaoIAP()
      if (ok) ouvintesReconexao.forEach(cb => { try { cb() } catch { /* nunca atrapalha */ } })
      return ok
    })().finally(() => { reconectando = null })
  }
  return reconectando
}

// Roda a operação da loja; se falhar por conexão caída (Android), reconecta e repete 1 vez. Funil: loja_erro com o código
// exato + ":retry_ok" quando a 2ª tentativa funcionou; se falhar de novo o erro volta com .reconexao = "retry_falhou"
// (ou "retry_sem_conexao" se nem religou) para quem chamou gravar em compra_erro/loja_erro. iOS: sem mudança.
export async function comReconexaoIAP<T>(op: () => Promise<T>): Promise<T> {
  if (!isAndroid) return op()
  try {
    return await op()
  } catch (e: any) {
    if (!erroDeConexaoIAP(e)) throw e
    const codigo = codigoErroIAP(e)
    const religou = await reconectarIAP()
    if (!religou) { try { e.reconexao = 'retry_sem_conexao' } catch { /* erro congelado */ } throw e }
    try {
      const valor = await op()
      evento('loja_erro', codigo + ':retry_ok')
      return valor
    } catch (e2: any) {
      try { e2.reconexao = 'retry_falhou' } catch { /* erro congelado */ }
      throw e2
    }
  }
}

// Guarda do botão Assinar: quando um erro de CONEXÃO chega pelo ouvinte de compra, quem chamou requestPurchase religa e repete
// sozinho. Se nada resolver em `ms`, libera o botão (aoEsgotar). Cancelável: a tela de pagamento do Google abrir (o retry
// resolveu), chegar qualquer resultado/erro de compra ou desmontar a tela cancela — o lojista pode demorar para pagar.
export function criarGuardaConexao(ms: number, aoEsgotar: () => void) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    armar() { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; aoEsgotar() }, ms) },
    cancelar() { if (timer) { clearTimeout(timer); timer = null } },
    armado() { return timer !== null },
  }
}

// Evita ficar "preso" para sempre se a loja não responder.
export function comTempoIAP<T>(p: Promise<T>, ms = 15000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error('tempo_esgotado'), { code: 'timeout' })), ms)
    p.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
  })
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

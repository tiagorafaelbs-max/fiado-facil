// Cliente do Google Play Developer API + gravação no banco. Usado por google-play-verify
// (app) e google-play-rtdn (avisos do Google). Regras puras em googlePlayEstado.ts.
import { SignJWT, importPKCS8 } from 'https://esm.sh/jose@5'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { concedeAcesso, decidirEscrita, interpretar, type AssinaturaV2, type Interpretada } from './googlePlayEstado.ts'

export const PACOTE = Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME') ?? 'com.fiadofacil.app'
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications'

let tokenCache: { valor: string; expira: number } | null = null

async function tokenGoogle(): Promise<string> {
  if (tokenCache && tokenCache.expira > Date.now() + 60_000) return tokenCache.valor
  const bruto = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON')
  if (!bruto) throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON não configurado')
  const conta = JSON.parse(bruto)
  const chave = await importPKCS8(String(conta.private_key).replace(/\\n/g, '\n'), 'RS256')
  const agora = Math.floor(Date.now() / 1000)
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/androidpublisher' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(conta.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(agora)
    .setExpirationTime(agora + 3000)
    .sign(chave)
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  if (!r.ok) throw new Error(`OAuth Google ${r.status}`)  // não loga o corpo: pode conter detalhes da conta
  const j = await r.json()
  tokenCache = { valor: j.access_token, expira: Date.now() + (j.expires_in ?? 3000) * 1000 }
  return tokenCache.valor
}

export type ResultadoConsulta =
  | { ok: true; bruta: AssinaturaV2 }
  | { ok: false; definitivo: boolean; http: number }   // definitivo = token inexistente/inválido: não adianta tentar de novo

export async function consultarAssinatura(purchaseToken: string): Promise<ResultadoConsulta> {
  const t = await tokenGoogle()
  const r = await fetch(`${API}/${PACOTE}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`, {
    headers: { Authorization: `Bearer ${t}` },
  })
  if (r.ok) return { ok: true, bruta: await r.json() }
  console.error('[google-play] subscriptionsv2.get falhou, http', r.status)
  return { ok: false, definitivo: r.status === 400 || r.status === 404 || r.status === 410, http: r.status }
}

// O Google estorna a compra se ela não for reconhecida em até 3 dias.
export async function reconhecer(produto: string, purchaseToken: string): Promise<boolean> {
  const t = await tokenGoogle()
  const r = await fetch(`${API}/${PACOTE}/purchases/subscriptions/${produto}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!r.ok) console.error('[google-play] acknowledge falhou, http', r.status)
  return r.ok
}

export function clienteServico() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
}

const MODULOS_PRO = ['score_cliente', 'relatorio_categoria', 'cobranca_automatica', 'equipe'] as const

export type ResultadoAplicar = 'aplicado' | 'ignorado' | 'token_de_outro_usuario'

// Grava a assinatura e ajusta módulos. O plano em si quem decide é o trigger sync_perfil_plano
// (com a trava da migration google_play_billing.sql), a partir de active_subscriptions.
export async function aplicarAssinatura(
  supabase: ReturnType<typeof clienteServico>,
  userId: string,
  token: string,
  info: Interpretada,
): Promise<ResultadoAplicar> {
  const [{ data: linha }, { data: perfil }] = await Promise.all([
    supabase.from('subscriptions').select('provider_subscription_id, status').eq('user_id', userId).eq('provider', 'google').maybeSingle(),
    supabase.from('perfis').select('plano, modulos').eq('id', userId).maybeSingle(),
  ])

  if (decidirEscrita({ status: info.status, token, linha, planoPerfil: perfil?.plano ?? null }) === 'ignorar') {
    console.log(`[google-play] ignorado: ${info.status} de outra compra para ${userId}`)
    return 'ignorado'
  }

  const { error } = await supabase.from('subscriptions').upsert({
    user_id: userId,
    provider: 'google',
    provider_subscription_id: token,
    plan_id: info.planId,
    status: info.status,
    cancel_at_period_end: info.cancelAtPeriodEnd,
    current_period_start: info.inicio,
    current_period_end: info.fimPeriodo,
    grace_period_end: info.fimCarencia,
    canceled_at: info.status === 'cancelled' || info.cancelAtPeriodEnd ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,provider' })
  if (error) {
    if (error.code === '23505') return 'token_de_outro_usuario'   // índice único (provider, provider_subscription_id)
    throw new Error(`upsert subscriptions: ${error.code}`)
  }

  // Módulos Pro acompanham o plano que o trigger acabou de decidir.
  const { data: depois } = await supabase.from('perfis').select('plano, modulos').eq('id', userId).maybeSingle()
  const modulos: Record<string, unknown> = { ...(depois?.modulos ?? {}) }
  const pro = depois?.plano === 'pro'
  for (const k of MODULOS_PRO) modulos[k] = pro
  if (concedeAcesso(info.status) && !pro) {
    // O trigger deveria ter promovido; se não promoveu, falha alto em vez de dizer "ativo".
    throw new Error('assinatura ativa gravada, mas perfis.plano não virou pro')
  }
  const { error: e2 } = await supabase.from('perfis').update({ modulos }).eq('id', userId)
  if (e2) throw new Error(`update perfis.modulos: ${e2.code}`)
  return 'aplicado'
}

export { interpretar }

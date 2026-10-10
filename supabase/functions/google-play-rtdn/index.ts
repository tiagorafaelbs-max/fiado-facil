// Avisos em tempo real do Google Play (renovação, cancelamento, expiração, reembolso...)
// via Pub/Sub push. verify_jwt = false (supabase/config.toml): quem autentica é o OIDC do Pub/Sub.
// O corpo da notificação NUNCA é confiado: serve só para saber QUAL token consultar; o estado
// vem sempre da consulta ao Google.
import { createRemoteJWKSet, jwtVerify } from 'https://esm.sh/jose@5'
import { aplicarAssinatura, clienteServico, consultarAssinatura, interpretar, PACOTE, reconhecer } from '../_shared/googlePlay.ts'
import { ehUuid } from '../_shared/googlePlayEstado.ts'

const AUDIENCE = Deno.env.get('GOOGLE_RTDN_AUDIENCE') ?? ''
const SA_EMAIL = Deno.env.get('GOOGLE_RTDN_SA_EMAIL') ?? ''
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

async function autenticado(req: Request): Promise<boolean> {
  if (!AUDIENCE || !SA_EMAIL) {
    console.error('[rtdn] GOOGLE_RTDN_AUDIENCE/GOOGLE_RTDN_SA_EMAIL não configurados')
    return false
  }
  const h = req.headers.get('Authorization') ?? ''
  if (!h.startsWith('Bearer ')) return false
  try {
    const { payload } = await jwtVerify(h.slice(7), JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: AUDIENCE,
    })
    return payload.email === SA_EMAIL && payload.email_verified === true
  } catch (e) {
    console.error('[rtdn] OIDC inválido:', (e as Error)?.message)
    return false
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!(await autenticado(req))) return new Response('Unauthorized', { status: 401 })

  let aviso: Record<string, any>
  try {
    const corpo = await req.json()
    aviso = JSON.parse(atob(corpo?.message?.data ?? ''))
  } catch {
    return new Response('OK', { status: 200 }) // lixo: reenviar não adianta
  }
  if (aviso.packageName !== PACOTE) return new Response('OK', { status: 200 })
  if (aviso.testNotification) {
    console.log('[rtdn] notificação de teste recebida')
    return new Response('OK', { status: 200 })
  }

  // Compra anulada (reembolso/estorno) também traz o token da assinatura.
  const token: string | undefined =
    aviso.subscriptionNotification?.purchaseToken ??
    (aviso.voidedPurchaseNotification?.productType === 1 ? aviso.voidedPurchaseNotification?.purchaseToken : undefined)
  if (!token) return new Response('OK', { status: 200 }) // produto avulso: não vendemos

  try {
    const consulta = await consultarAssinatura(token)
    if (!consulta.ok) {
      // 401/403 do Google = permissão da conta de serviço (configuração), não falha passageira: reenviar não
      // resolve e o Pub/Sub repetiria o aviso sem parar (80 mil chamadas/dia). Registra 1 linha e confirma (200);
      // a reconciliação no app (ao abrir / entrar / Restaurar compras) ativa a assinatura depois.
      if (consulta.http === 401 || consulta.http === 403) {
        console.warn(`[rtdn] Google negou a consulta (http ${consulta.http}); respondendo 200, a reconciliação no app cobre depois`)
        return new Response('OK', { status: 200 })
      }
      return consulta.definitivo ? new Response('OK', { status: 200 }) : new Response('Retry', { status: 502 })
    }
    const info = interpretar(consulta.bruta)
    if (!info) return new Response('OK', { status: 200 })

    const supabase = clienteServico()
    // Dono da assinatura: primeiro pelo token já gravado; senão pela conta ofuscada da compra.
    const { data: linha } = await supabase
      .from('subscriptions').select('user_id')
      .eq('provider', 'google').eq('provider_subscription_id', token).maybeSingle()
    let userId: string | null = linha?.user_id ?? null
    if (!userId && ehUuid(info.contaOfuscada)) {
      const { data: perfil } = await supabase.from('perfis').select('id').eq('id', info.contaOfuscada).maybeSingle()
      userId = perfil?.id ?? null
    }
    if (!userId) {
      console.warn('[rtdn] assinatura sem dono conhecido')
      return new Response('OK', { status: 200 })
    }

    // Se o app fechou antes do google-play-verify, quem reconhece é este aviso
    // (senão o Google estorna em 3 dias).
    if (info.precisaReconhecer && !(await reconhecer(info.produto, token))) {
      return new Response('Retry', { status: 502 })
    }

    await aplicarAssinatura(supabase, userId, token, info)
    return new Response('OK', { status: 200 })
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e)
    if (/^OAuth Google (401|403)/.test(msg)) {
      console.warn(`[rtdn] ${msg}; respondendo 200, a reconciliação no app cobre depois`)
      return new Response('OK', { status: 200 })
    }
    console.error('[rtdn]', msg)
    return new Response('Retry', { status: 500 })
  }
})

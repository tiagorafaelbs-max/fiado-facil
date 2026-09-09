import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const mpSecret = Deno.env.get('MP_WEBHOOK_SECRET')
  const mpToken = Deno.env.get('MP_ACCESS_TOKEN')
  if (!mpSecret || !mpToken) {
    console.error('MP env vars not set')
    return new Response('Server misconfigured', { status: 500 })
  }

  // Validar assinatura do MercadoPago
  // Header: x-signature = "ts=<timestamp>,v1=<hmac_sha256_hex>"
  const xSignature = req.headers.get('x-signature') ?? ''
  const xRequestId = req.headers.get('x-request-id') ?? ''
  const url = new URL(req.url)
  const dataId = url.searchParams.get('data.id') ?? ''

  const sigParts = Object.fromEntries(
    xSignature.split(',').map((p) => p.split('=') as [string, string])
  )
  const ts = sigParts['ts']
  const v1 = sigParts['v1']

  if (!ts || !v1) {
    return new Response('Missing signature', { status: 401 })
  }

  // Anti-replay: rejeitar se timestamp > 5 minutos
  const tsNum = parseInt(ts, 10)
  const diffSeconds = Math.abs(Date.now() / 1000 - tsNum)
  if (diffSeconds > 300) {
    return new Response('Signature expired', { status: 401 })
  }

  // Template MercadoPago: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
  const rawBody = await req.text()
  let bodyJson: any = {}
  try { bodyJson = JSON.parse(rawBody) } catch { /* ignora */ }

  const resolvedDataId = dataId || bodyJson?.data?.id || ''
  const template = `id:${resolvedDataId};request-id:${xRequestId};ts:${ts};`

  const encoder = new TextEncoder()
  const keyData = encoder.encode(mpSecret)
  const msgData = encoder.encode(template)
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, msgData)
  const expected = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  if (expected !== v1) {
    return new Response('Invalid signature', { status: 401 })
  }

  const eventType = bodyJson?.type
  if (eventType !== 'subscription_preapproval') {
    // Outros tipos (payment, etc.) — ignorar
    return new Response('OK', { status: 200 })
  }

  const subscriptionId = resolvedDataId
  if (!subscriptionId) {
    return new Response('Missing subscription id', { status: 400 })
  }

  // Consultar detalhes completos na API do MercadoPago
  const mpRes = await fetch(
    `https://api.mercadopago.com/preapproval/${subscriptionId}`,
    { headers: { Authorization: `Bearer ${mpToken}` } }
  )

  if (!mpRes.ok) {
    console.error('MP API error:', await mpRes.text())
    return new Response('MP API error', { status: 502 })
  }

  const sub = await mpRes.json()
  const userId = sub.external_reference

  if (!userId) {
    console.error('external_reference missing in MP subscription:', subscriptionId)
    return new Response('Missing external_reference', { status: 400 })
  }

  // Mapear status do MercadoPago para nosso schema
  const statusMap: Record<string, string> = {
    authorized: 'active',
    paused: 'paused',
    cancelled: 'cancelled',
    pending: 'expired',  // pending sem pagamento = sem acesso
  }
  const status = statusMap[sub.status] ?? 'expired'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        provider: 'mercadopago',
        provider_subscription_id: subscriptionId,
        plan_id: 'pro_monthly',
        status,
        current_period_end: sub.next_payment_date
          ? new Date(sub.next_payment_date).toISOString()
          : null,
        canceled_at: sub.status === 'cancelled' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' }
    )

  if (error) {
    console.error('Supabase upsert error:', error)
    return new Response('Database error', { status: 500 })
  }

  // Sincroniza plano e módulos em perfis com base no status da assinatura
  const { data: perfilAtual } = await supabase
    .from('perfis').select('modulos').eq('id', userId).single()

  const MODULOS_PRO_KEYS = ['score_cliente', 'relatorio_categoria', 'cobranca_automatica', 'equipe'] as const

  if (status === 'active') {
    const modulosAtualizados = {
      ...(perfilAtual?.modulos ?? {}),
      score_cliente: true,
      relatorio_categoria: true,
      cobranca_automatica: true,
      equipe: true,
    }
    await supabase.from('perfis').update({ plano: 'pro', modulos: modulosAtualizados }).eq('id', userId)
    console.log(`Plano Pro ativado via MercadoPago para ${userId}`)
  } else if (status === 'cancelled' || status === 'expired') {
    const modulosDowngrade = { ...(perfilAtual?.modulos ?? {}) }
    for (const key of MODULOS_PRO_KEYS) modulosDowngrade[key] = false
    await supabase.from('perfis').update({ plano: 'free', modulos: modulosDowngrade }).eq('id', userId)
    console.log(`Plano revertido para free via MercadoPago para ${userId}`)
  }

  return new Response('OK', { status: 200 })
})

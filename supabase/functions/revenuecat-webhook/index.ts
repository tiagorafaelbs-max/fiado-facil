import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ACTIVATION_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
])

const EXPIRE_EVENTS = new Set(['EXPIRATION', 'CANCELLATION'])

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET')
  if (!secret) {
    console.error('REVENUECAT_WEBHOOK_SECRET not set')
    return new Response('Server misconfigured', { status: 500 })
  }

  // RevenueCat envia Authorization: Bearer <secret>
  const authHeader = req.headers.get('Authorization') ?? ''
  const incoming = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (incoming !== secret) {
    return new Response('Unauthorized', { status: 401 })
  }

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const event = payload?.event
  if (!event) return new Response('Missing event', { status: 400 })

  const { type, app_user_id: userId, store, expiration_at_ms: expirationMs } = event

  if (!userId || !type) {
    return new Response('Missing required fields', { status: 400 })
  }

  // Valida que userId é um UUID válido antes de usar no banco
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!UUID_REGEX.test(userId)) {
    console.warn(`RevenueCat: app_user_id não é UUID válido: "${userId}" — ignorando`)
    return new Response('OK', { status: 200 })
  }

  console.log(`RevenueCat event: ${type} for user ${userId}`)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  if (ACTIVATION_EVENTS.has(type)) {
    // Ativa plano Pro
    const { error } = await supabase
      .from('perfis')
      .update({ plano: 'pro' })
      .eq('id', userId)

    if (error) {
      console.error('Erro ao ativar plano pro:', error)
      return new Response('Database error', { status: 500 })
    }
    console.log(`Plano Pro ativado para ${userId} via RevenueCat (${type})`)
  } else if (EXPIRE_EVENTS.has(type)) {
    // Revoga plano Pro — só rebaixa se já expirou (não rebaixa cancel antecipado)
    const now = Date.now()
    const expired = !expirationMs || expirationMs < now

    if (expired) {
      const { error } = await supabase
        .from('perfis')
        .update({ plano: 'gratuito' })
        .eq('id', userId)

      if (error) {
        console.error('Erro ao revogar plano pro:', error)
        return new Response('Database error', { status: 500 })
      }
      console.log(`Plano revertido para gratuito: ${userId} (${type})`)
    } else {
      // Cancelado mas ainda no período pago — mantém Pro até expirar
      console.log(`Cancelamento agendado para ${userId}, Pro mantido até ${new Date(expirationMs).toISOString()}`)
    }
  } else {
    console.log(`Evento não tratado: ${type}`)
  }

  return new Response('OK', { status: 200 })
})

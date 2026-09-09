import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts'

const MP_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')!
const MP_WEBHOOK_SECRET = Deno.env.get('MP_WEBHOOK_SECRET') // opcional — sem isso, aceita qualquer origem
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Verifica assinatura HMAC-SHA256 do MercadoPago
// Documentação: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
async function verificarAssinatura(req: Request, dataId: string): Promise<boolean> {
  if (!MP_WEBHOOK_SECRET) {
    console.error('[mp-webhook] MP_WEBHOOK_SECRET não configurado — rejeitando requisição')
    return false
  }

  const xSignature = req.headers.get('x-signature')
  const xRequestId = req.headers.get('x-request-id')

  if (!xSignature || !xRequestId) {
    console.error('[mp-webhook] Headers x-signature ou x-request-id ausentes')
    return false
  }

  // Extrai ts e v1 do header x-signature
  const parts = Object.fromEntries(xSignature.split(',').map(p => p.split('=')))
  const ts = parts['ts']
  const v1 = parts['v1']

  if (!ts || !v1) {
    console.error('[mp-webhook] Formato de x-signature inválido:', xSignature)
    return false
  }

  // Monta a string a ser assinada: id:<dataId>;request-id:<requestId>;ts:<ts>
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts}`
  const encoder = new TextEncoder()

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(MP_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(manifest))
  const hashHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('')

  if (hashHex !== v1) {
    console.error('[mp-webhook] Assinatura inválida. Esperado:', hashHex, 'Recebido:', v1)
    return false
  }

  return true
}

serve(async (req) => {
  try {
    const body = await req.json()
    console.log('MP webhook:', JSON.stringify(body))

    const type = body.type ?? body.topic
    const resourceId = body.data?.id ?? body.id

    if (!type || !resourceId) {
      return new Response('ok', { status: 200 })
    }

    // Verifica assinatura HMAC (só para notificações reais com data.id)
    if (body.data?.id) {
      const assinaturaValida = await verificarAssinatura(req, body.data.id)
      if (!assinaturaValida) {
        return new Response('unauthorized', { status: 401 })
      }
    }

    // Trata notificações de assinatura (preapproval)
    if (type === 'subscription_preapproval' || type === 'preapproval') {
      const preapprovalResp = await fetch(
        `https://api.mercadopago.com/preapproval/${resourceId}`,
        { headers: { Authorization: `Bearer ${MP_TOKEN}` } },
      )
      const preapproval = await preapprovalResp.json()
      console.log('preapproval:', JSON.stringify(preapproval))

      const userId = preapproval.external_reference
      const status = preapproval.status // authorized | paused | cancelled | pending

      if (!userId) {
        console.warn('Sem external_reference, ignorando')
        return new Response('ok', { status: 200 })
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

      if (status === 'authorized') {
        await supabase
          .from('perfis')
          .update({ plano: 'pro' })
          .eq('id', userId)
        console.log(`Plano Pro ativado para ${userId}`)
      } else if (status === 'cancelled' || status === 'paused') {
        await supabase
          .from('perfis')
          .update({ plano: 'gratuito' })
          .eq('id', userId)
        console.log(`Plano revertido para gratuito: ${userId}`)
      }
    }

    return new Response('ok', { status: 200 })
  } catch (err) {
    console.error('Webhook error:', err)
    return new Response('error', { status: 500 })
  }
})

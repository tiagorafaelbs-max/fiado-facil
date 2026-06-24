import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MP_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  try {
    const body = await req.json()
    console.log('MP webhook:', JSON.stringify(body))

    const type = body.type ?? body.topic
    const resourceId = body.data?.id ?? body.id

    if (!type || !resourceId) {
      return new Response('ok', { status: 200 })
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
        // Ativa plano Pro
        await supabase
          .from('perfis')
          .update({ plano: 'pro' })
          .eq('id', userId)
        console.log(`Plano Pro ativado para ${userId}`)
      } else if (status === 'cancelled' || status === 'paused') {
        // Cancela — volta para gratuito
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

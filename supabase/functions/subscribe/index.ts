import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MP_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const PLAN_IDS = {
  monthly: 'bbd3a50e08474bf2875d30e214658e6d',
  annual: '4860a5ae9f11475b9f2dbbd7a0de2848',
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verifica autenticação do usuário via Supabase
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { plan_type = 'monthly' } = await req.json()
    const plan_id = PLAN_IDS[plan_type as keyof typeof PLAN_IDS] ?? PLAN_IDS.monthly

    // Busca email do perfil
    const { data: perfil } = await supabase
      .from('perfis')
      .select('email')
      .eq('id', user.id)
      .single()

    const payer_email = perfil?.email ?? user.email ?? ''

    // Cria preapproval (assinatura individual) no MercadoPago
    const mpResp = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        preapproval_plan_id: plan_id,
        payer_email,
        external_reference: user.id,
        back_url: 'https://tiagorafaelbs-max.github.io/fiado-facil/',
        auto_recurring: plan_type === 'annual'
          ? { frequency: 12, frequency_type: 'months', transaction_amount: 149, currency_id: 'BRL' }
          : { frequency: 1, frequency_type: 'months', transaction_amount: 19, currency_id: 'BRL' },
      }),
    })

    const mpData = await mpResp.json()

    if (!mpResp.ok) {
      console.error('MP error:', mpData)
      return new Response(JSON.stringify({ error: 'Erro ao criar assinatura', detail: mpData }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ init_point: mpData.init_point }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

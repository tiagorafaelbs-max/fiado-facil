import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MP_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')
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
    // Diagnóstico: verifica se token MP está configurado
    if (!MP_TOKEN) {
      console.error('[subscribe] ERRO: MP_ACCESS_TOKEN não configurado nas env vars da edge function')
      return new Response(JSON.stringify({
        error: 'MP_ACCESS_TOKEN não configurado',
        diagnostico: 'Variável de ambiente MP_ACCESS_TOKEN está ausente no Supabase Edge Functions'
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

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

    const payer_email = user.email ?? ''

    console.log(`[subscribe] Criando assinatura MP: plan_type=${plan_type}, plan_id=${plan_id}, email=${payer_email}`)

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
        back_url: 'https://fiadoapp.app.br',
        // Define explicitamente o webhook desta assinatura em vez de depender
        // só da URL configurada no painel do MP (evita ambiguidade entre
        // mp-webhook e mercadopago-webhook — mantidos idênticos em efeito,
        // mas fixamos um canal único e conhecido para novas assinaturas).
        notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`,
      }),
    })

    const mpData = await mpResp.json()

    console.log(`[subscribe] MP status=${mpResp.status}`, JSON.stringify(mpData))

    if (!mpResp.ok) {
      // Retorna o erro completo do MP para diagnóstico
      const mpErrorMsg = mpData?.message ?? mpData?.error ?? JSON.stringify(mpData)
      return new Response(JSON.stringify({
        error: `MercadoPago: ${mpErrorMsg}`,
        mp_status: mpResp.status,
        mp_detail: mpData,
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!mpData.init_point) {
      console.error('[subscribe] MP retornou OK mas sem init_point:', mpData)
      return new Response(JSON.stringify({ error: 'MP não retornou init_point', mp_detail: mpData }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ init_point: mpData.init_point }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[subscribe] Exceção:', err?.message ?? err)
    return new Response(JSON.stringify({ error: `Erro interno: ${err?.message ?? 'desconhecido'}` }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

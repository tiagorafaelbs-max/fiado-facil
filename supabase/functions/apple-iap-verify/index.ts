import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { importX509, compactVerify } from 'https://esm.sh/jose@5'

const APPLE_VERIFY_URL_PROD    = 'https://buy.itunes.apple.com/verifyReceipt'
const APPLE_VERIFY_URL_SANDBOX = 'https://sandbox.itunes.apple.com/verifyReceipt'
const APPLE_SHARED_SECRET      = Deno.env.get('APPLE_IAP_SHARED_SECRET') ?? ''

const SKU_MENSAL = 'com.fiadofacil.app.pro.monthly'
const SKU_ANUAL  = 'com.fiadofacil.app.pro.annual'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Detecta JWS (StoreKit 2): três partes base64url separadas por ponto
function isJWS(receipt: string): boolean {
  const parts = receipt.trim().split('.')
  return parts.length === 3 && !receipt.includes(' ') && !receipt.includes('\n')
}

// Verifica a assinatura Apple do JWS usando a chave pública do certificado folha (x5c[0])
// e retorna o payload decodificado. Lança erro se a assinatura for inválida.
async function verifyAndDecodeAppleJWS(jws: string): Promise<Record<string, unknown>> {
  const [headerB64] = jws.split('.')
  const padded = headerB64.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - headerB64.length % 4) % 4)
  const header = JSON.parse(atob(padded)) as { alg?: string; x5c?: string[] }

  if (header.alg !== 'ES256') {
    throw new Error(`Algoritmo inesperado: ${header.alg}`)
  }

  const x5c = header.x5c
  if (!x5c || x5c.length === 0) {
    throw new Error('JWS header sem x5c')
  }

  // Importa o certificado folha (primeiro da cadeia) como chave pública
  const leafPem = `-----BEGIN CERTIFICATE-----\n${x5c[0]}\n-----END CERTIFICATE-----`
  const publicKey = await importX509(leafPem, 'ES256')

  // Verifica assinatura — lança se inválida
  const { payload } = await compactVerify(jws, publicKey)
  return JSON.parse(new TextDecoder().decode(payload))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401 })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) return new Response('Unauthorized', { status: 401 })

    const { receipt, productId } = await req.json()
    if (!receipt) {
      return new Response(JSON.stringify({ error: 'receipt required' }), { status: 400 })
    }

    let planoTipo: 'monthly' | 'annual' = 'monthly'

    if (isJWS(receipt)) {
      // StoreKit 2: verifica assinatura Apple antes de confiar no payload
      let payload: Record<string, unknown>
      try {
        payload = await verifyAndDecodeAppleJWS(receipt)
      } catch (e) {
        console.error('JWS verification failed:', e)
        return new Response(
          JSON.stringify({ error: 'Invalid JWS signature' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const pid = (payload.productId as string) ?? productId ?? ''
      if (pid !== SKU_MENSAL && pid !== SKU_ANUAL) {
        console.error('Product ID invalido:', pid)
        return new Response(
          JSON.stringify({ error: 'Invalid product' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // expiresDate no JWS pode estar em ms ou segundos — normaliza para ms
      const rawExpires = payload.expiresDate as number | string | undefined
      let expiresMs = 0
      if (rawExpires !== undefined && rawExpires !== null) {
        const n = typeof rawExpires === 'number' ? rawExpires : parseInt(String(rawExpires))
        expiresMs = n < 1_000_000_000_000 ? n * 1000 : n
      }

      // Rejeita se expiresDate ausente ou assinatura expirada
      if (expiresMs === 0 || expiresMs <= Date.now()) {
        console.warn('JWS expirado ou sem data:', { expiresMs, userId: user.id })
        return new Response(
          JSON.stringify({ error: 'Subscription expired or invalid' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      planoTipo = pid === SKU_ANUAL ? 'annual' : 'monthly'
      console.log(`JWS valido: produto=${pid}, expira=${new Date(expiresMs).toISOString()}`)

    } else {
      // StoreKit 1: AppReceipt base64 — verifica com Apple verifyReceipt
      const verifyBody = JSON.stringify({
        'receipt-data': receipt,
        'password': APPLE_SHARED_SECRET,
        'exclude-old-transactions': true,
      })

      let appleResp = await fetch(APPLE_VERIFY_URL_PROD, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: verifyBody,
      })
      let appleData = await appleResp.json()

      // Status 21007 = recibo sandbox enviado para produção
      if (appleData.status === 21007) {
        appleResp = await fetch(APPLE_VERIFY_URL_SANDBOX, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: verifyBody,
        })
        appleData = await appleResp.json()
      }

      if (appleData.status !== 0) {
        console.error('Apple IAP verify failed, status:', appleData.status)
        return new Response(
          JSON.stringify({ error: 'Invalid receipt', status: appleData.status }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const latestInfo = appleData.latest_receipt_info ?? []
      const now = Date.now()
      const activeSub = latestInfo
        .filter((info: Record<string, string>) => {
          const expMs = parseInt(info.expires_date_ms ?? '0')
          return expMs > now && (info.product_id === SKU_MENSAL || info.product_id === SKU_ANUAL)
        })
        .sort((a: Record<string, string>, b: Record<string, string>) =>
          parseInt(b.expires_date_ms) - parseInt(a.expires_date_ms)
        )[0]

      if (!activeSub) {
        console.warn('No active subscription found for user:', user.id)
        return new Response(
          JSON.stringify({ error: 'No active subscription found' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      planoTipo = activeSub.product_id === SKU_ANUAL ? 'annual' : 'monthly'
    }

    // Lê módulos atuais para fazer merge
    const { data: perfilAtual } = await supabase
      .from('perfis').select('modulos').eq('id', user.id).single()

    const modulosAtualizados = {
      ...(perfilAtual?.modulos ?? {}),
      score_cliente: true,
      relatorio_categoria: true,
      cobranca_automatica: true,
      equipe: true,
    }

    const { error: updateError } = await supabase
      .from('perfis')
      .update({ plano: 'pro', modulos: modulosAtualizados })
      .eq('id', user.id)

    if (updateError) {
      console.error('Failed to update perfis.plano:', updateError)
      return new Response(
        JSON.stringify({ error: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    console.log(`Plano Pro ativado via Apple IAP para ${user.id} (${planoTipo})`)

    return new Response(
      JSON.stringify({ success: true, plano: planoTipo }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error(err)
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

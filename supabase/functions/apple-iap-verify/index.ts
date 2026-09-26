import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { importX509, compactVerify } from 'https://esm.sh/jose@5'
import 'https://esm.sh/reflect-metadata@0.2.2'
import * as x509 from 'https://esm.sh/@peculiar/x509@2.1.0'

x509.cryptoProvider.set(crypto)

const APPLE_VERIFY_URL_PROD    = 'https://buy.itunes.apple.com/verifyReceipt'
const APPLE_VERIFY_URL_SANDBOX = 'https://sandbox.itunes.apple.com/verifyReceipt'
const APPLE_SHARED_SECRET      = Deno.env.get('APPLE_IAP_SHARED_SECRET') ?? ''

// Root CA oficial da Apple (https://www.apple.com/certificateauthority/AppleRootCA-G3.cer).
// É pública e estável — pinada aqui em vez de baixada a cada chamada, com o fingerprint
// conferido no boot como defesa contra o PEM ser adulterado por engano num merge futuro.
const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`
const APPLE_ROOT_CA_G3_SHA256_FINGERPRINT = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179'

function bufferToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Valida a cadeia de certificados do JWS até a Root CA oficial da Apple — sem isso,
// qualquer pessoa pode se autoassinar um certificado, colocá-lo como x5c[0] e forjar
// um recibo "válido" sem nenhum pagamento real (vulnerabilidade corrigida em 26/09).
async function verificarCadeiaApple(x5c: string[]): Promise<void> {
  if (!x5c || x5c.length < 2) {
    throw new Error('Cadeia de certificados incompleta no JWS (esperado folha + intermediário)')
  }

  const rootCert = new x509.X509Certificate(APPLE_ROOT_CA_G3_PEM)
  const rootThumb = bufferToHex(await rootCert.getThumbprint('SHA-256'))
  if (rootThumb !== APPLE_ROOT_CA_G3_SHA256_FINGERPRINT) {
    throw new Error('Root CA da Apple pinada não confere com o fingerprint esperado')
  }

  const certs = x5c.map(b64 => new x509.X509Certificate(b64))
  const agora = new Date()

  for (const cert of certs) {
    if (agora < cert.notBefore || agora > cert.notAfter) {
      throw new Error(`Certificado fora do período de validade: ${cert.subject}`)
    }
  }

  // Cada elo da cadeia precisa estar assinado pela chave pública do próximo.
  for (let i = 0; i < certs.length - 1; i++) {
    const valido = await certs[i].verify({ publicKey: certs[i + 1].publicKey, date: agora })
    if (!valido) throw new Error(`Assinatura inválida na cadeia de certificados (posição ${i})`)
  }

  // O topo da cadeia enviada precisa fechar na Root CA pinada da Apple.
  const topo = certs[certs.length - 1]
  const fechaNaRoot = await topo.verify({ publicKey: rootCert.publicKey, date: agora })
  if (!fechaNaRoot) {
    throw new Error('Cadeia de certificados não fecha na Root CA oficial da Apple')
  }
}

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

  // Ancora a cadeia na Root CA da Apple antes de confiar em qualquer coisa do recibo —
  // sem isso, o passo abaixo (importar x5c[0] e verificar contra ele mesmo) é circular
  // e aceita qualquer certificado autoassinado.
  await verificarCadeiaApple(x5c)

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

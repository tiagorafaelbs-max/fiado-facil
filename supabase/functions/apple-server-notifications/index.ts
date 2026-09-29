import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { importX509, compactVerify } from 'https://esm.sh/jose@5'
import 'https://esm.sh/reflect-metadata@0.2.2'
import * as x509 from 'https://esm.sh/@peculiar/x509@2.1.0'

// Recebe App Store Server Notifications V2 (webhook da Apple) e mantém
// perfis.plano sincronizado com o status real da assinatura -- hoje
// apple-iap-verify só ATIVA o Pro na hora da compra e nunca REBAIXA quando
// a assinatura expira, falha ao renovar, é reembolsada ou revogada. Esta
// function fecha esse buraco.
//
// Requer a migration `perfis.apple_original_transaction_id` (proposta,
// NÃO aplicada) -- é a chave que liga um evento da Apple (que só manda o
// originalTransactionId, nunca o user_id do Supabase) ao perfil certo.
// `apple-iap-verify` precisa gravar esse campo na hora da compra -- também
// ainda não alterado, fica pronto pra publicar junto.

x509.cryptoProvider.set(crypto)

// Mesma Root CA G3 e mesma lógica de apple-iap-verify -- ver esse arquivo
// para o comentário completo sobre por que a cadeia precisa ser validada
// (evita o mesmo tipo de recibo forjado corrigido em 26/09).
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
  for (let i = 0; i < certs.length - 1; i++) {
    const valido = await certs[i].verify({ publicKey: certs[i + 1].publicKey, date: agora })
    if (!valido) throw new Error(`Assinatura inválida na cadeia de certificados (posição ${i})`)
  }
  const topo = certs[certs.length - 1]
  const fechaNaRoot = await topo.verify({ publicKey: rootCert.publicKey, date: agora })
  if (!fechaNaRoot) throw new Error('Cadeia de certificados não fecha na Root CA oficial da Apple')
}

// Verifica e decodifica QUALQUER JWS assinado pela Apple com esse formato de
// header (x5c) -- usado tanto para o payload externo da notificação quanto
// para os JWS aninhados signedTransactionInfo/signedRenewalInfo.
async function verificarEDecodificarJWS(jws: string): Promise<Record<string, unknown>> {
  const [headerB64] = jws.split('.')
  const padded = headerB64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - headerB64.length % 4) % 4)
  const header = JSON.parse(atob(padded)) as { alg?: string; x5c?: string[] }
  if (header.alg !== 'ES256') throw new Error(`Algoritmo inesperado: ${header.alg}`)
  const x5c = header.x5c
  if (!x5c || x5c.length === 0) throw new Error('JWS sem x5c no header')
  await verificarCadeiaApple(x5c)
  const leafPem = `-----BEGIN CERTIFICATE-----\n${x5c[0]}\n-----END CERTIFICATE-----`
  const publicKey = await importX509(leafPem, 'ES256')
  const { payload } = await compactVerify(jws, publicKey)
  return JSON.parse(new TextDecoder().decode(payload))
}

const MODULOS_PRO_KEYS = ['score_cliente', 'relatorio_categoria', 'cobranca_automatica', 'equipe'] as const

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body = await req.json().catch(() => null)
    const signedPayload = body?.signedPayload
    if (!signedPayload || typeof signedPayload !== 'string') {
      return new Response('Missing signedPayload', { status: 400 })
    }

    const payload = await verificarEDecodificarJWS(signedPayload)
    const notificationType = payload.notificationType as string
    const subtype = payload.subtype as string | undefined
    const data = payload.data as Record<string, unknown> | undefined

    if (!data?.signedTransactionInfo) {
      // Eventos sem transação associada (ex: TEST, do botão "Send Test Notification"
      // do App Store Connect) -- confirma recebimento sem processar.
      console.log(`[apple-server-notifications] ${notificationType} sem signedTransactionInfo, ignorando`)
      return new Response('OK', { status: 200 })
    }

    const transactionInfo = await verificarEDecodificarJWS(data.signedTransactionInfo as string)
    const originalTransactionId = transactionInfo.originalTransactionId as string | undefined
    if (!originalTransactionId) {
      console.error('[apple-server-notifications] Transação sem originalTransactionId')
      return new Response('Missing originalTransactionId', { status: 400 })
    }

    // signedRenewalInfo só vem em eventos de renovação/falha -- usado pra checar
    // se a carência (grace period) do DID_FAIL_TO_RENEW já expirou de verdade,
    // em vez de confiar só no subtype.
    let gracePeriodExpiresMs: number | null = null
    if (data.signedRenewalInfo) {
      try {
        const renewalInfo = await verificarEDecodificarJWS(data.signedRenewalInfo as string)
        const raw = renewalInfo.gracePeriodExpiresDate as number | undefined
        if (raw) gracePeriodExpiresMs = raw
      } catch (e) {
        console.warn('[apple-server-notifications] Falha ao validar signedRenewalInfo:', e)
      }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: perfil } = await supabase
      .from('perfis')
      .select('id, modulos')
      .eq('apple_original_transaction_id', originalTransactionId)
      .maybeSingle()

    if (!perfil) {
      // Sem perfil vinculado (ex: compra feita antes desta migration existir, ou
      // apple-iap-verify falhou ao gravar o originalTransactionId). Responde 200
      // pra Apple não ficar re-tentando pra sempre -- fica só no log pra investigar.
      console.warn(`[apple-server-notifications] Nenhum perfil com apple_original_transaction_id=${originalTransactionId} (evento ${notificationType}${subtype ? '/' + subtype : ''})`)
      return new Response('OK', { status: 200 })
    }

    async function ativarPro() {
      const modulosAtualizados: Record<string, unknown> = { ...(perfil!.modulos ?? {}) }
      for (const k of MODULOS_PRO_KEYS) modulosAtualizados[k] = true
      const { error } = await supabase.from('perfis').update({ plano: 'pro', modulos: modulosAtualizados }).eq('id', perfil!.id)
      if (error) throw error
      console.log(`[apple-server-notifications] Pro ativado para ${perfil!.id} via ${notificationType}`)
    }

    async function revogarPro(motivo: string) {
      const modulosDowngrade: Record<string, unknown> = { ...(perfil!.modulos ?? {}) }
      for (const k of MODULOS_PRO_KEYS) modulosDowngrade[k] = false
      const { error } = await supabase.from('perfis').update({ plano: 'gratuito', modulos: modulosDowngrade }).eq('id', perfil!.id)
      if (error) throw error
      console.log(`[apple-server-notifications] Pro revogado para ${perfil!.id} via ${motivo}`)
    }

    switch (notificationType) {
      case 'SUBSCRIBED':
      case 'DID_RENEW':
        // Renovação (ou primeira ativação) bem-sucedida.
        await ativarPro()
        break

      case 'EXPIRED':
        // Assinatura expirou de vez (cancelou e não renovou, ou billing retry esgotado).
        await revogarPro(notificationType)
        break

      case 'REFUND':
      case 'REVOKE':
        // Reembolso ou revogação (ex: Family Sharing removido) -- acesso cai na hora.
        await revogarPro(notificationType)
        break

      case 'DID_FAIL_TO_RENEW':
        if (subtype === 'GRACE_PERIOD' && (gracePeriodExpiresMs === null || Date.now() < gracePeriodExpiresMs)) {
          // Apple ainda está tentando cobrar de novo e o app deve manter acesso
          // durante a carência -- não rebaixa.
          console.log(`[apple-server-notifications] Falha ao renovar em carência para ${perfil.id}, mantendo Pro`)
        } else {
          await revogarPro(`DID_FAIL_TO_RENEW${subtype ? '/' + subtype : ''}`)
        }
        break

      default:
        // CANCEL (cancelou mas ainda não expirou), PRICE_INCREASE, RENEWAL_EXTENDED
        // etc. não mudam o acesso imediatamente -- só loga.
        console.log(`[apple-server-notifications] Evento não tratado: ${notificationType}${subtype ? '/' + subtype : ''}`)
    }

    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('[apple-server-notifications] Erro:', err)
    return new Response('Internal error', { status: 500 })
  }
})

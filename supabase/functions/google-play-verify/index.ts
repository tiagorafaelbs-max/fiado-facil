// Ativa o Pro a partir de uma compra do Google Play (modelo: apple-iap-verify).
// O app manda { purchaseToken, productId }; NADA do que o app diz vale sem a consulta ao Google.
import { aplicarAssinatura, clienteServico, consultarAssinatura, interpretar, reconhecer } from '../_shared/googlePlay.ts'
import { concedeAcesso, SKUS } from '../_shared/googlePlayEstado.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'Unauthorized' }, 401)
    const supabase = clienteServico()
    const { data: { user } } = await supabase.auth.getUser(auth.replace('Bearer ', ''))
    if (!user) return json({ error: 'Unauthorized' }, 401)

    const { purchaseToken, productId } = await req.json()
    if (typeof purchaseToken !== 'string' || purchaseToken.length < 20 || purchaseToken.length > 4096) {
      return json({ error: 'purchaseToken inválido' }, 400)
    }
    if (productId && !SKUS.includes(productId)) return json({ error: 'Invalid product' }, 400)

    const consulta = await consultarAssinatura(purchaseToken)
    if (!consulta.ok) {
      // 4xx definitivo do Google: token que não existe. Erro transitório: 502 para o app tentar de novo.
      return consulta.definitivo ? json({ error: 'Invalid purchase' }, 400) : json({ error: 'Google indisponível' }, 502)
    }

    const info = interpretar(consulta.bruta)
    if (!info) return json({ error: 'Unrecognized subscription' }, 400)
    if (productId && info.produto !== productId) return json({ error: 'Product mismatch' }, 400)

    // A compra precisa ter sido feita POR esta conta: obfuscatedAccountId = user.id (gravado pelo app
    // no requestPurchase). Sem isso qualquer pessoa poderia mandar o token de outra para ganhar Pro.
    if (info.contaOfuscada !== user.id) {
      console.warn(`[google-play-verify] conta da compra não confere para ${user.id}`)
      return json({ error: 'Purchase belongs to another account' }, 403)
    }

    if (info.status === 'pending') return json({ pending: true }, 202)   // pagamento ainda não confirmado
    if (!concedeAcesso(info.status)) return json({ error: 'No active subscription' }, 400)

    if (info.precisaReconhecer) {
      const ok = await reconhecer(info.produto, purchaseToken)
      if (!ok) return json({ error: 'Acknowledge failed' }, 502)
    }

    const r = await aplicarAssinatura(supabase, user.id, purchaseToken, info)
    if (r === 'token_de_outro_usuario') return json({ error: 'Purchase already linked' }, 409)
    return json({ success: true, plano: info.planId === 'pro_annual' ? 'annual' : 'monthly' })
  } catch (e) {
    console.error('[google-play-verify]', (e as Error)?.message ?? e)
    return json({ error: 'Internal error' }, 500)
  }
})

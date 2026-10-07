// Uso: node scripts/teste-google-play.js
// Testa as regras PURAS do Google Play Billing (interpretação da assinatura e trava de escrita).
const fs = require('fs'), path = require('path'), vm = require('vm')
const raiz = path.join(__dirname, '..')
const ts = require(raiz + '/node_modules/typescript')
const src = fs.readFileSync(path.join(raiz, 'supabase/functions/_shared/googlePlayEstado.ts'), 'utf8')
const js = ts.transpileModule(src, { compilerOptions: { module: 'commonjs', target: 'es2022' } }).outputText
const m = { exports: {} }
vm.runInNewContext(js, { module: m, exports: m.exports, Date, Number, Math })
const { interpretar, decidirEscrita, ehUuid, concedeAcesso, SKU_MENSAL, SKU_ANUAL } = m.exports

let falhas = 0, total = 0
function t(nome, ok) { total++; if (!ok) { falhas++; console.log('FALHOU:', nome) } }

const AGORA = Date.parse('2026-10-10T12:00:00Z')
const futuro = '2026-11-10T12:00:00Z', passado = '2026-10-01T12:00:00Z'
const base = (estado, extra = {}) => ({
  subscriptionState: estado, startTime: '2026-10-01T12:00:00Z', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
  lineItems: [{ productId: SKU_MENSAL, expiryTime: futuro }],
  externalAccountIdentifiers: { obfuscatedExternalAccountId: 'u1' }, ...extra,
})

let r = interpretar(base('SUBSCRIPTION_STATE_ACTIVE'), AGORA)
t('ativa', r.status === 'active' && r.planId === 'pro_monthly' && !r.cancelAtPeriodEnd && r.fimPeriodo.startsWith('2026-11-10') && r.contaOfuscada === 'u1')
r = interpretar(base('SUBSCRIPTION_STATE_ACTIVE', { lineItems: [{ productId: SKU_ANUAL, expiryTime: futuro }] }), AGORA)
t('anual', r.planId === 'pro_annual')
r = interpretar(base('SUBSCRIPTION_STATE_CANCELED'), AGORA)
t('cancelada com tempo = ativa até o fim', r.status === 'active' && r.cancelAtPeriodEnd)
r = interpretar(base('SUBSCRIPTION_STATE_CANCELED', { lineItems: [{ productId: SKU_MENSAL, expiryTime: passado }] }), AGORA)
t('cancelada vencida = cancelled', r.status === 'cancelled' && !concedeAcesso(r.status))
r = interpretar(base('SUBSCRIPTION_STATE_IN_GRACE_PERIOD', { lineItems: [{ productId: SKU_MENSAL, expiryTime: passado }] }), AGORA)
t('carência concede acesso e tem fim no futuro', r.status === 'grace_period' && Date.parse(r.fimCarencia) > AGORA)
t('on hold = paused', interpretar(base('SUBSCRIPTION_STATE_ON_HOLD'), AGORA).status === 'paused')
t('paused', interpretar(base('SUBSCRIPTION_STATE_PAUSED'), AGORA).status === 'paused')
t('expirada', interpretar(base('SUBSCRIPTION_STATE_EXPIRED', { lineItems: [{ productId: SKU_MENSAL, expiryTime: passado }] }), AGORA).status === 'expired')
t('pending', interpretar(base('SUBSCRIPTION_STATE_PENDING'), AGORA).status === 'pending')
t('pending cancelada', interpretar(base('SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED'), AGORA).status === 'cancelled')
t('estado desconhecido não grava', interpretar(base('SUBSCRIPTION_STATE_NOVO'), AGORA) === null)
t('produto desconhecido não grava', interpretar(base('SUBSCRIPTION_STATE_ACTIVE', { lineItems: [{ productId: 'outro', expiryTime: futuro }] }), AGORA) === null)
t('ativa sem validade não grava (seria eterna)', interpretar(base('SUBSCRIPTION_STATE_ACTIVE', { lineItems: [{ productId: SKU_MENSAL }] }), AGORA) === null)
t('reconhecer: ativa e pendente', interpretar(base('SUBSCRIPTION_STATE_ACTIVE', { acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' }), AGORA).precisaReconhecer)
t('reconhecer: pending não reconhece', !interpretar(base('SUBSCRIPTION_STATE_PENDING', { acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' }), AGORA).precisaReconhecer)
t('reconhecer: já reconhecida', !interpretar(base('SUBSCRIPTION_STATE_ACTIVE'), AGORA).precisaReconhecer)
t('token vinculado e teste', (() => { const x = interpretar(base('SUBSCRIPTION_STATE_ACTIVE', { linkedPurchaseToken: 'ANTIGO', testPurchase: {} }), AGORA); return x.tokenAnterior === 'ANTIGO' && x.teste })())
t('sem conta ofuscada', interpretar(base('SUBSCRIPTION_STATE_ACTIVE', { externalAccountIdentifiers: {} }), AGORA).contaOfuscada === null)

// --- trava de escrita ---
const ativaB = { provider_subscription_id: 'B', status: 'active' }
t('ativo sempre grava', decidirEscrita({ status: 'active', token: 'B', linha: null, planoPerfil: 'gratuito' }) === 'gravar')
t('ativo sobrescreve linha de outro token (reassinatura)', decidirEscrita({ status: 'active', token: 'C', linha: ativaB, planoPerfil: 'pro' }) === 'gravar')
t('B1: token antigo expirado não derruba a ativa', decidirEscrita({ status: 'expired', token: 'A', linha: ativaB, planoPerfil: 'pro' }) === 'ignorar')
t('cancelamento real do mesmo token grava', decidirEscrita({ status: 'cancelled', token: 'B', linha: ativaB, planoPerfil: 'pro' }) === 'gravar')
t('Pro Apple/manual sem linha: evento sem acesso ignorado', decidirEscrita({ status: 'expired', token: 'A', linha: null, planoPerfil: 'pro' }) === 'ignorar')
t('gratuito sem linha: pending grava', decidirEscrita({ status: 'pending', token: 'A', linha: null, planoPerfil: 'gratuito' }) === 'gravar')
t('gratuito com linha antiga expirada: outro token expirado grava', decidirEscrita({ status: 'expired', token: 'A', linha: { provider_subscription_id: 'Z', status: 'expired' }, planoPerfil: 'gratuito' }) === 'gravar')
t('linha ativa mas perfil ainda gratuito: protege', decidirEscrita({ status: 'paused', token: 'A', linha: ativaB, planoPerfil: 'gratuito' }) === 'ignorar')
t('grace do mesmo token grava', decidirEscrita({ status: 'grace_period', token: 'B', linha: ativaB, planoPerfil: 'pro' }) === 'gravar')

t('uuid ok', ehUuid('3f007836-d70c-4617-b632-1b00898e43dc'))
t('uuid ruim', !ehUuid('abc') && !ehUuid(null) && !ehUuid("x'; drop"))

// --- escolha da oferta (lib/googleOfertas.ts) ---
const o = (() => { const x = ts.transpileModule(fs.readFileSync(path.join(raiz, 'lib/googleOfertas.ts'), 'utf8'), { compilerOptions: { module: 'commonjs', target: 'es2022' } }).outputText; const mm = { exports: {} }; vm.runInNewContext(x, { module: mm, exports: mm.exports }); return mm.exports })()
const prod = { id: SKU_MENSAL, subscriptionOffers: [
  { id: 'promo', basePlanIdAndroid: 'mensal', offerTokenAndroid: 'TP', pricingPhasesAndroid: { pricingPhaseList: [{}, {}] } },
  { id: 'mensal', basePlanIdAndroid: 'mensal', offerTokenAndroid: 'TB', pricingPhasesAndroid: { pricingPhaseList: [{}] } },
  { id: 'anual', basePlanIdAndroid: 'anual', offerTokenAndroid: 'TA', pricingPhasesAndroid: { pricingPhaseList: [{}] } },
] }
t('oferta padrão do plano base, não a promoção', o.escolherOferta(o.ofertasDoProduto(prod), 'mensal').token === 'TB')
t('oferta do plano anual', o.escolherOferta(o.ofertasDoProduto(prod), 'anual').token === 'TA')
t('sem plano base igual, usa a que existir', o.escolherOferta(o.ofertasDoProduto(prod), 'xyz') !== null)
t('sem ofertas = null', o.escolherOferta(o.ofertasDoProduto({ subscriptionOffers: [] }), 'mensal') === null)
t('formato antigo (subscriptionOfferDetailsAndroid)', o.escolherOferta(o.ofertasDoProduto({ subscriptionOfferDetailsAndroid: [{ basePlanId: 'mensal', offerId: null, offerToken: 'OLD', pricingPhases: { pricingPhaseList: [{}] } }] }), 'mensal').token === 'OLD')

console.log(`${total - falhas}/${total} ok`)
process.exit(falhas ? 1 : 0)

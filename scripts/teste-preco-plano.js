// Uso: node scripts/teste-preco-plano.js  (lib/precoPlano.ts: preço da loja só em BRL)
const fs = require('fs'), path = require('path'), vm = require('vm')
const raiz = path.join(__dirname, '..')
const ts = require(raiz + '/node_modules/typescript')
const js = ts.transpileModule(fs.readFileSync(path.join(raiz, 'lib/precoPlano.ts'), 'utf8'), { compilerOptions: { module: 'commonjs', target: 'es2022' } }).outputText
const m = { exports: {} }; vm.runInNewContext(js, { module: m, exports: m.exports, String })
const { escolherPreco: e, moedaDoProduto: moeda } = m.exports
let falhas = 0, total = 0
const t = (n, ok) => { total++; if (!ok) { falhas++; console.log('FALHOU:', n) } }

t('iOS em BRL: usa o preço da loja', JSON.stringify(e({ displayPrice: 'R$ 19,90', currency: 'BRL' })) === JSON.stringify({ tipo: 'loja', preco: 'R$ 19,90' }))
t('conta de teste em USD ($2.99): NÃO usa o preço da loja', e({ displayPrice: '$2.99', currency: 'USD' }).tipo === 'fixo' && e({ displayPrice: '$2.99', currency: 'USD' }).moeda === 'USD')
t('moeda em minúsculas é aceita', e({ displayPrice: 'R$ 149,90', currency: 'brl' }).tipo === 'loja')
t('sem moeda informada: não arrisca, usa o fixo', e({ displayPrice: 'R$ 19,90' }).tipo === 'fixo' && e({ displayPrice: 'R$ 19,90' }).moeda === null)
t('BRL mas sem preço: usa o fixo', e({ currency: 'BRL' }).tipo === 'fixo')
t('usa localizedPrice se displayPrice faltar', e({ localizedPrice: 'R$ 19,90', currency: 'BRL' }).preco === 'R$ 19,90')
t('Android: moeda vem das ofertas (BRL)', e({ displayPrice: 'R$ 19,90', subscriptionOffers: [{ currency: 'BRL' }] }).tipo === 'loja')
t('Android: moeda vem do formato antigo (USD) e usa o fixo', e({ displayPrice: '$3.99', subscriptionOfferDetailsAndroid: [{ pricingPhases: { pricingPhaseList: [{ priceCurrencyCode: 'USD' }] } }] }).tipo === 'fixo')
t('moedaDoProduto: nada informado = null', moeda({}) === null)
console.log(`${total - falhas}/${total} ok`); process.exit(falhas ? 1 : 0)

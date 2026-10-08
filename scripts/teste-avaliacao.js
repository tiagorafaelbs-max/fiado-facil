// Uso: node scripts/teste-avaliacao.js  (regras do pedido de avaliação: lib/avaliacaoRegras.ts)
const fs = require('fs'), path = require('path'), vm = require('vm')
const raiz = path.join(__dirname, '..')
const ts = require(raiz + '/node_modules/typescript')
const js = ts.transpileModule(fs.readFileSync(path.join(raiz, 'lib/avaliacaoRegras.ts'), 'utf8'), { compilerOptions: { module: 'commonjs', target: 'es2022' } }).outputText
const m = { exports: {} }; vm.runInNewContext(js, { module: m, exports: m.exports })
const { podePedirAvaliacao: pode } = m.exports
const DIA = 24 * 3600 * 1000, AGORA = Date.parse('2026-10-20T12:00:00Z')
const base = { agora: AGORA, tentativas: 0, ultimaTentativa: null, criadaEm: AGORA - 8 * DIA, vendas: 10, online: true, souDono: true }
let falhas = 0, total = 0
const t = (n, ok) => { total++; if (!ok) { falhas++; console.log('FALHOU:', n) } }
t('caso feliz', pode(base))
t('conta com 6 dias não', !pode({ ...base, criadaEm: AGORA - 6 * DIA }))
t('conta com exatamente 7 dias sim', pode({ ...base, criadaEm: AGORA - 7 * DIA }))
t('9 vendas não', !pode({ ...base, vendas: 9 }))
t('offline não', !pode({ ...base, online: false }))
t('funcionário não', !pode({ ...base, souDono: false }))
t('sem data de criação não', !pode({ ...base, criadaEm: null }))
t('2ª tentativa antes de 60 dias não', !pode({ ...base, tentativas: 1, ultimaTentativa: AGORA - 59 * DIA }))
t('2ª tentativa com 60 dias sim', pode({ ...base, tentativas: 1, ultimaTentativa: AGORA - 60 * DIA }))
t('3ª tentativa depois de 60 dias sim', pode({ ...base, tentativas: 2, ultimaTentativa: AGORA - 90 * DIA }))
t('4ª tentativa nunca', !pode({ ...base, tentativas: 3, ultimaTentativa: AGORA - 400 * DIA }))
// chave antiga convertida (1 tentativa, "ultima" = dia da conversão gravado uma vez)
const conversao = AGORA - 61 * DIA
t('chave antiga + 61 dias depois: pode pedir', pode({ ...base, tentativas: 1, ultimaTentativa: conversao }))
t('chave antiga + 30 dias depois: ainda não', !pode({ ...base, tentativas: 1, ultimaTentativa: AGORA - 30 * DIA }))
console.log(`${total - falhas}/${total} ok`); process.exit(falhas ? 1 : 0)

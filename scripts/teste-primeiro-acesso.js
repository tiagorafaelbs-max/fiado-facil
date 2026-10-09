// Uso: node scripts/teste-primeiro-acesso.js  (lib/primeiroAcesso.ts: aparelho novo vê boas-vindas, quem já teve conta vê login)
const fs = require('fs'), path = require('path'), vm = require('vm')
const raiz = path.join(__dirname, '..')
const ts = require(raiz + '/node_modules/typescript')
const js = ts.transpileModule(fs.readFileSync(path.join(raiz, 'lib/primeiroAcesso.ts'), 'utf8'), { compilerOptions: { module: 'commonjs', target: 'es2022' } }).outputText
let falhas = 0, total = 0
const t = (n, ok) => { total++; if (!ok) { falhas++; console.log('FALHOU:', n) } }
function modulo(armazem, quebrar) {
  const AsyncStorage = {
    getItem: async k => { if (quebrar) throw new Error('x'); return armazem[k] ?? null },
    setItem: async (k, v) => { if (quebrar) throw new Error('x'); armazem[k] = v },
  }
  const m = { exports: {} }
  vm.runInNewContext(js, { module: m, exports: m.exports, require: () => ({ __esModule: true, default: AsyncStorage }), Promise })
  return m.exports
}
;(async () => {
  let a = {}
  t('aparelho novo: não teve conta (vai para as boas-vindas)', (await modulo(a).aparelhoJaTeveConta()) === false)
  t('onboarding concluído NÃO conta como ter tido conta', (await (async () => { const x = { '@fiado_onboarding_ok': '1' }; return modulo(x).aparelhoJaTeveConta() })()) === false)
  a = {}; const m1 = modulo(a); await m1.marcarAparelhoComConta()
  t('depois de entrar/criar conta: teve conta (vai para o login)', (await m1.aparelhoJaTeveConta()) === true)
  t('legado: tour já concluído = teve conta', (await modulo({ '@fiado_tour_ok': '1' }).aparelhoJaTeveConta()) === true)
  t('falha do armazenamento: não quebra (boas-vindas)', (await modulo({}, true).aparelhoJaTeveConta()) === false)
  await modulo({}, true).marcarAparelhoComConta().then(() => t('gravar com falha do armazenamento não lança', true), () => t('gravar com falha do armazenamento não lança', false))
  console.log(`${total - falhas}/${total} ok`); process.exit(falhas ? 1 : 0)
})()

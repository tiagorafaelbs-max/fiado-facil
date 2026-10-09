// Uso: node scripts/teste-teclado.js  (lib/teclado.ts: espaço extra do teclado no Android)
const fs = require('fs'), path = require('path'), vm = require('vm')
const raiz = path.join(__dirname, '..')
const ts = require(raiz + '/node_modules/typescript')
const js = ts.transpileModule(fs.readFileSync(path.join(raiz, 'lib/teclado.ts'), 'utf8'), { compilerOptions: { module: 'commonjs', target: 'es2022' } }).outputText
const m = { exports: {} }; vm.runInNewContext(js, { module: m, exports: m.exports })
const { paddingExtraDoTeclado: p, janelaRedimensionou: r } = m.exports
let falhas = 0, total = 0
const t = (n, ok) => { total++; if (!ok) { falhas++; console.log('FALHOU:', n) } }
const base = { android: true, tecladoAltura: 300, alturaSemTeclado: 700, alturaAtual: 700 }
t('Android, teclado aberto e janela NÃO redimensionada: soma a altura do teclado', p(base) === 300)
t('Android, teclado fechado: nada', p({ ...base, tecladoAltura: 0 }) === 0)
t('Android, sistema redimensionou (área encolheu 300): nada a somar', p({ ...base, alturaAtual: 400 }) === 0)
t('Android, encolheu só um pouco (barra): ainda soma', p({ ...base, alturaAtual: 640 }) === 300)
t('iOS: nunca soma', p({ ...base, android: false }) === 0)
t('altura sem teclado ainda desconhecida: soma (não dá para saber)', p({ ...base, alturaSemTeclado: 0, alturaAtual: 0 }) === 300)
t('altura fracionada vira inteiro', p({ ...base, tecladoAltura: 299.6 }) === 300)
t('janelaRedimensionou: com teclado fechado é falso', r({ ...base, tecladoAltura: 0 }) === false)
t('janelaRedimensionou: encolheu 300 com teclado de 300 = verdadeiro', r({ ...base, alturaAtual: 400 }) === true)
console.log(`${total - falhas}/${total} ok`); process.exit(falhas ? 1 : 0)

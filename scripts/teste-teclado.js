// Uso: node scripts/teste-teclado.js  (lib/teclado.ts: espaço extra do teclado no Android e rolagem depois de fechar)
const fs = require('fs'), path = require('path'), vm = require('vm')
const raiz = path.join(__dirname, '..')
const ts = require(raiz + '/node_modules/typescript')
const js = ts.transpileModule(fs.readFileSync(path.join(raiz, 'lib/teclado.ts'), 'utf8'), { compilerOptions: { module: 'commonjs', target: 'es2022' } }).outputText
const m = { exports: {} }; vm.runInNewContext(js, { module: m, exports: m.exports })
const { paddingExtraDoTeclado: p, janelaRedimensionou: r, rolagemAposFecharTeclado: f } = m.exports
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
// depois de fechar o teclado / voltar para a tela
t('conteúdo cabe e a rolagem ficou deslocada: volta ao topo (bug do login)', f({ alturaConteudo: 600, alturaArea: 700, deslocamento: 180 }) === 0)
t('conteúdo cabe e já está no topo: nada a fazer', f({ alturaConteudo: 600, alturaArea: 700, deslocamento: 0 }) === null)
t('conteúdo maior e rolagem passou do fim real: volta ao fim real', f({ alturaConteudo: 900, alturaArea: 700, deslocamento: 500 }) === 200)
t('conteúdo maior e rolagem dentro do limite: não mexe', f({ alturaConteudo: 900, alturaArea: 700, deslocamento: 150 }) === null)
t('medidas ainda desconhecidas: não mexe', f({ alturaConteudo: 0, alturaArea: 0, deslocamento: 300 }) === null)
console.log(`${total - falhas}/${total} ok`); process.exit(falhas ? 1 : 0)

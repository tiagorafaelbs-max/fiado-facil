// Uso: node scripts/teste-instalacao.js  (lib/instalacao.ts: funil anônimo; simula AsyncStorage, supabase e info do app)
const fs = require('fs'), path = require('path'), vm = require('vm')
const raiz = path.join(__dirname, '..')
const ts = require(raiz + '/node_modules/typescript')
const js = ts.transpileModule(fs.readFileSync(path.join(raiz, 'lib/instalacao.ts'), 'utf8'), { compilerOptions: { module: 'commonjs', target: 'es2022' } }).outputText

let falhas = 0, total = 0
const t = (n, ok) => { total++; if (!ok) { falhas++; console.log('FALHOU:', n) } }

function ambiente({ armazem = {}, jaTeveConta = false, info = { plataforma: 'android', versao_app: '1.0.12', build: '54', runtime_version: '61a2955d' }, resposta = () => ({ error: null }) } = {}) {
  const chamadas = []
  const supabase = {
    from: (tabela) => ({
      insert: (linha) => {
        const c = { tabela, linha, usouSelect: false }
        chamadas.push(c)
        const q = { abortSignal: () => q, select: () => { c.usouSelect = true; return q }, then: (ok, ko) => Promise.resolve(resposta(c)).then(ok, ko) }
        return q
      },
    }),
  }
  const AsyncStorage = {
    getItem: async k => armazem[k] ?? null,
    setItem: async (k, v) => { armazem[k] = v },
  }
  const mods = {
    '@react-native-async-storage/async-storage': { __esModule: true, default: AsyncStorage },
    './dispositivo': { lerInfoApp: () => info },
    './primeiroAcesso': { aparelhoJaTeveConta: async () => jaTeveConta },
    './uuid': { gerarUUID: () => '11111111-1111-4111-8111-111111111111' },
    './supabase': { supabase },
  }
  const m = { exports: {} }
  vm.runInNewContext(js, { module: m, exports: m.exports, require: (n) => mods[n], Promise, Set, Array, JSON, AbortController, setTimeout, clearTimeout })
  return { ...m.exports, chamadas, armazem }
}

;(async () => {
  // aparelho novo: grava "abriu" uma vez, só com campos permitidos e sem pedir a linha de volta
  let a = ambiente()
  await a.registrarEtapa('abriu'); await a.registrarEtapa('abriu')
  t('aparelho novo grava "abriu" uma única vez', a.chamadas.length === 1 && a.chamadas[0].tabela === 'instalacoes_app' && a.chamadas[0].linha.etapa === 'abriu')
  const cols = Object.keys(a.chamadas[0].linha).sort().join(',')
  t('só as colunas que o banco permite (nenhuma data, nenhum dado pessoal)', cols === 'build,etapa,instalacao_id,plataforma,runtime_version,versao_app')
  t('nunca pede a linha de volta (.select)', a.chamadas.every(c => !c.usouSelect))
  t('guarda o id da instalação e a etapa enviada', a.armazem['@fiado_instalacao_id'] === '11111111-1111-4111-8111-111111111111' && JSON.parse(a.armazem['@fiado_etapas_enviadas']).includes('abriu'))
  await a.registrarEtapa('cadastro'); await a.registrarEtapa('conta'); await a.registrarEtapa('entrou')
  t('as 4 etapas, cada uma uma vez, com o mesmo id', a.chamadas.length === 4 && new Set(a.chamadas.map(c => c.linha.instalacao_id)).size === 1)

  // quem já usava o app (tour feito / já teve conta): fora do funil
  a = ambiente({ jaTeveConta: true })
  await a.registrarEtapa('abriu'); await a.registrarEtapa('entrou')
  t('aparelho que já tinha conta não entra no funil', a.chamadas.length === 0 && a.armazem['@fiado_instalacao_nova'] === '0')

  // 23505 (já gravada) conta como enviada; outro erro NÃO marca (tenta de novo depois)
  a = ambiente({ resposta: () => ({ error: { code: '23505' } }) })
  await a.registrarEtapa('abriu')
  t('23505 vira "enviada"', JSON.parse(a.armazem['@fiado_etapas_enviadas']).includes('abriu'))
  a = ambiente({ resposta: () => ({ error: { code: '54000' } }) })
  await a.registrarEtapa('abriu')
  t('freio (54000) não marca como enviada', a.armazem['@fiado_etapas_enviadas'] === undefined)
  a = ambiente({ resposta: () => { throw new Error('sem rede') } })
  await a.registrarEtapa('abriu')
  t('sem rede não lança e não marca', a.armazem['@fiado_etapas_enviadas'] === undefined)

  // depois de falhar, a próxima abertura reenvia
  let falhar = true
  a = ambiente({ resposta: () => (falhar ? { error: { code: '54000' } } : { error: null }) })
  await a.registrarEtapa('abriu'); falhar = false; await a.registrarEtapa('abriu')
  t('reenvia na próxima abertura e então marca', a.chamadas.length === 2 && JSON.parse(a.armazem['@fiado_etapas_enviadas']).includes('abriu'))

  // web (sem info): nada
  a = ambiente({ info: null })
  await a.registrarEtapa('abriu')
  t('web não registra', a.chamadas.length === 0)

  console.log(`${total - falhas}/${total} ok`); process.exit(falhas ? 1 : 0)
})()

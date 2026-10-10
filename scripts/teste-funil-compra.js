// Uso: node scripts/teste-funil-compra.js  (lib/instalacao.ts: funil de COMPRA; simula AsyncStorage, supabase e info do app)
const fs = require('fs'), path = require('path'), vm = require('vm')
const raiz = path.join(__dirname, '..')
const ts = require(raiz + '/node_modules/typescript')
const js = ts.transpileModule(fs.readFileSync(path.join(raiz, 'lib/instalacao.ts'), 'utf8'), { compilerOptions: { module: 'commonjs', target: 'es2022' } }).outputText

let falhas = 0, total = 0
const t = (n, ok) => { total++; if (!ok) { falhas++; console.log('FALHOU:', n) } }

function ambiente({ armazem = {}, jaTeveConta = false, sessao = null, info = { plataforma: 'ios', versao_app: '1.0.13', build: '89', runtime_version: '7f2b7439' }, resposta = () => ({ error: null }), agora } = {}) {
  const chamadas = []
  const supabase = {
    auth: { getSession: async () => ({ data: { session: sessao } }) },
    from: (tabela) => ({
      insert: (linha) => {
        const c = { tabela, linha, usouSelect: false }
        chamadas.push(c)
        const q = { abortSignal: () => q, select: () => { c.usouSelect = true; return q }, then: (ok, ko) => Promise.resolve().then(() => resposta(c)).then(ok, ko) }
        return q
      },
    }),
  }
  const AsyncStorage = { getItem: async k => armazem[k] ?? null, setItem: async (k, v) => { armazem[k] = v } }
  const mods = {
    '@react-native-async-storage/async-storage': { __esModule: true, default: AsyncStorage },
    './dispositivo': { lerInfoApp: () => info },
    './primeiroAcesso': { aparelhoJaTeveConta: async () => jaTeveConta },
    './uuid': { gerarUUID: () => '22222222-2222-4222-8222-222222222222' },
    './supabase': { supabase },
  }
  const m = { exports: {} }
  const DateFalsa = agora ? class extends Date { static now() { return agora.v } } : Date
  vm.runInNewContext(js, { module: m, exports: m.exports, require: (n) => mods[n], Promise, Set, Array, JSON, AbortController, setTimeout, clearTimeout, Date: DateFalsa, String })
  return { ...m.exports, chamadas, armazem }
}

;(async () => {
  // vale para TODO aparelho (inclusive o que já tinha conta), sem exigir sessão
  let a = ambiente({ jaTeveConta: true, sessao: { user: { id: 'u' } } })
  await a.registrarEvento('planos')
  t('aparelho antigo com sessão também registra "planos"', a.chamadas.length === 1 && a.chamadas[0].linha.etapa === 'planos')
  t('só colunas permitidas e nenhum select', Object.keys(a.chamadas[0].linha).sort().join(',') === 'build,etapa,instalacao_id,plataforma,runtime_version,versao_app' && !a.chamadas[0].usouSelect)

  // 1 vez por etapa por dia
  await a.registrarEvento('planos'); await a.registrarEvento('planos')
  t('mesma etapa no mesmo dia: uma linha só', a.chamadas.length === 1)
  await a.registrarEvento('compra'); await a.registrarEvento('compra_ok')
  t('etapas diferentes gravam cada uma', a.chamadas.length === 3)

  // detalhe: só código, sanitizado
  a = ambiente()
  await a.registrarEvento('compra_erro', 'E_PRODUCT_NOT_FOUND')
  t('compra_erro leva o código', a.chamadas[0].linha.detalhe === 'E_PRODUCT_NOT_FOUND')
  a = ambiente()
  await a.registrarEvento('compra_erro', 'Erro: não achei o produto do João <joao@x.com> ' + 'x'.repeat(100))
  const det = a.chamadas[0].linha.detalhe
  t('texto livre é limpo (sem espaço, @, acento) e limitado a 60', /^[A-Za-z0-9_.:-]{1,60}$/.test(det) && !det.includes('@'))
  a = ambiente()
  await a.registrarEvento('limite', 'cobrancas'); await a.registrarEvento('loja_erro', 'moeda_USD')
  t('detalhes simples passam', a.chamadas[0].linha.detalhe === 'cobrancas' && a.chamadas[1].linha.detalhe === 'moeda_USD')
  a = ambiente()
  await a.registrarEvento('planos')
  t('sem detalhe não manda a coluna', !('detalhe' in a.chamadas[0].linha))
  t('limparDetalhe: vazio e nulo viram null', a.limparDetalhe('   ') === null && a.limparDetalhe(undefined) === null && a.limparDetalhe(null) === null)

  // falha não marca como enviado; 23505 marca
  a = ambiente({ resposta: () => ({ error: { code: '54000' } }) })
  await a.registrarEvento('planos'); await a.registrarEvento('planos')
  t('erro do banco/freio não marca e tenta de novo', a.chamadas.length === 2)
  a = ambiente({ resposta: () => ({ error: { code: '23505' } }) })
  await a.registrarEvento('planos'); await a.registrarEvento('planos')
  t('23505 (já gravada) conta como enviada', a.chamadas.length === 1)
  a = ambiente({ resposta: () => { throw new Error('sem rede') } })
  await a.registrarEvento('planos')
  t('sem rede não lança', true)

  // novo dia: envia de novo (dia de São Paulo)
  const agora = { v: Date.parse('2026-10-10T15:00:00Z') }
  a = ambiente({ agora })
  await a.registrarEvento('planos')
  agora.v = Date.parse('2026-10-10T20:00:00Z')   // ainda 10/10 em São Paulo (17h)
  await a.registrarEvento('planos')
  t('mesmo dia de São Paulo: não reenvia', a.chamadas.length === 1)
  agora.v = Date.parse('2026-10-11T03:30:00Z')   // 00:30 de 11/10 em São Paulo
  await a.registrarEvento('planos')
  t('dia seguinte: envia de novo', a.chamadas.length === 2)
  t('dia de São Paulo é UTC-3', a.diaDeSaoPaulo(Date.parse('2026-10-11T02:59:00Z')) === '2026-10-10' && a.diaDeSaoPaulo(Date.parse('2026-10-11T03:00:00Z')) === '2026-10-11')

  // web (sem info): nada
  a = ambiente({ info: null })
  await a.registrarEvento('planos')
  t('web não registra', a.chamadas.length === 0)

  // o funil de INSTALAÇÃO continua independente (só aparelho novo)
  a = ambiente({ jaTeveConta: true })
  await a.registrarEtapa('abriu')
  t('funil de instalação segue excluindo aparelho antigo', a.chamadas.length === 0)

  console.log(`${total - falhas}/${total} ok`); process.exit(falhas ? 1 : 0)
})()

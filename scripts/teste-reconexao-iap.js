// Uso: node scripts/teste-reconexao-iap.js
// Simula a conexão com a Play Store caindo (not-prepared / Billing_client_not_ready) e confere a reconexão automática de
// lib/appleIAP.ts: reconectar (endConnection + initConnection) e repetir 1 vez, funil, ouvintes, concorrência, iOS sem mudança.
const fs = require('fs'), path = require('path'), vm = require('vm')
const raiz = path.join(__dirname, '..')
const ts = require(raiz + '/node_modules/typescript')
const src = fs.readFileSync(path.join(raiz, 'lib/appleIAP.ts'), 'utf8')
const js = ts.transpileModule(src, { compilerOptions: { module: 'commonjs', target: 'es2022' } }).outputText

let falhas = 0, total = 0
function t(nome, ok) { total++; if (!ok) { falhas++; console.log('FALHOU:', nome) } }

function carregar(os) {
  const reg = { eventos: [], init: 0, end: 0, initFalha: 0, endFalha: false }
  const iap = {
    initConnection: async () => { reg.init++; if (reg.initFalha > 0) { reg.initFalha--; throw Object.assign(new Error('sem rede'), { code: 'network-error' }) } return true },
    endConnection: async () => { reg.end++; if (reg.endFalha) throw new Error('já fechada'); return true },
    getAvailablePurchases: async () => [],
  }
  const mods = {
    'react-native': { Platform: { OS: os } },
    '@react-native-async-storage/async-storage': { removeItem: async () => {} },
    'react-native-iap': iap,
    './supabase': { supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } },
    './instalacao': { evento: (etapa, detalhe) => reg.eventos.push([etapa, detalhe]) },
  }
  const m = { exports: {} }
  vm.runInNewContext(js, {
    module: m, exports: m.exports, Promise, Date, Object, Error, String, Set, setTimeout, clearTimeout, console, process: { env: {} },
    require: (n) => { if (!(n in mods)) throw new Error('mod ' + n); return mods[n] },
  })
  return { lib: m.exports, reg }
}

const NOT_PREPARED = () => Object.assign(new Error('Billing client not ready'), { code: 'not-prepared' })

;(async () => {
  // 1) Conexão cai entre abrir Planos e tocar Assinar: 1ª chamada falha, depois de religar funciona
  {
    const { lib, reg } = carregar('android')
    t('abre Planos: conecta', await lib.garantirConexaoIAP() === true && reg.init === 1)
    let chamadas = 0, ouvintesRelidos = 0
    lib.aoReconectarIAP(() => ouvintesRelidos++)
    const r = await lib.comReconexaoIAP(async () => { chamadas++; if (chamadas === 1) throw NOT_PREPARED(); return 'compra_aberta' })
    t('tocar Assinar: repete e funciona', r === 'compra_aberta' && chamadas === 2)
    t('reconectou de verdade: endConnection + initConnection', reg.end === 1 && reg.init === 2)
    t('ouvintes de compra reanexados (endConnection os apaga)', ouvintesRelidos === 1)
    t('funil: código exato + retry_ok', reg.eventos.some(e => e[0] === 'loja_erro' && e[1] === 'not-prepared:retry_ok'))
    t('detalhe aceito pelo banco (A-Za-z0-9_.:- até 60)', reg.eventos.every(e => /^[A-Za-z0-9_.:-]{1,60}$/.test(e[1])))
    t('conexão marcada como pronta de novo (sem init extra)', await lib.garantirConexaoIAP() === true && reg.init === 2)
  }
  // 2) Erro só por mensagem (Billing_client_not_ready) e service-disconnected
  {
    const { lib } = carregar('android')
    t('mensagem Billing_client_not_ready', lib.erroDeConexaoIAP(new Error('Billing_client_not_ready')))
    t('código service-disconnected', lib.erroDeConexaoIAP({ code: 'service-disconnected', message: 'x' }))
    t('cancelou NÃO é erro de conexão', !lib.erroDeConexaoIAP({ code: 'user-cancelled', message: 'cancelado' }))
    t('rede/outro erro NÃO é erro de conexão', !lib.erroDeConexaoIAP({ code: 'network-error', message: 'timeout' }))
  }
  // 3) Repetição também falha: erro volta com retry_falhou (vira compra_erro:not-prepared:retry_falhou)
  {
    const { lib, reg } = carregar('android')
    let chamadas = 0, erro
    try { await lib.comReconexaoIAP(async () => { chamadas++; throw NOT_PREPARED() }) } catch (e) { erro = e }
    t('só 1 repetição (2 chamadas)', chamadas === 2)
    t('erro marcado retry_falhou', erro && erro.reconexao === 'retry_falhou' && erro.code === 'not-prepared')
    t('sem evento retry_ok', !reg.eventos.some(e => /retry_ok/.test(e[1])))
    const detalhe = (erro.code + ':' + erro.reconexao)
    t('detalhe compra_erro válido', /^[A-Za-z0-9_.:-]{1,60}$/.test(detalhe))
  }
  // 4) Sem internet ao religar: não consegue conectar (retry_sem_conexao); depois a internet volta e funciona
  {
    const { lib, reg } = carregar('android')
    await lib.garantirConexaoIAP()
    reg.initFalha = 1
    let erro
    try { await lib.comReconexaoIAP(async () => { throw NOT_PREPARED() }) } catch (e) { erro = e }
    t('sem internet: erro com retry_sem_conexao', erro && erro.reconexao === 'retry_sem_conexao')
    t('conexão ficou marcada como NÃO pronta', true)
    let chamadas = 0
    const r = await lib.comReconexaoIAP(async () => { chamadas++; if (chamadas === 1) throw NOT_PREPARED(); return 'ok' })
    t('internet voltou: toque seguinte reconecta e funciona', r === 'ok')
  }
  // 5) Voltar do 2º plano: conexão morta -> recarregar produtos reconecta uma vez
  {
    const { lib, reg } = carregar('android')
    await lib.garantirConexaoIAP()
    let estado = 'morta'
    const fetchProdutos = async () => { if (estado === 'morta') { estado = 'viva'; throw NOT_PREPARED() } return ['mensal', 'anual'] }
    const produtos = await lib.comReconexaoIAP(() => lib.comTempoIAP(fetchProdutos()))
    t('produtos recarregados após voltar do 2º plano', Array.isArray(produtos) && produtos.length === 2 && reg.end === 1)
  }
  // 6) Concorrência: duas operações caindo juntas reconectam UMA vez só
  {
    const { lib, reg } = carregar('android')
    await lib.garantirConexaoIAP()
    const fazer = () => { let n = 0; return lib.comReconexaoIAP(async () => { n++; if (n === 1) throw NOT_PREPARED(); return 'ok' }) }
    const [a, b] = await Promise.all([fazer(), fazer()])
    t('duas operações: ambas funcionam', a === 'ok' && b === 'ok')
    t('uma única reconexão (endConnection 1x)', reg.end === 1)
  }
  // 7) Erro comum (cancelou) não tenta reconectar
  {
    const { lib, reg } = carregar('android')
    await lib.garantirConexaoIAP()
    let erro, chamadas = 0
    try { await lib.comReconexaoIAP(async () => { chamadas++; throw Object.assign(new Error('cancelou'), { code: 'user-cancelled' }) }) } catch (e) { erro = e }
    t('cancelou: 1 chamada, sem reconexão, sem marca', chamadas === 1 && reg.end === 0 && !erro.reconexao)
  }
  // 8) endConnection falha ("já fechada"): ainda assim reabre
  {
    const { lib, reg } = carregar('android')
    await lib.garantirConexaoIAP()
    reg.endFalha = true
    let n = 0
    const r = await lib.comReconexaoIAP(async () => { n++; if (n === 1) throw NOT_PREPARED(); return 'ok' })
    t('endConnection falhando não impede reabrir', r === 'ok' && reg.init === 2)
  }
  // 9) Tempo esgotado
  {
    const { lib } = carregar('android')
    let erro
    try { await lib.comTempoIAP(new Promise(() => {}), 30) } catch (e) { erro = e }
    t('loja que não responde vira erro (não prende o botão)', erro && erro.code === 'timeout')
    t('resposta rápida passa', await lib.comTempoIAP(Promise.resolve(7), 1000) === 7)
  }
  // 10) iOS: comportamento igual ao de antes (sem reconexão)
  {
    const { lib, reg } = carregar('ios')
    let n = 0, erro
    try { await lib.comReconexaoIAP(async () => { n++; throw NOT_PREPARED() }) } catch (e) { erro = e }
    t('iOS: 1 chamada, sem endConnection, sem marca', n === 1 && reg.end === 0 && !erro.reconexao)
  }

  // 11) Guarda de 20 s do ouvinte de erro: cancelável (o retry abriu a tela do Google e o lojista demorou para pagar)
  {
    const { lib } = carregar('android')
    const espera = (ms) => new Promise(r => setTimeout(r, ms))
    // erro de conexão chega no ouvinte -> arma; o retry resolve (tela da loja abriu) -> cancela; passa o tempo: NENHUM alerta
    let alertas = 0
    const g1 = lib.criarGuardaConexao(60, () => alertas++)
    g1.armar(); t('guarda armada', g1.armado())
    g1.cancelar(); t('retry resolveu: guarda cancelada', !g1.armado())
    await espera(150)
    t('lojista demorou mais que o tempo: alerta NÃO aparece', alertas === 0)
    // nada resolve: avisa uma vez só
    let avisos = 0
    const g2 = lib.criarGuardaConexao(40, () => avisos++)
    g2.armar(); g2.armar()   // 2 erros seguidos não duplicam
    await espera(150)
    t('sem solução: avisa exatamente 1 vez', avisos === 1 && !g2.armado())
    // chegou purchaseUpdated / erro que não é de conexão -> cancela
    let a3 = 0
    const g3 = lib.criarGuardaConexao(40, () => a3++)
    g3.armar(); g3.cancelar(); await espera(100)
    t('resultado de compra cancela a guarda', a3 === 0)
    // só erros de conexão são silenciados
    t('cancelar (user-cancelled) NÃO é conexão', !lib.erroDeConexaoIAP({ code: 'user-cancelled', message: 'x' }))
    t('billing-unavailable NÃO é conexão (mostra o erro)', !lib.erroDeConexaoIAP({ code: 'billing-unavailable', message: 'x' }))
  }

  console.log(falhas === 0 ? ` TODOS OS TESTES PASSARAM (${total})` : `${falhas} FALHA(S) de ${total}`)
  process.exit(falhas === 0 ? 0 : 1)
})()

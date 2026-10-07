// Uso: node scripts/teste-fila-direcionado.js
// Testa, com Supabase/AsyncStorage simulados, o caminho do PAGAMENTO DIRECIONADO a uma venda:
//   registrarPagamento (online e offline), fila offline (sincronizar depois, funcionário, venda apagada -> reenvio sem venda_id).
const fs = require('fs'), path = require('path'), vm = require('vm')
const raiz = path.join(__dirname, '..')
const ts = require(path.join(raiz, 'node_modules', 'typescript'))

let falhas = 0
const ok = (nome, cond, extra) => { if (!cond) { falhas++; console.log('FALHOU:', nome, extra ?? '') } else console.log('ok   :', nome) }

// ── simulados ──
function novoAmbiente({ usuario = 'u-dono', online = true, respostas = [] } = {}) {
  const armazenamento = new Map()
  const chamadas = []        // { tipo, tabela, payload }
  const alertas = []
  const reconciliados = []
  let i = 0
  const proximaResposta = () => respostas[Math.min(i++, respostas.length - 1)] ?? { error: null }
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: usuario } } } }) },
    from: (tabela) => ({
      insert: (payload) => ({ abortSignal: async () => { chamadas.push({ tipo: 'insert', tabela, payload }); return proximaResposta() } }),
      upsert: (payload) => ({ abortSignal: async () => { chamadas.push({ tipo: 'upsert', tabela, payload }); return proximaResposta() } }),
    }),
  }
  const stubs = {
    react: { useState: (v) => [v, () => {}], useEffect: () => {}, useRef: (v) => ({ current: v }), useCallback: (f) => f },
    '@react-native-async-storage/async-storage': {
      __esModule: true,
      default: {
        getItem: async (k) => armazenamento.get(k) ?? null,
        setItem: async (k, v) => { armazenamento.set(k, v) },
        removeItem: async (k) => { armazenamento.delete(k) },
      },
    },
    '@react-native-community/netinfo': {
      __esModule: true,
      default: { fetch: async () => ({ isConnected: online, isInternetReachable: online }), addEventListener: () => () => {} },
    },
    'react-native': { Platform: { OS: 'android' }, Alert: { alert: (...a) => alertas.push(a) } },
    '../lib/supabase': { supabase },
    '../lib/reconciliacao': { reconciliarPagoCliente: async (id) => { reconciliados.push(id) } },
    '../lib/tenant': { resolverTenantId: async () => 'u-dono' },
    '../lib/uuid': { gerarUUID: () => 'op-fixa-1' },
  }
  return { stubs, armazenamento, chamadas, alertas, reconciliados }
}

function carregar(rel, stubs, cache = {}) {
  if (cache[rel]) return cache[rel]
  const src = fs.readFileSync(path.join(raiz, rel), 'utf8')
  const js = ts.transpileModule(src, { compilerOptions: { module: 'commonjs', target: 'es2022', esModuleInterop: true } }).outputText
  const m = { exports: {} }
  const req = (n) => {
    if (stubs[n]) return stubs[n]
    if (n === './useOffline') return carregar('hooks/useOffline.ts', stubs, cache)
    throw new Error('require sem stub: ' + n)
  }
  vm.runInNewContext(js, { module: m, exports: m.exports, require: req, console, Date, Math, Promise, setTimeout, clearTimeout, AbortController }, { filename: rel })
  return (cache[rel] = m.exports)
}

;(async () => {
  // 1) ONLINE: o pagamento sai com venda_id
  {
    const a = novoAmbiente({ online: true })
    const cache = {}
    const useVendas = carregar('hooks/useVendas.ts', a.stubs, cache).useVendas()
    await useVendas.registrarPagamento({ cliente_id: 'c1', valor: 157.8, venda_id: 'venda-batom', observacao: 'Pix' })
    const c = a.chamadas.find(x => x.tipo === 'insert' && x.tabela === 'pagamentos')
    ok('online: pagamento é gravado com o venda_id escolhido', c && c.payload.venda_id === 'venda-batom' && c.payload.valor === 157.8 && c.payload.criado_por === 'u-dono')
    ok('online: reconcilia o cliente depois de gravar', a.reconciliados.includes('c1'))
  }

  // 2) SEM escolher venda: nada de venda_id (igual a hoje)
  {
    const a = novoAmbiente({ online: true })
    const useVendas = carregar('hooks/useVendas.ts', a.stubs, {}).useVendas()
    await useVendas.registrarPagamento({ cliente_id: 'c1', valor: 50 })
    const c = a.chamadas.find(x => x.tipo === 'insert' && x.tabela === 'pagamentos')
    ok('pagamento solto continua sem venda_id', c && c.payload.venda_id === undefined)
  }

  // 3) OFFLINE: enfileira com venda_id; depois sincroniza e envia com venda_id
  {
    const a = novoAmbiente({ online: false })
    const cache = {}
    const useVendas = carregar('hooks/useVendas.ts', a.stubs, cache).useVendas()
    await useVendas.registrarPagamento({ cliente_id: 'c1', valor: 157.8, venda_id: 'venda-batom' })
    const fila = JSON.parse(a.armazenamento.get('@fiado_fila_offline'))
    ok('offline: operação fica na fila com venda_id', fila.length === 1 && fila[0].dados.venda_id === 'venda-batom' && a.chamadas.length === 0)
    // volta a internet
    const off = carregar('hooks/useOffline.ts', a.stubs, cache)
    const qtd = await off.sincronizarFila()
    const env = a.chamadas.find(x => x.tipo === 'upsert')
    ok('offline→online: sincroniza 1 operação com o venda_id preservado e client_op_id', qtd === 1 && env.payload.venda_id === 'venda-batom' && env.payload.client_op_id === 'op-fixa-1')
    ok('offline→online: fila esvazia e o cliente é reconciliado', JSON.parse(a.armazenamento.get('@fiado_fila_offline')).length === 0 && a.reconciliados.includes('c1'))
  }

  // 4) VENDA APAGADA antes de sincronizar (banco responde 23514): reenvia sem venda_id e avisa
  {
    const a = novoAmbiente({ online: false, respostas: [{ error: { code: '23514', message: 'A venda escolhida não pertence a este cliente.' } }, { error: null }] })
    const cache = {}
    const useVendas = carregar('hooks/useVendas.ts', a.stubs, cache).useVendas()
    await useVendas.registrarPagamento({ cliente_id: 'c1', valor: 42.2, venda_id: 'venda-apagada' })
    const off = carregar('hooks/useOffline.ts', a.stubs, cache)
    const qtd = await off.sincronizarFila()
    const envios = a.chamadas.filter(x => x.tipo === 'upsert')
    ok('venda apagada: 1º envio com venda_id, 2º envio SEM venda_id (mesmo client_op_id)', envios.length === 2 && envios[0].payload.venda_id === 'venda-apagada' && envios[1].payload.venda_id === undefined && envios[1].payload.client_op_id === 'op-fixa-1')
    ok('venda apagada: o pagamento entra (sincronizados=1) e a fila esvazia', qtd === 1 && JSON.parse(a.armazenamento.get('@fiado_fila_offline')).length === 0)
    ok('venda apagada: o usuário é avisado', a.alertas.length === 1 && /Pagamento ajustado/.test(a.alertas[0][0]) && /R\$\s?42,20/.test(a.alertas[0][1]), JSON.stringify(a.alertas))
  }

  // 5) FUNCIONÁRIO: a fila só sincroniza o que a própria sessão criou
  {
    const a = novoAmbiente({ online: false, usuario: 'u-func' })
    const cache = {}
    const useVendas = carregar('hooks/useVendas.ts', a.stubs, cache).useVendas()
    await useVendas.registrarPagamento({ cliente_id: 'c1', valor: 10, venda_id: 'venda-x' })
    const fila = JSON.parse(a.armazenamento.get('@fiado_fila_offline'))
    ok('funcionário: o lançamento na fila leva o id dele como autor', fila[0].dados.criado_por === 'u-func' && fila[0].dados.usuario_id === 'u-dono')
    // outro usuário abre o app no mesmo aparelho: não envia o do funcionário
    const b = novoAmbiente({ online: true, usuario: 'u-dono' })
    b.armazenamento.set('@fiado_fila_offline', JSON.stringify(fila))
    const off = carregar('hooks/useOffline.ts', b.stubs, {})
    const qtd = await off.sincronizarFila()
    ok('celular compartilhado: sessão do dono não envia o pagamento do funcionário', qtd === 0 && b.chamadas.length === 0)
  }

  // 6) ERRO QUE NÃO É de venda apagada continua preso na fila (não perde nem duplica)
  {
    const a = novoAmbiente({ online: false, respostas: [{ error: { code: '23503', message: 'fk' } }] })
    const cache = {}
    const useVendas = carregar('hooks/useVendas.ts', a.stubs, cache).useVendas()
    await useVendas.registrarPagamento({ cliente_id: 'c1', valor: 5, venda_id: 'v1' })
    const off = carregar('hooks/useOffline.ts', a.stubs, cache)
    const qtd = await off.sincronizarFila()
    ok('outro erro do banco: fica na fila, sem reenvio e sem aviso', qtd === 0 && a.chamadas.length === 1 && JSON.parse(a.armazenamento.get('@fiado_fila_offline')).length === 1 && a.alertas.length === 0)
  }

  // 7) 23514 de OUTRO check (mensagem diferente) NÃO vira reenvio sem venda_id
  {
    const a = novoAmbiente({ online: false, respostas: [{ error: { code: '23514', message: 'new row violates check constraint "pagamentos_valor_check"' } }] })
    const cache = {}
    const useVendas = carregar('hooks/useVendas.ts', a.stubs, cache).useVendas()
    await useVendas.registrarPagamento({ cliente_id: 'c1', valor: 5, venda_id: 'v1' })
    const off = carregar('hooks/useOffline.ts', a.stubs, cache)
    const qtd = await off.sincronizarFila()
    ok('23514 de outro CHECK: não reenvia sem venda_id; fica na fila', qtd === 0 && a.chamadas.length === 1 && a.alertas.length === 0)
  }

  console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} FALHA(S)`)
  process.exit(falhas ? 1 : 0)
})().catch((e) => { console.error('ERRO NO TESTE', e); process.exit(2) })

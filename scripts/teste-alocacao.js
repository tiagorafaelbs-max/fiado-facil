const fs = require('fs'), path = require('path'), vm = require('vm')
// Uso: node scripts/teste-alocacao.js   (compara lib/alocacao.ts com o resultado da formula do banco)
const raiz = path.join(__dirname, '..')
const ts = require(raiz + '/node_modules/typescript')
const cache = {}
function carregar(rel) {
  if (cache[rel]) return cache[rel]
  const src = fs.readFileSync(path.join(raiz, rel), 'utf8')
  const js = ts.transpileModule(src, { compilerOptions: { module: 'commonjs', target: 'es2022' } }).outputText
  const m = { exports: {} }
  const req = (n) => carregar('lib/' + n.replace('./', '') + '.ts')
  vm.runInNewContext(js, { module: m, exports: m.exports, require: req, console, Date, Math })
  return (cache[rel] = m.exports)
}
let falhas = 0
const ok = (nome, cond, extra) => { if (!cond) { falhas++; console.log('FALHOU:', nome, extra ?? '') } else console.log('ok   :', nome) }
const { alocarPagamentos, parcialDirecionada, listarAbertas, previaDaAplicacao } = carregar('lib/alocacao.ts')
const { vencimentoEfetivoISO } = carregar('lib/vencimento.ts')

// Referência: o FIFO "de sempre" (sem direcionamento), escrito de forma independente
function fifoAntigo(vendas, pagamentos) {
  const tp = Math.round(pagamentos.reduce((s, p) => s + p.valor, 0) * 100)
  const o = [...vendas].sort((a, b) => {
    const ea = vencimentoEfetivoISO(a.data_venda, a.data_vencimento), eb = vencimentoEfetivoISO(b.data_venda, b.data_vencimento)
    if (ea !== eb) return ea < eb ? -1 : 1
    if (a.data_venda !== b.data_venda) return a.data_venda < b.data_venda ? -1 : 1
    return a.id < b.id ? -1 : 1
  })
  let acum = 0; const r = {}
  for (const v of o) { acum += Math.round(v.valor * 100); r[v.id] = acum <= tp }
  return r
}

// Caso Natura: batom R$ 157,80 vence DEPOIS de outras vendas
const A = { id: 'a', valor: 200, data_venda: '2026-09-01', data_vencimento: '2026-10-10' }
const B = { id: 'b', valor: 157.8, data_venda: '2026-09-05', data_vencimento: '2026-10-20' }   // batom
const C = { id: 'c', valor: 90, data_venda: '2026-09-10', data_vencimento: '2026-11-01' }
const q = (m, id) => m.get(id)

let m = alocarPagamentos([A, B, C], [{ valor: 157.8 }])
ok('FIFO de hoje: R$157,80 solto quita parte da venda mais antiga, não o batom', !q(m, 'b').quitada && q(m, 'a').pago === 157.8 && !q(m, 'a').quitada)
m = alocarPagamentos([A, B, C], [{ valor: 157.8, venda_id: 'b' }])
ok('direcionado ao batom: batom quitado, as outras intactas', q(m, 'b').quitada && q(m, 'b').pago === 157.8 && q(m, 'a').pago === 0 && q(m, 'c').pago === 0)
m = alocarPagamentos([A, B, C], [{ valor: 100, venda_id: 'b' }])
ok('direcionado menor que a venda: parcial, pago=false', !q(m, 'b').quitada && q(m, 'b').pago === 100 && q(m, 'b').restante === 57.8)
const p = parcialDirecionada(q(m, 'b'))
ok('texto "R$ X pagos de R$ Y"', p && p.pago === 100 && p.de === 157.8)
ok('parcial só aparece para venda com direcionado', parcialDirecionada(q(m, 'a')) === null)
m = alocarPagamentos([A, B, C], [{ valor: 200, venda_id: 'b' }])
ok('direcionado maior que a venda: batom quitado e a SOBRA (42,20) segue o FIFO na venda mais antiga', q(m, 'b').quitada && q(m, 'b').pago === 157.8 && q(m, 'a').pago === 42.2 && !q(m, 'a').quitada)
m = alocarPagamentos([A, B, C], [{ valor: 50 }, { valor: 157.8, venda_id: 'b' }])
ok('solto + direcionado: batom quitado, os R$50 soltos vão para a mais antiga', q(m, 'b').quitada && q(m, 'a').pago === 50 && q(m, 'c').pago === 0)
m = alocarPagamentos([A, B, C], [{ valor: 150, venda_id: 'b' }, { valor: 7.8, venda_id: 'b' }])
ok('dois pagamentos direcionados à mesma venda somam', q(m, 'b').quitada && q(m, 'b').dirigido === 157.8)
m = alocarPagamentos([A, B, C], [{ valor: 100, venda_id: 'nao-existe' }])
ok('venda_id desconhecido vira pagamento solto (como o SET NULL do banco)', q(m, 'a').pago === 100 && q(m, 'b').pago === 0)
m = alocarPagamentos([A, B, C], [{ valor: 447.8 }])
ok('quitou tudo: todas quitadas', [...m.values()].every(x => x.quitada))
m = alocarPagamentos([A, B, C], [{ valor: 200, venda_id: 'a' }, { valor: 157.8, venda_id: 'b' }, { valor: 90, venda_id: 'c' }])
ok('tudo direcionado: todas quitadas', [...m.values()].every(x => x.quitada))
ok('lista vazia', alocarPagamentos([], [{ valor: 10 }]).size === 0)

// Lista de vendas em aberto para a tela "Escolher venda"
const Av = { id: 'a', descricao: 'Perfume', valor: 200, data_venda: '2026-09-01', data_vencimento: '2026-10-10' }
const Bv = { id: 'b', descricao: 'Batons e presente', valor: 157.8, data_venda: '2026-09-05', data_vencimento: '2026-10-20' }
const Cv = { id: 'c', descricao: 'Creme', valor: 90, data_venda: '2026-09-10', data_vencimento: '2026-11-01' }
const Lv = { id: 'local_123', descricao: 'Venda offline', valor: 10, data_venda: '2026-10-07' }
let ab = listarAbertas([Cv, Bv, Av, Lv], [])
ok('lista na ordem FIFO e sem venda offline não sincronizada', ab.map(x => x.id).join() === 'a,b,c', ab.map(x => x.id).join())
ab = listarAbertas([Av, Bv, Cv], [{ valor: 200, venda_id: null }])
ok('venda quitada some da lista e o que falta é mostrado', ab.map(x => x.id).join() === 'b,c' && ab[0].falta === 157.8)
ab = listarAbertas([Av, Bv, Cv], [{ valor: 100, venda_id: 'b' }])
ok('parcial direcionado: continua na lista com o que falta (57,80) e o que já foi pago (100)', ab.find(x => x.id === 'b').falta === 57.8 && ab.find(x => x.id === 'b').dirigido === 100)
const pBatom = ab.find(x => x.id === 'b')
let pv = previaDaAplicacao({ ...pBatom, falta: 157.8 }, 200)
ok('prévia: valor maior que a venda -> quitada e sobra de R$ 42,20', pv.quitada && pv.sobra === 42.2 && pv.ficaFaltando === 0, JSON.stringify(pv))
pv = previaDaAplicacao({ ...pBatom, falta: 157.8 }, 157.8)
ok('prévia: valor exato -> quitada, sem sobra', pv.quitada && pv.sobra === 0)
pv = previaDaAplicacao({ ...pBatom, falta: 157.8 }, 100)
ok('prévia: valor menor -> não quita, fica faltando 57,80', !pv.quitada && pv.ficaFaltando === 57.8, JSON.stringify(pv))

// Propriedade 1: sem venda_id, igual ao FIFO de sempre (aleatório, 3000 casos)
let semente = 12345
const rnd = () => (semente = (semente * 1664525 + 1013904223) % 4294967296) / 4294967296
const dia = (n) => { const d = new Date(Date.UTC(2026, 0, 1 + n)); return d.toISOString().slice(0, 10) }
let divergencias = 0, violacoes = 0
for (let i = 0; i < 3000; i++) {
  const nv = 1 + Math.floor(rnd() * 7)
  const vendas = Array.from({ length: nv }, (_, k) => ({
    id: 'v' + k + 'x' + Math.floor(rnd() * 100), valor: Math.round((5 + rnd() * 300) * 100) / 100,
    data_venda: dia(Math.floor(rnd() * 60)), data_vencimento: rnd() < 0.5 ? null : dia(30 + Math.floor(rnd() * 60)),
  }))
  const ids = new Set(); vendas.forEach((v, k) => { while (ids.has(v.id)) v.id += 'z'; ids.add(v.id) })
  const pags = Array.from({ length: Math.floor(rnd() * 5) }, () => ({ valor: Math.round((1 + rnd() * 250) * 100) / 100 }))
  const novo = alocarPagamentos(vendas, pags), antigo = fifoAntigo(vendas, pags)
  for (const v of vendas) if (novo.get(v.id).quitada !== antigo[v.id]) divergencias++
  // Propriedade 2 (com direcionamento aleatório): nada é criado nem perdido
  const pd = pags.map(pg => rnd() < 0.5 ? { ...pg, venda_id: vendas[Math.floor(rnd() * nv)].id } : pg)
  const r = alocarPagamentos(vendas, pd)
  const totalPago = Math.round(pd.reduce((s, x) => s + x.valor, 0) * 100)
  const somaPago = Math.round([...r.values()].reduce((s, x) => s + x.pago, 0) * 100)
  const somaValor = Math.round(vendas.reduce((s, v) => s + v.valor, 0) * 100)
  if (somaPago !== Math.min(totalPago, somaValor)) violacoes++
  for (const x of r.values()) if (x.pago > x.valor + 1e-9 || x.pago < 0 || x.dirigido > x.valor + 1e-9) violacoes++
}
ok('sem venda_id: idêntico ao FIFO de sempre (3000 casos aleatórios)', divergencias === 0, divergencias)
ok('com venda_id aleatório: nunca paga mais que a venda, soma = min(total pago, total vendido) (3000 casos)', violacoes === 0, violacoes)

// Propriedade 3: MESMO resultado da funcao do banco (pagamento_direcionado_a_venda.sql) em 60 clientes reais
// (metade com pagamento direcionado sintetico, 1/3 com direcionado maior que a venda). O flag 'pago' do fixture
// foi calculado pelo proprio SQL da migration.
const fixture = JSON.parse(fs.readFileSync(path.join(raiz, 'scripts', 'fixtures', 'alocacao-banco.json'), 'utf8'))
let comparadas = 0, difs = [], direcionados = 0
fixture.clientes.forEach((cli, idx) => {
  const vendas = cli.v.map(([id, valor, dv, dvenc]) => ({ id: String(id).padStart(6, '0'), valor, data_venda: dv, data_vencimento: dvenc }))
  const pagamentos = cli.p.map(([valor, vid]) => ({ valor, venda_id: vid == null ? null : String(vid).padStart(6, '0') }))
  if (pagamentos.some(x => x.venda_id)) direcionados++
  const r = alocarPagamentos(vendas, pagamentos)
  cli.v.forEach(([id, , , , pagoSql]) => {
    comparadas++
    const js = r.get(String(id).padStart(6, '0')).quitada
    if (js !== pagoSql) difs.push({ cliente: idx, venda: id, sql: pagoSql, js })
  })
})
ok('mesmo resultado do banco em ' + comparadas + ' vendas de ' + fixture.clientes.length + ' clientes (' + direcionados + ' com pagamento direcionado)', difs.length === 0, JSON.stringify(difs.slice(0, 5)))

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} FALHA(S)`)
process.exit(falhas ? 1 : 0)

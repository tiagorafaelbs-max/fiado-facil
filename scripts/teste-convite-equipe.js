// Uso: node scripts/teste-convite-equipe.js
// Testa as regras PURAS do convite de funcionário pelo WhatsApp (supabase/functions/_shared/convite.ts e lib/conviteEquipe.ts)
// e confere por leitura do código que o link/token nunca vai para log nem para o funil.
const fs = require('fs'), path = require('path'), vm = require('vm')
const raiz = path.join(__dirname, '..')
const ts = require(raiz + '/node_modules/typescript')
const compilar = (arq, mods = {}) => {
  const js = ts.transpileModule(fs.readFileSync(path.join(raiz, arq), 'utf8'), { compilerOptions: { module: 'commonjs', target: 'es2022' } }).outputText
  const m = { exports: {} }
  vm.runInNewContext(js, { module: m, exports: m.exports, encodeURIComponent, decodeURIComponent, Date, JSON, require: n => { if (!(n in mods)) throw new Error('mod ' + n); return mods[n] } })
  return m.exports
}
const C = compilar('supabase/functions/_shared/convite.ts')
const L = compilar('lib/conviteEquipe.ts', { './supabase': { supabase: {} } })

let falhas = 0, total = 0
function t(nome, ok) { total++; if (!ok) { falhas++; console.log('FALHOU:', nome) } }

// ── tipo do link ──
t('e-mail ainda não confirmado = invite', C.escolherTipoLink(false) === 'invite')
t('e-mail confirmado (abriu fora do app) = recovery', C.escolherTipoLink(true) === 'recovery')

// ── quem abriu o link ──
const UA = {
  whatsapp: 'WhatsApp/2.23.20.0 A',
  whatsappIos: 'WhatsApp/23.20.79 i',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 13; SM-A515F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  chromeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  facebook: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  telegram: 'TelegramBot (like TwitterBot)',
  scanner: 'python-requests/2.31.0',
}
t('pré-visualização do WhatsApp (Android) = robô, não segue', C.classificarAcesso('GET', UA.whatsapp) === 'robo')
t('pré-visualização do WhatsApp (iPhone) = robô', C.classificarAcesso('GET', UA.whatsappIos) === 'robo')
t('Facebook / Telegram / scanner = robô', C.classificarAcesso('GET', UA.facebook) === 'robo' && C.classificarAcesso('GET', UA.telegram) === 'robo' && C.classificarAcesso('GET', UA.scanner) === 'robo')
t('sem user-agent = robô', C.classificarAcesso('GET', '') === 'robo')
t('HEAD nunca segue', C.classificarAcesso('HEAD', UA.chromeAndroid) === 'head' && C.classificarAcesso('head', UA.safariIphone) === 'head')
t('Chrome no Android = celular (segue para o app)', C.classificarAcesso('GET', UA.chromeAndroid) === 'celular')
t('Safari no iPhone = celular', C.classificarAcesso('GET', UA.safariIphone) === 'celular')
t('computador Windows/Mac = aviso "abra no celular"', C.classificarAcesso('GET', UA.chromeWindows) === 'computador' && C.classificarAcesso('GET', UA.safariMac) === 'computador')

// ── deep link do app (formato que lib/linkAuth.ts valida) ──
const u = C.urlDoAppConvite('abc+/=123', 'invite')
t('deep link usa token_hash e type', u.startsWith('fiadofacil://nova-senha?token_hash=') && u.endsWith('&type=invite'))
t('token_hash codificado na URL', u.includes(encodeURIComponent('abc+/=123')) && !u.includes('abc+/='))
t('recovery', C.urlDoAppConvite('x', 'recovery').endsWith('&type=recovery'))
t('link de abertura é opaco e sem barra dupla', C.linkDeAbertura('https://proj.supabase.co/', '11111111-2222-3333-4444-555555555555') === 'https://proj.supabase.co/functions/v1/abrir-convite?c=11111111-2222-3333-4444-555555555555')
t('link enviado no WhatsApp = página do site com o id (opaco)', C.linkDoConvite('11111111-2222-3333-4444-555555555555') === 'https://fiadoapp.app.br/convite.html?c=11111111-2222-3333-4444-555555555555')
t('uuid válido / inválido', C.uuidValido('11111111-2222-3333-4444-555555555555') && !C.uuidValido('x') && !C.uuidValido(null) && !C.uuidValido("1' or 1=1"))

// ── texto do WhatsApp ──
const txt = L.montarTextoConvite({ nome: 'Donizetti', loja: 'A.S Produto De Limpeza', link: 'https://proj.supabase.co/functions/v1/abrir-convite?c=ID' })
t('texto: nome, loja e o pedido de abrir no celular', txt.includes('Oi, Donizetti!') && txt.includes('da A.S Produto De Limpeza') && txt.includes('NO SEU CELULAR') && txt.includes('depois de instalar'))
t('texto: links das duas lojas e o link do convite', txt.includes('play.google.com/store/apps/details?id=com.fiadofacil.app') && txt.includes('apps.apple.com/app/id6783416254') && txt.includes('abrir-convite?c=ID'))
t('texto: avisa que o link vale uma vez', txt.includes('O link vale uma vez.'))
t('texto: nunca menciona "código"', !/c[óo]digo/i.test(txt))
t('texto sem loja não quebra', !/undefined|null/.test(L.montarTextoConvite({ nome: 'Ana', loja: null, link: 'L' })))
const wa = L.urlWhatsApp(txt)
t('wa.me SEM número (o dono escolhe o contato)', wa.startsWith('https://wa.me/?text='))
t('texto volta igual depois de codificar', decodeURIComponent(wa.slice('https://wa.me/?text='.length)) === txt)

// ── segurança: o link/token nunca em log nem no funil (leitura do código) ──
const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8')
const funcoes = ['supabase/functions/convidar-funcionario/index.ts', 'supabase/functions/abrir-convite/index.ts']
for (const f of funcoes) {
  const linhasLog = ler(f).split('\n').filter(l => /console\.(log|error|warn|info)/.test(l))
  t(f + ': log sem link/token', linhasLog.every(l => !/hash|link|token|gerado|registro|url/i.test(l.replace(/\/\/.*$/, ''))))
}
const equipe = ler('app/equipe.tsx')
t('equipe.tsx: nenhum evento() com o link', equipe.split('\n').filter(l => /evento\(/.test(l)).every(l => !/link|texto|url/i.test(l.replace(/'convite_[a-z]+'/g, ''))))
t('equipe.tsx: nenhum console com o link', !/console\.(log|warn|error)/.test(equipe))
t('conviteEquipe.ts: sem console e sem funil', !/console\.|evento\(/.test(ler('lib/conviteEquipe.ts')))
t('equipe.tsx: nada de "código" na tela', !/c[óo]digo/i.test(equipe))
t('migration: convites_link sem acesso do app', /revoke all on public\.convites_link from public, anon, authenticated/.test(ler('supabase/migrations/convite_whatsapp.sql')) && !/create policy[^;]*convites_link/i.test(ler('supabase/migrations/convite_whatsapp.sql')))

console.log(falhas === 0 ? ` TODOS OS TESTES PASSARAM (${total})` : `${falhas} FALHA(S) de ${total}`)
process.exit(falhas === 0 ? 0 : 1)

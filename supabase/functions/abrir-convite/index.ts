import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { classificarAcesso, uuidValido, urlDoAppConvite, escolherTipoLink, VALIDADE_REGISTRO_DIAS, LIMITE_ABERTURAS } from '../_shared/convite.ts'

// Abre o convite de funcionário enviado pelo WhatsApp. Deploy SEM verificação de JWT (quem abre é o funcionário, ainda sem conta
// logada). O link do WhatsApp é opaco (?c=<id>) e aponta só para (dono, funcionário) em public.convites_link: NÃO guarda token.
// O token de acesso é gerado AQUI, na hora em que o funcionário abre o link, porque o Auth o vence em ~1 h e um convite pelo
// WhatsApp costuma ser aberto horas ou dias depois. Ele vai só no deep link do app (fiadofacil://nova-senha?token_hash=…), nunca
// em log nem no funil, e só é consumido quando o APP o valida: abrir no computador ou a pré-visualização do WhatsApp não gasta
// o convite (robô/HEAD/computador nem geram token).
//
// Dois modos (mesmas checagens):
//   GET ?c=<id>             celular -> 302 para o deep link do app (texto simples nos demais casos).
//   GET ?c=<id>&modo=json   para a página https://fiadoapp.app.br/convite.html (botão "Abrir no FiadoApp" quando o navegador interno
//                           do WhatsApp não segue o 302): devolve {"url": "<deep link>"} ou {"erro": "<mensagem>"}, com CORS só
//                           para o site. Esta função NÃO serve HTML (o domínio padrão do Supabase força text/plain).

const CABECALHOS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
}
const ORIGEM_SITE = 'https://fiadoapp.app.br'

function texto(status: number, msg: string): Response {
  return new Response(msg, { status, headers: CABECALHOS })
}

function jsonSite(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': ORIGEM_SITE,
      'Vary': 'Origin',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

type Resultado = { url: string } | { status: number; msg: string }

// Todas as checagens do convite; só no fim gera o token (e conta a abertura).
async function resolver(id: string): Promise<Resultado> {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: reg } = await supabase.from('convites_link').select('id, dono_id, membro_id, tipo, criado_em, aberturas').eq('id', id).maybeSingle()
  const vencido = reg && Date.now() - Date.parse(reg.criado_em) > VALIDADE_REGISTRO_DIAS * 86400 * 1000
  if (!reg || vencido || reg.tipo !== 'link') {
    return { status: 410, msg: 'Este link expirou. Peça ao dono do negócio para reenviar o convite.' }
  }
  if ((reg.aberturas ?? 0) >= LIMITE_ABERTURAS) return { status: 429, msg: 'Muitas tentativas com este link. Peça ao dono do negócio para reenviar o convite.' }

  // O funcionário ainda faz parte da equipe deste dono?
  const { data: membro } = await supabase
    .from('membros_equipe').select('id').eq('dono_id', reg.dono_id).eq('membro_id', reg.membro_id).eq('status', 'ativo').maybeSingle()
  if (!membro) return { status: 410, msg: 'Este convite não vale mais. Fale com o dono do negócio.' }

  const { data: temSenha } = await supabase.rpc('membro_tem_senha', { p_membro: reg.membro_id })
  if (temSenha === true) return { status: 200, msg: 'Você já criou sua senha. Abra o FiadoApp e entre com seu e-mail e senha.' }

  const { data: dadosFunc } = await supabase.auth.admin.getUserById(reg.membro_id)
  const func = dadosFunc?.user
  if (!func?.email) return { status: 410, msg: 'Este convite não vale mais. Fale com o dono do negócio.' }

  // Token novo a cada abertura: invite se o e-mail ainda não foi confirmado; recovery se já foi (abriu fora do app) mas não tem senha.
  // Se o Auth recusar "invite" para um usuário que já existe (ainda não confirmado), cai para "recovery" (o app aceita os dois tipos).
  const preferido = escolherTipoLink(!!func.email_confirmed_at)
  const tentativas: ('invite' | 'recovery')[] = preferido === 'invite' ? ['invite', 'recovery'] : ['recovery']
  let hash: string | undefined
  let tipo = preferido
  for (const t of tentativas) {
    const { data: gerado, error: erroLink } = await supabase.auth.admin.generateLink({
      type: t,
      email: func.email,
      options: { redirectTo: 'fiadofacil://nova-senha' },
    })
    if (!erroLink && gerado?.properties?.hashed_token) { hash = gerado.properties.hashed_token; tipo = t; break }
  }
  if (!hash) return { status: 502, msg: 'Não foi possível abrir o convite agora. Tente de novo em instantes.' }

  await supabase.from('convites_link').update({ aberturas: (reg.aberturas ?? 0) + 1 }).eq('id', reg.id)
  return { url: urlDoAppConvite(hash, tipo) }
}

serve(async (req) => {
  try {
    const url = new URL(req.url)
    const modoJson = url.searchParams.get('modo') === 'json'
    const acesso = classificarAcesso(req.method, req.headers.get('user-agent') ?? '')

    if (acesso === 'head' || acesso === 'robo') {
      return modoJson ? jsonSite({ erro: 'Abra este link no celular do funcionário.' }) : texto(200, 'FiadoApp: convite para a equipe. Abra este link no celular do funcionário.')
    }
    if (acesso === 'computador') {
      const msg = 'Abra este link no celular do funcionário, com o FiadoApp instalado. No computador o convite não funciona.'
      return modoJson ? jsonSite({ erro: msg }) : texto(200, msg)
    }

    const id = url.searchParams.get('c')
    if (!uuidValido(id)) {
      const msg = 'Link inválido. Peça ao dono do negócio para reenviar o convite.'
      return modoJson ? jsonSite({ erro: msg }, 404) : texto(404, msg)
    }

    const r = await resolver(id)
    if ('url' in r) {
      if (modoJson) return jsonSite({ url: r.url })
      return new Response(null, {
        status: 302,
        headers: { Location: r.url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
      })
    }
    return modoJson ? jsonSite({ erro: r.msg }, r.status === 200 ? 200 : r.status) : texto(r.status, r.msg)
  } catch (err: any) {
    console.error('[abrir-convite] Exceção:', err?.message ?? 'desconhecida')   // nunca o link/token
    const msg = 'Não foi possível abrir o convite agora. Tente de novo em instantes.'
    return new Response(msg, { status: 500, headers: CABECALHOS })
  }
})

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { classificarAcesso, uuidValido, urlDoAppConvite, escolherTipoLink, VALIDADE_REGISTRO_DIAS, LIMITE_ABERTURAS } from '../_shared/convite.ts'

// Abre o convite de funcionário enviado pelo WhatsApp. Deploy SEM verificação de JWT (quem abre é o funcionário, ainda sem conta
// logada). O link do WhatsApp é opaco (?c=<id>) e aponta só para (dono, funcionário) em public.convites_link: NÃO guarda token.
// O token de acesso é gerado AQUI, na hora em que o funcionário abre o link, porque o Auth o vence em ~1 h e um convite pelo
// WhatsApp costuma ser aberto horas ou dias depois. Ele vai só no deep link do app (fiadofacil://nova-senha?token_hash=…), nunca
// em log nem no funil, e só é consumido quando o APP o valida: abrir no computador ou a pré-visualização do WhatsApp não gasta
// o convite (robô/HEAD/computador nem geram token).

const CABECALHOS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
}

function texto(status: number, msg: string): Response {
  return new Response(msg, { status, headers: CABECALHOS })
}

serve(async (req) => {
  try {
    const acesso = classificarAcesso(req.method, req.headers.get('user-agent') ?? '')
    if (acesso === 'head' || acesso === 'robo') {
      return texto(200, 'FiadoApp: convite para a equipe. Abra este link no celular do funcionário.')
    }
    if (acesso === 'computador') {
      return texto(200, 'Abra este link no celular do funcionário, com o FiadoApp instalado. No computador o convite não funciona.')
    }

    const id = new URL(req.url).searchParams.get('c')
    if (!uuidValido(id)) return texto(404, 'Link inválido. Peça ao dono do negócio para reenviar o convite.')

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: reg } = await supabase.from('convites_link').select('id, dono_id, membro_id, tipo, criado_em, aberturas').eq('id', id).maybeSingle()
    const vencido = reg && Date.now() - Date.parse(reg.criado_em) > VALIDADE_REGISTRO_DIAS * 86400 * 1000
    if (!reg || vencido || reg.tipo !== 'link') {
      return texto(410, 'Este link expirou. Peça ao dono do negócio para reenviar o convite.')
    }
    if ((reg.aberturas ?? 0) >= LIMITE_ABERTURAS) return texto(429, 'Muitas tentativas com este link. Peça ao dono do negócio para reenviar o convite.')

    // O funcionário ainda faz parte da equipe deste dono?
    const { data: membro } = await supabase
      .from('membros_equipe').select('id').eq('dono_id', reg.dono_id).eq('membro_id', reg.membro_id).eq('status', 'ativo').maybeSingle()
    if (!membro) return texto(410, 'Este convite não vale mais. Fale com o dono do negócio.')

    const { data: temSenha } = await supabase.rpc('membro_tem_senha', { p_membro: reg.membro_id })
    if (temSenha === true) return texto(200, 'Você já criou sua senha. Abra o FiadoApp e entre com seu e-mail e senha.')

    const { data: dadosFunc } = await supabase.auth.admin.getUserById(reg.membro_id)
    const func = dadosFunc?.user
    if (!func?.email) return texto(410, 'Este convite não vale mais. Fale com o dono do negócio.')

    // Token novo a cada abertura: invite se o e-mail ainda não foi confirmado; recovery se já foi (abriu fora do app) mas não tem senha.
    const tipo = escolherTipoLink(!!func.email_confirmed_at)
    const { data: gerado, error: erroLink } = await supabase.auth.admin.generateLink({
      type: tipo,
      email: func.email,
      options: { redirectTo: 'fiadofacil://nova-senha' },
    })
    const hash = gerado?.properties?.hashed_token
    if (erroLink || !hash) return texto(502, 'Não foi possível abrir o convite agora. Tente de novo em instantes.')

    await supabase.from('convites_link').update({ aberturas: (reg.aberturas ?? 0) + 1 }).eq('id', reg.id)

    return new Response(null, {
      status: 302,
      headers: { Location: urlDoAppConvite(hash, tipo), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    })
  } catch (err: any) {
    console.error('[abrir-convite] Exceção:', err?.message ?? 'desconhecida')   // nunca o link/token
    return texto(500, 'Não foi possível abrir o convite agora. Tente de novo em instantes.')
  }
})

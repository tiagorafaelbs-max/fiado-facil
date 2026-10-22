import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { classificarAcesso, uuidValido, urlDoAppConvite, VALIDADE_REGISTRO_DIAS } from '../_shared/convite.ts'

// Abre o convite de funcionário enviado pelo WhatsApp. Deploy SEM verificação de JWT (quem abre é o funcionário, ainda sem conta
// logada). O link do WhatsApp é opaco (?c=<id>): o token de verdade fica guardado no servidor (public.convites_link) e NUNCA vai
// para a URL, para log nem para o funil. Aqui só redirecionamos para o deep link do app (fiadofacil://nova-senha?token_hash=…):
// o token só é consumido quando o APP o valida, então abrir no computador ou a pré-visualização do WhatsApp não gasta o convite.

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
    const { data } = await supabase.from('convites_link').select('token_hash, tipo, criado_em').eq('id', id).maybeSingle()
    const vencido = data && Date.now() - Date.parse(data.criado_em) > VALIDADE_REGISTRO_DIAS * 86400 * 1000
    if (!data || vencido || !data.token_hash || (data.tipo !== 'invite' && data.tipo !== 'recovery')) {
      return texto(410, 'Este link expirou. Peça ao dono do negócio para reenviar o convite.')
    }

    return new Response(null, {
      status: 302,
      headers: { Location: urlDoAppConvite(data.token_hash, data.tipo), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    })
  } catch (err: any) {
    console.error('[abrir-convite] Exceção:', err?.message ?? 'desconhecida')   // nunca o link/token
    return texto(500, 'Não foi possível abrir o convite agora. Tente de novo em instantes.')
  }
})

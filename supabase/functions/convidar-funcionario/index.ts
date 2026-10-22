import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { escolherTipoLink, uuidValido, linkDeAbertura, LIMITE_LINKS_POR_HORA, VALIDADE_REGISTRO_DIAS } from '../_shared/convite.ts'

// Convida um funcionário para operar sob a conta do dono, com login próprio
// (email/senha) mas atuando sobre os mesmos dados do negócio (via membros_equipe
// + tenant_id_atual() no banco). Limite: 2 funcionários por conta Pro.
//
// Ações (campo "acao" do corpo; sem ele = convidar, como sempre):
//   convidar        cria o usuário, envia o e-mail de convite e vincula à equipe.
//   link            gera o link de acesso para o dono mandar pelo WhatsApp (devolve só para o dono que convidou).
//   reenviar_email  reenvia o convite por e-mail (convite novo ou recuperação de senha).
// O link/token NUNCA vai para log nem para o funil: só existe no banco (public.convites_link) e no retorno ao dono.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LIMITE_FUNCIONARIOS = 2
const REDIRECT_APP = 'fiadofacil://nova-senha'

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autorizado' }, 401)

    const corpo = await req.json().catch(() => ({}))
    const acao: string = corpo?.acao ?? 'convidar'
    if (!['convidar', 'link', 'reenviar_email'].includes(acao)) return json({ error: 'Ação inválida' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: dono }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !dono) return json({ error: 'Token inválido' }, 401)

    // Só dono com plano Pro convida — nunca um funcionário convidando outro.
    const { data: perfil } = await supabase.from('perfis').select('plano, nome_negocio').eq('id', dono.id).single()
    if (perfil?.plano !== 'pro') return json({ error: 'Convidar funcionários é exclusivo do plano Pro' }, 403)

    if (acao === 'convidar') {
      const { nome, email } = corpo
      if (!nome?.trim() || !email?.trim()) return json({ error: 'Nome e e-mail são obrigatórios' }, 400)

      const { count } = await supabase
        .from('membros_equipe')
        .select('id', { count: 'exact', head: true })
        .eq('dono_id', dono.id)
        .eq('status', 'ativo')
      if ((count ?? 0) >= LIMITE_FUNCIONARIOS) return json({ error: `Limite de ${LIMITE_FUNCIONARIOS} funcionários atingido` }, 400)

      // redirectTo obrigatório -- sem ele, o link do e-mail cai no Site URL padrão do
      // projeto (não é o esquema do app), e o convite nunca abre o FiadoApp pra criar
      // a senha (achado do Tiago, 29/09: convite não funcionava por isso).
      const { data: convite, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email.trim(), {
        redirectTo: REDIRECT_APP,
        data: { nome_negocio: perfil?.nome_negocio ?? null },
      })
      if (inviteError || !convite?.user) return json({ error: inviteError?.message ?? 'Erro ao convidar usuário' }, 400)

      const { data: membro, error: membroError } = await supabase.from('membros_equipe').insert({
        dono_id: dono.id,
        membro_id: convite.user.id,
        nome: nome.trim(),
      }).select('id').single()
      if (membroError) {
        // Não deixa o convite "órfão" (usuário criado sem vínculo) se o insert falhar.
        await supabase.auth.admin.deleteUser(convite.user.id)
        return json({ error: 'Erro ao vincular funcionário à equipe' }, 500)
      }

      return json({ success: true, membro_id: membro?.id ?? null })
    }

    // ── link / reenviar_email: só para um funcionário ATIVO da equipe DESTE dono ──
    if (!uuidValido(corpo?.membro_id)) return json({ error: 'Funcionário inválido' }, 400)
    const { data: membro } = await supabase
      .from('membros_equipe')
      .select('id, membro_id, nome')
      .eq('id', corpo.membro_id)
      .eq('dono_id', dono.id)
      .eq('status', 'ativo')
      .maybeSingle()
    if (!membro) return json({ error: 'Funcionário não encontrado na sua equipe' }, 404)

    const { data: dadosFunc } = await supabase.auth.admin.getUserById(membro.membro_id)
    const func = dadosFunc?.user
    if (!func?.email) return json({ error: 'Funcionário não encontrado na sua equipe' }, 404)

    // Quem já criou a senha não precisa de novo convite.
    const { data: temSenha } = await supabase.rpc('membro_tem_senha', { p_membro: func.id })
    if (temSenha === true) return json({ error: 'Este funcionário já criou a senha e já tem acesso.' }, 409)

    // Limite por funcionário (evita disparar e-mails/links em excesso).
    const desde = new Date(Date.now() - 3600 * 1000).toISOString()
    const { count: recentes } = await supabase
      .from('convites_link')
      .select('id', { count: 'exact', head: true })
      .eq('membro_id', func.id)
      .gte('criado_em', desde)
    if ((recentes ?? 0) >= LIMITE_LINKS_POR_HORA) return json({ error: 'Muitos convites seguidos. Tente de novo em alguns minutos.' }, 429)

    // Limpeza dos registros antigos (o link vale pouco; o Supabase já expira o token por conta própria).
    await supabase.from('convites_link').delete().lt('criado_em', new Date(Date.now() - VALIDADE_REGISTRO_DIAS * 86400 * 1000).toISOString())

    const confirmado = !!func.email_confirmed_at

    if (acao === 'reenviar_email') {
      if (!confirmado) {
        // convite ainda não aberto: reenvia o convite
        const { error } = await supabase.auth.admin.inviteUserByEmail(func.email, {
          redirectTo: REDIRECT_APP,
          data: { nome_negocio: perfil?.nome_negocio ?? null },
        })
        if (error) return json({ error: 'Não foi possível reenviar o e-mail agora. Tente de novo.' }, 400)
      } else {
        // convite já aberto (e-mail confirmado) mas sem senha: e-mail de redefinição de senha
        const anon = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!)
        const { error } = await anon.auth.resetPasswordForEmail(func.email, { redirectTo: REDIRECT_APP })
        if (error) return json({ error: 'Não foi possível reenviar o e-mail agora. Tente de novo.' }, 400)
      }
      await supabase.from('convites_link').insert({ dono_id: dono.id, membro_id: func.id, tipo: 'email' })
      return json({ success: true })
    }

    // acao === 'link': gera o token no servidor; o app recebe só um link opaco (abrir-convite?c=<id>)
    const tipo = escolherTipoLink(confirmado)
    const { data: gerado, error: erroLink } = await supabase.auth.admin.generateLink({
      type: tipo,
      email: func.email,
      options: { redirectTo: REDIRECT_APP },
    })
    const hash = gerado?.properties?.hashed_token
    if (erroLink || !hash) return json({ error: 'Não foi possível gerar o link agora. Tente de novo.' }, 400)

    const { data: registro, error: erroRegistro } = await supabase
      .from('convites_link')
      .insert({ dono_id: dono.id, membro_id: func.id, tipo, token_hash: hash })
      .select('id')
      .single()
    if (erroRegistro || !registro?.id) return json({ error: 'Não foi possível gerar o link agora. Tente de novo.' }, 500)

    return json({ link: linkDeAbertura(supabaseUrl, registro.id), loja: perfil?.nome_negocio ?? null, nome: membro.nome })
  } catch (err: any) {
    console.error('[convidar-funcionario] Exceção:', err?.message ?? 'desconhecida')   // nunca o link/token
    return json({ error: `Erro interno: ${err?.message ?? 'desconhecido'}` }, 500)
  }
})

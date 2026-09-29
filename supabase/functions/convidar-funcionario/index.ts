import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Convida um funcionário para operar sob a conta do dono, com login próprio
// (email/senha) mas atuando sobre os mesmos dados do negócio (via membros_equipe
// + tenant_id_atual() no banco). Limite: 2 funcionários por conta Pro.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LIMITE_FUNCIONARIOS = 2

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { nome, email } = await req.json()
    if (!nome?.trim() || !email?.trim()) {
      return new Response(JSON.stringify({ error: 'Nome e e-mail são obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: dono }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !dono) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Só dono com plano Pro convida — nunca um funcionário convidando outro.
    const { data: perfil } = await supabase.from('perfis').select('plano, nome_negocio').eq('id', dono.id).single()
    if (perfil?.plano !== 'pro') {
      return new Response(JSON.stringify({ error: 'Convidar funcionários é exclusivo do plano Pro' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { count } = await supabase
      .from('membros_equipe')
      .select('id', { count: 'exact', head: true })
      .eq('dono_id', dono.id)
      .eq('status', 'ativo')
    if ((count ?? 0) >= LIMITE_FUNCIONARIOS) {
      return new Response(JSON.stringify({ error: `Limite de ${LIMITE_FUNCIONARIOS} funcionários atingido` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // redirectTo obrigatório -- sem ele, o link do e-mail cai no Site URL padrão do
    // projeto (não é o esquema do app), e o convite nunca abre o FiadoApp pra criar
    // a senha (achado do Tiago, 29/09: convite não funcionava por isso).
    const { data: convite, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email.trim(), {
      redirectTo: 'fiadofacil://nova-senha',
      data: { nome_negocio: perfil?.nome_negocio ?? null },
    })
    if (inviteError || !convite?.user) {
      return new Response(JSON.stringify({ error: inviteError?.message ?? 'Erro ao convidar usuário' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { error: membroError } = await supabase.from('membros_equipe').insert({
      dono_id: dono.id,
      membro_id: convite.user.id,
      nome: nome.trim(),
    })
    if (membroError) {
      // Não deixa o convite "órfão" (usuário criado sem vínculo) se o insert falhar.
      await supabase.auth.admin.deleteUser(convite.user.id)
      return new Response(JSON.stringify({ error: 'Erro ao vincular funcionário à equipe' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[convidar-funcionario] Exceção:', err?.message ?? err)
    return new Response(JSON.stringify({ error: `Erro interno: ${err?.message ?? 'desconhecido'}` }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

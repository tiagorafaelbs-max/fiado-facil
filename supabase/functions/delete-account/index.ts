import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Exclui a conta do usuário de verdade (LGPD, direito à eliminação — Art. 18).
// O app antes só apagava as linhas de negócio (clientes/vendas/pagamentos)
// e dava signOut, mas nunca removia o usuário de auth.users — o e-mail e a
// conta continuavam existindo pra sempre no Supabase Auth.
//
// Todas as tabelas de negócio (perfis, clientes, vendas, pagamentos,
// subscriptions) referenciam auth.users(id) com ON DELETE CASCADE, então
// deletar o usuário via Admin API apaga tudo de uma vez, atomicamente —
// sem risco de exclusão parcial se uma chamada falhar no meio.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Identifica o usuário a partir do próprio token — nunca aceita um
    // user_id vindo do corpo da requisição, pra ninguém conseguir apagar
    // a conta de outra pessoa.
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id)
    if (deleteError) {
      console.error('[delete-account] Erro ao excluir usuário:', deleteError)
      return new Response(JSON.stringify({ error: 'Erro ao excluir conta' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[delete-account] Conta excluída: ${user.id}`)
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[delete-account] Exceção:', err?.message ?? err)
    return new Response(JSON.stringify({ error: `Erro interno: ${err?.message ?? 'desconhecido'}` }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

-- SIMULAÇÃO da trava do sync_perfil_plano (migration google_play_billing.sql). NÃO RODADA ainda:
-- rodar só com ordem do Tiago, na MESMA transação revertida da migration (tudo termina em ROLLBACK).
-- Usa duas contas de TESTE (substituir os ids) e devolve uma linha por cenário.
begin;
-- (colar aqui o conteúdo da migration google_play_billing.sql, sem o begin/commit dela)
do $$
declare
  u_free uuid := '00000000-0000-0000-0000-000000000001';   -- conta de teste gratuita (substituir)
  u_apple uuid := '00000000-0000-0000-0000-000000000002';  -- conta de teste com apple_original_transaction_id (substituir)
  r text := '';
  v text;
begin
  -- 1) gratuito: assinatura ativa promove
  insert into subscriptions(user_id, provider, provider_subscription_id, plan_id, status, current_period_end)
    values (u_free, 'google', 'T1', 'pro_monthly', 'active', now() + interval '30 days');
  select plano into v from perfis where id = u_free; r := r || '1 promove=' || v || E'\n';
  -- 2) expiração real do mesmo token rebaixa
  update subscriptions set status = 'expired', current_period_end = now() - interval '1 day' where user_id = u_free and provider = 'google';
  select plano into v from perfis where id = u_free; r := r || '2 expira rebaixa=' || v || E'\n';
  -- 3) pending não promove
  update subscriptions set status = 'pending' where user_id = u_free and provider = 'google';
  select plano into v from perfis where id = u_free; r := r || '3 pending=' || v || E'\n';
  -- 4) Pro da Apple/manual SEM linha ativa: gravar pending não rebaixa
  update perfis set plano = 'pro' where id = u_apple;
  insert into subscriptions(user_id, provider, provider_subscription_id, plan_id, status) values (u_apple, 'google', 'T9', 'pro_monthly', 'pending');
  select plano into v from perfis where id = u_apple; r := r || '4 apple/manual com pending segue=' || v || E'\n';
  -- 5) ex-Apple assina o Google e depois expira: DEVE rebaixar (sem Pro de graça)
  update subscriptions set status = 'active', current_period_end = now() + interval '30 days' where user_id = u_apple and provider = 'google';
  update subscriptions set status = 'expired', current_period_end = now() - interval '1 day' where user_id = u_apple and provider = 'google';
  select plano into v from perfis where id = u_apple; r := r || '5 ex-apple expira rebaixa=' || v || E'\n';
  perform set_config('app.r', r, true);
end $$;
select current_setting('app.r');
rollback;

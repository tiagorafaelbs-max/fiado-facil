-- SIMULAÇÃO da trava do sync_perfil_plano (migration google_play_billing.sql). NÃO RODADA ainda:
-- rodar só com ordem do Tiago, depois de aplicar a migration dentro da MESMA transação revertida.
-- Tudo termina em ROLLBACK. Usa contas de teste (substituir os ids) e devolve uma linha por cenário.
begin;
-- (colar aqui o conteúdo da migration google_play_billing.sql, sem o begin/commit dela)
do $$
declare
  u_free uuid := '00000000-0000-0000-0000-000000000001';   -- conta de teste gratuita (substituir)
  u_apple uuid := '00000000-0000-0000-0000-000000000002';  -- conta de teste Pro com apple_original_transaction_id (substituir)
  r text := '';
  plano text;
begin
  -- 1) gratuito: assinatura ativa promove
  insert into subscriptions(user_id, provider, provider_subscription_id, plan_id, status, current_period_end)
    values (u_free, 'google', 'T1', 'pro_monthly', 'active', now() + interval '30 days');
  select p.plano into plano from perfis p where p.id = u_free; r := r || '1 promove=' || plano || E'\n';
  -- 2) cancelamento real do mesmo token rebaixa
  update subscriptions set status = 'expired', current_period_end = now() - interval '1 day' where user_id = u_free and provider = 'google';
  select p.plano into plano from perfis p where p.id = u_free; r := r || '2 expira rebaixa=' || plano || E'\n';
  -- 3) pending não rebaixa nem promove
  update subscriptions set status = 'pending' where user_id = u_free and provider = 'google';
  select p.plano into plano from perfis p where p.id = u_free; r := r || '3 pending=' || plano || E'\n';
  -- 4) Pro da Apple nunca é rebaixado por linha google
  insert into subscriptions(user_id, provider, provider_subscription_id, plan_id, status, current_period_end)
    values (u_apple, 'google', 'T9', 'pro_monthly', 'active', now() + interval '30 days');
  update subscriptions set status = 'expired', current_period_end = now() - interval '1 day' where user_id = u_apple and provider = 'google';
  select p.plano into plano from perfis p where p.id = u_apple; r := r || '4 apple segue=' || plano || E'\n';
  perform set_config('app.r', r, true);
end $$;
select current_setting('app.r');
rollback;

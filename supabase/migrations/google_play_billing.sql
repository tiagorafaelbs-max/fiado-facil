-- PARA REVISÃO — NÃO APLICAR sem ordem do Tiago. Ordem de publicação: 1) esta migration, 2) funções
-- google-play-verify e google-play-rtdn, 3) OTA Android.
--
-- 1) subscriptions.status passa a aceitar 'pending' (compra do Google ainda sem pagamento confirmado).
--    'pending' não concede acesso: active_subscriptions só considera 'active' e 'grace_period'.
-- 2) Trava no trigger sync_perfil_plano. Hoje ele recalcula perfis.plano a CADA escrita em subscriptions e
--    rebaixa para 'gratuito' quem não tem linha ativa -- inclusive o Pro da Apple (que não grava em
--    subscriptions) e o Pro manual. Passa a rebaixar SOMENTE quando uma assinatura rastreada deixa de
--    conceder acesso (OLD ativa/em carência -> NEW sem acesso, ou linha ativa apagada), e nunca quem tem
--    vínculo Apple (a apple-server-notifications cuida dele). Promover continua igual (linha ativa -> 'pro').
begin;
set local lock_timeout = '5s';

alter table public.subscriptions drop constraint subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status = any (array['active','cancelled','expired','paused','grace_period','pending']));

create or replace function public.sync_perfil_plano()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := coalesce(new.user_id, old.user_id);
  tem_ativa boolean;
  perdeu_acesso boolean := false;
  tem_apple boolean;
begin
  select exists (select 1 from public.active_subscriptions where user_id = uid) into tem_ativa;

  if tem_ativa then
    update public.perfis set plano = 'pro' where id = uid;
    return coalesce(new, old);
  end if;

  -- Sem linha ativa. Só rebaixa quando ESTA escrita tirou o acesso de uma assinatura que o tinha.
  if tg_op = 'UPDATE' then
    perdeu_acesso := old.status in ('active', 'grace_period') and new.status not in ('active', 'grace_period');
    -- Também perde o acesso quem estava ativo e teve o fim do período antecipado para o passado.
    if not perdeu_acesso and old.status in ('active', 'grace_period') and new.status in ('active', 'grace_period') then
      perdeu_acesso := true;  -- continua "ativa" mas a view não a enxerga (período vencido)
    end if;
  elsif tg_op = 'DELETE' then
    perdeu_acesso := old.status in ('active', 'grace_period');
  end if;

  if perdeu_acesso then
    select (apple_original_transaction_id is not null) into tem_apple from public.perfis where id = uid;
    if coalesce(tem_apple, false) = false then
      update public.perfis set plano = 'gratuito' where id = uid;
    end if;
  end if;

  return coalesce(new, old);
end;
$function$;

commit;

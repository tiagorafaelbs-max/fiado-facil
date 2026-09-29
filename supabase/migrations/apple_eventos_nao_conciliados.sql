-- Log de eventos da apple-server-notifications que não bateram com nenhum perfil
-- (nem por apple_original_transaction_id, nem por appAccountToken) -- fica aqui pro
-- Tiago conciliar manualmente em vez de simplesmente sumir num console.warn.
create table if not exists public.apple_eventos_nao_conciliados (
  id uuid primary key default gen_random_uuid(),
  original_transaction_id text,
  notification_type text,
  subtype text,
  app_account_token text,
  criado_em timestamptz not null default now()
);

alter table public.apple_eventos_nao_conciliados enable row level security;
-- Só a service role (usada pela edge function) grava/lê aqui -- nenhuma policy pra
-- authenticated/anon, então RLS ativado sem policies já bloqueia tudo que não for
-- service role.

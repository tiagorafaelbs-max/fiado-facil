-- PARA REVISÃO — NÃO APLICADA. Só aplicar com ordem do Tiago (pedido do Growth, 20/10/2026).
-- Acesso diário: 1 linha por conta por dia (dia = dia de São Paulo), gravada ao abrir o app.
-- Objetivo: retenção D1/D7/D30 reais e dias ativos por loja (hoje só existe o "último acesso", desde 06/10).
-- Dono e funcionário gravam o PRÓPRIO acesso (usuario_id = auth.uid()); a loja se obtém pela ligação conta → dono (equipe).
-- O dia é do SERVIDOR (default): o app não escolhe a data. Sem dado pessoal além do id da conta; some com a conta (cascade).
-- Sem begin/commit: apply_migration já é transacional.

create table if not exists public.acessos_diarios (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  dia        date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  plataforma text not null check (plataforma in ('ios', 'android')),
  primary key (usuario_id, dia)
);
comment on table public.acessos_diarios is '1 linha por conta por dia (São Paulo) ao abrir o app. Base de D1/D7/D30 e dias ativos.';
create index if not exists acessos_diarios_dia on public.acessos_diarios (dia);

alter table public.acessos_diarios enable row level security;

drop policy if exists acessos_diarios_insert_proprio on public.acessos_diarios;
create policy acessos_diarios_insert_proprio on public.acessos_diarios
  for insert to authenticated with check (usuario_id = auth.uid());

drop policy if exists acessos_diarios_select_proprio on public.acessos_diarios;
create policy acessos_diarios_select_proprio on public.acessos_diarios
  for select to authenticated using (usuario_id = auth.uid());

revoke all on public.acessos_diarios from public, anon, authenticated;
-- INSERT só das colunas que o app envia (o dia nunca vem do app); SELECT só do próprio.
grant insert (usuario_id, plataforma) on public.acessos_diarios to authenticated;
grant select on public.acessos_diarios to authenticated;

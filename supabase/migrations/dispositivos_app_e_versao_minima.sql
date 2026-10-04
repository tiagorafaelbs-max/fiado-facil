-- Plataforma/versão de cada usuário + versão mínima recomendada do app
--
-- 1) dispositivos_app: um registro por (usuario_id, plataforma) com plataforma, versão, build,
--    runtimeVersion, ID do update OTA, canal e datas de acesso. Dono e funcionário gravam o PRÓPRIO
--    registro (usuario_id = auth.uid()). Nada de identificação do aparelho (sem IMEI, sem ID de
--    publicidade, sem modelo/OS): só o necessário para separar iOS × Android e achar quem está em
--    versão antiga (LGPD: dado técnico de suporte, apagado junto com a conta por ON DELETE CASCADE).
-- 2) config_app: configurações globais lidas pelo app (por ora "versao_minima_recomendada").
--    Só leitura para usuários logados; quem altera é o painel/service_role.
--
-- Só cria tabelas novas: não altera dados nem tabelas existentes. App antigo não as usa.
-- Reversão: ver bloco no fim do arquivo.

-- ── 1) dispositivos_app ─────────────────────────────────────────────────────────────────
create table if not exists public.dispositivos_app (
  id                 uuid primary key default gen_random_uuid(),
  usuario_id         uuid not null references auth.users(id) on delete cascade,
  plataforma         text not null check (plataforma in ('ios', 'android')),
  versao_app         text check (char_length(versao_app) <= 32),
  build              text check (char_length(build) <= 32),
  runtime_version    text check (char_length(runtime_version) <= 64),
  update_id          text check (char_length(update_id) <= 64),
  canal              text check (char_length(canal) <= 32),
  primeiro_acesso_em timestamptz not null default now(),
  ultimo_acesso_em   timestamptz not null default now(),
  constraint dispositivos_app_usuario_plataforma_key unique (usuario_id, plataforma)
);

alter table public.dispositivos_app enable row level security;

-- Cada usuário só vê/escreve o próprio registro. Sem DELETE (some com a conta, por cascade).
drop policy if exists dispositivos_app_select_proprio on public.dispositivos_app;
create policy dispositivos_app_select_proprio on public.dispositivos_app
  for select to authenticated using (usuario_id = auth.uid());

drop policy if exists dispositivos_app_insert_proprio on public.dispositivos_app;
create policy dispositivos_app_insert_proprio on public.dispositivos_app
  for insert to authenticated with check (usuario_id = auth.uid());

drop policy if exists dispositivos_app_update_proprio on public.dispositivos_app;
create policy dispositivos_app_update_proprio on public.dispositivos_app
  for update to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

revoke all on public.dispositivos_app from public, anon, authenticated;
grant select, insert, update on public.dispositivos_app to authenticated;

-- As datas são do servidor (o app não decide "último acesso"); o primeiro acesso nunca muda.
create or replace function public.dispositivos_app_datas()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.primeiro_acesso_em := now();
    new.ultimo_acesso_em := now();
  else
    new.primeiro_acesso_em := old.primeiro_acesso_em;
    new.ultimo_acesso_em := now();
  end if;
  return new;
end;
$$;

revoke all on function public.dispositivos_app_datas() from public, anon, authenticated;

drop trigger if exists trg_dispositivos_app_datas on public.dispositivos_app;
create trigger trg_dispositivos_app_datas
  before insert or update on public.dispositivos_app
  for each row execute function public.dispositivos_app_datas();

-- ── 2) config_app ───────────────────────────────────────────────────────────────────────
create table if not exists public.config_app (
  chave         text primary key,
  valor         text not null,
  atualizado_em timestamptz not null default now()
);

alter table public.config_app enable row level security;

drop policy if exists config_app_leitura on public.config_app;
create policy config_app_leitura on public.config_app
  for select to authenticated using (true);

revoke all on public.config_app from public, anon, authenticated;
grant select on public.config_app to authenticated;

-- 1.0.12 = a versão que está nas lojas agora: ninguém vê o aviso hoje. Para avisar de uma versão
-- futura, basta atualizar o valor (ex.: update public.config_app set valor = '1.0.13', atualizado_em = now()
-- where chave = 'versao_minima_recomendada';).
insert into public.config_app (chave, valor)
values ('versao_minima_recomendada', '1.0.12')
on conflict (chave) do nothing;

-- ── Consultas úteis para suporte (rodar no painel; NÃO fazem parte da migration) ──────────
-- Usuários por plataforma e versão:
--   select plataforma, versao_app, build, count(*) from public.dispositivos_app group by 1,2,3 order by 1,2,3;
-- Ativos nos últimos 14 dias SEM registro (provável 1.0.11 ou anterior, que não grava nada):
--   select p.id, p.nome_negocio from public.perfis p
--   where exists (select 1 from public.vendas v where v.usuario_id = p.id and v.criado_em > now() - interval '14 days')
--     and not exists (select 1 from public.dispositivos_app d where d.usuario_id = p.id);

-- ── Reversão (não faz parte da migration) ──────────────────────────────────────────────
-- drop table if exists public.config_app;
-- drop table if exists public.dispositivos_app;
-- drop function if exists public.dispositivos_app_datas();

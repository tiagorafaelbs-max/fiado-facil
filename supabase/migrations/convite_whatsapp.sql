-- PARA REVISÃO — NÃO APLICADA. Aplicar só com autorização do Tiago (22/10/2026).
-- Convite de funcionário pelo WhatsApp (6 de 9 convites travavam: o link do e-mail era aberto fora do celular e gastava o convite).
-- 1) convites_link: o link do WhatsApp é só um id opaco que aponta para (dono, funcionário). O token de acesso NÃO é guardado: o Auth
--    vence o token em ~1 h, então ele é gerado na hora em que o funcionário ABRE o link (função abrir-convite). Nunca em log nem no funil.
-- 2) membro_tem_senha(uuid): só o service_role (edge function) pergunta se o funcionário já criou a senha.
-- 3) equipe_status(): o DONO vê, para os próprios funcionários, quem já criou a senha (status Ativo x Aguardando).
-- 4) Funil anônimo: etapas convite_whatsapp e convite_reenviado (sem dado pessoal).
-- Sem begin/commit: apply_migration já é transacional.

-- ── 1) convites_link ──
create table if not exists public.convites_link (
  id         uuid primary key default gen_random_uuid(),
  dono_id    uuid not null references auth.users(id) on delete cascade,
  membro_id  uuid not null references auth.users(id) on delete cascade,
  tipo       text not null check (tipo in ('link', 'email')),
  aberturas  integer not null default 0,
  criado_em  timestamptz not null default now()
);
comment on table public.convites_link is 'Convites de funcionário: link do WhatsApp (tipo link, aberturas = quantas vezes foi aberto) ou registro de reenvio por e-mail (tipo email). Sem token. Só a service_role lê e escreve.';
create index if not exists convites_link_membro on public.convites_link (membro_id, criado_em);
alter table public.convites_link enable row level security;
revoke all on public.convites_link from public, anon, authenticated;   -- sem policy: ninguém do app lê o token

-- ── 2) membro_tem_senha: uso interno da edge function ──
create or replace function public.membro_tem_senha(p_membro uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select coalesce(u.encrypted_password, '') <> '' from auth.users u where u.id = p_membro), false)
$$;
revoke all on function public.membro_tem_senha(uuid) from public, anon, authenticated;
grant execute on function public.membro_tem_senha(uuid) to service_role;

-- ── 3) equipe_status: o dono vê o status dos PRÓPRIOS funcionários ──
create or replace function public.equipe_status()
returns table (membro_id uuid, tem_senha boolean)
language sql stable security definer set search_path = ''
as $$
  select m.membro_id, coalesce(u.encrypted_password, '') <> ''
  from public.membros_equipe m
  join auth.users u on u.id = m.membro_id
  where m.dono_id = auth.uid()
$$;
revoke all on function public.equipe_status() from public, anon;
grant execute on function public.equipe_status() to authenticated;

-- ── 4) Funil ──
alter table public.instalacoes_app drop constraint instalacoes_app_etapa_check;
alter table public.instalacoes_app add constraint instalacoes_app_etapa_check
  check (etapa in ('abriu','cadastro','conta','entrou',
                   'limite','planos','compra','compra_cancelou','compra_erro','compra_ok','compra_pendente','loja_erro',
                   'contatos_erro',
                   'avaliar_card','avaliar_toque',
                   'cadastro_toque','cadastro_erro',
                   'cadastro_ja_existe','cadastro_ir_login',
                   'cobrar_vence_hoje',
                   'itens_cadastrou','venda_com_item',
                   'convite_whatsapp','convite_reenviado'));

-- ROLLBACK:
--   drop function public.equipe_status(); drop function public.membro_tem_senha(uuid); drop table public.convites_link;
--   (e recriar instalacoes_app_etapa_check sem as 2 etapas novas)

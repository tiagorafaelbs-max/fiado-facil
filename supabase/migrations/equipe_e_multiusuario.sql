-- Equipe & Funcionários: permite que o dono da conta convide funcionários com
-- login próprio (email/senha), operando sob o MESMO negócio (mesmo usuario_id
-- nas tabelas de dados), sem migrar nenhuma linha existente.
--
-- Conceito: `usuario_id` continua sendo o dono/tenant em clientes/vendas/pagamentos.
-- `auth.uid()` passa a poder ser o dono OU um funcionário. A função
-- `tenant_id_atual()` resolve qual tenant usar em cada policy.

create table if not exists public.membros_equipe (
  id uuid primary key default gen_random_uuid(),
  dono_id uuid not null references auth.users(id) on delete cascade,
  membro_id uuid not null references auth.users(id) on delete cascade unique,
  nome text not null,
  status text not null default 'ativo' check (status in ('ativo', 'desativado')),
  permissoes jsonb not null default '{"excluir_venda": false, "editar_venda": true}'::jsonb,
  criado_em timestamptz not null default now()
);

alter table public.membros_equipe enable row level security;

-- Só o dono gerencia sua própria equipe.
create policy membros_equipe_dono on public.membros_equipe
  for all using (dono_id = auth.uid())
  with check (dono_id = auth.uid());

-- O próprio funcionário pode ler a própria linha (pra saber seu nome/permissões).
create policy membros_equipe_proprio on public.membros_equipe
  for select using (membro_id = auth.uid());

create or replace function public.tenant_id_atual()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select dono_id from public.membros_equipe where membro_id = auth.uid() and status = 'ativo'),
    auth.uid()
  );
$$;

-- Funcionário precisa LER o perfil do dono (nome do negócio, chave Pix, plano,
-- módulos) para as telas funcionarem — mas nunca escrever nele. A policy
-- `perfil_proprio` (ALL, auth.uid() = id) continua sendo a única forma de
-- editar, então o funcionário fica automaticamente restrito a leitura.
create policy perfis_leitura_equipe on public.perfis
  for select using (id = public.tenant_id_atual());

-- Colunas de autoria — quem de fato registrou, independente de quem é o dono.
alter table public.vendas add column if not exists criado_por uuid references auth.users(id);
alter table public.pagamentos add column if not exists criado_por uuid references auth.users(id);
update public.vendas set criado_por = usuario_id where criado_por is null;
update public.pagamentos set criado_por = usuario_id where criado_por is null;

-- Troca as policies de clientes/vendas/pagamentos para usar o tenant resolvido,
-- adicionando WITH CHECK (as policies antigas não tinham nenhum).
drop policy if exists clientes_proprio on public.clientes;
drop policy if exists usuarios_veeem_proprios_clientes on public.clientes;
create policy clientes_tenant on public.clientes
  for all using (usuario_id = public.tenant_id_atual())
  with check (usuario_id = public.tenant_id_atual());

drop policy if exists vendas_proprio on public.vendas;
drop policy if exists usuarios_veeem_proprias_vendas on public.vendas;
create policy vendas_tenant on public.vendas
  for all using (usuario_id = public.tenant_id_atual())
  with check (usuario_id = public.tenant_id_atual());

drop policy if exists pagamentos_proprio on public.pagamentos;
drop policy if exists usuarios_veeem_proprios_pagamentos on public.pagamentos;
create policy pagamentos_tenant on public.pagamentos
  for all using (usuario_id = public.tenant_id_atual())
  with check (usuario_id = public.tenant_id_atual());

-- Aplica as permissões granulares (excluir/editar venda) no banco, não só na UI —
-- um funcionário sem a permissão não consegue nem via chamada direta à API.
create or replace function public.checar_permissao_venda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo_usuario_id uuid := coalesce(new.usuario_id, old.usuario_id);
  perms jsonb;
begin
  if auth.uid() = alvo_usuario_id then
    return coalesce(new, old);
  end if;

  select permissoes into perms
  from public.membros_equipe
  where membro_id = auth.uid() and status = 'ativo';

  if TG_OP = 'DELETE' and not coalesce((perms->>'excluir_venda')::boolean, false) then
    raise exception 'Sem permissão para excluir vendas';
  end if;

  if TG_OP = 'UPDATE' and not coalesce((perms->>'editar_venda')::boolean, false) then
    raise exception 'Sem permissão para editar vendas';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists checar_permissao_venda_trigger on public.vendas;
create trigger checar_permissao_venda_trigger
  before update or delete on public.vendas
  for each row execute function public.checar_permissao_venda();

-- ============================================================
-- Fiado Fácil — Schema do Banco de Dados
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- Extensão para UUID
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABELA: perfis (estende auth.users)
-- ============================================================
create table public.perfis (
  id           uuid primary key references auth.users(id) on delete cascade,
  nome_negocio text not null,
  telefone     text,
  plano        text not null default 'gratuito' check (plano in ('gratuito', 'pro')),
  criado_em    timestamptz not null default now()
);

-- Cria perfil automaticamente ao registrar usuário
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome_negocio)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome_negocio', 'Meu Negócio'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- TABELA: clientes
-- ============================================================
create table public.clientes (
  id          uuid primary key default uuid_generate_v4(),
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  nome        text not null check (char_length(nome) >= 2),
  telefone    text,
  cpf         text,
  empresa     text,
  endereco    text,
  observacao  text,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

create index idx_clientes_usuario on public.clientes(usuario_id);
create index idx_clientes_ativo on public.clientes(ativo);

-- ============================================================
-- TABELA: vendas
-- ============================================================
create table public.vendas (
  id               uuid primary key default uuid_generate_v4(),
  usuario_id       uuid not null references auth.users(id) on delete cascade,
  cliente_id       uuid not null references public.clientes(id) on delete cascade,
  descricao        text not null check (char_length(descricao) >= 1),
  valor            numeric(10, 2) not null check (valor > 0),
  data_venda       date not null default current_date,
  data_vencimento  date,
  categoria        text not null default 'Outro',
  pago             boolean not null default false,
  criado_em        timestamptz not null default now()
);

create index idx_vendas_cliente on public.vendas(cliente_id);
create index idx_vendas_usuario on public.vendas(usuario_id);
create index idx_vendas_pago on public.vendas(pago);

-- ============================================================
-- TABELA: pagamentos
-- ============================================================
create table public.pagamentos (
  id               uuid primary key default uuid_generate_v4(),
  usuario_id       uuid not null references auth.users(id) on delete cascade,
  cliente_id       uuid not null references public.clientes(id) on delete cascade,
  venda_id         uuid references public.vendas(id) on delete set null,
  valor            numeric(10, 2) not null check (valor > 0),
  data_pagamento   date not null default current_date,
  observacao       text,
  criado_em        timestamptz not null default now()
);

create index idx_pagamentos_cliente on public.pagamentos(cliente_id);
create index idx_pagamentos_usuario on public.pagamentos(usuario_id);

-- ============================================================
-- VIEW: clientes_com_saldo (saldo e status calculados)
-- ============================================================
create or replace view public.clientes_com_saldo as
select
  c.*,
  coalesce(v.total_vendido, 0) - coalesce(p.total_pago, 0) as saldo_devedor,
  v.ultima_compra,
  case
    when coalesce(v.total_vendido, 0) - coalesce(p.total_pago, 0) <= 0 then 'em_dia'
    when exists (
      select 1 from public.vendas
      where cliente_id = c.id
        and pago = false
        and data_vencimento < current_date
    ) then 'vencido'
    when exists (
      select 1 from public.vendas
      where cliente_id = c.id
        and pago = false
        and data_vencimento between current_date and current_date + interval '3 days'
    ) then 'atencao'
    else 'em_dia'
  end as status_pagamento
from public.clientes c
left join (
  select cliente_id, sum(valor) as total_vendido, max(data_venda) as ultima_compra
  from public.vendas
  group by cliente_id
) v on v.cliente_id = c.id
left join (
  select cliente_id, sum(valor) as total_pago
  from public.pagamentos
  group by cliente_id
) p on p.cliente_id = c.id;

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — isolamento por usuário
-- ============================================================

alter table public.perfis    enable row level security;
alter table public.clientes  enable row level security;
alter table public.vendas    enable row level security;
alter table public.pagamentos enable row level security;

-- Perfis: apenas o próprio usuário
create policy "perfil_proprio" on public.perfis
  for all using (auth.uid() = id);

-- Clientes: apenas do usuário autenticado
create policy "clientes_proprio" on public.clientes
  for all using (auth.uid() = usuario_id);

-- Vendas: apenas do usuário autenticado
create policy "vendas_proprio" on public.vendas
  for all using (auth.uid() = usuario_id);

-- Pagamentos: apenas do usuário autenticado
create policy "pagamentos_proprio" on public.pagamentos
  for all using (auth.uid() = usuario_id);

-- ============================================================
-- LIMITE DO PLANO GRATUITO: máximo 10 clientes
-- ============================================================
create or replace function public.verificar_limite_clientes()
returns trigger language plpgsql security definer as $$
declare
  total_clientes integer;
  plano_usuario  text;
begin
  select plano into plano_usuario from public.perfis where id = new.usuario_id;
  if plano_usuario = 'gratuito' then
    select count(*) into total_clientes
    from public.clientes
    where usuario_id = new.usuario_id and ativo = true;
    if total_clientes >= 10 then
      raise exception 'Limite de 10 clientes atingido no plano gratuito. Faça upgrade para o plano Pro.';
    end if;
  end if;
  return new;
end;
$$;

create trigger check_limite_clientes
  before insert on public.clientes
  for each row execute function public.verificar_limite_clientes();

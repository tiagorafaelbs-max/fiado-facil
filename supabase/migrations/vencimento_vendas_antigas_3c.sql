-- 3c — vendas ANTIGAS sem data de vencimento: contagem, definição em massa (só o dono, com
-- confirmação explícita na tela) e desfazer. PARA REVISÃO: NÃO APLICADA.
--
-- Decisões do Tiago (03/10): base = data_venda + 30 dias; funcionário NÃO vê/usa isto;
-- auditoria + desfazer; "Agora não" esconde o aviso por 7 dias (isso é só do app, não do banco).
--
-- Escopo mínimo: só vendas do próprio dono (usuario_id = auth.uid()), pago = false e
-- data_vencimento IS NULL. Nunca altera outra coluna. Não mexe em pagamentos nem na flag pago.
-- A ordem FIFO NÃO muda (o vencimento efetivo já era data_venda + 30 para essas vendas).
--
-- Efeito de produto que a tela precisa mostrar ANTES de confirmar: vendas com mais de 30 dias
-- passam a ter data real já vencida, e a view marca o cliente como 'vencido' (aparecem em
-- Cobranças/Vencidos e nos lembretes). Simulação de 03/10 (se TODOS os donos confirmassem):
-- 1.031 vendas / 716 clientes / 69 donos; 261 vendas já nascem vencidas; clientes 'vencido'
-- 211 -> 448 (+237). Cada dono decide por conta própria.

-- Auditoria (permite desfazer). Só o dono lê; escrita só pelas funções abaixo.
create table if not exists public.vendas_vencimento_backfill (
  id                  bigint generated always as identity primary key,
  usuario_id          uuid        not null references auth.users(id) on delete cascade,   -- dono (LGPD: some junto com a conta)
  venda_id            uuid        not null references public.vendas(id) on delete cascade,
  base                text        not null default 'data_venda_mais_30',
  vencimento_definido date        not null,
  executado_por       uuid        not null default auth.uid(),
  executado_em        timestamptz not null default now(),
  desfeito_em         timestamptz
);
create index if not exists vendas_vencimento_backfill_dono_idx on public.vendas_vencimento_backfill (usuario_id, executado_em desc);
alter table public.vendas_vencimento_backfill enable row level security;
revoke all on public.vendas_vencimento_backfill from anon, authenticated;
grant select on public.vendas_vencimento_backfill to authenticated;
drop policy if exists vendas_vencimento_backfill_dono_le on public.vendas_vencimento_backfill;
create policy vendas_vencimento_backfill_dono_le on public.vendas_vencimento_backfill
  for select to authenticated using (usuario_id = auth.uid());

-- 1) Contagem (somente leitura) para o aviso e para a tela de confirmação. Sem valores em R$.
create or replace function public.contar_vendas_sem_vencimento()
returns table (total integer, ja_vencidas integer, a_vencer integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() <> public.tenant_id_atual() then
    raise exception 'Somente o dono da conta pode ver isto';
  end if;
  return query
    select count(*)::integer,
           (count(*) filter (where v.data_venda + 30 < current_date))::integer,
           (count(*) filter (where v.data_venda + 30 >= current_date))::integer
    from public.vendas v
    where v.usuario_id = auth.uid() and v.pago = false and v.data_vencimento is null
      and v.data_venda + 30 < date '2101-01-01'
      and exists (select 1 from public.clientes c where c.id = v.cliente_id and c.usuario_id = auth.uid());
end;
$$;

-- 2) Definir (uma transação só; idempotente: rodar de novo não encontra mais nada).
create or replace function public.definir_vencimento_vendas_antigas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qtd integer;
begin
  if auth.uid() is null or auth.uid() <> public.tenant_id_atual() then
    raise exception 'Somente o dono da conta pode definir os vencimentos';
  end if;
  set local lock_timeout = '5s';   -- se travar com a reconciliação do app, falha rápido e o app tenta de novo

  with upd as (
    update public.vendas v
       set data_vencimento = v.data_venda + 30
     where v.usuario_id = auth.uid()
       and v.pago = false
       and v.data_vencimento is null
       and v.data_venda + 30 < date '2101-01-01'      -- respeita vendas_datas_plausiveis (ano <= 2100)
       and exists (select 1 from public.clientes c where c.id = v.cliente_id and c.usuario_id = auth.uid())  -- ignora venda ligada a cliente de outro dono (5 órfãs hoje)
    returning v.id, v.data_vencimento
  ), log as (
    insert into public.vendas_vencimento_backfill (usuario_id, venda_id, vencimento_definido)
    select auth.uid(), id, data_vencimento from upd
    returning 1
  )
  select count(*)::integer into v_qtd from upd;

  return v_qtd;
end;
$$;

-- 3) Desfazer (até 30 dias; só vendas que NÃO foram editadas depois — a data ainda é a definida).
create or replace function public.desfazer_vencimento_vendas_antigas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qtd integer;
begin
  if auth.uid() is null or auth.uid() <> public.tenant_id_atual() then
    raise exception 'Somente o dono da conta pode desfazer';
  end if;
  set local lock_timeout = '5s';

  with rev as (
    update public.vendas v
       set data_vencimento = null
      from public.vendas_vencimento_backfill b
     where b.venda_id = v.id
       and b.usuario_id = auth.uid()
       and v.usuario_id = auth.uid()
       and b.desfeito_em is null
       and b.executado_em > now() - interval '30 days'
       and v.data_vencimento = b.vencimento_definido
    returning b.id
  ), marca as (
    update public.vendas_vencimento_backfill b
       set desfeito_em = now()
      from rev where b.id = rev.id
    returning 1
  )
  select count(*)::integer into v_qtd from rev;

  return v_qtd;
end;
$$;

revoke all on function public.contar_vendas_sem_vencimento() from public, anon;
revoke all on function public.definir_vencimento_vendas_antigas() from public, anon;
revoke all on function public.desfazer_vencimento_vendas_antigas() from public, anon;
grant execute on function public.contar_vendas_sem_vencimento() to authenticated;
grant execute on function public.definir_vencimento_vendas_antigas() to authenticated;
grant execute on function public.desfazer_vencimento_vendas_antigas() to authenticated;

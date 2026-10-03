-- 3c — vendas ANTIGAS sem data de vencimento: contagem com impacto, definição em massa (só o
-- dono, com confirmação explícita na tela) e desfazer. PARA REVISÃO: NÃO APLICADA.
--
-- Decisões do Tiago (03/10): base = data_venda + 30 dias; funcionário NÃO vê/usa isto;
-- auditoria + desfazer (botão acessível por 7 dias); "Agora não" esconde o aviso por 7 dias
-- (isso é só do app, não do banco).
--
-- Escopo mínimo: só vendas do próprio dono (usuario_id = auth.uid()) ligadas a cliente do próprio
-- dono, pago = false e data_vencimento IS NULL. Nunca altera outra coluna. Não mexe em
-- pagamentos nem na flag pago. A ordem FIFO NÃO muda (o vencimento efetivo já era
-- data_venda + 30 para essas vendas).
--
-- CORTE (achado do Fiscal): só vendas criadas ANTES de 03/10/2026 09:49 UTC (publicação da OTA do
-- vencimento padrão, android 09:49:17Z / ios 09:52:58Z). Depois dela, `data_vencimento IS NULL` também
-- significa "o lojista escolheu Sem vencimento" (chip explícito) e isso NÃO pode ser sobrescrito.
-- Conservador: vendas sem data criadas depois do corte (escolha deliberada OU aparelho ainda sem a OTA)
-- ficam de fora. O MESMO corte vale em contar e definir (constante repetida nos dois lugares).
--
-- Efeito de produto que a tela mostra ANTES de confirmar (contar_vendas_sem_vencimento):
-- vendas com mais de 30 dias passam a ter data real já vencida e a view marca o cliente como
-- 'vencido' (aparecem em Cobranças/Vencidos e nos lembretes). Simulação de 03/10 somando todas
-- as lojas: 1.031 vendas / 716 clientes / 69 donos; clientes 'vencido' 211 -> 448 (+237) e
-- 'atencao' 88 -> 152. Cada dono vê os NÚMEROS DA PRÓPRIA LOJA e decide.

-- Auditoria (permite desfazer). Só o dono lê; escrita só pelas funções abaixo.
-- FK com cascade: a exclusão de conta (delete-account só apaga o usuário) não deixa linhas órfãs.
create table if not exists public.vendas_vencimento_backfill (
  id                  bigint generated always as identity primary key,
  usuario_id          uuid        not null references auth.users(id) on delete cascade,   -- dono
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

-- 1) Contagem + impacto (SOMENTE LEITURA) para o aviso e para a tela de confirmação. Sem R$.
--    novos_vencidos = clientes que HOJE não aparecem como 'vencido' e passariam a aparecer (mesma
--    regra da view clientes_com_saldo, com as datas preenchidas). desfazivel = vendas que ainda
--    podem ser desfeitas (últimos 7 dias, data ainda igual à definida).
create or replace function public.contar_vendas_sem_vencimento()
returns table (
  total integer, ja_vencidas integer, a_vencer integer,
  clientes_afetados integer, novos_vencidos integer,
  desfazivel integer, ultima_execucao timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or v_uid <> public.tenant_id_atual() then
    raise exception 'Somente o dono da conta pode ver isto';
  end if;

  return query
  with meus as (
    select c.id as cliente_id from public.clientes c where c.usuario_id = v_uid and c.ativo
  ),
  alvo as (
    select v.id, v.cliente_id, (v.data_venda + 30) as venc_h
    from public.vendas v join meus m on m.cliente_id = v.cliente_id
    where v.usuario_id = v_uid and v.pago = false and v.data_vencimento is null
      and v.criado_em < timestamptz '2026-10-03 09:49:00+00'   -- CORTE: antes da OTA do vencimento padrão
      and v.data_venda + 30 < date '2101-01-01'
  ),
  pg as (
    select p.cliente_id, sum(p.valor) as tp
    from public.pagamentos p join meus m on m.cliente_id = p.cliente_id
    group by p.cliente_id
  ),
  base as (
    select v.cliente_id, v.valor, v.data_vencimento,
      case when a.id is not null then a.venc_h else v.data_vencimento end as venc_h,
      sum(v.valor) over (
        partition by v.cliente_id
        order by coalesce(v.data_vencimento::timestamp, v.data_venda + interval '30 days'), v.data_venda, v.id
        rows between unbounded preceding and current row
      ) as acum
    from public.vendas v
    join meus m on m.cliente_id = v.cliente_id
    left join alvo a on a.id = v.id
  ),
  cli as (
    select b.cliente_id,
      sum(b.valor) - coalesce(max(pg.tp), 0) as saldo,
      bool_or(b.data_vencimento is not null and b.data_vencimento < current_date and b.acum > coalesce(pg.tp, 0)) as venc_hoje,
      bool_or(b.venc_h is not null and b.venc_h < current_date and b.acum > coalesce(pg.tp, 0)) as venc_depois
    from base b left join pg on pg.cliente_id = b.cliente_id
    group by b.cliente_id
  ),
  desf as (
    select count(*)::integer as n, max(b.executado_em) as ultima
    from public.vendas_vencimento_backfill b
    join public.vendas v on v.id = b.venda_id
    where b.usuario_id = v_uid and b.desfeito_em is null
      and b.executado_em > now() - interval '7 days'
      and v.data_vencimento = b.vencimento_definido
  )
  select
    (select count(*) from alvo)::integer,
    (select count(*) from alvo where venc_h < current_date)::integer,
    (select count(*) from alvo where venc_h >= current_date)::integer,
    (select count(distinct cliente_id) from alvo)::integer,
    (select count(*) from cli where saldo > 0 and venc_depois and not venc_hoje)::integer,
    (select n from desf),
    (select ultima from desf);
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
       and v.criado_em < timestamptz '2026-10-03 09:49:00+00'   -- CORTE: antes da OTA do vencimento padrão (mesmo de contar)
       and v.data_venda + 30 < date '2101-01-01'      -- respeita vendas_datas_plausiveis (ano <= 2100)
       and exists (select 1 from public.clientes c where c.id = v.cliente_id and c.usuario_id = auth.uid() and c.ativo)  -- cliente do dono (e ativo, como contar)
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

-- 3) Desfazer (até 7 dias; só vendas que NÃO foram editadas depois — a data ainda é a definida).
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
       and b.executado_em > now() - interval '7 days'
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

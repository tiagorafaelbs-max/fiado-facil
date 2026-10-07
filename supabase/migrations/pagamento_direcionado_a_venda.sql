-- Pagar uma venda específica (pedido de cliente revendedora): pagamento DIRECIONADO
--
-- Hoje todo pagamento quita pela ordem FIFO (vencimento efetivo, depois data da venda, depois id). A coluna
-- pagamentos.venda_id JÁ EXISTE (FK -> vendas, ON DELETE SET NULL) e nenhum pagamento a usa ainda (0 de 976).
-- Esta migration faz o banco RESPEITAR o direcionamento:
--   * um pagamento com venda_id quita PRIMEIRO essa venda (até o valor dela);
--   * a SOBRA do pagamento direcionado (valor acima do que falta na venda) e os pagamentos sem venda_id seguem
--     o FIFO normal, sobre as vendas que ainda têm resto;
--   * se o valor direcionado for menor que a venda, ela fica parcialmente paga (vendas.pago = false; o resto
--     continua entrando no FIFO como qualquer outra dívida).
-- Sem nenhum venda_id preenchido o resultado é IDÊNTICO ao de hoje (conferido em simulação sobre os dados reais).
-- O saldo do cliente (vendido - pago) não muda: pagamento direcionado é só um pagamento com destino.
--
-- O que muda:
--   1) trigger valida_pagamento_venda: o venda_id tem que ser venda do MESMO cliente e do MESMO negócio
--      (hoje a RLS de pagamentos não confere isso);
--   2) índice parcial em pagamentos(venda_id);
--   3) reconciliar_pago_cliente(): nova alocação (direcionado primeiro, FIFO no resto);
--   4) view clientes_com_saldo: status vencido/atencao pela mesma alocação (colunas e ordem idênticas);
--   5) contar_vendas_sem_vencimento(): a estimativa do aviso das vendas antigas usa a mesma alocação.
-- Não altera nenhuma linha (vendas.pago só muda quando o app chamar a reconciliação com algum pagamento direcionado).
-- Reversão: ver bloco no fim do arquivo.

set local lock_timeout = '5s';

-- ── 1) o venda_id precisa ser do mesmo cliente e do mesmo negócio ───────────────────────────────
create or replace function public.valida_pagamento_venda()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.venda_id is not null
     and not exists (
       select 1 from public.vendas v
       where v.id = new.venda_id and v.cliente_id = new.cliente_id and v.usuario_id = new.usuario_id
     )
  then
    raise exception 'A venda escolhida não pertence a este cliente.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.valida_pagamento_venda() from public, anon, authenticated;

drop trigger if exists trg_valida_pagamento_venda on public.pagamentos;
create trigger trg_valida_pagamento_venda
  before insert or update of venda_id, cliente_id, usuario_id on public.pagamentos
  for each row execute function public.valida_pagamento_venda();

-- ── 2) índice (também acelera o ON DELETE SET NULL quando uma venda é apagada) ───────────────────
create index if not exists idx_pagamentos_venda on public.pagamentos (venda_id) where venda_id is not null;

-- ── 3) reconciliação do flag vendas.pago: direcionado primeiro, FIFO no resto ───────────────────
create or replace function public.reconciliar_pago_cliente(p_cliente_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tenant uuid;
  v_dono_cliente uuid;
begin
  v_tenant := public.tenant_id_atual();

  select usuario_id into v_dono_cliente
  from public.clientes
  where id = p_cliente_id;

  if v_dono_cliente is null or v_dono_cliente <> v_tenant then
    raise exception 'Cliente não encontrado ou não pertence ao seu negócio';
  end if;

  with dirigido as (
    select venda_id, sum(valor) as total
    from public.pagamentos
    where cliente_id = p_cliente_id and usuario_id = v_tenant and venda_id is not null
    group by venda_id
  ),
  base as (
    select
      v.id, v.valor, v.data_vencimento, v.data_venda,
      least(coalesce(d.total, 0), v.valor) as dirigido_aplicado,
      v.valor - least(coalesce(d.total, 0), v.valor) as resto
    from public.vendas v
    left join dirigido d on d.venda_id = v.id
    where v.cliente_id = p_cliente_id and v.usuario_id = v_tenant
  ),
  pool as (
    -- dinheiro "solto": tudo que foi pago menos o que já quitou a venda escolhida (a sobra do direcionado entra aqui)
    select coalesce((select sum(valor) from public.pagamentos where cliente_id = p_cliente_id and usuario_id = v_tenant), 0)
           - coalesce((select sum(dirigido_aplicado) from base), 0) as total
  ),
  alloc as (
    select
      b.id, b.resto, b.dirigido_aplicado,
      sum(b.resto) over (
        order by coalesce(b.data_vencimento::timestamp, b.data_venda + interval '30 days'), b.data_venda, b.id
        rows between unbounded preceding and current row
      ) as acumulado
    from base b
  )
  update public.vendas v
  set pago = ((a.resto = 0 and a.dirigido_aplicado > 0) or a.acumulado <= (select total from pool))
  from alloc a
  where v.id = a.id
    and v.pago is distinct from ((a.resto = 0 and a.dirigido_aplicado > 0) or a.acumulado <= (select total from pool));
end;
$$;

-- ── 4) view clientes_com_saldo: status pela mesma alocação ──────────────────────────────────────
create or replace view public.clientes_com_saldo as
 with pg as (
         select pagamentos.cliente_id,
            sum(pagamentos.valor) as total_pago
           from pagamentos
          group by pagamentos.cliente_id
        ), vd as (
         select vendas.cliente_id,
            sum(vendas.valor) as total_vendido,
            max(vendas.data_venda) as ultima_compra
           from vendas
          group by vendas.cliente_id
        ), dirigido as (
         select pagamentos.venda_id,
            sum(pagamentos.valor) as total
           from pagamentos
          where pagamentos.venda_id is not null
          group by pagamentos.venda_id
        ), base as (
         select v.id,
            v.cliente_id,
            v.data_vencimento,
            v.data_venda,
            least(coalesce(d.total, 0::numeric), v.valor) as dirigido_aplicado,
            v.valor - least(coalesce(d.total, 0::numeric), v.valor) as resto
           from vendas v
             left join dirigido d on d.venda_id = v.id
        ), alloc as (
         select b.cliente_id,
            b.data_vencimento,
            b.resto,
            b.dirigido_aplicado,
            sum(b.resto) over (partition by b.cliente_id order by (coalesce(b.data_vencimento::timestamp without time zone, b.data_venda + '30 days'::interval)), b.data_venda, b.id rows between unbounded preceding and current row) as acumulado
           from base b
        ), dirtot as (
         select b.cliente_id,
            sum(b.dirigido_aplicado) as total
           from base b
          group by b.cliente_id
        ), pool as (
         select pg.cliente_id,
            pg.total_pago - coalesce(dt.total, 0::numeric) as solto
           from pg
             left join dirtot dt on dt.cliente_id = pg.cliente_id
        )
 select c.id,
    c.usuario_id,
    c.nome,
    c.telefone,
    c.cpf,
    c.empresa,
    c.endereco,
    c.observacao,
    c.limite_credito,
    c.ativo,
    c.criado_em,
    coalesce(vd.total_vendido, 0::numeric) - coalesce(pg.total_pago, 0::numeric) as saldo_devedor,
    vd.ultima_compra,
        case
            when (coalesce(vd.total_vendido, 0::numeric) - coalesce(pg.total_pago, 0::numeric)) <= 0::numeric then 'em_dia'::text
            when (exists ( select 1
               from alloc a
              where a.cliente_id = c.id and a.data_vencimento is not null and a.data_vencimento < current_date
                and not ((a.resto = 0::numeric and a.dirigido_aplicado > 0::numeric) or a.acumulado <= coalesce(pool.solto, 0::numeric)))) then 'vencido'::text
            when (exists ( select 1
               from alloc a
              where a.cliente_id = c.id and a.data_vencimento is not null and a.data_vencimento >= current_date and a.data_vencimento <= (current_date + '3 days'::interval)
                and not ((a.resto = 0::numeric and a.dirigido_aplicado > 0::numeric) or a.acumulado <= coalesce(pool.solto, 0::numeric)))) then 'atencao'::text
            else 'devendo'::text
        end as status_pagamento
   from clientes c
     left join vd on vd.cliente_id = c.id
     left join pg on pg.cliente_id = c.id
     left join pool on pool.cliente_id = c.id;

-- CREATE OR REPLACE VIEW zera as opções da view: repete security_invoker (a RLS de vendas/pagamentos vale para quem consulta).
alter view public.clientes_com_saldo set (security_invoker = true);

-- ── 5) estimativa do aviso das vendas antigas (mesma alocação) ──────────────────────────────────
create or replace function public.contar_vendas_sem_vencimento()
returns table(total integer, ja_vencidas integer, a_vencer integer, clientes_afetados integer, novos_vencidos integer, desfazivel integer, ultima_execucao timestamp with time zone)
language plpgsql
security definer
set search_path to 'public'
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
      and v.criado_em < timestamptz '2026-10-03 09:49:00+00'
      and v.data_venda + 30 < date '2101-01-01'
  ),
  pg as (
    select p.cliente_id, sum(p.valor) as tp
    from public.pagamentos p join meus m on m.cliente_id = p.cliente_id
    group by p.cliente_id
  ),
  dirigido as (
    select p.venda_id, sum(p.valor) as total
    from public.pagamentos p join meus m on m.cliente_id = p.cliente_id
    where p.venda_id is not null
    group by p.venda_id
  ),
  base as (
    select v.cliente_id, v.valor, v.data_vencimento,
      case when a.id is not null then a.venc_h else v.data_vencimento end as venc_h,
      least(coalesce(d.total, 0), v.valor) as dirigido_aplicado,
      v.valor - least(coalesce(d.total, 0), v.valor) as resto,
      sum(v.valor - least(coalesce(d.total, 0), v.valor)) over (
        partition by v.cliente_id
        order by coalesce(v.data_vencimento::timestamp, v.data_venda + interval '30 days'), v.data_venda, v.id
        rows between unbounded preceding and current row
      ) as acum
    from public.vendas v
    join meus m on m.cliente_id = v.cliente_id
    left join alvo a on a.id = v.id
    left join dirigido d on d.venda_id = v.id
  ),
  solto as (
    select b.cliente_id, coalesce(max(pg.tp), 0) - sum(b.dirigido_aplicado) as s
    from base b left join pg on pg.cliente_id = b.cliente_id
    group by b.cliente_id
  ),
  cli as (
    select b.cliente_id,
      sum(b.valor) - coalesce(pg.tp, 0) as saldo,
      bool_or(b.data_vencimento is not null and b.data_vencimento < current_date
              and not ((b.resto = 0 and b.dirigido_aplicado > 0) or b.acum <= coalesce(s.s, 0))) as venc_hoje,
      bool_or(b.venc_h is not null and b.venc_h < current_date
              and not ((b.resto = 0 and b.dirigido_aplicado > 0) or b.acum <= coalesce(s.s, 0))) as venc_depois
    from base b
      left join pg on pg.cliente_id = b.cliente_id
      left join solto s on s.cliente_id = b.cliente_id
    group by b.cliente_id, pg.tp, s.s
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

-- ── Reversão (não faz parte da migration) ──────────────────────────────────────────────
-- drop trigger if exists trg_valida_pagamento_venda on public.pagamentos;
-- drop function if exists public.valida_pagamento_venda();
-- drop index if exists public.idx_pagamentos_venda;
-- (recriar reconciliar_pago_cliente, clientes_com_saldo (+ alter view ... set (security_invoker = true)) e
--  contar_vendas_sem_vencimento com as versões anteriores: reconciliar_pago_cliente_rpc.sql,
--  fifo_ordem_vencimento_efetivo.sql e vencimento_vendas_antigas_3c.sql)

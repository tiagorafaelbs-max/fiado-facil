-- BACKFILL (DML) da flag vendas.pago com a ordem FIFO nova -- NÃO é migration automática.
-- Rodar SÓ: (1) depois de aplicar supabase/migrations/fifo_ordem_vencimento_efetivo.sql,
--           (2) com autorização explícita do Tiago, (3) logo em seguida (para a flag acompanhar a view).
-- Antes, rodar o DRYRUN (backfill_pago_fifo_vencimento_efetivo_DRYRUN.sql) e conferir a contagem.
-- Executar como postgres/service_role (a RPC reconciliar_pago_cliente exige contexto de tenant,
-- então não serve para um lote geral). Replica a semântica da RPC: vendas e pagamentos do
-- tenant dono do cliente; ordem coalesce(vencimento, venda + 30 dias), data_venda, id.
-- Só altera vendas.pago (e SÓ onde o valor muda); grava cada alteração em vendas_pago_backfill_log
-- para poder desfazer. Idempotente: rodar de novo não encontra mais nada.
begin;
set local lock_timeout = '5s';

create table if not exists public.vendas_pago_backfill_log (
  id            bigint generated always as identity primary key,
  venda_id      uuid        not null,
  cliente_id    uuid        not null,
  pago_antes    boolean     not null,
  pago_depois   boolean     not null,
  motivo        text        not null default 'fifo_ordem_vencimento_efetivo',
  executado_em  timestamptz not null default now()
);
alter table public.vendas_pago_backfill_log enable row level security;  -- sem policy: só postgres/service_role
revoke all on public.vendas_pago_backfill_log from anon, authenticated;

with dono as (select id as cliente_id, usuario_id from public.clientes),
pg as (
  select p.cliente_id, sum(p.valor) as total_pago
  from public.pagamentos p join dono d on d.cliente_id = p.cliente_id and d.usuario_id = p.usuario_id
  group by p.cliente_id
),
alloc as (
  select v.id, v.cliente_id, v.pago,
    sum(v.valor) over (partition by v.cliente_id
      order by coalesce(v.data_vencimento::timestamp, v.data_venda + interval '30 days'), v.data_venda, v.id
      rows between unbounded preceding and current row) as acumulado
  from public.vendas v join dono d on d.cliente_id = v.cliente_id and d.usuario_id = v.usuario_id
),
mudou as (
  select a.id, a.cliente_id, a.pago as pago_antes, (a.acumulado <= coalesce(p.total_pago, 0)) as pago_depois
  from alloc a left join pg p on p.cliente_id = a.cliente_id
  where a.pago is distinct from (a.acumulado <= coalesce(p.total_pago, 0))
),
log as (
  insert into public.vendas_pago_backfill_log (venda_id, cliente_id, pago_antes, pago_depois)
  select id, cliente_id, pago_antes, pago_depois from mudou
  returning venda_id
)
update public.vendas v set pago = m.pago_depois from mudou m where v.id = m.id;

-- Conferência: deve bater com o DRYRUN (hoje: 36 vendas).
select count(*) as vendas_alteradas, count(distinct cliente_id) as clientes from public.vendas_pago_backfill_log
where executado_em > now() - interval '5 minutes';
commit;

-- DESFAZER (se necessário; só reverte linhas ainda no valor gravado pelo backfill).
-- Só faz sentido JUNTO com a reversão da migration (ordem antiga): uma reconciliação legítima posterior
-- (ex.: pagamento novo) pode ter levado a venda ao mesmo valor, e o desfazer a devolveria à flag da ordem antiga.
-- Rode em horário de pouco uso, logo depois da migration; se houver deadlock com a reconciliação do app,
-- a transação volta inteira e basta rodar de novo.
-- update public.vendas v set pago = l.pago_antes
--   from public.vendas_pago_backfill_log l
--  where l.venda_id = v.id and l.motivo = 'fifo_ordem_vencimento_efetivo' and v.pago = l.pago_depois;

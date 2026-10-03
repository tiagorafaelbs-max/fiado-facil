-- DRY RUN (SOMENTE LEITURA) do backfill da flag vendas.pago com a ordem FIFO nova.
-- Replica EXATAMENTE a semântica da RPC reconciliar_pago_cliente: vendas e pagamentos
-- filtrados por usuario_id = dono do cliente (tenant), ordem coalesce(vencimento, venda+30d), venda, id.
-- Mostra quantas linhas o script de DML (backfill_pago_fifo_vencimento_efetivo.sql) alteraria.
with dono as (select id as cliente_id, usuario_id from public.clientes),
pg as (
  select p.cliente_id, sum(p.valor) as total_pago
  from public.pagamentos p join dono d on d.cliente_id = p.cliente_id and d.usuario_id = p.usuario_id
  group by p.cliente_id
),
alloc as (
  select v.id, v.cliente_id, v.valor, v.pago,
    sum(v.valor) over (partition by v.cliente_id
      order by coalesce(v.data_vencimento::timestamp, v.data_venda + interval '30 days'), v.data_venda, v.id
      rows between unbounded preceding and current row) as acumulado
  from public.vendas v join dono d on d.cliente_id = v.cliente_id and d.usuario_id = v.usuario_id
),
novo as (
  select a.id, a.cliente_id, a.valor, a.pago as pago_antes,
         (a.acumulado <= coalesce(p.total_pago, 0)) as pago_depois
  from alloc a left join pg p on p.cliente_id = a.cliente_id
),
mudou as (select * from novo where pago_antes is distinct from pago_depois)
select 'vendas_que_mudariam' as metrica, count(*)::text as valor from mudou
union all select '  true_para_false (passam a EM ABERTO)', count(*)::text from mudou where pago_antes and not pago_depois
union all select '  false_para_true (passam a PAGAS)', count(*)::text from mudou where not pago_antes and pago_depois
union all select 'clientes_afetados', count(distinct cliente_id)::text from mudou
union all select 'R$ que passam de pago para em aberto', coalesce(round(sum(valor) filter (where pago_antes and not pago_depois), 2), 0)::text from mudou
union all select 'R$ que passam de em aberto para pago', coalesce(round(sum(valor) filter (where not pago_antes and pago_depois), 2), 0)::text from mudou;

-- SIMULAÇÃO SOMENTE LEITURA (nenhum UPDATE/DELETE/INSERT) -- ordem FIFO nova x atual.
-- Ordem atual (view clientes_com_saldo e RPC reconciliar_pago_cliente):
--     order by data_vencimento (NULLS LAST), data_venda, id
-- Ordem nova (migration fifo_ordem_vencimento_efetivo.sql):
--     order by coalesce(data_vencimento, data_venda + 30 dias), data_venda, id
--
-- Mede dois efeitos de trocar a ordem:
--   (1) flag vendas.pago: quantas vendas mudariam de pago=false/true se a reconciliação
--       rodasse com a nova ordem (comparado com a ordem atual aplicada aos mesmos dados);
--   (2) status_pagamento mostrado na view (em_dia/devendo/atencao/vencido) -- a view
--       passa a usar a nova ordem assim que a migration é aplicada, ANTES de qualquer
--       reconciliação, então a mudança de status é imediata.
-- Não devolve nome nem telefone de cliente (só prefixos de uuid e contagens).

with pg as (
  select cliente_id, sum(valor) as total_pago from public.pagamentos group by cliente_id
),
base as (
  select v.id, v.cliente_id, v.usuario_id, v.valor, v.pago, v.data_venda, v.data_vencimento,
    sum(v.valor) over (partition by v.cliente_id
      order by v.data_vencimento, v.data_venda, v.id
      rows between unbounded preceding and current row) as acum_atual,
    sum(v.valor) over (partition by v.cliente_id
      order by coalesce(v.data_vencimento::timestamp, v.data_venda + interval '30 days'), v.data_venda, v.id
      rows between unbounded preceding and current row) as acum_novo
  from public.vendas v
),
cmp as (
  select b.*, coalesce(pg.total_pago, 0) as tp,
    (b.acum_atual <= coalesce(pg.total_pago, 0)) as pago_atual_calc,
    (b.acum_novo  <= coalesce(pg.total_pago, 0)) as pago_novo
  from base b left join pg on pg.cliente_id = b.cliente_id
),
-- clientes que têm pelo menos uma venda sem vencimento
cli_sem_venc as (
  select distinct cliente_id from public.vendas where data_vencimento is null
),
-- status da view com cada ordem (mesma regra da view: vencido > atencao > devendo; saldo<=0 = em_dia)
status as (
  select c.cliente_id,
    max(c.tp) as tp,
    coalesce(sum(c.valor), 0) - max(c.tp) as saldo,
    bool_or(c.data_vencimento is not null and c.data_vencimento < current_date and c.acum_atual > c.tp) as venc_atual,
    bool_or(c.data_vencimento is not null and c.data_vencimento >= current_date and c.data_vencimento <= current_date + 3 and c.acum_atual > c.tp) as aten_atual,
    bool_or(c.data_vencimento is not null and c.data_vencimento < current_date and c.acum_novo > c.tp) as venc_novo,
    bool_or(c.data_vencimento is not null and c.data_vencimento >= current_date and c.data_vencimento <= current_date + 3 and c.acum_novo > c.tp) as aten_novo
  from cmp c group by c.cliente_id
),
status_txt as (
  select cliente_id, saldo,
    case when saldo <= 0 then 'em_dia' when venc_atual then 'vencido' when aten_atual then 'atencao' else 'devendo' end as st_atual,
    case when saldo <= 0 then 'em_dia' when venc_novo  then 'vencido' when aten_novo  then 'atencao' else 'devendo' end as st_novo
  from status
)
-- RESUMO GLOBAL
select 'vendas_total' as metrica, count(*)::text as valor from cmp
union all select 'vendas_sem_vencimento', count(*)::text from cmp where data_vencimento is null
union all select 'clientes_com_venda_sem_vencimento', count(*)::text from cli_sem_venc
union all select 'flag_pago_gravada_diferente_do_calculo_atual (flags desatualizadas hoje)', count(*)::text from cmp where pago is distinct from pago_atual_calc
union all select 'MUDARIAM_pago_so_pela_nova_ordem (calc atual x calc novo)', count(*)::text from cmp where pago_atual_calc <> pago_novo
union all select '  de_pago=true_para_false', count(*)::text from cmp where pago_atual_calc = true and pago_novo = false
union all select '  de_pago=false_para_true', count(*)::text from cmp where pago_atual_calc = false and pago_novo = true
union all select 'MUDARIAM_pago_vs_flag_gravada_hoje (efeito total ao reconciliar)', count(*)::text from cmp where pago is distinct from pago_novo
union all select 'clientes_com_alguma_venda_que_muda_pago', count(distinct cliente_id)::text from cmp where pago_atual_calc <> pago_novo
union all select 'clientes_COM_venda_sem_venc_e_alguma_venda_que_muda', count(distinct c.cliente_id)::text from cmp c join cli_sem_venc s on s.cliente_id = c.cliente_id where c.pago_atual_calc <> c.pago_novo
union all select 'clientes_com_STATUS_diferente_na_view', count(*)::text from status_txt where st_atual <> st_novo
union all select '  status_vencido_vira_outro', count(*)::text from status_txt where st_atual = 'vencido' and st_novo <> 'vencido'
union all select '  status_outro_vira_vencido', count(*)::text from status_txt where st_atual <> 'vencido' and st_novo = 'vencido'
union all select '  outras_mudancas_de_status (atencao/devendo)', count(*)::text from status_txt where st_atual <> st_novo and st_atual <> 'vencido' and st_novo <> 'vencido';

-- ==========================================================================
-- BLOCO 2 (rodar SEPARADO, completo): amostra de 20 clientes com venda sem vencimento
-- (determinística por md5) + TODOS os clientes afetados. Só leitura.
-- ==========================================================================
with pg as (select cliente_id, sum(valor) as total_pago from public.pagamentos group by cliente_id),
base as (
  select v.id, v.cliente_id, v.valor, v.pago, v.data_venda, v.data_vencimento,
    sum(v.valor) over (partition by v.cliente_id order by v.data_vencimento, v.data_venda, v.id rows between unbounded preceding and current row) as acum_atual,
    sum(v.valor) over (partition by v.cliente_id order by coalesce(v.data_vencimento::timestamp, v.data_venda + interval '30 days'), v.data_venda, v.id rows between unbounded preceding and current row) as acum_novo
  from public.vendas v
),
cmp as (select b.*, coalesce(pg.total_pago,0) as tp, (b.acum_atual <= coalesce(pg.total_pago,0)) as pa, (b.acum_novo <= coalesce(pg.total_pago,0)) as pn from base b left join pg on pg.cliente_id=b.cliente_id),
cli as (
  select c.cliente_id, count(*) as vendas, count(*) filter (where c.data_vencimento is null) as sem_venc,
    count(*) filter (where c.pa <> c.pn) as mudariam_pago, count(*) filter (where c.pa and not c.pn) as true_para_false,
    count(*) filter (where not c.pa and c.pn) as false_para_true,
    round(coalesce(sum(c.valor) filter (where c.pa and not c.pn), 0), 2) as rs_vira_em_aberto,
    round(coalesce(sum(c.valor) filter (where not c.pa and c.pn), 0), 2) as rs_vira_pago
  from cmp c group by c.cliente_id having count(*) filter (where c.data_vencimento is null) > 0
)
select 'amostra20' as grupo, left(cliente_id::text, 8) as cliente, vendas, sem_venc, mudariam_pago, true_para_false, false_para_true, rs_vira_em_aberto, rs_vira_pago
from (select * from cli order by md5(cliente_id::text) limit 20) a
union all
select 'afetados', left(cliente_id::text, 8), vendas, sem_venc, mudariam_pago, true_para_false, false_para_true, rs_vira_em_aberto, rs_vira_pago
from cli where mudariam_pago > 0
order by 1, mudariam_pago desc, 2;

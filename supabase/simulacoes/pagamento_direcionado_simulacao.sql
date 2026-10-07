-- Simulação (SOMENTE LEITURA) da migration pagamento_direcionado_a_venda.sql sobre os dados reais.
-- Nada aqui altera dados nem objetos do banco.

-- S1) Sem nenhum pagamento direcionado (hoje: 0 de 976), a nova alocação dá o MESMO flag pago da atual?
--     Esperado: diferentes = 0.
with atual as (
  select v.id, v.cliente_id,
    sum(v.valor) over (partition by v.cliente_id
      order by coalesce(v.data_vencimento::timestamp, v.data_venda + interval '30 days'), v.data_venda, v.id
      rows between unbounded preceding and current row) as acum
  from public.vendas v
),
tp as (select cliente_id, sum(valor) as tp from public.pagamentos group by cliente_id),
flag_atual as (select a.id, (a.acum <= coalesce(tp.tp, 0)) as pago from atual a left join tp on tp.cliente_id = a.cliente_id),
dirigido as (select venda_id, sum(valor) as total from public.pagamentos where venda_id is not null group by venda_id),
base as (
  select v.id, v.cliente_id, v.data_vencimento, v.data_venda,
    least(coalesce(d.total, 0), v.valor) as dirigido_aplicado,
    v.valor - least(coalesce(d.total, 0), v.valor) as resto
  from public.vendas v left join dirigido d on d.venda_id = v.id
),
dirtot as (select cliente_id, sum(dirigido_aplicado) as total from base group by cliente_id),
solto as (select tp.cliente_id, tp.tp - coalesce(dt.total, 0) as s from tp left join dirtot dt on dt.cliente_id = tp.cliente_id),
alloc as (
  select b.id, b.cliente_id, b.resto, b.dirigido_aplicado,
    sum(b.resto) over (partition by b.cliente_id
      order by coalesce(b.data_vencimento::timestamp, b.data_venda + interval '30 days'), b.data_venda, b.id
      rows between unbounded preceding and current row) as acumulado
  from base b
),
flag_novo as (
  select a.id, ((a.resto = 0 and a.dirigido_aplicado > 0) or a.acumulado <= coalesce(s.s, 0)) as pago
  from alloc a left join solto s on s.cliente_id = a.cliente_id
)
select count(*) as vendas,
       count(*) filter (where fa.pago is distinct from fn.pago) as diferentes_atual_vs_novo,
       (select count(*) from public.pagamentos where venda_id is not null) as pagamentos_direcionados_hoje
from flag_atual fa join flag_novo fn using (id);

-- S2) A nova definição da view dá o mesmo status_pagamento e o mesmo saldo da view de hoje? Esperado: diferentes = 0.
--     (substituir o bloco "novo" pelo SELECT da view da migration; o script do relatório faz isso)

-- S3) Cenário hipotético (nada é gravado): cliente com 3+ vendas em aberto; a cliente diz "me pagou ESTA venda".
--     Compara onde o dinheiro cai hoje (FIFO) com o direcionamento.
with alvo as (
  select cliente_id from public.vendas group by cliente_id
  having count(*) filter (where not pago) >= 3
  order by count(*) filter (where not pago) desc, cliente_id limit 1
),
ord as (
  select v.id, v.valor, v.data_vencimento, v.data_venda, v.pago,
    row_number() over (order by coalesce(v.data_vencimento::timestamp, v.data_venda + interval '30 days'), v.data_venda, v.id) as rn
  from public.vendas v join alvo a on a.cliente_id = v.cliente_id
),
tp as (select coalesce(sum(valor), 0) as t from public.pagamentos where cliente_id = (select cliente_id from alvo)),
escolhida as (select id, valor from ord where not pago order by rn desc limit 1),
calc as (
  select o.rn, o.valor, o.data_vencimento, o.pago as pago_hoje,
    (e.id = o.id) as e_a_escolhida,
    sum(o.valor) over (order by o.rn) as acum_fifo,
    sum(o.valor - case when e.id = o.id then e.valor else 0 end) over (order by o.rn) as acum_resto,
    (o.valor - case when e.id = o.id then e.valor else 0 end) as resto
  from ord o cross join escolhida e
)
select c.rn, c.valor, c.data_vencimento, c.pago_hoje, c.e_a_escolhida,
  (c.acum_fifo <= (select t from tp) + (select valor from escolhida)) as pago_se_pagamento_solto,
  ((c.resto = 0 and c.e_a_escolhida) or c.acum_resto <= (select t from tp)) as pago_se_direcionado
from calc c order by c.rn;

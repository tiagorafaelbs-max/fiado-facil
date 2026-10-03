-- FIFO: ordem de quitação pelo VENCIMENTO EFETIVO.
--
-- Problema: a view clientes_com_saldo e a RPC reconciliar_pago_cliente ordenavam por
--     data_vencimento ASC (NULL por último), data_venda, id
-- então, com o vencimento padrão nas vendas novas, uma venda nova COM data era quitada
-- ANTES de uma venda antiga SEM data do mesmo cliente (a nova aparece paga, a antiga em aberto).
--
-- Nova ordem, nos dois lugares:
--     coalesce(data_vencimento, data_venda + 30 dias), data_venda, id
--
-- NÃO altera dados (nenhum UPDATE/INSERT/DELETE em tabelas): só create or replace da view
-- e da função. A flag vendas.pago só muda quando a reconciliação rodar de novo para o
-- cliente (próximo lançamento/pagamento dele) -- já com a ordem nova.
--
-- ATENÇÃO (efeito imediato, medido na simulação supabase/simulacoes/fifo_ordem_vencimento_efetivo_simulacao.sql):
-- a VIEW passa a usar a nova ordem assim que esta migration roda, antes de qualquer
-- reconciliação, então status_pagamento de alguns clientes muda na hora (na simulação de
-- 03/10: 2 clientes passam a 'vencido'; nenhum deixa de ser vencido).
--
-- A regra de "vencido"/"atencao" da view NÃO mudou: continua exigindo data_vencimento NOT NULL
-- (venda sem vencimento nunca vira vencida sozinha; isso é o item 3c, que preenche as antigas).
--
-- IMPORTANTE: logo depois desta migration, rodar o backfill da flag pago
-- (supabase/scripts_dados/backfill_pago_fifo_vencimento_efetivo.sql, com autorização separada):
-- sem ele, a view já muda o status e a flag vendas.pago só acompanha na próxima reconciliação de cada
-- cliente, e telas que leem `pago` (Cobranças, ranking, lembretes, painel) ficam incoerentes até lá.
--
-- Reversão: re-aplicar as definições anteriores (ver fix_datas_plausiveis_e_view_saldo_fifo.sql
-- e reconciliar_pago_cliente_rpc.sql) -- só a cláusula ORDER BY muda.

set local lock_timeout = '5s';  -- CREATE OR REPLACE VIEW pede lock exclusivo na view: não enfileirar leituras atrás de consulta longa

-- 1) View. security_invoker é OBRIGATÓRIO repetir: CREATE OR REPLACE VIEW sem WITH zera as opções
--    da view (hoje: {security_invoker=true}); as permissões (GRANT) são preservadas.
create or replace view public.clientes_com_saldo
with (security_invoker = true)
as
 WITH pg AS (
         SELECT pagamentos.cliente_id,
            sum(pagamentos.valor) AS total_pago
           FROM pagamentos
          GROUP BY pagamentos.cliente_id
        ), vd AS (
         SELECT vendas.cliente_id,
            sum(vendas.valor) AS total_vendido,
            max(vendas.data_venda) AS ultima_compra
           FROM vendas
          GROUP BY vendas.cliente_id
        ), alloc AS (
         SELECT v.cliente_id,
            v.data_vencimento,
            v.valor,
            sum(v.valor) OVER (
              PARTITION BY v.cliente_id
              ORDER BY COALESCE(v.data_vencimento::timestamp, v.data_venda + interval '30 days'), v.data_venda, v.id
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) AS acumulado
           FROM vendas v
        )
 SELECT c.id,
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
    COALESCE(vd.total_vendido, 0::numeric) - COALESCE(pg.total_pago, 0::numeric) AS saldo_devedor,
    vd.ultima_compra,
        CASE
            WHEN (COALESCE(vd.total_vendido, 0::numeric) - COALESCE(pg.total_pago, 0::numeric)) <= 0::numeric THEN 'em_dia'::text
            WHEN (EXISTS ( SELECT 1
               FROM alloc a
              WHERE a.cliente_id = c.id AND a.data_vencimento IS NOT NULL AND a.data_vencimento < CURRENT_DATE AND a.acumulado > COALESCE(pg.total_pago, 0::numeric))) THEN 'vencido'::text
            WHEN (EXISTS ( SELECT 1
               FROM alloc a
              WHERE a.cliente_id = c.id AND a.data_vencimento IS NOT NULL AND a.data_vencimento >= CURRENT_DATE AND a.data_vencimento <= (CURRENT_DATE + '3 days'::interval) AND a.acumulado > COALESCE(pg.total_pago, 0::numeric))) THEN 'atencao'::text
            ELSE 'devendo'::text
        END AS status_pagamento
   FROM clientes c
     LEFT JOIN vd ON vd.cliente_id = c.id
     LEFT JOIN pg ON pg.cliente_id = c.id;

-- 2) RPC (mesma assinatura, SECURITY DEFINER e search_path preservados; só o ORDER BY muda).
create or replace function public.reconciliar_pago_cliente(p_cliente_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
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

  with pagos as (
    select coalesce(sum(valor), 0) as total_pago
    from public.pagamentos
    where cliente_id = p_cliente_id and usuario_id = v_tenant
  ),
  alloc as (
    select
      v.id,
      sum(v.valor) over (
        order by coalesce(v.data_vencimento::timestamp, v.data_venda + interval '30 days'), v.data_venda, v.id
        rows between unbounded preceding and current row
      ) as acumulado
    from public.vendas v
    where v.cliente_id = p_cliente_id and v.usuario_id = v_tenant
  )
  update public.vendas v
  set pago = (a.acumulado <= (select total_pago from pagos))
  from alloc a
  where v.id = a.id
    and v.pago is distinct from (a.acumulado <= (select total_pago from pagos));
end;
$function$;

-- Permissões como estão hoje (postgres, authenticated, service_role): reafirma sem abrir para anon/public.
revoke all on function public.reconciliar_pago_cliente(uuid) from public, anon;
grant execute on function public.reconciliar_pago_cliente(uuid) to authenticated;

-- Aplicada em produção em 2026-09-09 via MCP.
-- Reconcilia retroativamente a flag vendas.pago com a alocação FIFO dos
-- pagamentos (mesma ordem da view clientes_com_saldo). Fecha vendas já cobertas;
-- reabre vendas que não estão mais cobertas. Idempotente.
-- Equivale à rotina reconciliarPagoCliente() em hooks/useVendas.ts, aplicada a
-- todos os clientes de uma vez. Substitui a antiga fix_vendas_pago_flag.sql.
WITH pg AS (
  SELECT cliente_id, SUM(valor) AS total_pago FROM public.pagamentos GROUP BY cliente_id
),
alloc AS (
  SELECT
    v.id, v.cliente_id, v.pago,
    SUM(v.valor) OVER (
      PARTITION BY v.cliente_id
      ORDER BY v.data_vencimento ASC NULLS LAST, v.data_venda ASC, v.id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS acum
  FROM public.vendas v
),
alvo AS (
  SELECT a.id, (a.acum <= COALESCE(pg.total_pago, 0)) AS deveria_estar_pago
  FROM alloc a LEFT JOIN pg ON pg.cliente_id = a.cliente_id
)
UPDATE public.vendas v
SET pago = alvo.deveria_estar_pago
FROM alvo
WHERE alvo.id = v.id
  AND v.pago IS DISTINCT FROM alvo.deveria_estar_pago;

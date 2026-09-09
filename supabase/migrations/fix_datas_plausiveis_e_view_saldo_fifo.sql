-- Aplicada em produção em 2026-09-09 via MCP.
--
-- Contexto: usuária via banner "cliente com dívida vencida" mas nada estava
-- vencido. Causa: uma venda gravada com data_vencimento no ano 1026 (digitação
-- de "10/10/1026" no lugar de "10/10/2026"). Além disso a view calculava
-- saldo_devedor com dupla contagem de pagamentos.
--
-- 1) Correção pontual do dado (executada à parte):
--    UPDATE public.vendas SET data_vencimento = DATE '2026-10-10'
--    WHERE id = 'e2fd44e8-4373-4c4d-b1d2-e0ce5b2f4709';

-- 2) Barreira contra datas com ano implausível.
ALTER TABLE public.vendas
  ADD CONSTRAINT vendas_datas_plausiveis CHECK (
    (data_venda IS NULL OR EXTRACT(YEAR FROM data_venda) BETWEEN 2000 AND 2100)
    AND (data_vencimento IS NULL OR EXTRACT(YEAR FROM data_vencimento) BETWEEN 2000 AND 2100)
  );

-- 3) View de saldo/status corrigida:
--    - saldo_devedor considera TODAS as vendas (antes só pago=false), eliminando
--      a dupla contagem que zerava/negativava o saldo de quem realmente devia.
--    - status "vencido"/"atencao" decidido por alocação FIFO dos pagamentos por
--      ordem de vencimento, independente da flag `pago` (imune a flag
--      desatualizada por pagamento offline ou dados históricos).
CREATE OR REPLACE VIEW public.clientes_com_saldo AS
WITH pg AS (
  SELECT cliente_id, SUM(valor) AS total_pago
  FROM public.pagamentos
  GROUP BY cliente_id
),
vd AS (
  SELECT cliente_id, SUM(valor) AS total_vendido, MAX(data_venda) AS ultima_compra
  FROM public.vendas
  GROUP BY cliente_id
),
alloc AS (
  SELECT
    v.cliente_id,
    v.data_vencimento,
    v.valor,
    SUM(v.valor) OVER (
      PARTITION BY v.cliente_id
      ORDER BY v.data_vencimento ASC NULLS LAST, v.data_venda ASC, v.id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS acumulado
  FROM public.vendas v
)
SELECT
  c.id,
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
    WHEN COALESCE(vd.total_vendido, 0::numeric) - COALESCE(pg.total_pago, 0::numeric) <= 0::numeric
      THEN 'em_dia'
    WHEN EXISTS (
      SELECT 1 FROM alloc a
      WHERE a.cliente_id = c.id
        AND a.data_vencimento IS NOT NULL
        AND a.data_vencimento < CURRENT_DATE
        AND a.acumulado > COALESCE(pg.total_pago, 0::numeric)
    ) THEN 'vencido'
    WHEN EXISTS (
      SELECT 1 FROM alloc a
      WHERE a.cliente_id = c.id
        AND a.data_vencimento IS NOT NULL
        AND a.data_vencimento >= CURRENT_DATE
        AND a.data_vencimento <= CURRENT_DATE + INTERVAL '3 days'
        AND a.acumulado > COALESCE(pg.total_pago, 0::numeric)
    ) THEN 'atencao'
    ELSE 'devendo'
  END AS status_pagamento
FROM public.clientes c
LEFT JOIN vd ON vd.cliente_id = c.id
LEFT JOIN pg ON pg.cliente_id = c.id;

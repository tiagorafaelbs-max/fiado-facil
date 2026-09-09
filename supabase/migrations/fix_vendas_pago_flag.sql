-- Corrige retroativamente o flag pago=false em vendas cobertas por pagamentos.
-- FIFO por data_vencimento ASC, descontando vendas já fechadas (pago=true).

DO $$
DECLARE
  rec RECORD;
  saldo_disponivel NUMERIC;
  v RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT vd.usuario_id, vd.cliente_id
    FROM public.vendas vd
    WHERE vd.pago = false
      AND vd.data_vencimento IS NOT NULL
  LOOP
    -- Crédito = total pago − total já coberto por vendas pago=true
    -- (mesma lógica do código JS em useVendas.ts)
    SELECT
      COALESCE((
        SELECT SUM(pg.valor) FROM public.pagamentos pg
        WHERE pg.cliente_id = rec.cliente_id
          AND pg.usuario_id = rec.usuario_id
      ), 0)
      -
      COALESCE((
        SELECT SUM(vf.valor) FROM public.vendas vf
        WHERE vf.cliente_id = rec.cliente_id
          AND vf.usuario_id = rec.usuario_id
          AND vf.pago = true
      ), 0)
    INTO saldo_disponivel;

    IF saldo_disponivel <= 0 THEN
      CONTINUE;
    END IF;

    -- FIFO: fecha as vendas mais antigas enquanto o crédito cobrir
    FOR v IN
      SELECT id, valor
      FROM public.vendas
      WHERE cliente_id = rec.cliente_id
        AND usuario_id = rec.usuario_id
        AND pago = false
      ORDER BY
        data_vencimento ASC NULLS LAST,
        data_venda ASC
    LOOP
      IF saldo_disponivel >= v.valor THEN
        UPDATE public.vendas SET pago = true WHERE id = v.id;
        saldo_disponivel := saldo_disponivel - v.valor;
      ELSE
        EXIT;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

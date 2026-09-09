-- Adiciona colunas de contador WhatsApp à tabela perfis
ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS wpp_cobrado_mes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wpp_mes_ref     text    NOT NULL DEFAULT '';

-- Função atômica: incrementa contador com controle de limite e reset mensal
CREATE OR REPLACE FUNCTION public.incrementar_contador_wpp(p_usuario_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mes_atual  text    := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM');
  v_mes_ref  text;
  v_contador integer;
BEGIN
  SELECT wpp_mes_ref, wpp_cobrado_mes
  INTO   v_mes_ref, v_contador
  FROM   public.perfis
  WHERE  id = p_usuario_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('permitido', false, 'usado', 0);
  END IF;

  -- Reset se mudou o mês
  IF v_mes_ref IS DISTINCT FROM mes_atual THEN
    UPDATE public.perfis
    SET    wpp_cobrado_mes = 1, wpp_mes_ref = mes_atual
    WHERE  id = p_usuario_id;
    RETURN json_build_object('permitido', true, 'usado', 1);
  END IF;

  IF v_contador >= 10 THEN
    RETURN json_build_object('permitido', false, 'usado', v_contador);
  END IF;

  UPDATE public.perfis
  SET    wpp_cobrado_mes = wpp_cobrado_mes + 1
  WHERE  id = p_usuario_id;

  RETURN json_build_object('permitido', true, 'usado', v_contador + 1);
END;
$$;

-- Função de rollback: decrementa 1 uso (chamada quando Linking.openURL falha)
CREATE OR REPLACE FUNCTION public.reverter_contador_wpp(p_usuario_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.perfis
  SET    wpp_cobrado_mes = GREATEST(0, wpp_cobrado_mes - 1)
  WHERE  id = p_usuario_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.incrementar_contador_wpp(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverter_contador_wpp(uuid) TO authenticated;

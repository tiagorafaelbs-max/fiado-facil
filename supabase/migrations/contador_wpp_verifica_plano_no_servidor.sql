-- Aplicada em produção em 2026-09-11 via MCP.
--
-- O limite de 10 cobranças WhatsApp/mês do plano gratuito só era pulado
-- pelo app (hooks/useContadorWhatsApp.ts: `if (plano === 'pro') return true`,
-- sem nem chamar esta RPC). Um app adulterado (apk modificado) que ainda
-- chamasse a RPC diretamente não tinha nenhuma barreira no servidor.
-- Agora a própria função confere `plano` no banco e libera ilimitado só
-- para quem é 'pro' de verdade — não confia em nada vindo do cliente.
CREATE OR REPLACE FUNCTION public.incrementar_contador_wpp(p_usuario_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  mes_atual  text    := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM');
  v_mes_ref  text;
  v_contador integer;
  v_plano    text;
BEGIN
  SELECT plano, wpp_mes_ref, wpp_cobrado_mes
  INTO   v_plano, v_mes_ref, v_contador
  FROM   public.perfis
  WHERE  id = p_usuario_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('permitido', false, 'usado', 0);
  END IF;

  IF v_plano = 'pro' THEN
    RETURN json_build_object('permitido', true, 'usado', 0);
  END IF;

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
$function$;

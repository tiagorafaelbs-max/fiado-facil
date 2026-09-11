-- Aplicada em produção em 2026-09-11 via MCP.
--
-- CRÍTICO: a policy RLS "perfil_proprio" em perfis é
-- FOR ALL USING (auth.uid() = id) sem WITH CHECK — o Postgres usa o
-- USING também pra validar escritas, então ela só garante "é a minha
-- linha", não quais colunas podem mudar. Sem trava adicional, qualquer
-- usuário logado conseguia se promover a Pro de graça rodando
-- supabase.from('perfis').update({ plano: 'pro', modulos: {...} }).
--
-- Fix: só o service_role (usado pelas Edge Functions de pagamento —
-- mp-webhook, mercadopago-webhook, apple-iap-verify, revenuecat-webhook)
-- pode alterar perfis.plano. Qualquer tentativa vinda de authenticated/anon
-- é silenciosamente revertida para o valor anterior, e como isso acontece
-- ANTES da lógica de módulos no mesmo trigger, o bloqueio de módulos Pro
-- (score_cliente, relatorio_categoria, cobranca_automatica, equipe)
-- continua consistente mesmo se o cliente tentar setar os dois campos juntos.
CREATE OR REPLACE FUNCTION public.enforce_pro_modules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND auth.role() IS DISTINCT FROM 'service_role'
     AND NEW.plano IS DISTINCT FROM OLD.plano THEN
    NEW.plano := OLD.plano;
  END IF;

  IF NEW.plano = 'gratuito' THEN
    NEW.modulos = NEW.modulos
      || '{"cobranca_automatica": false}'::jsonb
      || '{"equipe": false}'::jsonb
      || '{"score_cliente": false}'::jsonb
      || '{"relatorio_categoria": false}'::jsonb;
  ELSIF NEW.plano = 'pro' AND (TG_OP = 'INSERT' OR OLD.plano = 'gratuito') THEN
    NEW.modulos = NEW.modulos
      || '{"cobranca_automatica": true}'::jsonb
      || '{"score_cliente": true}'::jsonb
      || '{"relatorio_categoria": true}'::jsonb;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pro_modules ON public.perfis;
CREATE TRIGGER trg_enforce_pro_modules
  BEFORE INSERT OR UPDATE ON public.perfis
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_pro_modules();

-- Hardening: search_path fixo (lint function_search_path_mutable)
ALTER FUNCTION public.set_subscriptions_updated_at() SET search_path = public;
ALTER FUNCTION public.sync_perfil_plano() SET search_path = public;
ALTER FUNCTION public.verificar_limite_clientes() SET search_path = public;

-- Hardening: revoga EXECUTE de funções que só devem rodar como trigger
-- interno (nunca via RPC direto de anon/authenticated). Os contadores de
-- WhatsApp continuam liberados para "authenticated" pois o app chama via
-- .rpc() (hooks/useContadorWhatsApp.ts); só tiramos de "anon".
REVOKE EXECUTE ON FUNCTION public.enforce_pro_modules() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_perfil_plano() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verificar_limite_clientes() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.incrementar_contador_wpp(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reverter_contador_wpp(uuid) FROM anon;

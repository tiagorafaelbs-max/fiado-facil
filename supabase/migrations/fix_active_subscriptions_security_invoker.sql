-- Fix: active_subscriptions view com SECURITY INVOKER
-- Garante que o RLS da tabela subscriptions seja aplicado mesmo sem filtro explícito de user_id
-- Requer PostgreSQL 15+ (Supabase suporta desde 2023)

CREATE OR REPLACE VIEW public.active_subscriptions
WITH (security_invoker = true) AS
SELECT DISTINCT user_id
FROM public.subscriptions
WHERE
  status IN ('active', 'grace_period')
  AND (
    current_period_end IS NULL
    OR current_period_end > NOW()
    OR grace_period_end > NOW()
  );

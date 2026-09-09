-- ============================================================
-- Tabela de assinaturas (substitui/unifica assinaturas existente)
-- Suporta: Apple IAP, Google Play Billing, MercadoPago
-- ============================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider                  TEXT NOT NULL CHECK (provider IN ('apple', 'google', 'mercadopago')),
  provider_subscription_id  TEXT NOT NULL,
  original_transaction_id   TEXT,
  plan_id                   TEXT NOT NULL DEFAULT 'pro_monthly',
  status                    TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'expired', 'paused', 'grace_period')),
  cancel_at_period_end      BOOLEAN NOT NULL DEFAULT FALSE,
  current_period_start      TIMESTAMPTZ,
  current_period_end        TIMESTAMPTZ,
  grace_period_end          TIMESTAMPTZ,
  canceled_at               TIMESTAMPTZ,
  trial_ends_at             TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status  ON public.subscriptions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_provider_id
  ON public.subscriptions(provider, provider_subscription_id);

-- ============================================================
-- View de assinaturas ativas (considera grace period)
-- ============================================================

CREATE OR REPLACE VIEW public.active_subscriptions AS
SELECT DISTINCT user_id
FROM public.subscriptions
WHERE
  status IN ('active', 'grace_period')
  AND (
    current_period_end IS NULL
    OR current_period_end > NOW()
    OR grace_period_end > NOW()
  );

-- ============================================================
-- Trigger: atualizar updated_at automaticamente
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_subscriptions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_subscriptions_updated_at();

-- ============================================================
-- Trigger: sincronizar perfis.plano com subscriptions
-- Mantém compatibilidade com o código existente que lê perfis.plano
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_perfil_plano()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  has_active BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.active_subscriptions WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
  ) INTO has_active;

  UPDATE public.perfis
  SET plano = CASE WHEN has_active THEN 'pro' ELSE 'gratuito' END
  WHERE id = COALESCE(NEW.user_id, OLD.user_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_perfil_plano ON public.subscriptions;
CREATE TRIGGER trg_sync_perfil_plano
  AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_perfil_plano();

-- ============================================================
-- RLS: usuário lê apenas sua própria assinatura
-- Writes somente via service role (Edge Functions)
-- ============================================================

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_select_own"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Trigger que impede usuários gratuitos de ativar módulos PRO
-- Os módulos PRO são: cobranca_automatica e equipe

CREATE OR REPLACE FUNCTION enforce_pro_modules()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o plano for gratuito, força os módulos PRO para false
  IF NEW.plano = 'gratuito' THEN
    IF NEW.modulos IS NOT NULL THEN
      NEW.modulos = NEW.modulos
        || '{"cobranca_automatica": false}'::jsonb
        || '{"equipe": false}'::jsonb;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_pro_modules ON perfis;

CREATE TRIGGER trg_enforce_pro_modules
  BEFORE INSERT OR UPDATE ON perfis
  FOR EACH ROW
  EXECUTE FUNCTION enforce_pro_modules();

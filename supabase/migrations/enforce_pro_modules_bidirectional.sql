-- Trigger bidirecional para módulos Pro
-- Quando plano = 'gratuito': bloqueia todos os módulos Pro
-- Quando plano muda PARA 'pro' (de gratuito): ativa automaticamente os módulos Pro
-- Substitui enforce_score_relatorio_pro.sql

DROP TRIGGER IF EXISTS trg_enforce_pro_modules ON perfis;
DROP FUNCTION IF EXISTS enforce_pro_modules();

CREATE OR REPLACE FUNCTION enforce_pro_modules()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.plano = 'gratuito' THEN
    NEW.modulos = NEW.modulos
      || '{"cobranca_automatica": false}'::jsonb
      || '{"equipe": false}'::jsonb
      || '{"score_cliente": false}'::jsonb
      || '{"relatorio_categoria": false}'::jsonb;
  ELSIF NEW.plano = 'pro' AND (OLD IS NULL OR OLD.plano = 'gratuito') THEN
    -- Ativa módulos Pro ao fazer upgrade (equipe fica false — requer plano equipe futuro)
    NEW.modulos = NEW.modulos
      || '{"cobranca_automatica": true}'::jsonb
      || '{"score_cliente": true}'::jsonb
      || '{"relatorio_categoria": true}'::jsonb;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_enforce_pro_modules
  BEFORE INSERT OR UPDATE ON perfis
  FOR EACH ROW
  EXECUTE FUNCTION enforce_pro_modules();

-- Corrige usuários gratuitos existentes
UPDATE perfis
SET modulos = modulos
  || '{"cobranca_automatica": false}'::jsonb
  || '{"equipe": false}'::jsonb
  || '{"score_cliente": false}'::jsonb
  || '{"relatorio_categoria": false}'::jsonb
WHERE plano = 'gratuito';

-- Ativa módulos para usuários Pro existentes que ainda não tinham
UPDATE perfis
SET modulos = modulos
  || '{"cobranca_automatica": true}'::jsonb
  || '{"score_cliente": true}'::jsonb
  || '{"relatorio_categoria": true}'::jsonb
WHERE plano = 'pro';

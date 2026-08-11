-- Adiciona coluna modulos e corrige trigger enforce_pro_modules
-- Coluna faltava na tabela perfis, causando falha em todos os UPDATEs

ALTER TABLE perfis
  ADD COLUMN IF NOT EXISTS modulos JSONB NOT NULL DEFAULT '{}';

DROP TRIGGER IF EXISTS trg_enforce_pro_modules ON perfis;
DROP FUNCTION IF EXISTS enforce_pro_modules();

CREATE OR REPLACE FUNCTION enforce_pro_modules()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.plano = 'gratuito' THEN
    NEW.modulos = NEW.modulos
      || '{"cobranca_automatica": false}'::jsonb
      || '{"equipe": false}'::jsonb;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_enforce_pro_modules
  BEFORE INSERT OR UPDATE ON perfis
  FOR EACH ROW
  EXECUTE FUNCTION enforce_pro_modules();

UPDATE perfis
SET modulos = modulos
  || '{"cobranca_automatica": false}'::jsonb
  || '{"equipe": false}'::jsonb
WHERE plano = 'gratuito';

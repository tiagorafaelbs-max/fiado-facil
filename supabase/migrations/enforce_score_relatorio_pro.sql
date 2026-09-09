-- Adiciona score_cliente e relatorio_categoria ao bloco de módulos PRO
-- Estes módulos aparecem como Pro em planos.tsx mas não estavam sendo
-- protegidos pelo trigger — usuários gratuitos conseguiam acessá-los.

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
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_enforce_pro_modules
  BEFORE INSERT OR UPDATE ON perfis
  FOR EACH ROW
  EXECUTE FUNCTION enforce_pro_modules();

-- Corrige usuários gratuitos existentes que já tinham os módulos ativados
UPDATE perfis
SET modulos = modulos
  || '{"cobranca_automatica": false}'::jsonb
  || '{"equipe": false}'::jsonb
  || '{"score_cliente": false}'::jsonb
  || '{"relatorio_categoria": false}'::jsonb
WHERE plano = 'gratuito';

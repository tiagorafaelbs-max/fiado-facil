-- Atualiza constraint de dia_cobranca de 28 para 31
ALTER TABLE perfis DROP CONSTRAINT IF EXISTS perfis_dia_cobranca_check;
ALTER TABLE perfis ADD CONSTRAINT perfis_dia_cobranca_check CHECK (dia_cobranca BETWEEN 1 AND 31);

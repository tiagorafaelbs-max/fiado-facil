-- Adiciona campo para escolher quais clientes incluir na cobrança agendada
ALTER TABLE perfis
  ADD COLUMN IF NOT EXISTS cobranca_auto_tipo TEXT NOT NULL DEFAULT 'vencidos'
    CHECK (cobranca_auto_tipo IN ('vencidos', 'todos'));

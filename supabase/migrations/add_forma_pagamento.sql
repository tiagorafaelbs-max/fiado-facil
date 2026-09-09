-- Adiciona forma de pagamento na tabela de pagamentos
ALTER TABLE pagamentos
  ADD COLUMN IF NOT EXISTS forma_pagamento TEXT
    CHECK (forma_pagamento IN ('dinheiro', 'cartao', 'pix'))
    DEFAULT 'dinheiro';

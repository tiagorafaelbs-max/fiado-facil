-- Adiciona colunas para suporte ao Apple IAP na tabela assinaturas
ALTER TABLE assinaturas
  ADD COLUMN IF NOT EXISTS plataforma TEXT DEFAULT 'mercadopago',
  ADD COLUMN IF NOT EXISTS apple_original_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS apple_product_id TEXT,
  ADD COLUMN IF NOT EXISTS expira_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ DEFAULT NOW();

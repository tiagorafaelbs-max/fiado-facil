-- Adiciona colunas de configuração do negócio na tabela perfis
-- Essas colunas estavam no código do app mas faltavam no banco (causava dados sumindo)
-- Aplicado em: 2026-08-05

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS chave_pix          text,
  ADD COLUMN IF NOT EXISTS dia_cobranca       integer CHECK (dia_cobranca BETWEEN 1 AND 28),
  ADD COLUMN IF NOT EXISTS notificacoes_ativas boolean NOT NULL DEFAULT true;

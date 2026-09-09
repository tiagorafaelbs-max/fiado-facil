-- Adicionar campos empresa e endereco na tabela clientes
-- Execute este script no SQL Editor do Supabase

alter table public.clientes
  add column if not exists empresa  text,
  add column if not exists endereco text;

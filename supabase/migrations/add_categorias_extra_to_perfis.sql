-- Persiste categorias personalizadas por usuário no Supabase
-- antes ficavam só no AsyncStorage e eram perdidas ao reinstalar o app
ALTER TABLE perfis
  ADD COLUMN IF NOT EXISTS categorias_extra JSONB NOT NULL DEFAULT '[]'::jsonb;

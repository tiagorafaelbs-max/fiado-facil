-- Aplicada em produção em 2026-09-22 via MCP (autorizada pelo Tiago).
--
-- Defesa em profundidade após o incidente de 16/09 (view clientes_com_saldo).
-- O papel `anon` (chave pública embutida no app) tinha todos os privilégios
-- padrão do Supabase (SELECT/INSERT/UPDATE/DELETE/TRUNCATE) nas tabelas.
-- Hoje só a RLS (auth.uid() = usuario_id) barrava o acesso — uma única camada.
--
-- Nada no app usa `anon` para dados: todas as telas exigem login e todas as
-- edge functions usam SUPABASE_SERVICE_ROLE_KEY. Cadastro usa Supabase Auth e
-- o trigger handle_new_user (SECURITY DEFINER), que não depende de `anon`.
REVOKE ALL ON public.clientes, public.vendas, public.pagamentos, public.perfis,
  public.subscriptions FROM anon;
REVOKE ALL ON public.active_subscriptions, public.clientes_com_saldo FROM anon;

-- Tabelas e views criadas no futuro não recebem privilégios para `anon`
-- por padrão; se algum dia for preciso, conceder explicitamente com justificativa.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

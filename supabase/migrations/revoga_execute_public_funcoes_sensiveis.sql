-- Aplicada em produção em 2026-09-11 via MCP.
--
-- Achado pelo Fiscal na validação da correção anterior: o hardening
-- anterior (bloqueia_auto_promocao_pro_e_hardening.sql) revogou EXECUTE
-- de `anon`/`authenticated` explicitamente, mas todo papel do Postgres
-- herda os privilégios concedidos a PUBLIC — e essas 6 funções tinham (por
-- padrão de criação) EXECUTE liberado pra PUBLIC. Ou seja, `anon` (a chave
-- anônima, pública, embutida no app) continuava conseguindo chamar todas
-- elas via herança, mesmo depois do REVOKE explícito.
--
-- Revoga de PUBLIC de vez. `authenticated` mantém grant explícito nas duas
-- funções que o app realmente chama via .rpc() (contador WhatsApp).
-- Testado: RPC do contador continua chamável por authenticated; trigger
-- enforce_pro_modules continua disparando e revertendo tentativa de
-- auto-promoção; insert em vendas/clientes continua passando pelo trigger
-- verificar_limite_clientes sem erro.
REVOKE EXECUTE ON FUNCTION public.enforce_pro_modules() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_perfil_plano() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verificar_limite_clientes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.incrementar_contador_wpp(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reverter_contador_wpp(uuid) FROM PUBLIC;

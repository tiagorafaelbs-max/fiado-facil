-- Aplicada em produção em 2026-09-16 via MCP. CRÍTICO — vazamento de dados ativo.
--
-- A view clientes_com_saldo rodava como SECURITY DEFINER (comportamento
-- padrão de view no Postgres), o que ignora completamente o RLS das
-- tabelas clientes/vendas/pagamentos por trás dela. Combinado com GRANT
-- SELECT para o role `anon` (a chave pública, embutida no app, extraível
-- por qualquer um), isso permitia que QUALQUER requisição HTTP não
-- autenticada lesse clientes_com_saldo de TODOS os usuários — nome,
-- telefone, CPF, endereço, saldo devedor.
--
-- Comprovado antes do fix: `select count(distinct usuario_id) from
-- clientes_com_saldo` como role anon retornava 65 empresas / 473 clientes.
-- Depois do fix: anon recebe "permission denied"; um usuário autenticado
-- real (testado) só vê os próprios clientes (1 empresa / N clientes).
ALTER VIEW public.clientes_com_saldo SET (security_invoker = true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.clientes_com_saldo FROM anon, authenticated;
REVOKE SELECT ON public.clientes_com_saldo FROM anon;

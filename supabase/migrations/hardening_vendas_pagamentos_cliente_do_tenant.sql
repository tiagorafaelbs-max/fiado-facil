-- SEGURANÇA (baixa prioridade) — vendas/pagamentos só podem apontar para cliente DO MESMO dono.
-- PARA REVISÃO: NÃO APLICADA.
--
-- Problema: as policies de INSERT conferem `usuario_id = tenant_id_atual()` mas NÃO conferem que o
-- `cliente_id` pertence ao tenant. Um usuário autenticado consegue gravar uma venda/pagamento com o
-- próprio usuario_id ligado ao cliente de OUTRA loja (foi assim que surgiram 5 vendas cruzadas em
-- 11/07: usuário 04274343 -> clientes de 06a90188). O saldo (view clientes_com_saldo) soma TODAS as
-- vendas do cliente, então a loja dona do cliente passa a ver um saldo alterado por terceiro.
-- As policies de UPDATE (dono e funcionário) têm o mesmo buraco: dá para trocar o cliente_id para o
-- cliente de outra loja.
--
-- Correção: `exists (select 1 from clientes c where c.id = <tabela>.cliente_id and c.usuario_id = <tenant>)`
-- no WITH CHECK de INSERT e de UPDATE (a subconsulta respeita a RLS de clientes, que já limita ao tenant).
-- Só ALTER POLICY: não mexe em dados nem em nenhuma outra policy (select/delete ficam como estão).
--
-- Dados existentes: NÃO são alterados. As 5 vendas cruzadas continuam no banco (ver relatório): o WITH CHECK
-- só avalia linhas novas/atualizadas — o dono da venda cruzada passa a não conseguir EDITAR essas 5 vendas
-- pelo app (a edição falharia no check), o que é o comportamento desejado. Funções SECURITY DEFINER
-- (reconciliação, 3c) e service_role não passam por RLS e não são afetadas.
--
-- Impacto no app (conferido): criação de venda/pagamento (online e fila offline) sempre usa cliente do
-- próprio tenant; cliente não é criável offline, então a fila nunca referencia cliente inexistente.
--
-- Reversão: alter policy ... with check (usuario_id = tenant_id_atual()) (insert) e
-- (usuario_id = auth.uid()) / a expressão antiga do funcionário (update) — expressões antigas abaixo.

-- INSERT
alter policy vendas_insert on public.vendas
  with check (
    usuario_id = tenant_id_atual()
    and exists (select 1 from public.clientes c where c.id = vendas.cliente_id and c.usuario_id = tenant_id_atual())
  );

alter policy pagamentos_insert on public.pagamentos
  with check (
    usuario_id = tenant_id_atual()
    and exists (select 1 from public.clientes c where c.id = pagamentos.cliente_id and c.usuario_id = tenant_id_atual())
  );

-- UPDATE — dono
alter policy vendas_update_dono on public.vendas
  with check (
    usuario_id = auth.uid()
    and exists (select 1 from public.clientes c where c.id = vendas.cliente_id and c.usuario_id = auth.uid())
  );

alter policy pagamentos_update_dono on public.pagamentos
  with check (
    usuario_id = auth.uid()
    and exists (select 1 from public.clientes c where c.id = pagamentos.cliente_id and c.usuario_id = auth.uid())
  );

-- UPDATE — funcionário (mantém as regras atuais: venda própria e do mesmo dia, em horário de Brasília)
alter policy vendas_update_funcionario on public.vendas
  with check (
    usuario_id = tenant_id_atual()
    and criado_por = auth.uid()
    and ((criado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date)
    and exists (select 1 from public.clientes c where c.id = vendas.cliente_id and c.usuario_id = tenant_id_atual())
  );

alter policy pagamentos_update_funcionario on public.pagamentos
  with check (
    usuario_id = tenant_id_atual()
    and criado_por = auth.uid()
    and ((criado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date)
    and exists (select 1 from public.clientes c where c.id = pagamentos.cliente_id and c.usuario_id = tenant_id_atual())
  );

-- Expressões ANTIGAS (para reverter):
--   vendas_insert / pagamentos_insert ........ WITH CHECK (usuario_id = tenant_id_atual())
--   vendas_update_dono / pagamentos_update_dono ... WITH CHECK (usuario_id = auth.uid())
--   *_update_funcionario ..... WITH CHECK ((usuario_id = tenant_id_atual()) AND (criado_por = auth.uid())
--                                AND (((criado_em AT TIME ZONE 'America/Sao_Paulo')::date) = ((now() AT TIME ZONE 'America/Sao_Paulo')::date)))

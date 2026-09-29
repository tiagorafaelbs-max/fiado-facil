-- PROPOSTA -- NÃO APLICAR sem aprovação do Tiago.
--
-- Achado do Tiago (29/09): as policies de clientes/vendas/pagamentos são FOR ALL
-- por tenant, então qualquer funcionário ativo edita ou apaga qualquer venda,
-- pagamento ou cliente do negócio, mesmo lançado por outra pessoa há meses. O
-- trigger checar_permissao_venda_trigger (existente, equipe_e_multiusuario.sql) só
-- cobre vendas (pagamentos não tem checagem nenhuma) e não exige autoria nem mesmo
-- dia -- só a flag editar_venda/excluir_venda.
--
-- Esta migration separa as policies por comando e adiciona a checagem completa:
-- dono continua com acesso total (comportamento de hoje); funcionário só edita
-- venda/pagamento que ELE MESMO lançou, NO MESMO DIA (fuso America/Sao_Paulo), com
-- a permissão editar_venda ligada; só exclui com a permissão excluir_venda (sem
-- exigência de autoria/data pra exclusão, conforme pedido); nunca edita/exclui
-- cliente.

-- Checa a permissão do MEMBRO ATIVO logado agora -- não confundir com o dono, que
-- não tem linha em membros_equipe e por isso nunca depende desta função (as
-- policies abaixo tratam o dono via usuario_id = auth.uid(), sem chamar isto).
create or replace function public.tem_permissao(chave text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select (permissoes ->> chave)::boolean
     from public.membros_equipe
     where membro_id = auth.uid() and status = 'ativo'),
    false
  );
$$;

revoke all on function public.tem_permissao(text) from public;
revoke all on function public.tem_permissao(text) from anon;
grant execute on function public.tem_permissao(text) to authenticated;

-- ── CLIENTES ────────────────────────────────────────────────────────────────
-- SELECT/INSERT continuam por tenant (dono ou funcionário). UPDATE/DELETE nunca
-- para funcionário -- só o dono edita ou apaga um cliente.
drop policy if exists clientes_tenant on public.clientes;

create policy clientes_select on public.clientes
  for select using (usuario_id = public.tenant_id_atual());

create policy clientes_insert on public.clientes
  for insert with check (usuario_id = public.tenant_id_atual());

create policy clientes_update_dono on public.clientes
  for update using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

create policy clientes_delete_dono on public.clientes
  for delete using (usuario_id = auth.uid());

-- ── VENDAS ──────────────────────────────────────────────────────────────────
drop policy if exists vendas_tenant on public.vendas;

create policy vendas_select on public.vendas
  for select using (usuario_id = public.tenant_id_atual());

create policy vendas_insert on public.vendas
  for insert with check (usuario_id = public.tenant_id_atual());

-- Dono: sem restrição (igual hoje).
create policy vendas_update_dono on public.vendas
  for update using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

-- Funcionário: só o que ele mesmo lançou, no mesmo dia, com a permissão ligada.
-- criado_em é gravado pelo banco na hora do insert -- não dá pro funcionário
-- forjar uma data antiga pra abrir a janela de edição de novo.
create policy vendas_update_funcionario on public.vendas
  for update
  using (
    usuario_id = public.tenant_id_atual()
    and auth.uid() <> usuario_id
    and public.tem_permissao('editar_venda')
    and criado_por = auth.uid()
    and (criado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
  )
  -- Repete a checagem de mesmo dia sobre a linha NOVA: sem isso, o próprio update
  -- permitido poderia adiantar criado_em pra amanhã (PostgREST aceita qualquer
  -- coluna no payload; a RLS é a única barreira) e reabrir a janela de edição
  -- indefinidamente -- achado do Fiscal, 29/09.
  with check (
    usuario_id = public.tenant_id_atual()
    and criado_por = auth.uid()
    and (criado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
  );

-- Dono: sem restrição.
create policy vendas_delete_dono on public.vendas
  for delete using (usuario_id = auth.uid());

-- Funcionário: só precisa da permissão excluir_venda -- sem exigir autoria/data
-- (pedido explícito: exclusão é mais permissiva que edição).
create policy vendas_delete_funcionario on public.vendas
  for delete
  using (
    usuario_id = public.tenant_id_atual()
    and auth.uid() <> usuario_id
    and public.tem_permissao('excluir_venda')
  );

-- ── PAGAMENTOS (mesmas regras de vendas -- reaproveita editar_venda/excluir_venda,
-- não existe uma permissão separada pra pagamentos hoje) ────────────────────────
drop policy if exists pagamentos_tenant on public.pagamentos;

create policy pagamentos_select on public.pagamentos
  for select using (usuario_id = public.tenant_id_atual());

create policy pagamentos_insert on public.pagamentos
  for insert with check (usuario_id = public.tenant_id_atual());

create policy pagamentos_update_dono on public.pagamentos
  for update using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

create policy pagamentos_update_funcionario on public.pagamentos
  for update
  using (
    usuario_id = public.tenant_id_atual()
    and auth.uid() <> usuario_id
    and public.tem_permissao('editar_venda')
    and criado_por = auth.uid()
    and (criado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
  )
  -- Mesmo motivo do with check de vendas_update_funcionario: fecha a brecha de
  -- adiantar criado_em pra reabrir a janela de edição.
  with check (
    usuario_id = public.tenant_id_atual()
    and criado_por = auth.uid()
    and (criado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
  );

create policy pagamentos_delete_dono on public.pagamentos
  for delete using (usuario_id = auth.uid());

create policy pagamentos_delete_funcionario on public.pagamentos
  for delete
  using (
    usuario_id = public.tenant_id_atual()
    and auth.uid() <> usuario_id
    and public.tem_permissao('excluir_venda')
  );

-- ── Limpeza: o trigger antigo fica redundante ────────────────────────────────
-- checar_permissao_venda_trigger só cobria vendas e só checava a flag (sem
-- autoria/data) -- a nova RLS de vendas_update_funcionario já é estritamente mais
-- restritiva em todo caso que o trigger bloqueava, então ele nunca mais dispara
-- de forma útil. Mantê-lo seria código morto que engana quem ler depois achando
-- que ainda é ele quem protege pagamentos (nunca protegeu).
drop trigger if exists checar_permissao_venda_trigger on public.vendas;
drop function if exists public.checar_permissao_venda();

-- PROPOSTA -- NÃO APLICAR sem aprovação do Tiago.
--
-- Achado do Tiago (29/09), bloqueante pro build: lib/reconciliacao.ts fazia
-- UPDATE direto em vendas.pago do cliente inteiro, tocando vendas de QUALQUER
-- dia/autor. Com a nova RLS de funcionário (equipe_permissoes_granulares.sql,
-- já aplicada), esse update é recusado em silêncio pra vendas que não são do
-- próprio funcionário/do mesmo dia -- uma venda antiga do dono, quitada por um
-- pagamento que o funcionário registrou, fica presa em pago=false e continua
-- aparecendo como "em aberto" em Cobranças, notificações, painel, ranking e no
-- extrato do WhatsApp. Risco real: cobrar de novo quem já pagou.
--
-- Esta RPC roda como o dono da função (SECURITY DEFINER), então recalcula e
-- grava pago independente de quem chamou (dono ou funcionário) -- a mesma
-- lógica FIFO que já existia em JS (lib/reconciliacao.ts) e na view
-- clientes_com_saldo, só que como UPDATE atômico no servidor.

create or replace function public.reconciliar_pago_cliente(p_cliente_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_dono_cliente uuid;
begin
  v_tenant := public.tenant_id_atual();

  select usuario_id into v_dono_cliente
  from public.clientes
  where id = p_cliente_id;

  if v_dono_cliente is null or v_dono_cliente <> v_tenant then
    raise exception 'Cliente não encontrado ou não pertence ao seu negócio';
  end if;

  -- Mesma ordem FIFO da view clientes_com_saldo: vencimento, depois data da
  -- venda, depois id como desempate estável.
  with pagos as (
    select coalesce(sum(valor), 0) as total_pago
    from public.pagamentos
    where cliente_id = p_cliente_id and usuario_id = v_tenant
  ),
  alloc as (
    select
      v.id,
      sum(v.valor) over (
        order by v.data_vencimento, v.data_venda, v.id
        rows between unbounded preceding and current row
      ) as acumulado
    from public.vendas v
    where v.cliente_id = p_cliente_id and v.usuario_id = v_tenant
  )
  update public.vendas v
  set pago = (a.acumulado <= (select total_pago from pagos))
  from alloc a
  where v.id = a.id
    and v.pago is distinct from (a.acumulado <= (select total_pago from pagos));
end;
$$;

revoke all on function public.reconciliar_pago_cliente(uuid) from public;
revoke all on function public.reconciliar_pago_cliente(uuid) from anon;
grant execute on function public.reconciliar_pago_cliente(uuid) to authenticated;

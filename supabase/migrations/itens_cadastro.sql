-- PARA REVISÃO — NÃO APLICADA. Aplicar só com ordem do Tiago (pedido de 2 clientes Pro, 21/10/2026).
-- Cadastro de ITENS do comerciante (atalhos para lançar vendas mais rápido): nome, preço opcional, categoria, ativo, ordem.
-- RLS no mesmo padrão das vendas/clientes (equipe):
--   • LER: dono e funcionários da loja (usuario_id = tenant_id_atual()), porque o funcionário lança vendas com os itens.
--   • CRIAR / EDITAR / DESATIVAR / REORDENAR / APAGAR: só o dono (usuario_id = auth.uid()).
-- Limite: plano gratuito até 10 itens ATIVOS; Pro ilimitado (mesmo padrão do limite de 10 clientes, validado no servidor).
-- O app só mostra o recurso se a tabela existir: sem esta migration o app antigo e o novo funcionam como hoje.
-- Sem begin/commit: apply_migration já é transacional.

create table if not exists public.itens (
  id         uuid        primary key default gen_random_uuid(),
  usuario_id uuid        not null references auth.users(id) on delete cascade,
  nome       text        not null check (char_length(btrim(nome)) between 1 and 60),
  preco      numeric(12,2) check (preco is null or (preco >= 0 and preco < 100000000)),   -- em reais; vazio = sem preço fixo
  categoria  text        not null default 'Mercadoria' check (char_length(btrim(categoria)) between 1 and 40),
  ativo      boolean     not null default true,
  ordem      integer     not null default 0,
  criado_em  timestamptz not null default now()
);
comment on table public.itens is 'Itens cadastrados pelo comerciante para lançar vendas mais rápido. Sem dado pessoal. Some com a conta (cascade).';

-- sem dois itens ATIVOS com o mesmo nome (ignora maiúsculas/minúsculas e espaços nas pontas)
create unique index if not exists itens_nome_ativo_unico on public.itens (usuario_id, lower(btrim(nome))) where ativo;
create index if not exists itens_usuario_ordem on public.itens (usuario_id, ativo, ordem);

alter table public.itens enable row level security;

drop policy if exists itens_select on public.itens;
create policy itens_select on public.itens for select to authenticated
  using (usuario_id = public.tenant_id_atual());

drop policy if exists itens_insert_dono on public.itens;
create policy itens_insert_dono on public.itens for insert to authenticated
  with check (usuario_id = auth.uid());

drop policy if exists itens_update_dono on public.itens;
create policy itens_update_dono on public.itens for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

drop policy if exists itens_delete_dono on public.itens;
create policy itens_delete_dono on public.itens for delete to authenticated
  using (usuario_id = auth.uid());

revoke all on public.itens from public, anon, authenticated;
grant select, insert, update, delete on public.itens to authenticated;

-- Limite do plano gratuito, validado no servidor (o app também avisa antes). Vale ao criar um item ativo e ao reativar.
create or replace function public.itens_verificar_limite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  plano_dono text;
  total      integer;
begin
  if new.ativo is not true then
    return new;
  end if;
  select plano into plano_dono from public.perfis where id = new.usuario_id;
  if plano_dono = 'gratuito' then
    select count(*) into total from public.itens
      where usuario_id = new.usuario_id and ativo and id is distinct from new.id;
    if total >= 10 then
      raise exception 'Limite de 10 itens atingido no plano gratuito. Faça upgrade para o plano Pro.';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.itens_verificar_limite() from public, anon, authenticated;

drop trigger if exists itens_limite on public.itens;
create trigger itens_limite before insert or update of ativo on public.itens
  for each row execute function public.itens_verificar_limite();

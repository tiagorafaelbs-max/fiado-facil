-- Equipe: autoria confiável dos lançamentos + opção de resumo diário
--
-- Hoje vendas.criado_por / pagamentos.criado_por são enviados pelo próprio app e NÃO são conferidos
-- pelo banco: um funcionário (ou um app antigo/alterado) pode gravar sem autor ou com o autor de outra
-- pessoa, e o "Registrado por" do dono ficaria errado. Os triggers abaixo fazem o banco decidir:
--   * INSERT por usuário logado: criado_por = auth.uid() (quem de fato está lançando — dono ou funcionário);
--   * UPDATE por usuário logado: criado_por nunca muda (editar não "rouba" a autoria).
-- service_role e acessos sem JWT (painel/migrations) não são afetados.
-- A fila offline é uma só por aparelho: o app (hooks/useOffline.ts) só sincroniza cada operação na sessão de
-- quem a criou (criado_por = usuário logado); as de outra pessoa esperam ela entrar de novo. Assim, mesmo em
-- celular compartilhado, o login que envia é o de quem lançou e a autoria continua certa. OBS.: versões do app
-- sem essa regra (builds 54/88 antes desta OTA) podem sincronizar a fila de outra pessoa com o login atual e,
-- com o trigger, o autor passaria a ser quem sincronizou — por isso aplicar a migration 2 junto da OTA.
-- As policies de edição do funcionário já exigem criado_por = auth.uid(); o trigger é coerente com elas.
--
-- Também cria perfis.notif_resumo_equipe (resumo diário da equipe, desligado por padrão; só o dono escreve
-- em perfis, pela policy perfil_proprio).
--
-- Não altera nenhuma linha existente (as vendas antigas sem autor continuam sem autor).
-- Reversão: ver bloco no fim do arquivo.

create or replace function public.definir_criado_por()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' and auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.criado_por := auth.uid();
    else
      new.criado_por := old.criado_por;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.definir_criado_por() from public, anon, authenticated;

drop trigger if exists trg_definir_criado_por on public.vendas;
create trigger trg_definir_criado_por
  before insert or update on public.vendas
  for each row execute function public.definir_criado_por();

drop trigger if exists trg_definir_criado_por on public.pagamentos;
create trigger trg_definir_criado_por
  before insert or update on public.pagamentos
  for each row execute function public.definir_criado_por();

alter table public.perfis
  add column if not exists notif_resumo_equipe boolean not null default false;

-- ── Reversão (não faz parte da migration) ──────────────────────────────────────────────
-- drop trigger if exists trg_definir_criado_por on public.vendas;
-- drop trigger if exists trg_definir_criado_por on public.pagamentos;
-- drop function if exists public.definir_criado_por();
-- alter table public.perfis drop column if exists notif_resumo_equipe;

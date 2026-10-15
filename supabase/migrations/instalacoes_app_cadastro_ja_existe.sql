-- Funil anônimo (public.instalacoes_app): duas etapas novas do aviso "Você já tem uma conta" no cadastro (15/10/2026, autorizado pelo Tiago).
--   cadastro_ja_existe = o e-mail digitado já tinha conta · cadastro_ir_login = nesse aviso, tocou em Entrar. Sem dado pessoal.
-- Sem begin/commit: apply_migration já é transacional.

alter table public.instalacoes_app drop constraint instalacoes_app_etapa_check;
alter table public.instalacoes_app add constraint instalacoes_app_etapa_check
  check (etapa in ('abriu','cadastro','conta','entrou',
                   'limite','planos','compra','compra_cancelou','compra_erro','compra_ok','loja_erro',
                   'contatos_erro',
                   'avaliar_card','avaliar_toque',
                   'cadastro_toque','cadastro_erro',
                   'cadastro_ja_existe','cadastro_ir_login'));

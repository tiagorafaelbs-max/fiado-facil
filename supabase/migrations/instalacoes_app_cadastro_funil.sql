-- Funil anônimo (public.instalacoes_app): duas etapas novas da tela de cadastro (14/10/2026, autorizado pelo Tiago).
--   cadastro_toque = tocou em "Criar conta" · cadastro_erro = não concluiu (detalhe: validacao:<campos> ou signup:<código do erro>).
-- Nunca grava e-mail, nome do negócio nem senha: só campos que falharam ou o código técnico do erro.
-- Sem begin/commit: apply_migration já é transacional.

alter table public.instalacoes_app drop constraint instalacoes_app_etapa_check;
alter table public.instalacoes_app add constraint instalacoes_app_etapa_check
  check (etapa in ('abriu','cadastro','conta','entrou',
                   'limite','planos','compra','compra_cancelou','compra_erro','compra_ok','loja_erro',
                   'contatos_erro',
                   'avaliar_card','avaliar_toque',
                   'cadastro_toque','cadastro_erro'));

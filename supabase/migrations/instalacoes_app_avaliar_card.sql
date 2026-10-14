-- PARA REVISÃO — NÃO APLICADA. Aplicar só com autorização do Tiago.
-- Funil anônimo (public.instalacoes_app): duas etapas novas do card de avaliação da tela Início.
--   avaliar_card  = o card foi exibido · avaliar_toque = tocou em "Avaliar". Sem dado pessoal.
-- Sem begin/commit: apply_migration já é transacional.

alter table public.instalacoes_app drop constraint instalacoes_app_etapa_check;
alter table public.instalacoes_app add constraint instalacoes_app_etapa_check
  check (etapa in ('abriu','cadastro','conta','entrou',
                   'limite','planos','compra','compra_cancelou','compra_erro','compra_ok','loja_erro',
                   'contatos_erro',
                   'avaliar_card','avaliar_toque'));

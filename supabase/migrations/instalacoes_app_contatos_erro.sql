-- PARA REVISÃO — NÃO APLICADA. Aplicar só com autorização do Tiago.
-- Nova etapa 'contatos_erro' no funil anônimo (public.instalacoes_app): falha ao abrir a agenda do celular.
-- "detalhe" guarda só código/mensagem curta do módulo nativo (já restrito a 1–60 chars [A-Za-z0-9_.:-]); nunca dado de contato.
-- Sem begin/commit: apply_migration já é transacional.

alter table public.instalacoes_app drop constraint instalacoes_app_etapa_check;
alter table public.instalacoes_app add constraint instalacoes_app_etapa_check
  check (etapa in ('abriu','cadastro','conta','entrou',
                   'limite','planos','compra','compra_cancelou','compra_erro','compra_ok','loja_erro',
                   'contatos_erro'));

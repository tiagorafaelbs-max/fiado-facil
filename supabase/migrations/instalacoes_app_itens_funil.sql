-- PARA REVISÃO — NÃO APLICADA. Aplicar só com autorização do Tiago (21/10/2026).
-- Funil anônimo (public.instalacoes_app): etapas novas do cadastro de itens.
--   itens_cadastrou = cadastrou um item em "Meus itens" · venda_com_item = lançou uma venda usando itens. Sem dado pessoal.
-- Sem a migration os eventos falham em silêncio e o app funciona normal.
-- Sem begin/commit: apply_migration já é transacional.

alter table public.instalacoes_app drop constraint instalacoes_app_etapa_check;
alter table public.instalacoes_app add constraint instalacoes_app_etapa_check
  check (etapa in ('abriu','cadastro','conta','entrou',
                   'limite','planos','compra','compra_cancelou','compra_erro','compra_ok','compra_pendente','loja_erro',
                   'contatos_erro',
                   'avaliar_card','avaliar_toque',
                   'cadastro_toque','cadastro_erro',
                   'cadastro_ja_existe','cadastro_ir_login',
                   'cobrar_vence_hoje',
                   'itens_cadastrou','venda_com_item'));

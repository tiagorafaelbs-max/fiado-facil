-- PARA REVISÃO — NÃO APLICADA. Aplicar só depois do Fiscal (autorizado pelo Tiago em 10/10/2026).
-- Funil de COMPRA em public.instalacoes_app (mesmo padrão anônimo: anon só INSERE, sem dado pessoal):
--   limite · planos · compra · compra_cancelou · compra_erro · compra_ok · loja_erro
-- vale para TODO aparelho, no máximo 1 linha por etapa por DIA (a chave passa a incluir o dia).
-- "detalhe" guarda só um código curto (ex.: E_USER_CANCELLED, cobrancas, moeda_USD), nunca texto livre.

alter table public.instalacoes_app drop constraint instalacoes_app_etapa_check;
alter table public.instalacoes_app add constraint instalacoes_app_etapa_check
  check (etapa in ('abriu','cadastro','conta','entrou',
                   'limite','planos','compra','compra_cancelou','compra_erro','compra_ok','loja_erro'));

alter table public.instalacoes_app add column detalhe text
  check (detalhe is null or (char_length(detalhe) between 1 and 60 and detalhe ~ '^[A-Za-z0-9_.:-]+$'));
comment on column public.instalacoes_app.detalhe is 'Código curto (limite: clientes|cobrancas; erro: código da loja; loja_erro: motivo). Nunca texto livre.';

-- 1 linha por (instalação, etapa, dia). criado_em é preenchido pelo gatilho BEFORE INSERT (só o dia) antes desta checagem.
alter table public.instalacoes_app drop constraint instalacoes_app_pkey;
alter table public.instalacoes_app add primary key (instalacao_id, etapa, criado_em);

-- anon/authenticated continuam só com INSERT, agora também na coluna nova
grant insert (detalhe) on public.instalacoes_app to anon, authenticated;

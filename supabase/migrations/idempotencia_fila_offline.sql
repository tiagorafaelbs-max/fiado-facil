-- Idempotência para vendas/pagamentos enfileirados offline: sem isso, se a
-- confirmação de rede de um insert se perder depois do servidor já ter
-- processado (queda de conexão exatamente nesse instante, app fechado no
-- meio), o app reenvia a mesma operação no próximo sync e cria um registro
-- duplicado — mexendo direto no saldo do cliente, sem trilha de auditoria.
--
-- client_op_id é gerado UMA vez no aparelho quando a operação é criada (não a
-- cada tentativa de sync) e enviado no payload. Um reenvio da MESMA operação
-- chega com o MESMO client_op_id; o upsert com ON CONFLICT DO NOTHING ignora
-- silenciosamente em vez de duplicar.
--
-- Constraint única NORMAL (não parcial): PostgREST/supabase-js geram
-- `ON CONFLICT (client_op_id)` sem cláusula WHERE — um índice único parcial
-- (`where client_op_id is not null`) não seria inferido por isso e toda
-- sincronização offline passaria a falhar com "no unique or exclusion
-- constraint matching the ON CONFLICT specification". Constraint normal
-- funciona porque múltiplos NULL nunca conflitam entre si no Postgres —
-- confirmado em teste (transação com ROLLBACK) antes de aplicar: inserts sem
-- client_op_id (app 1.0.11) continuam funcionando, RLS de insert continua
-- valendo para o upsert, e a view clientes_com_saldo não é afetada.

alter table public.pagamentos add column if not exists client_op_id uuid;
alter table public.pagamentos add constraint pagamentos_client_op_id_key unique (client_op_id);

alter table public.vendas add column if not exists client_op_id uuid;
alter table public.vendas add constraint vendas_client_op_id_key unique (client_op_id);

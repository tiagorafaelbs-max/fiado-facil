-- PROPOSTA -- NÃO APLICAR sem aprovação do Tiago.
--
-- Liga um perfil ao originalTransactionId da assinatura Apple. É a chave que
-- permite à nova function `apple-server-notifications` (App Store Server
-- Notifications V2) saber de QUEM é uma assinatura quando a Apple avisa que
-- ela expirou/falhou ao renovar/foi reembolsada -- a notificação da Apple só
-- traz o originalTransactionId, nunca o user_id do Supabase.
--
-- Único (parcial, ignora NULL): dois perfis nunca podem compartilhar a mesma
-- assinatura Apple: contas antigas ficam com NULL até a próxima compra/renovação
-- gravar o valor pela primeira vez (apple-iap-verify precisa ser atualizado
-- para popular esse campo -- mudança de código já pronta, publicar junto).
alter table public.perfis add column if not exists apple_original_transaction_id text;
create unique index if not exists perfis_apple_original_transaction_id_key
  on public.perfis (apple_original_transaction_id) where apple_original_transaction_id is not null;

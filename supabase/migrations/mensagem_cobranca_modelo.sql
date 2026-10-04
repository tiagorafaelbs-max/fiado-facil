-- Mensagem de cobrança personalizável (plano Pro)
--
-- O lojista Pro escreve um modelo com variáveis ({nome}, {valor}, {negocio}, {pix}, {vencimento})
-- em Configurações → Mensagem de cobrança. NULL = usa o texto padrão do app.
--
-- Segurança:
--  * Quem escreve em perfis continua sendo só o dono (policy perfil_proprio, auth.uid() = id).
--    O funcionário LÊ o modelo do dono pela policy perfis_leitura_equipe (id = tenant_id_atual()).
--  * Gravar um modelo fora do plano Pro é recusado pelo banco (trigger abaixo), não só pela tela;
--    INSERT já com modelo só pelo service_role.
--    Apagar o modelo (voltar ao padrão) é sempre permitido, inclusive depois de um downgrade.
--  * Limite de 1.000 caracteres no banco (a tela também limita).
--
-- Só adiciona uma coluna nula e um trigger: nenhuma linha existente é alterada e o app antigo
-- (builds 54/88 sem esta OTA) continua funcionando, pois não lê nem escreve a coluna.
-- Reversão: ver bloco no fim do arquivo.

alter table public.perfis
  add column if not exists mensagem_cobranca_modelo text;

alter table public.perfis
  drop constraint if exists perfis_mensagem_cobranca_modelo_tamanho;

alter table public.perfis
  add constraint perfis_mensagem_cobranca_modelo_tamanho
  check (mensagem_cobranca_modelo is null or char_length(mensagem_cobranca_modelo) between 1 and 1000);

create or replace function public.enforce_pro_mensagem_cobranca()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Só interessa quando o modelo foi definido/alterado para um texto (apagar = NULL, sempre liberado).
  if new.mensagem_cobranca_modelo is not null
     and (tg_op = 'INSERT' or new.mensagem_cobranca_modelo is distinct from old.mensagem_cobranca_modelo)
     and auth.role() is distinct from 'service_role'
     -- No UPDATE vale o plano ATUAL do banco (old): o plano não muda pelo cliente (enforce_pro_modules),
     -- então "plano = pro + modelo" na mesma requisição não burla a regra. No INSERT o plano vem do
     -- próprio cliente (enforce_pro_modules não o segura no INSERT), então não dá para confiar nele:
     -- INSERT com modelo só pelo service_role. O app só grava o modelo por UPDATE, com a linha já criada.
     and (tg_op = 'INSERT' or old.plano is distinct from 'pro')
  then
    raise exception 'Mensagem de cobrança personalizada é um recurso do plano Pro.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Função de trigger não precisa de EXECUTE para ninguém (padrão do projeto: revoga_execute_public_funcoes_sensiveis).
revoke all on function public.enforce_pro_mensagem_cobranca() from public, anon, authenticated;

drop trigger if exists trg_pro_mensagem_cobranca on public.perfis;
create trigger trg_pro_mensagem_cobranca
  before insert or update of mensagem_cobranca_modelo on public.perfis
  for each row execute function public.enforce_pro_mensagem_cobranca();

-- ── Reversão (não faz parte da migration) ──────────────────────────────────────────────
-- drop trigger if exists trg_pro_mensagem_cobranca on public.perfis;
-- drop function if exists public.enforce_pro_mensagem_cobranca();
-- alter table public.perfis drop constraint if exists perfis_mensagem_cobranca_modelo_tamanho;
-- alter table public.perfis drop column if exists mensagem_cobranca_modelo;

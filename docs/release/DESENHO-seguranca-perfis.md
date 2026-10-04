# Segurança: brecha "Pro de graça" em `perfis` (04/10)

Status: **APLICADA em 04/10/2026** (aprovada pelo Tiago) — `supabase/migrations/seguranca_perfis_sem_pro_gratis.sql`. Os 3 roteiros de conferência passaram (ver abaixo).

## A brecha
- `enforce_pro_modules` só segura a troca de `plano` no UPDATE; no INSERT aceita `plano = 'pro'`.
- A policy `perfil_proprio` é FOR ALL: o usuário pode DELETE no próprio perfil e INSERT de novo já como Pro.
- Nenhuma tabela depende de `perfis` em cascata (a única FK é `perfis.id → auth.users`), então o ataque não custa nada.
- Conferido no banco (só leitura): `authenticated` tem privilégio DELETE em `perfis`; o único trigger de `perfis` é `trg_enforce_pro_modules`; o cadastro cria o perfil pelo trigger `handle_new_user` (insere sem `plano`, ou seja, gratuito).

## A correção (3 camadas, em 1 migration curta)
1. Policies separadas: `perfis_select_proprio`, `perfis_insert_proprio`, `perfis_update_proprio` (todas `auth.uid() = id`; UPDATE também com `WITH CHECK`). **Sem DELETE.** `perfis_leitura_equipe` (funcionário lê o perfil do dono) não muda.
2. `REVOKE DELETE ON perfis FROM authenticated` (mesmo se alguém recriar uma policy ampla, não apaga).
3. `enforce_pro_modules`: INSERT feito por quem não é `service_role` entra sempre como `'gratuito'`. O resto da função é idêntico à versão aplicada em 11/09.

## Conferências que fiz (leitura do código e do banco)
- **Exclusão de conta** continua funcionando: a edge function `delete-account` usa `service_role` e o `ON DELETE CASCADE` de `auth.users` roda como dono da tabela (não depende do privilégio revogado).
- **Webhooks e `apple-iap-verify`** (`service_role`) viram Pro por UPDATE: `auth.role() = 'service_role'` segue liberando a troca de plano. `sync_perfil_plano` (SECURITY DEFINER) também só faz UPDATE.
- **Cadastro novo**: `handle_new_user` insere sem plano (gratuito); a regra nova não muda nada.
- **Upsert de `configuracoes.tsx` (~linha 106)** — `INSERT … ON CONFLICT (id) DO UPDATE` com `id, nome_negocio, telefone, chave_pix, dia_cobranca, notificacoes_ativas, cobranca_auto_tipo`: perfil existente cai no caminho de UPDATE, que só altera as colunas enviadas (nunca `plano`); o INSERT proposto é forçado a gratuito, mas isso não toca na linha existente. Dono Pro continua Pro. Perfil inexistente cria como gratuito. As demais escritas do app em `perfis` são todas UPDATE (`SetupModal`, `useModulos`, `useCategorias`, `useChecklistDia0`, notificações, mensagem e resumo da equipe) e passam pelas policies novas.
- Nenhum código do app apaga `perfis`.
- Testes de comportamento (3 roteiros curtos, cada um termina em `ROLLBACK`) estão no fim da migration, para rodar logo depois de aplicar. **Não fiz teste de DDL no banco de produção** (derrubar/criar policy toma lock em `perfis`).

## Conferência pós-aplicação (04/10, transações revertidas)
1. Usuário sem perfil inserindo `plano='pro'` → entrou como **gratuito**, módulos Pro em false. OK
2. Dono gratuito tentando `DELETE` do próprio perfil → **permission denied**. OK
3. Upsert de Configurações de um dono Pro → continua **pro**, módulos Pro intactos. OK
Estado: 243 perfis / 32 Pro antes e depois; policies = insert/select/update próprios + leitura_equipe; `authenticated` sem DELETE; trigger e função com o bloco novo; EXECUTE da função segue revogado.

## Auditoria (d): quem já pode ter usado a brecha
Resultado em 04/10 (só leitura):

| | Contas |
|---|---|
| Plano `pro` no total | 32 |
| Pro com `apple_original_transaction_id` (compra Apple) | 9 |
| Pro com assinatura ativa em `subscriptions` (Mercado Pago) | **0** |
| Pro **sem nenhuma origem comprovável no banco** | **23** |

- **A tabela `subscriptions` está vazia** (0 linhas, nem as 9 contas Apple aparecem). O `mercadopago-webhook` grava lá em "best effort" e muda o `plano` em `perfis` direto, então **quem pagou pelo Mercado Pago não deixa rastro no banco**. Por isso a consulta "Pro sem Apple e sem assinatura MP" não separa pagantes de quem usou a brecha: os 23 precisam ser conferidos com o painel do Mercado Pago (e com a sua lista de Pro dado à mão).
- **Sinal de recriação do perfil** (DELETE + INSERT dá `perfis.criado_em` bem depois de `auth.users.created_at`): nenhuma das 23 contas tem perfil criado com atraso relevante após a conta, **exceto "Vendas Felipe" (`f285fa46-e323-47a6-977a-0307c469026d`, perfil 17 min depois da conta, 31/08, antes do fix de 11/09 do UPDATE)**. As outras 22 têm diferença de 0 min — o que não prova nada se alguém rodou um script segundos depois do cadastro. Não há cliente mais antigo que o perfil em nenhuma delas.
- Pelo nome, duas parecem suas ("Tiago Store" e "Lanconhete Tia Leda"); as demais só você sabe se são Pro dado à mão ou pagantes do Mercado Pago.

Lista das 23 (id · negócio · criado · clientes/vendas) — para cruzar com Mercado Pago:
`06a90188` Lanconhete Tia Leda · 13/06 · 15/36 — `14725575` Erika Soares · 28/07 · 12/25 — `b9e2c151` Amorelliestilo · 31/08 · 20/53 — `f285fa46` Vendas Felipe · 31/08 · 90/147 — `19a4cd89` Tiago Store · 06/09 · 111/132 — `99afd609` JF Stores · 06/09 · 16/77 — `7a7d7190` Temperos Da Thay · 10/09 · 13/13 — `4e10e7f9` GS · 11/09 · 12/17 — `b25b0d45` Breno Importss · 11/09 · 11/34 — `4df7b900` Paula fitness · 13/09 · 55/89 — `3bdae208` Novo Orizonte · 13/09 · 1/1 — `3f007836` Secrets Woman · 13/09 · 0/0 — `cd4df967` TammyPratas · 15/09 · 57/57 — `ecc6b3c1` Josi Enxovais · 16/09 · 15/11 — `60495e83` E e G · 18/09 · 25/52 — `4cbc9bc8` Loja Medina · 20/09 · 49/125 — `b4577643` Plantão do Pastel · 22/09 · 41/182 — `8d5272ca` Bela Donna Joias · 24/09 · 42/63 — `81c69d6e` Cantina Do Tio Yan · 25/09 · 111/345 — `1b6ae285` Mimos Da Suely · 25/09 · 134/140 — `ce743e2f` DMW Áurea Perfumaria · 26/09 · 29/101 — `3217346c` Thai Docinhos · 29/09 · 35/42 — `98b5ad6c` SUNFLOWER · 29/09 · 71/184.

Consulta para repetir (painel Supabase):
```sql
select p.id, p.nome_negocio, p.criado_em::date, round(extract(epoch from (p.criado_em - u.created_at))/60) as min_apos_conta
from public.perfis p join auth.users u on u.id = p.id
where p.plano = 'pro' and p.apple_original_transaction_id is null
  and not exists (select 1 from public.active_subscriptions s where s.user_id = p.id)
order by p.criado_em;
```

**Esclarecimento do Tiago (04/10):** as 23 Pro sem origem batem com assinaturas Apple compradas antes do 1.0.12 — o App Store Connect mostra 27 assinaturas ativas pagas e só 9 têm `apple_original_transaction_id` no banco. Não investigar agora. **Repetir a consulta acima depois que o 1.0.12 for adotado** (o app novo vincula a compra) e comparar.

## Mesma família, fora desta migration (próximo pacote)
- `apple_original_transaction_id` é gravável pelo app (índice único parcial já existe): um usuário que soubesse o ID de transação de outro assinante poderia ocupar o vínculo. Exige conhecer o ID, mas vale travar igual ao `plano` (UPDATE reverte, INSERT zera, fora do `service_role`).
- `wpp_cobrado_mes` / `wpp_mes_ref` são graváveis pelo app: dá para zerar o próprio contador do plano grátis (10 cobranças/mês) por UPDATE direto, contornando a RPC que valida o plano no servidor.
- Solução geral: grant de UPDATE **por coluna** para `authenticated` (só as colunas que o app edita). É mais forte, mas exige lembrar de liberar cada coluna nova — por isso deixei fora do pacote.

## Pacote seguinte: GRANT por coluna + contador de WhatsApp — APLICADO em 04/10 (aprovado pelo Tiago)
Migration `seguranca_perfis_colunas_e_contador_wpp.sql`. Antes de aplicar, rodei a migration inteira + roteiros numa transação revertida; todos passaram: UPDATE de plano, wpp_cobrado_mes, wpp_mes_ref, apple_original_transaction_id e criado_em negado; INSERT com plano, wpp ou apple negado; upsert exato do PostgREST (com SET id = excluded.id), colunas liberadas e SetupModal funcionando (dono Pro continua Pro); usuário de outra loja chamando o contador com o id da vítima não altera o contador dela; funcionário usa o contador do dono; service_role segue trocando o plano. Pós-aplicação conferido por has_column_privilege (plano/wpp/apple = false; mensagem/resumo = true; SELECT intacto; ACL das funções igual). Reversão no fim do arquivo da migration.

## Ordem de aplicação (já decidida)
0 `seguranca_perfis_sem_pro_gratis` → 1 `mensagem_cobranca_modelo` → 2 `dispositivos_app_e_versao_minima` → 3 `equipe_autoria_confiavel_e_resumo` → OTA (fingerprints `61a2955d…` / `3ae31820…`). Só depois da sua aprovação desta migration.

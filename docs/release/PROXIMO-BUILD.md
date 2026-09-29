# Lote do próximo build — FiadoApp

> Política (protocolo da Fábrica, §8.1): acumular mudanças aprovadas e só pedir build ao Tiago quando o lote for relevante, tiver mudança nativa ou houver bug crítico.
> **Este lote TEM mudança nativa (`runtimeVersion`)**: as correções abaixo só chegam aos usuários por um novo `eas build`. OTAs publicados depois desta mudança não alcançam os builds antigos (runtime 1.0.0).

## Itens no lote (todos validados pelo Agente Fiscal · `tsc` com 0 erros no app)

| # | Data | Mudança | Arquivos | Tipo |
|---|---|---|---|---|
| 1 | 22/09 | Filtro explícito por comerciante (`usuario_id`) na busca, no contador do painel e nas notificações — segunda camada após o incidente de 16/09 | `app/busca.tsx`, `app/(tabs)/index.tsx`, `hooks/useNotificacoes.ts` | JS · segurança |
| 2 | 22/09 | Filtro `usuario_id` também nas leituras, edições e exclusões por `id` | `app/cliente/[id].tsx`, `app/novo-pagamento.tsx`, `app/(tabs)/nova-venda.tsx`, `hooks/useClientes.ts`, `hooks/useVendas.ts` | JS · segurança |
| 3 | 22/09 | Tela do cliente recarrega quando o login termina de carregar (antes podia ficar vazia com o filtro novo) | `app/cliente/[id].tsx` | JS · correção |
| 4 | 22/09 | Editar pagamento mostra o erro em vez de fechar como se tivesse salvo | `app/cliente/[id].tsx` | JS · correção |
| 5 | 22/09 | Notificação "cliente sumido" passa a funcionar (consultava coluna inexistente: 117 erros 400/dia em produção). **Comportamento novo para o usuário:** notificação de sábado 10h com até 3 clientes sem compra há 5+ dias | `hooks/useNotificacoes.ts` | JS · correção |
| 6 | 22/09 | Erro de TypeScript em `planos.tsx` (mesma lógica) | `app/planos.tsx` | JS |
| 7 | 22/09 | `runtimeVersion` → `{ "policy": "fingerprint" }` | `app.json` | **Nativo** |
| 8 | 25/09 | Habilita R8/ProGuard (minify) e shrink de recursos no Android — Play Console avisou ofuscação em só 2% (recomendado 25%+, prazo Google fev/2027) | `app.json`, `package.json`, `package-lock.json` | **Nativo** |
| 9 | 26/09 | **Equipe & Funcionários**: dono Pro convida até 2 funcionários com login próprio (e-mail/senha), operando sobre os mesmos dados do negócio; toda venda/pagamento fica marcado com quem registrou; permissões de excluir/editar venda por funcionário, reforçadas no banco (trigger), não só na tela | migration `equipe_e_multiusuario.sql`, `lib/tenant.ts`, `hooks/useTenant.ts` (novos), `app/equipe.tsx` (tela real, antes placeholder), edge function `convidar-funcionario`, + ~15 arquivos (`useVendas`, `useClientes`, `useDashboard`, `useNotificacoes`, `useModulos`, `useCategorias`, telas de clientes/relatórios/cobranças/nova-venda/configurações/ranking/busca) ajustados para resolver o tenant certo | JS + banco + edge function |
| 10 | 26/09 | Corrige o total do extrato de cobrança no WhatsApp — passa a usar o saldo real da view (FIFO) em vez de somar vendas em aberto, evitando divergência em pagamentos parciais | `lib/whatsapp.ts` | JS · correção |
| 11 | 26/09 | Pagamento agora funciona offline (fila local, sincroniza e reconcilia automaticamente ao reconectar) — mesma lógica que já existia para venda nova; de brinde, corrige uma lacuna onde venda offline nunca era reconciliada após sincronizar | `hooks/useVendas.ts`, `hooks/useOffline.ts`, `lib/reconciliacao.ts` (novo) | JS |
| 12 | 26/09 | Botão de olho pra ocultar/mostrar o saldo total no dashboard (preferência salva no aparelho) | `app/(tabs)/index.tsx` | JS |
| 13 | 26/09 | Botão "Sugestões e reclamações": trocado de e-mail (falha silenciosa sem app configurado) para WhatsApp, com e-mail como fallback | `app/(tabs)/configuracoes.tsx` | JS |

## Lote 29/09 — fecha lacunas do Urgente 2 + delay de ativação Apple + checklist dia 0

Decisão do Tiago (29/09) sobre o relatório da Growth Fase 1: aprovou o pacote com 3 correções obrigatórias antes de publicar `apple-server-notifications`, mais uma investigação de incidente real e o checklist do item 6.

| # | Mudança | Arquivos | Tipo |
|---|---|---|---|
| 14 | **Item 1a** — backfill silencioso: ao abrir o app e ao voltar à tela de planos, se não há `apple_original_transaction_id` vinculado (ou o vínculo ainda não existe), verifica `getAvailablePurchases()` e reenvia pro `apple-iap-verify` sem alertar o usuário. Cobre os assinantes atuais sem o vínculo. | `lib/appleIAP.ts` (novo), `app/_layout.tsx` (`AppleBackfillListener`), `app/planos.tsx` (`useFocusEffect`) | JS |
| 15 | **Item 1b** — `appAccountToken` (UUID do usuário) enviado em todo `requestPurchase` novo; `apple-server-notifications` casa primeiro por `apple_original_transaction_id` e, se não achar, por `appAccountToken` — e já grava o vínculo pra não precisar do fallback de novo | `app/planos.tsx`, `supabase/functions/apple-server-notifications/index.ts` | JS + edge function (não publicada) |
| 16 | **Item 1c** — evento que não bate com nenhum perfil (nem por transação, nem por token) vai pra tabela `apple_eventos_nao_conciliados` (sem dado pessoal) em vez de só ficar no log | migration `apple_eventos_nao_conciliados.sql`, `supabase/functions/apple-server-notifications/index.ts` | banco (não aplicada) + edge function (não publicada) |
| 17 | **Item 2** — investigado o atraso de 1h16 na compra de 29/09: o fluxo depende só do `purchaseUpdatedListener` disparar; se o app fechar entre a compra e o evento (ou o StoreKit demorar pra resolver), a ativação fica presa até o usuário lembrar de "Restaurar compras". Mitigado com: retentativa automática (3x, backoff) na chamada ao `apple-iap-verify`, e reaproveitando o mecanismo do item 1a (verifica compra pendente ao abrir o app / voltar aos planos) pra pegar o caso em que o listener nunca disparou. Não elimina 100% (StoreKit pode legitimamente demorar em compras que pedem autenticação extra), mas fecha o caso de o evento ser perdido de vez. | `lib/appleIAP.ts`, `app/planos.tsx` | JS |
| 18 | Banner "Pagamento confirmado, ativando seu Pro…" durante a chamada ao backend após a compra | `app/planos.tsx` | JS |
| 19 | **Item 6 (aprovado)** — checklist "1º cliente · 1ª venda · 2º cliente · 2ª venda" no dashboard, visível só nos 2 primeiros dias da conta, dispensável, some sozinho quando completo. `checklist_dia0_completado_em` grava quando (e de qual conta) completou, pra medir ativação | migration `checklist_dia0.sql`, `hooks/useChecklistDia0.ts` (novo), `components/ui/ChecklistDia0.tsx` (novo), `app/(tabs)/index.tsx` | JS + banco (não aplicada) |

**Ordem de publicação do Urgente 2 — CONCLUÍDA em 29/09:**
1. ✅ `apple_original_transaction_id.sql` — aplicada
2. ✅ `apple_eventos_nao_conciliados.sql` — aplicada
3. ✅ `apple-iap-verify` — publicada (versão com gravação de `apple_original_transaction_id`)
4. ✅ `apple-server-notifications` — publicada pelo Tiago com `--no-verify-jwt` (a Apple não manda JWT)

**Fixado em `supabase/config.toml`:** `[functions.apple-server-notifications] verify_jwt = false` — sem isso, um `supabase functions deploy apple-server-notifications` futuro sem lembrar da flag `--no-verify-jwt` republicaria com `verify_jwt = true` (padrão) e quebraria silenciosamente o recebimento de notificações da Apple (401, sem retry infinito da Apple). O comando correto a partir de agora, com o config.toml valendo:
```
npx supabase functions deploy apple-server-notifications --project-ref eyipcpwmwtajrywouxub
```
(sem precisar mais da flag manual).

## Já aplicado no servidor (edge functions — não depende de build do app)
- 26/09: **Vulnerabilidade crítica corrigida** em `apple-iap-verify` — recibos JWS (StoreKit 2) não validavam a cadeia de certificado até a Root CA da Apple, permitindo forjar um recibo e ganhar Pro sem pagar. Corrigido com validação de cadeia completa (`@peculiar/x509`), testado localmente com ataque simulado antes do deploy. **Correção do relatório de 26/09:** o caso "Mimos Da Suely" (Oseas) NÃO foi exploração da falha — é cliente legítimo (sessão do app oficial, 127 clientes/129 vendas lançados, contatou o suporte). Decisão do Tiago: manter o Pro dela, não alterar nada.
- 26/09: **Bug crítico corrigido** em `subscribe`/`mercadopago-webhook` — o `notification_url` apontava para `mp-webhook`, que tem o HMAC fora do formato oficial do MP e rejeitava toda notificação real com 401. Revertido para `mercadopago-webhook` (formato correto). Pagamentos Android via MP não estavam ativando o Pro até esta correção. Também corrigido `plan_id` sempre gravado como mensal mesmo em assinaturas anuais.
- Validado pelo Agente Fiscal (leitura de código/banco) antes do deploy. As 3 functions já estão publicadas em produção.

## Já aplicado no banco (não depende de build)
- 22/09: `supabase/migrations/revoga_privilegios_anon_tabelas.sql`: o papel `anon` perdeu todos os privilégios nas tabelas e views, e as tabelas futuras nascem sem privilégio para `anon`. Verificado: usuários logados seguem normais, e as edge functions usam a service role.
- 26/09: `supabase/migrations/equipe_e_multiusuario.sql`: tabela `membros_equipe`, função `tenant_id_atual()`, RLS de `clientes`/`vendas`/`pagamentos`/`perfis` atualizada para resolver dono vs. funcionário, coluna `criado_por` em `vendas`/`pagamentos`, trigger de permissões em `vendas`. Validado em 2 rodadas pelo Agente Fiscal direto contra o banco real (não regressão confirmada para as contas sem equipe). **Falta publicar a edge function `convidar-funcionario`** — bloqueada pelo classificador do Claude Code, precisa rodar manualmente: `npx supabase functions deploy convidar-funcionario --project-ref eyipcpwmwtajrywouxub`.
- 26/09: `supabase/migrations/idempotencia_fila_offline.sql`: coluna `client_op_id` + constraint única em `vendas`/`pagamentos`, fecha o risco de duplicata na fila offline (ver detalhes na seção do achado abaixo). Testado em transação com ROLLBACK e validado 2x (eu + Fiscal) antes de aplicar.

## Metadados do App Store Connect (fazer ao abrir a próxima versão, antes de enviar para revisão)
- **URL da Política de Privacidade** está desatualizada: Distribuição → Privacidade do app → Política de privacidade → `https://rcsolucoes.github.io/fiado-facil/privacy` (domínio antigo) → trocar para `https://fiadoapp.app.br/privacidade`. Campo está congelado na 1.0.11 (já "Pronto para distribuição"), só libera dentro de uma versão nova. Backlink de alta autoridade apontando pro lugar errado — afeta SEO além de credibilidade.
- **Idioma dos metadados**: trocar de Português (Portugal) para Português (Brasil) como principal.

## Checklist de teste em Android real com R8 ligado (fazer antes de publicar o 1.0.12)
1. Login e cadastro de novo usuário
2. Cadastro de cliente e registro de venda nova
3. Exportação de relatório em PDF
4. Envio de cobrança/extrato pelo WhatsApp
5. **Fluxo Mercado Pago de ponta a ponta**: criar preferência (`subscribe`) → pagar → voltar ao app → confirmar que `mercadopago-webhook` recebeu a notificação → `perfis.plano` virou `'pro'` no banco. Prioridade alta — é o fluxo que estava quebrado até hoje.
6. **Pagamento offline**: modo avião → lançar pagamento → voltar internet → confirmar que aparece UMA vez e o saldo fica certo. Proteção de idempotência já aplicada (ver seção abaixo) — este teste agora é confirmação, não investigação de risco aberto.
7. **Pagamento offline + fechar o app antes de sincronizar** → reabrir com internet → confirmar que sincroniza uma vez só.
8. **Equipe**: convidar funcionário, entrar como funcionário, conferir isolamento (só vê dados do próprio dono) e permissões de editar/excluir venda. Depende da edge function `convidar-funcionario` estar publicada — fica para depois do lançamento (publica junto, conforme decidido).
9. **Ocultar saldo**: liga/desliga no dashboard, fecha e reabre o app, confirma que a preferência persiste.
10. **Sugestões via WhatsApp**: botão em Configurações abre o WhatsApp com a mensagem certa.
11. **Android com R8**: app abre, nenhuma tela quebrada, compra/assinatura via Mercado Pago funciona de ponta a ponta.
12. **iOS**: compra do plano mensal em sandbox (roteiro já documentado) com o app 1.0.12.
13. **Atualização 1.0.11 → 1.0.12** num aparelho com o app já instalado: login mantido, dados intactos, nada pendente na fila offline se perde.
14. **Backfill Apple (item 1a)**: conta iOS com Pro ativo, sem `apple_original_transaction_id` (simular limpando a coluna), abrir o app → confirmar que o campo é preenchido sozinho sem nenhum alerta aparecer.
15. **Checklist dia 0**: conta nova, cadastrar 1 cliente e 1 venda → checklist mostra 2/4 feitos; completar os 4 → card some sozinho; dispensar manualmente → não volta a aparecer mesmo sem completar.

## ⚠️ Achado da revisão de hoje — pagamento offline sem proteção contra duplicata (BLOQUEIA item 6 acima)

**O problema:** nem `pagamentos` nem `vendas` têm qualquer chave de idempotência. Quando `sincronizarFila()` (`hooks/useOffline.ts`) tenta reenviar uma operação da fila, o único critério de "falhou, tentar de novo" é a promise do `insert()` rejeitar — o que acontece tanto quando a operação nunca chegou ao servidor quanto quando ela chegou, foi processada com sucesso, mas a confirmação de rede se perdeu no caminho de volta (queda de conexão logo após o commit, app fechado no meio, etc.). Nesses casos, o próximo sync reenvia o mesmo pagamento e cria um **segundo registro idêntico** — o saldo do cliente fica errado (parece que ele pagou mais do que pagou), e como o comerciante lançando duas vezes de propósito o mesmo valor é um caso legítimo que não pode virar falso positivo, não dá para "adivinhar" duplicata comparando os valores depois.

**Isso não é regressão só do pagamento offline de hoje** — o mesmo padrão já existe desde que a fila de venda offline foi criada (antes desta sessão); hoje eu estendi o mesmo mecanismo pra pagamento, então o mesmo risco passou a valer pros dois casos.

**RESOLVIDO (26/09) — migration `idempotencia_fila_offline.sql` aplicada em produção.** Decisão do Tiago: corrigir antes do build, ficando com a recomendação do Fiscal. O Tiago também corrigiu um erro na proposta original: índice único **parcial** (`where client_op_id is not null`) não é inferido pelo `ON CONFLICT (client_op_id)` que o supabase-js gera — quebraria toda sincronização offline. A migration final usa constraint única **normal**, que funciona porque múltiplos `NULL` nunca conflitam entre si no Postgres.

```sql
alter table public.pagamentos add column if not exists client_op_id uuid;
alter table public.pagamentos add constraint pagamentos_client_op_id_key unique (client_op_id);

alter table public.vendas add column if not exists client_op_id uuid;
alter table public.vendas add constraint vendas_client_op_id_key unique (client_op_id);
```

Testado em transação com ROLLBACK antes de aplicar (dedupe funciona, `NULL`s coexistem, RLS de insert continua valendo com o upsert, view `clientes_com_saldo` intacta) — validado de forma independente 2x (eu + Agente Fiscal, cada um rodando os testes do zero).

**Código:** `lib/uuid.ts` (novo — gera UUID v4 com `Math.random()`, sem depender de `crypto.randomUUID()`, que não é garantido em React Native/Hermes sem polyfill e o projeto não tem `expo-crypto`/`uuid` instalado). `hooks/useVendas.ts` (`criar`/`registrarPagamento` geram `client_op_id` uma vez por chamada). `hooks/useOffline.ts` (`sincronizarFila` usa `upsert(..., { onConflict: 'client_op_id', ignoreDuplicates: true })` em vez de `insert`).

## Planos preparados — NÃO executar sem aprovação explícita do Tiago

### Apagar `mp-webhook` (depois que o Tiago confirmar o painel do MP)
1. Abrir painel do Mercado Pago → Suas integrações → Webhooks e conferir qual URL está cadastrada como notificação oficial da conta.
2. Se `mercadopago-webhook` for a única em uso (nenhuma preapproval antiga ainda aponta pro `mp-webhook`), apagar a function: `npx supabase functions delete mp-webhook --project-ref eyipcpwmwtajrywouxub`.
3. Confirmar que nenhum log novo aparece em `mp-webhook` por pelo menos 7 dias antes de apagar, pra garantir que nenhuma assinatura antiga ainda notifica pra lá.

### Remover RevenueCat por completo (ciclo próprio)
Arquivos a tocar:
- `app/_layout.tsx`: remover `initRevenueCat(session.user.id)` e `Purchases.logIn`/`Purchases.logOut`
- `hooks/useSubscription.ts`: remover o hook inteiro (não usado por nenhuma tela)
- `supabase/functions/revenuecat-webhook/`: remover a function
- View `active_subscriptions` no banco (migration de remoção)
- `package.json`: remover dependência do SDK nativo da RevenueCat
- Painel RevenueCat: Tiago precisa desativar o webhook lá e revogar a API key usada pelo app
- Validar com Fiscal que `useModulos.ts`/`perfis.plano` continuam sendo a única fonte de verdade após a remoção (já são hoje — a remoção não muda gating nenhum, só tira código morto e uma superfície de risco)

### Google Play Billing — plano técnico e estimativa (Tiago vai implementar antes de anunciar Android)
- Já existe o padrão de SKU usado no iOS via `react-native-iap`: `com.fiadofacil.app.pro.monthly` / `.annual`. Replicar os mesmos IDs de produto no Google Play Console.
- Implementar compra via `react-native-iap` no Android (a lib já é usada no projeto, só falta o fluxo Android — hoje só iOS usa IAP, Android usa só Mercado Pago).
- Verificação server-side: nova edge function (ou extensão de `apple-iap-verify` para um `google-play-verify`) usando a Google Play Developer API (`purchases.subscriptions.get`) com uma service account do Google Cloud.
- Convivência com Mercado Pago: aderir ao programa "User Choice Billing" do Google (exige oferecer as duas opções lado a lado, não substituir o MP).
- Estimativa: 3-5 dias de trabalho (fluxo de compra Android + edge function de verificação + testes de sandbox no Google Play Console + ajuste de UI pra oferecer as duas opções de pagamento).

## Lote 29/09 (2) — bloqueante da fila offline corrigido antes do build

**O problema (achado do Tiago):** `useOffline()` está montado em 4 telas (`index`, `nova-venda`, `cliente/[id]`, `configuracoes`). Cada uma dispara `sincronizarFila()` ao ficar online → várias sincronizações concorrentes processando a mesma fila. Pior: `sincronizarFila` lia a fila, processava (com `await` de rede no meio) e no final fazia `setItem(restantes)` a partir do snapshot do início — qualquer operação enfileirada **durante** a sincronização (ex: usuário lança uma venda nova enquanto o app ainda está sincronizando o que estava pendente) era sobrescrita e **perdida** nesse `setItem` final.

**Corrigido em `hooks/useOffline.ts` (v1):**
- (a) Trava global (`comTravaDaFila`, uma fila de promises) — uma sincronização por vez no app inteiro; chamadas concorrentes de `sincronizarFila()` recebem a mesma promise em vez de rodar em paralelo.
- (b) `sincronizarFila` agora relê a fila atual no final e remove só os ids que sincronizaram com sucesso (`idsSincronizados`), em vez de sobrescrever com o snapshot do início — preserva tanto o que falhou quanto o que entrou no meio.
- (c) `enfileirarOperacao` passa pela mesma trava — leitura+escrita da fila nunca intercala com a sincronização nem com outro enfileiramento concorrente.

**Ajuste (v2, mesmo dia, achado do Fiscal/Tiago revisando o commit da v1):** a trava da v1 cobria a sincronização INTEIRA, inclusive as chamadas de rede — um `enfileirarOperacao()` durante uma sincronização ficava esperando a rede terminar, e com conexão ruim o "Salvar" de uma venda offline podia travar dezenas de segundos ou indefinidamente (`fetch` sem timeout). Corrigido:
- A trava agora cobre só as duas seções que de fato leem+escrevem no AsyncStorage (o `enfileirar` inteiro, e a releitura+remoção final da sincronização) — as chamadas ao Supabase durante o loop de processamento ficam **fora** da trava.
- Timeout de 15s por requisição (`abortSignal`) em cada `upsert`/`update`/`delete` da sincronização — antes não tinha nenhum, uma operação podia ficar pendurada indefinidamente numa rede ruim.
- `try/catch` ao redor de `sincronizarFila()` em `useOffline()` (observação do Fiscal na v1) — não deixa mais uma falha inesperada virar promise rejeitada sem dono.

Testado com simulação isolada: sincronização de 4s de rede simulada + `enfileirarOperacao()` disparado no meio → responde em ~0ms (não espera a rede), e a fila final preserva corretamente o que entrou durante a sincronização. `tsc` 0 erros.

## Lote 29/09 (3) — Equipe: funcionário editava/apagava tudo (mudança de plano: Equipe entra no 1.0.12)

**Achado do Tiago:** as policies de `clientes`/`vendas`/`pagamentos` são `FOR ALL` por tenant — qualquer funcionário ativo edita ou apaga qualquer venda, pagamento ou cliente do negócio, mesmo lançado por outra pessoa há meses. O trigger `checar_permissao_venda_trigger` (existente) só checa a flag `editar_venda`/`excluir_venda` em `vendas`, não tem a exigência de autoria/mesmo dia, e **`pagamentos` não tem nenhuma checagem** — funcionário edita/apaga qualquer pagamento livremente.

**Migration `equipe_permissoes_granulares.sql` — APLICADA em produção em 29/09** (0 membros ativos em `membros_equipe` no momento da aplicação → nenhum usuário real afetado; dono ficou equivalente ao comportamento anterior). Confirmado no banco: as policies antigas (`clientes_tenant`, `vendas_tenant`, `pagamentos_tenant`) sumiram, as 14 novas existem, e o trigger/função antigos (`checar_permissao_venda_trigger`/`checar_permissao_venda()`) foram removidos. Revisão do Fiscal: reprovou a primeira versão (o `WITH CHECK` do UPDATE de funcionário não impedia adiantar `criado_em` pra reabrir a janela de edição — corrigido repetindo a checagem de mesmo dia também no `WITH CHECK`), aprovou a versão corrigida.
- `tem_permissao(chave text)`: função `SECURITY DEFINER`, `search_path` fixo, sem `EXECUTE` pra `anon`, lê `membros_equipe.permissoes` do membro ativo.
- `clientes`: SELECT/INSERT por tenant (como hoje); UPDATE/DELETE só `usuario_id = auth.uid()` — nunca funcionário.
- `vendas`/`pagamentos`: SELECT/INSERT por tenant; UPDATE do dono sem restrição; UPDATE do funcionário só com `tem_permissao('editar_venda')` **e** `criado_por = auth.uid()` **e** lançado no mesmo dia (fuso America/Sao_Paulo); DELETE do dono sem restrição; DELETE do funcionário só com `tem_permissao('excluir_venda')` (sem exigência de autoria/data, conforme pedido).
- Remove o trigger `checar_permissao_venda_trigger`/função `checar_permissao_venda()` — ficam redundantes: a nova RLS já é mais restritiva que o trigger em todos os casos que ele cobria.
- `perfis` (plano, chave Pix, dados do negócio) segue só do dono — já garantido pela policy `perfil_proprio` existente, nenhuma mudança necessária.

**App (feito, aguardando a migration pra fazer sentido de ponta a ponta):**
- `hooks/useVendas.ts`: `excluirVenda`/`editarVenda`/`excluirPagamento` agora usam `.select().maybeSingle()` e lançam erro claro se a RLS recusar — antes um bloqueio da RLS passava batido (0 linhas afetadas, sem erro, tela agia como se tivesse dado certo).
- `app/cliente/[id].tsx`: editar/excluir venda e pagamento só aparecem quando a RLS aceitaria (mesma regra espelhada no cliente: autoria + mesmo dia + permissão pra editar; só permissão pra excluir); editar/excluir cliente nunca aparece pra funcionário; "Registrado por {nome}" agora também em pagamentos (já existia em vendas).
- `app/(tabs)/clientes.tsx`: campo "Limite de crédito" some do formulário de novo cliente pra funcionário.
- `app/(tabs)/relatorios.tsx` + `app/(tabs)/_layout.tsx`: aba Relatórios escondida da tab bar (`href: null`) pra funcionário, com guard defensivo na própria tela.
- `app/cobrancas.tsx`: botão "Cobrar vencidos" (cobrança em massa) escondido pra funcionário.
- `app/planos.tsx`: tela inteira substituída por um aviso ("Assinatura gerenciada pelo dono") pra funcionário — centraliza a restrição num só lugar em vez de esconder cada botão que leva lá.
- `app/(tabs)/configuracoes.tsx`: botões "Editar" de Dados do negócio e Pix/Cobranças escondidos; "Exportar dados (CSV)" e "Excluir conta" escondidos; banner de upgrade escondido pra funcionário no plano gratuito. Card "Equipe & funcionários" já era escondido pra funcionário (feature anterior).

## Lote 29/09 (4) — bloqueante: reconciliação de `pago` quebrava com funcionário

**Achado do Tiago, ao revisar a migration aplicada:** `lib/reconciliacao.ts` fazia `UPDATE vendas.pago` diretamente do cliente, tocando vendas de **qualquer dia/autor** do cliente. Com a nova RLS de funcionário (só edita venda própria, do mesmo dia), esse update passou a ser recusado em silêncio pra vendas que não são do funcionário — uma venda antiga do dono, quitada por um pagamento que o funcionário registrou, ficava presa em `pago=false` e continuava aparecendo como "em aberto" em `cobrancas.tsx`, `useNotificacoes.ts`, painel, ranking, clientes e no extrato do WhatsApp. Risco real: cobrar de novo quem já pagou.

**Migration `reconciliar_pago_cliente_rpc.sql` — APLICADA em produção em 29/09.** Confirmado no banco: `prosecdef=true`, `search_path=public` fixo, `has_function_privilege('anon', ..., 'EXECUTE')=false`, `has_function_privilege('authenticated', ..., 'EXECUTE')=true`, e `proacl` sem entrada nenhuma pra `public`/`anon` (só `postgres`, `authenticated`, `service_role`).
- RPC `reconciliar_pago_cliente(p_cliente_id uuid)`: confere que o cliente pertence a `tenant_id_atual()` (senão lança exceção), recalcula FIFO na mesma ordem da view `clientes_com_saldo` (vencimento → data da venda → id), atualiza só a coluna `pago` num único `UPDATE ... FROM` atômico.

**App:**
- `lib/reconciliacao.ts`: `reconciliarPagoCliente(clienteId)` agora só chama a RPC via `supabase.rpc(...)` — perdeu o segundo parâmetro `uid` (a RPC deriva o tenant sozinha via `tenant_id_atual()`).
- `hooks/useVendas.ts` e `hooks/useOffline.ts`: os 6 call sites atualizados pra chamar com um argumento só; `clientesParaReconciliar` virou `Set<string>`.

**Testes via API direta (11/11 cenários OK)** — 3 contas de TESTE criadas/apagadas na hora (`*@fiadoapp-teste.invalid`, nunca conta de cliente real), chamando o REST/RPC do Supabase direto com o token de cada conta (não pela tela):

| # | Cenário | Esperado | Obtido |
|---|---|---|---|
| 1 | Funcionário registra pagamento que quita venda antiga do dono | venda fica `pago=true` | `insert=201, rpc=204, pago=true` ✅ |
| 2 | Pagamento excluído pelo dono | venda volta a `pago=false` | `delete=200 (1 linha), rpc=204, pago=false` ✅ |
| 3 | Funcionário edita venda de outro (do dono) | bloqueado | `0 linhas afetadas` ✅ |
| 4 | Funcionário edita venda própria de ontem | bloqueado | `0 linhas afetadas` ✅ |
| 5 | Funcionário edita venda própria de hoje (permissão ligada) | permitido | `1 linha afetada` ✅ |
| 6 | Mesmo cenário 5, com `editar_venda` desligado | bloqueado | `0 linhas afetadas` ✅ |
| 7 | Funcionário exclui cliente | bloqueado | `0 linhas afetadas` ✅ |
| 8 | Funcionário chama a RPC pra cliente de outra loja | erro | `400, "Cliente não encontrado ou não pertence ao seu negócio"` ✅ |
| 9 | Funcionário exclui venda de outro dia (`excluir_venda` ligado, sem exigir autoria/data) | permitido | `1 linha afetada` ✅ |
| 10 | Mesmo cenário 9, com `excluir_venda` desligado | bloqueado | `0 linhas afetadas` ✅ |
| 11 | Dono edita venda antiga e exclui o cliente de teste (sanity) | ambos permitidos | `1 linha cada` ✅ |

Contas de teste e todos os dados criados (cliente, vendas, pagamento, vínculo de equipe) apagados logo depois via `DELETE FROM auth.users` (cascade limpa o resto) — nada ficou em produção além do que já era esperado.

**Notas do Tiago, não bloqueantes, registradas pra depois:**
- INSERT de funcionário aceita `criado_por` de outra pessoa no payload — considerar exigir `criado_por = auth.uid()` também no `WITH CHECK` do INSERT de funcionário numa limpeza futura.
- `tenant_id_atual()` (função antiga, já em produção) não tem `REVOKE FROM PUBLIC` como as funções mais novas — impacto baixo (pra `anon`, `auth.uid()` é null), mas fica pra uma limpeza futura.
- Adicionar `raise exception` explícito na RPC `reconciliar_pago_cliente` se `tenant_id_atual()` vier nulo (hoje, se `v_tenant` for null, a comparação `v_dono_cliente <> v_tenant` já é null e o `if` entra por `v_dono_cliente is null` só se o cliente também não existir — vale um raise dedicado pra esse caso ficar explícito, não implícito).

Testes concluídos (tabela acima, 11/11 ✅) — usaram 3 contas de teste, não 2: além de dono + funcionário, uma terceira conta ("outro dono") foi necessária pra testar isolamento entre lojas de verdade (um cliente de tenant genuinamente não relacionado, não dava pra simular só com dono+funcionário). `convidar-funcionario` só publica no dia do lançamento, com aprovação do Tiago.

## Lote 29/09 (5) — convite de funcionário não funcionava

**Achado do Tiago, revisando antes de publicar `convidar-funcionario`:** `inviteUserByEmail(email)` era chamado sem `redirectTo` — o link do e-mail caía no Site URL padrão do projeto (não é o esquema do app), então o funcionário nunca conseguia abrir o FiadoApp pra criar a senha. Faltava também tratar `type=invite` no deep link (só `recovery` era tratado) e avisar o dono sobre abrir o e-mail no celular com o app instalado.

**Corrigido:**
- `supabase/functions/convidar-funcionario/index.ts` (ainda não publicada): `inviteUserByEmail(email, { redirectTo: 'fiadofacil://nova-senha', data: { nome_negocio } })` — mesmo `redirectTo` que `resetPasswordForEmail` já usa (`hooks/useAuth.ts`), então já está na allowlist de redirect URLs do projeto, sem precisar mexer no dashboard.
- `app/_layout.tsx` (`DeepLinkHandler`): trata `type === 'invite'` igual a `'recovery'` (nos dois fluxos, PKCE `code=` e implícito `#access_token=`), e passa `tipo` como param de rota pra `nova-senha`.
- `app/(auth)/nova-senha.tsx`: com `tipo=invite`, título vira "Crie sua senha para entrar no FiadoApp", texto do botão vira "Criar senha e entrar", e depois de salvar entra direto em `/(tabs)` como funcionário (a sessão já é válida desde o `setSession` do deep link — não precisa passar pelo login de novo). Sem o param (recovery normal), comportamento inalterado.
- `app/equipe.tsx`: aviso no formulário de convite e no alerta de sucesso — "abrir o e-mail no celular com o FiadoApp instalado" + checar spam.

**Pendente (só o Tiago pode fazer):** teste real no aparelho via TestFlight com e-mail de teste — convite → e-mail → toque no link no celular → cria senha → entra como funcionário → confere permissões. Também confirmar o comportamento esperado de abrir o link sem o app instalado (não funciona; o aviso do item acima cobre esse caso, mas vale conferir a mensagem de erro do navegador não fica confusa).

## Backlog 1.0.13 (não implementar agora — só registrar)
- Aviso de operação presa por permissão (funcionário desativado / outro usuário logado no aparelho) enquanto uma operação fica na fila offline sem conseguir sincronizar.
- Confirmação de pagamento repetido: mesmo cliente, mesmo valor, lançado por outra pessoa, nos últimos 30 minutos — hoje não há nenhum aviso, só a decisão consciente do comerciante evita duplicidade.
- Lixeira com restaurar (clientes/vendas/pagamentos excluídos ficam recuperáveis por um período antes de apagar de vez).
- Permissões finas por funcionário para relatórios, exportação e cobrança em massa (hoje é tudo-ou-nada: dono vê, funcionário não vê nada disso).

## Pendências fora do lote
- Foto de comprovante (`nova-venda.tsx:188`): o bucket `comprovantes` **não existe**, e o upload falha sem avisar. Se for ativar: bucket privado + URL assinada. Decisão de produto.
- Testes automatizados e lint: backlog de adequação (`docs/adequacao-fabrica.md`, a criar).
- Tela de Configurações continua visível/editável para funcionário mesmo sem efeito real (RLS bloqueia a escrita, mas a UI não esconde os campos) — cosmético, não bloqueante.
- Dois pagamentos offline seguidos pro mesmo cliente podem passar da checagem de saldo até sincronizar — janela estreita, sem perda de dado, mitigação futura possível.

## Antes de pedir o build ao Tiago
Checklist §8.1: lista do lote ✅ · typecheck ✅ · testes (o projeto ainda não tem) · E2E local (teste manual dos fluxos: busca, cliente, pagamento, desfazer venda, excluir cliente, **assinatura Android/IAP com o app minificado — prioridade alta por causa do item 8**) · versão proposta: **1.0.12** (iOS build 82 / Android vc 44) · plataformas: iOS + Android.

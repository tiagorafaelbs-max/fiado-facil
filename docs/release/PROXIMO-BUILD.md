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

## Lote 30/09 — bloqueantes achados no teste do build 50 (Android) — precisa de NOVO build (86/51)

**Achado do Tiago testando o build 50 real no Android:**

1. **`app/cliente/[id].tsx` em loading infinito.** O `useEffect` que carrega o cliente dependia de `[id, usuario?.id]`, mas `carregarCliente`/`carregarPagamentos` retornam cedo enquanto `tenantId` (resolvido de forma assíncrona por `useTenant()`) ainda não chegou — e como `tenantId` não estava nas dependências, o efeito nunca disparava de novo quando ele ficava disponível. A query pra `clientes_com_saldo` nunca era nem enviada (confirmado nos logs). **Corrigido:** dependências agora são `[id, tenantId]`; adicionado um timeout de 15s que mostra erro com "Tentar novamente" em vez de `ActivityIndicator` eterno. Varri as outras 12 telas/hooks que usam `useTenant()` procurando o mesmo padrão (efeito que não depende de `tenantId` enquanto a função que ele chama depende) — `cliente/[id].tsx` era o único caso; todas as outras já dependem de `tenantId` diretamente ou usam hooks (`useClientes`, `useDashboard`) que resolvem o tenant sozinhos por sessão, sem depender do estado externo do `useTenant()`.
2. **Offline mostrava estado vazio em vez de dados salvos.** `hooks/useClientes.ts` agora cacheia a última lista bem-sucedida no AsyncStorage e, se a busca falhar (sem conexão), mostra esse cache em vez de esvaziar a lista — e expõe um `offline: boolean` pra a tela avisar "Sem conexão — mostrando dados salvos" (ou "dados indisponíveis" se não há cache ainda). Aplicado em `app/(tabs)/clientes.tsx` (lista de clientes) e `app/novo-pagamento.tsx` (seletor de cliente pra registrar pagamento) — os dois lugares que o Tiago reportou mostrando "Nenhum cliente"/"nenhum cliente com saldo" mesmo offline com clientes reais cadastrados.
3. **Permissão de notificação pedida em toda venda, mesmo após "Não permitir".** `hooks/useNotificacoes.ts`: nova função `solicitarPermissaoNotificacoesUmaVez()` grava uma chave no AsyncStorage na primeira vez que pede (`solicitarPermissaoNotificacoes()`, usada por ela por baixo) e nunca insiste de novo automaticamente. `app/(tabs)/nova-venda.tsx` passou a chamar a versão "uma vez" depois de cada venda. O toggle explícito "Avisos de vencimento" em Configurações continua usando `solicitarPermissaoNotificacoes()` direto (ação explícita do usuário, sempre pode tentar de novo).

**Ajuste (achado do Fiscal revisando a correção acima):**
- Item 1: o botão "Tentar novamente" não rearmava o watchdog de 15s — `cliente`/`tenantId` não mudam ao tocar nele, então o `useEffect` do timeout não disparava de novo, e uma segunda falha de rede voltava a cair no `ActivityIndicator` eterno (o bug original, reintroduzido no caminho de retry). Corrigido com um contador `tentativa` incluído nas dependências dos dois `useEffect`s, incrementado pelo botão.
- Item 2: a chave de cache (`@fiado_clientes_cache`) era global, sem isolar por conta — um funcionário ou dono trocando de conta no mesmo aparelho e abrindo offline antes do primeiro `buscar()` bem-sucedido da nova sessão veria clientes da conta ANTERIOR, sem aviso de que eram de outra loja (vazamento de dado entre contas). Corrigido: a chave agora é `@fiado_clientes_cache:<user.id de quem está logado>` — cada conta tem seu próprio cache isolado.

**Este lote exige um build novo** (1.0.12, iOS build 86 / Android versionCode 51) — só com autorização do Tiago. O build 85/50 já enviado ao TestFlight/faixa internal tem esses 3 bugs.

## Lote 30/09 (2) — Android 51 falhou no build (fingerprint) + alinhamento mínimo de dependências

**O que aconteceu:** depois do build 86/51 ser autorizado e disparado, o **Android falhou** (`CONFIGURE_EXPO_UPDATES`, `"Runtime version calculated on local machine not equal to runtime version calculated during build"`). O **iOS 86 passou** e foi enviado ao TestFlight normalmente.

**Diagnóstico (só leitura, antes de qualquer mudança):**
- `eas fingerprint:compare --build-id <build Android>`: hash local e hash do build **idênticos** (`2909d347...`, 157 fontes, caminhos iguais). A divergência não é entre "meu upload" e "o build" — acontece **dentro do servidor**, na fase `CONFIGURE_EXPO_UPDATES`, entre o `@expo/fingerprint` (usado pelo `eas-cli`) e o plugin Gradle do `expo-updates` **instalado**, que recalcula o runtime version com sua própria lógica bundled.
- Hipótese do Tiago sobre `.easignore`/`.gitignore` não explicou ESTA falha (os ~157 arquivos hasheados pelo fingerprint não incluem nada dos arquivos soltos do projeto), **mas confirmou um problema de segurança real e independente**: com `.easignore` presente, o `.gitignore` é totalmente ignorado pra decidir o que sobe no build — e o `.easignore` antigo não excluía `.env` nem `google-service-account.json`.
- `expo-doctor`/`expo install --check` (só leitura): **18 pacotes desalinhados** da SDK 56, incluindo `expo` (56.0.11, esperado ~56.0.23) e `expo-updates` (56.0.22, esperado ~56.0.28) — a causa raiz real. `@expo/fingerprint` em si também estava desatualizado (0.19.4, a versão nova do `expo`/`@expo/cli` traz 0.19.10) — confirma que o algoritmo de fingerprint do lado do CLI tinha mudado desde a versão instalada.
- Confirmado: as variáveis `EXPO_PUBLIC_*` vêm do ambiente **"production" configurado na EAS**, não do `.env` local (log do build) — excluir `.env`/`google-service-account.json` do upload não quebra nada.

**Aplicado (aprovado pelo Tiago):**
- **`.easignore` reescrito**: agora espelha o `.gitignore` inteiro + mantém as exclusões de build que já existiam (`android/.gradle`, `ios/Pods`, `*.map`, etc.). Passa a excluir `node_modules/` por completo (antes só a subpasta `.cache`) — prática recomendada pela Expo; o servidor instala um `node_modules` limpo a partir do lockfile. Testado com a lib `ignore` (simulação local, sem precisar de um build real): `.env` e `google-service-account.json` confirmados excluídos do upload; `app/`, `package.json` etc. confirmados incluídos (nada essencial quebra).
- **Alinhamento MÍNIMO de dependências**: só `npx expo install expo expo-updates` (`expo` 56.0.11→56.0.23, `expo-updates` 56.0.22→56.0.28). Nada mais foi tocado — confirmei no diff do `package-lock.json` que nenhum dos pacotes que o Tiago pediu pra não tocar (`async-storage`, `gesture-handler`, `reanimated`, `worklets`, `expo-router`, `screens`, `safe-area-context`, `react-native`) mudou de versão; as ~100 entradas que mudaram no lockfile são só o `expo`/`expo-updates` em si, dependências diretas deles (`expo-asset`, `expo-constants`, `expo-file-system`, `expo-font`, `expo-modules-*`, `expo-server`) e ferramentas de build/CLI que nunca entram no app final (`@expo/cli`, `@expo/metro*`, `babel-*`, `lightningcss`).
- `expo-doctor` depois do alinhamento: caiu de 18 pacotes pra 14 — `expo`/`expo-updates` saíram da lista, como esperado. `tsc --noEmit`: 0 erros.

**Backlog (anotado, não implementado agora):** os outros 14 pacotes desalinhados ficam pra uma tarefa própria pós-lançamento — inclui 2 saltos de versão MAIOR (`@react-native-async-storage/async-storage` 3.1.1 instalado vs 2.2.0 esperado; `react-native-gesture-handler` 3.0.1 vs ~2.31.1 esperado) que merecem teste cuidadoso isolado, não misturado com outro lote. Também fora do lote: `app.json` tem `newArchEnabled` não reconhecido pelo schema do SDK atual; falta a peer dependency `expo-font` como dependência DIRETA (hoje só transitiva, exigida por `@expo/vector-icons`); `@react-navigation/native` instalado direto, incompatível com `expo-router` desde a SDK 56.

**Próximo passo:** com tudo validado (Fiscal + Tiago), um novo build pras duas plataformas (iOS 87 / Android 52) — só com autorização explícita, uma vez cada.

## Lote 01/10 — Android 52 falhou de novo (fingerprint) + regra nova: nunca builds em paralelo

**O que aconteceu:** iOS 87 e Android 52 foram disparados **em paralelo** (dois processos `eas-cli` rodando ao mesmo tempo, mesma pasta local). iOS 87 passou e foi pro TestFlight sem problema. **Android 52 falhou de novo**, mesmo erro de antes (`CONFIGURE_EXPO_UPDATES`, runtime version local ≠ build) — mesmo já com o `.easignore` corrigido e o alinhamento mínimo (`expo`/`expo-updates`) aplicados no lote anterior.

**Diagnóstico novo (o log desta vez trouxe o diff exato entre fingerprint local e o recalculado pela EAS, algo que o log do build 51 não tinha):**
1. Uma pasta `android` aparece como fonte nova **só do lado do servidor EAS** (motivo interno do `@expo/fingerprint`: `bareNativeDir`). No projeto local não existe pasta `android/` (confirmado antes, managed workflow). Hipótese: o build Android gera essa pasta via `expo prebuild` **antes** de recalcular o fingerprint no servidor, e esse recálculo passa a contar a pasta nativa como fonte — o fingerprint calculado localmente (antes do upload, sem prebuild) nunca viu isso. Pode ser um comportamento estrutural do `@expo/fingerprint` em projeto managed + Android + `runtimeVersion: fingerprint`, não dependente de versão de pacote.
2. A única outra diferença do diff: `expoConfig.ios.buildNumber` — local = `87`, lado EAS = `86`. Isso não devia nem importar pra um build Android. Explicação mais provável: os dois `eas-cli` (iOS e Android) escreveram no **mesmo `app.json` local ao mesmo tempo** (cada um bumpando seu próprio campo via `autoIncrement`) — condição de corrida entre os dois processos, não um problema de dependência nem do `.easignore`.

**Decisão do Tiago (01/10):**
- **Regra nova, permanente: nunca mais disparar `eas build` pra iOS e Android em paralelo.** Sempre sequencial — esperar um terminar (e comitar o autoincrement, deixando `app.json` limpo) antes de disparar o outro. Elimina a hipótese (2) de vez.
- Depois do iOS 87 confirmado no TestFlight e do commit do autoincrement, rodar o **Android sozinho** (versionCode 53), uma vez.
- Se falhar de novo por fingerprint: **não tentar mais nada sozinho** — trazer o log pro Tiago e preparar (sem aplicar) a proposta de trocar `runtimeVersion` pra `{ "policy": "appVersion" }`, com análise de impacto em OTA (updates já publicados, builds 1.0.11/1.0.12 já instalados) e plano de rebuild das duas plataformas.

**Resultado:** Android 53 rodado sozinho (sem iOS em paralelo) — **passou de primeira**. Confirma que a causa real da falha do 52 foi a condição de corrida no `app.json` compartilhado entre os dois processos `eas-cli`, não o `.easignore`/dependências (que já estavam corretos desde o lote anterior) nem a hipótese do `android`/`bareNativeDir` (ou essa fonte não causa falha por si só quando o resto do fingerprint está consistente). Build 1.0.12 completo: iOS 87 + Android 53, ambos no ar (TestFlight / faixa internal).

## Lote 01/10 (2) — 8 bugs do teste real em Android (build 53) + iPhone (build 87)

Tiago testou a 1.0.12 num Samsung Galaxy A51 físico (Android 13, navegação por 3 botões) e no iPhone. Reportou 8 bugs (3 bloqueantes pra produção Android + 1 bloqueante de UX iOS). Revisão em 3 rodadas pelo Agente Fiscal (2 reprovações corrigidas no meio, detalhes nos itens 2/3/4 abaixo) — todos os 8 aprovados. `tsc --noEmit` limpo. **Nenhum teste em dispositivo/emulador real foi feito nesta correção** — só revisão de código e tipos; Tiago precisa validar nos aparelhos antes de autorizar um novo build.

| # | Bug | Causa raiz | Arquivo:linha | Criticidade |
|---|---|---|---|---|
| 1 | "Já tenho conta"/"Entrar" atrás da barra de navegação Android | Nenhuma tela usava `useSafeAreaInsets().bottom` — SDK 56 passou a desenhar edge-to-edge no Android, e o rodapé fixo ficava parcialmente sob a barra de 3 botões | `app/onboarding.tsx:40,75,135`, `app/(auth)/cadastro.tsx:14,71` | BLOQUEANTE |
| 2 | Pagamento offline demora 10-15s e se perde se o app fechar em ~4s | Duas chamadas de rede SEM timeout rodavam antes de decidir enfileirar: o teste de conectividade ao vivo (`verificarConectividade`, até 3s) e a resolução do tenant (`resolverTenantId`→`obterContextoEquipe`, sem timeout nenhum, com retry automático do postgrest-js de até 7s em GET) | `lib/tenant.ts:33-72` (NetInfo + `abortSignal` 4.5s + cache), `hooks/useOffline.ts:70,165` (`estaOnlineRapido`/`sinalComTimeoutDeEscrita`), `hooks/useVendas.ts:14,85-116,140-163` (`criar`/`registrarPagamento`), `app/cliente/[id].tsx:260-273` (modal fecha antes do refresh em background) | BLOQUEANTE |
| 3 | Início zerado offline, continua zerado >30s após reconectar, checklist de conta nova aparece indevido | `useDashboard.ts` zerava o resumo ANTES de saber se a busca ia falhar, sem try/catch nem cache; `useChecklistDia0.ts` não checava erro nas queries e tratava contagem zerada por falha de rede como "conta vazia de verdade" | `hooks/useDashboard.ts:7-112` (cache + `requisicaoRef`), `hooks/useChecklistDia0.ts:27-50` (checagem de erro), `app/(tabs)/index.tsx:34,150-166,347,496` (gate do checklist, cache do nome, auto-refetch ao reconectar) | BLOQUEANTE |
| 4 | Teclado cobre o e-mail no convite de funcionário (iOS) | Formulário de convite renderizado sem nenhum `KeyboardAvoidingView`/ajuste de teclado | `app/equipe.tsx:119-123` (`automaticallyAdjustKeyboardInsets` no ScrollView) | Bloqueante de UX (iOS) |
| 5 | Botão "Salvar cliente" colado na barra de navegação Android | Mesma causa do item 1, no modal "Novo cliente" | `app/(tabs)/clientes.tsx:96,669` | BLOQUEANTE |
| 6 | Tela do cliente offline mostra erro em vez do cache | `carregarCliente`/`carregarPagamentos` não tinham cache (só a lista de clientes tinha) | `app/cliente/[id].tsx:44-45,162-205,571-576` | Recomendação |
| 7 | Mensagens contraditórias no modal de pagamento offline | Banner do topo dizia "conecte-se pra registrar" (errado — funciona offline), banner de baixo dizia o certo | `app/cliente/[id].tsx` (banner do topo removido) | Recomendação |
| 8 | Rótulo "Limite quase atingido" com saldo bem maior que o limite | O percentual usado pra decidir o texto já vinha limitado a 100% (`Math.min`), nunca disparava a diferenciação "ultrapassado" vs "quase atingido" | `app/cliente/[id].tsx:548-551,667-672` | Recomendação |

**Pendências que o Fiscal registrou como não-bloqueantes mas valem acompanhar:**
- Pior caso ainda existe: numa rede que o aparelho ainda não percebeu que caiu, o pagamento pode esperar até ~12,5s (4,5s resolução do tenant + 8s tentativa de insert) antes de cair na fila — menor que os 10-15s originais, mas não zero.
- Pagamento offline não aparece na tela do cliente até sincronizar (fica só na fila).
- Funcionário desativado continua enfileirando operações que a RLS recusa na sincronização, sem aviso.
- Caches novos (contexto de equipe, dashboard, cliente) não são apagados no logout — mesmo padrão que já existia no app.

**Teste pendente (Tiago, antes de autorizar build):** item 4 num iPhone real; item 2 em dois cenários — modo avião E wifi conectado sem internet; itens 1/5 num Android com navegação por 3 botões.

**Atualização 01/10 (3):** Tiago autorizou o build antes do reteste (outra sessão, Opus 5.5, verificou e aprovou o lote + adicionou `"channel": "production"` ao `eas.json` em paralelo — commit `172e10d`, sem conflito). Sequência executada: `git push` (commits `0377473` + `172e10d`) → **Android sozinho, versionCode 54, `--auto-submit`** → só depois dele terminar, **iOS sozinho, build 88** → `eas submit` manual pro TestFlight. Ambos confirmados com `channel: production` via `eas build:view --json`. Nenhum promovido pra produção/revisão. Autoincrement comitado localmente (`d757b24`), sem push ainda. **Falta:** Tiago retestar os 8 itens no Samsung (Android 54) e no iPhone (iOS 88, após processar no TestFlight) antes de promover.

## Backlog 1.0.13 (não implementar agora — só registrar)
- Aviso de operação presa por permissão (funcionário desativado / outro usuário logado no aparelho) enquanto uma operação fica na fila offline sem conseguir sincronizar.
- Confirmação de pagamento repetido: mesmo cliente, mesmo valor, lançado por outra pessoa, nos últimos 30 minutos — hoje não há nenhum aviso, só a decisão consciente do comerciante evita duplicidade.
- Lixeira com restaurar (clientes/vendas/pagamentos excluídos ficam recuperáveis por um período antes de apagar de vez).
- Permissões finas por funcionário para relatórios, exportação e cobrança em massa (hoje é tudo-ou-nada: dono vê, funcionário não vê nada disso).
- Apagar os caches locais (equipe, dashboard, cliente) no logout — ponto de atenção LGPD.

## Lote 01/10 (4) — duplicação de "Dívida anterior" em produção (correção OTA, sem native)

**O que aconteceu:** 5 registros de "Dívida anterior" duplicados em produção (29-30/09, 10-36s de diferença). Causa: dois pontos do app gravavam venda/pagamento com `supabase.insert()` direto, sem passar pelo `hooks/useVendas.ts` — então sem `client_op_id`, sem timeout, sem fila offline, nenhuma rede de segurança contra um timeout seguido de retry.

**Correção (commit `6019771`):**
- `app/cliente/[id].tsx` (`handleAdicionarDividaAnterior`, ~linha 452): trocado o insert direto por `criar()` do `useVendas(id)`.
- `app/novo-pagamento.tsx` (`handleSalvar`, ~linha 75): trocado o insert direto por `registrarPagamento()` do `useVendas()`; esse hook ganhou `forma_pagamento?: string` no tipo pra aceitar o campo que esse fluxo já usava. Bônus: agora chama `reconciliarPagoCliente()`, que o insert direto nunca chamava — vendas ficavam `pago=false` mesmo pagas, aparecendo "em aberto" em Cobranças.
- Varredura (`grep` em `app/`, `hooks/`, `lib/`, `components/`, `supabase/functions/`): confirmado que não sobra nenhum outro `.from('vendas'|'pagamentos').insert` fora de `hooks/useVendas.ts`.
- `hooks/useVendas.ts`: achado do Fiscal na revisão — `reconciliarPagoCliente()`/`buscar()` estavam dentro do mesmo `try` do insert. Se o insert tivesse sucesso mas a reconciliação falhasse com erro de servidor, o hook relançava o erro mesmo com o lançamento já salvo; o usuário tocaria de novo e duplicaria (a mesma classe de bug que estava sendo corrigida). Movido pra um try/catch próprio que nunca relança — falha vira só um aviso, reconciliação roda de novo na próxima operação.

**Teste:** `tsc --noEmit` limpo, revisado pelo Agente Fiscal (aprovado). **Sem teste em dispositivo** — é mudança 100% JS, sem campo nativo, elegível para `eas update --channel production` (os builds 1.0.12 54/88 já têm o channel configurado). Nenhum build/update/push rodado — Tiago decide quando publicar.

## Lote 02/10 — retorno do reteste (54/88 aprovados) + pacote de 4 itens (OTA, sem native)

Reteste do Tiago: os 8 bugs do pacote anterior estão APROVADOS, e funcionário offline (venda/pagamento sem internet, app fechado no meio, rede 4x) gravou 1 única vez com `criado_por` e `client_op_id` corretos; permissões OK.

| # | Item | Causa | Arquivos |
|---|---|---|---|
| 1 | [SEGURANÇA] Convite/recuperação trocavam a senha da conta ERRADA (dono teve a senha trocada em 02/10) | O link falhava em silêncio (provável token consumido: volta `#error=...otp_expired`), o expo-router abria `/nova-senha` pela própria URL e `updateUser()` agia sobre a sessão ativa do dono | `lib/linkAuth.ts` (novo), `app/_layout.tsx`, `app/(auth)/nova-senha.tsx`, `docs/release/supabase-templates-convite.md` |
| 2 | Inserts diretos sem anti-duplicação | Já corrigido (commits `6019771`/`00d3246`, lote 01/10 (4)); varredura reconfirmada | `hooks/useVendas.ts`, `app/cliente/[id].tsx`, `app/novo-pagamento.tsx` |
| 3 | Tela do cliente não atualizava após a fila offline sincronizar | Nada avisava as telas quando a fila sincronizava; lançamento offline não aparecia | `hooks/useOffline.ts` (eventos da fila), `app/cliente/[id].tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/clientes.tsx` |
| 4 | E-mail de contato inexistente | `contato.fiadoapp@gmail.com` recusado pelo servidor | **Aplicado em 02/10** (e-mail oficial = `fiadoapp.contato@gmail.com`, confirmado pelo Tiago): `configuracoes.tsx` (2x), `termos.tsx`, `privacidade.tsx` |

Item 1 — o que mudou: a tela só troca a senha com link validado (`token_hash` via `verifyOtp`, `?code=` ou `#access_token`) e compara `session.user.id` com o usuário do link; Alert "Trocar de conta?" quando já há sessão (Cancelar não altera nada); mostra o e-mail da conta do link; erros do link aparecem na tela; access_token vencido nem chama `setSession` (evita deslogar a conta atual). **Rollout e ajustes no painel do Supabase: `docs/release/supabase-templates-convite.md`** (OTA primeiro; Android precisa de `ios.buildNumber="87"` temporário no `eas update` por causa do fingerprint — verificado só leitura).

Item 3 — o que mudou: `assinarEventosDaFila('enfileirou'|'sincronizou')`; cliente/Início/lista recarregam no 'sincronizou'; bloco "Aguardando sincronização" com selo Pendente; `saldoComPendentes()` agora valida o valor do pagamento (fecha a pendência "dois pagamentos offline passam do saldo").

Item 4 — decisão do Tiago: o e-mail oficial é `fiadoapp.contato@gmail.com` (conta Google real do Search Console/Analytics; a nota antiga do `prompt-melhorias-testers-community.md` sobre `suporte@fiadofacil.com.br` está desatualizada). Site (`docs/`, `site-live-mirror/`) e fichas das lojas o Tiago corrige por fora.

**Publicado em 02/10 (OTA, branch/channel `production`, commit `bec894e`):** Android update `01a0fd85-84ec-796e-a059-0fe59e413747` (grupo `0eb8131b-95e9-4ef8-94a1-cd6040a7cc04`, runtime `61a2955d…` = build 54) e iOS update `01a0fd88-fa3a-7e36-b50d-cae92c2a54b9` (grupo `95e27cac-ae50-4d30-848d-84c08efaac6c`, runtime `3ae31820…` = build 88). Android publicado com `ios.buildNumber="87"` temporário (restaurado). **Templates do Supabase NÃO trocados** (1.0.11 quebraria) — proposta da página ponte em `docs/release/PROPOSTA-auth-ponte.html`.

**Teste:** `tsc --noEmit` limpo no app; Fiscal aprovou os 4 itens (2 rodadas no item 1: achou setSession com token vencido deslogando a conta, e o e-mail da conta do link). **Sem teste em aparelho** — roteiro de teste no doc do Supabase.

## Lote 02/10 (2) — "TOTAL EM ABERTO" só para o dono (OTA, sem native)

`app/(tabs)/index.tsx`: o bloco do valor do Hero (label, total, olho, dica) só renderiza para o dono (`!carregando && !souFuncionario` do `useTenant`); enquanto o papel carrega mostra só um espaçador (sem piscar valor); o toque no Hero (abre o Relatório de Vendas, que mostra o agregado "Em aberto") fica inativo para funcionário; o passo "Total em aberto" do tour é omitido para funcionário. Saudação, contador de clientes, "Nova venda" e as métricas continuam. Fiscal: aprovado com ressalvas.

**Pacote seguinte (decisão do Tiago: corrigir 1, 2 e 3; o 4 fica como está):**
1. **Cobranças**: os totais agregados ("total em aberto"/"total em atraso") só aparecem com `podeVerTotais`; a lista por cliente continua.
2. **Notificações**: as de 18h ("R$ X a receber") e 9h ("vence amanhã — R$ X") não são agendadas para funcionário/papel não confirmado (o `cancelAll` já remove as de um dono anterior); `sair()` agora cancela as notificações agendadas (também usado ao excluir conta). A de sábado 10h (sem valores) continua.
3. **Papel indeterminado**: `ContextoEquipe.papelConfirmado` (false só no fallback sem cache e sem rede); `useTenant().podeVerTotais = !carregando && papelConfirmado && !souFuncionario`, com retry a cada 6s até confirmar e sem re-render à toa. Usado SÓ para EXIBIÇÃO (Início, Cobranças, Relatórios, notificações) — nenhuma ação é bloqueada (RLS no servidor). Dono sem papel confirmado vê "Conecte-se para ver o total em aberto".
4. **Varredura**: funcionário ainda vê só (a) "Recebido hoje" (soma do dia, mantido por decisão do Tiago), (b) contagens sem valor (clientes vencidos, abas, badge), (c) valores POR CLIENTE (saldo, ranking `totalComprado`/`saldoDevedor`, perfil do cliente, extrato, WhatsApp). Sem soma geral de saldo.
Proteção é só de interface: o total ainda é calculado/guardado em cache no aparelho do funcionário e a RLS deixa ele ler o saldo dos clientes (combinado).

## Pendências fora do lote
- Foto de comprovante (`nova-venda.tsx:188`): o bucket `comprovantes` **não existe**, e o upload falha sem avisar. Se for ativar: bucket privado + URL assinada. Decisão de produto.
- Testes automatizados e lint: backlog de adequação (`docs/adequacao-fabrica.md`, a criar).
- Tela de Configurações continua visível/editável para funcionário mesmo sem efeito real (RLS bloqueia a escrita, mas a UI não esconde os campos) — cosmético, não bloqueante.
- Dois pagamentos offline seguidos pro mesmo cliente podem passar da checagem de saldo até sincronizar — janela estreita, sem perda de dado, mitigação futura possível.

## Antes de pedir o build ao Tiago
Checklist §8.1: lista do lote ✅ · typecheck ✅ · testes (o projeto ainda não tem) · E2E local (teste manual dos fluxos: busca, cliente, pagamento, desfazer venda, excluir cliente, **assinatura Android/IAP com o app minificado — prioridade alta por causa do item 8**) · versão proposta: **1.0.12** (iOS build 82 / Android vc 44) · plataformas: iOS + Android.

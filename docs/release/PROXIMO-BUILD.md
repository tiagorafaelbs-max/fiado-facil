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

## Já aplicado no servidor (edge functions — não depende de build do app)
- 26/09: **Vulnerabilidade crítica corrigida** em `apple-iap-verify` — recibos JWS (StoreKit 2) não validavam a cadeia de certificado até a Root CA da Apple, permitindo forjar um recibo e ganhar Pro sem pagar. Corrigido com validação de cadeia completa (`@peculiar/x509`), testado localmente com ataque simulado antes do deploy. **Correção do relatório de 26/09:** o caso "Mimos Da Suely" (Oseas) NÃO foi exploração da falha — é cliente legítimo (sessão do app oficial, 127 clientes/129 vendas lançados, contatou o suporte). Decisão do Tiago: manter o Pro dela, não alterar nada.
- 26/09: **Bug crítico corrigido** em `subscribe`/`mercadopago-webhook` — o `notification_url` apontava para `mp-webhook`, que tem o HMAC fora do formato oficial do MP e rejeitava toda notificação real com 401. Revertido para `mercadopago-webhook` (formato correto). Pagamentos Android via MP não estavam ativando o Pro até esta correção. Também corrigido `plan_id` sempre gravado como mensal mesmo em assinaturas anuais.
- Validado pelo Agente Fiscal (leitura de código/banco) antes do deploy. As 3 functions já estão publicadas em produção.

## Já aplicado no banco (não depende de build)
- 22/09: `supabase/migrations/revoga_privilegios_anon_tabelas.sql`: o papel `anon` perdeu todos os privilégios nas tabelas e views, e as tabelas futuras nascem sem privilégio para `anon`. Verificado: usuários logados seguem normais, e as edge functions usam a service role.
- 26/09: `supabase/migrations/equipe_e_multiusuario.sql`: tabela `membros_equipe`, função `tenant_id_atual()`, RLS de `clientes`/`vendas`/`pagamentos`/`perfis` atualizada para resolver dono vs. funcionário, coluna `criado_por` em `vendas`/`pagamentos`, trigger de permissões em `vendas`. Validado em 2 rodadas pelo Agente Fiscal direto contra o banco real (não regressão confirmada para as contas sem equipe). **Falta publicar a edge function `convidar-funcionario`** — bloqueada pelo classificador do Claude Code, precisa rodar manualmente: `npx supabase functions deploy convidar-funcionario --project-ref eyipcpwmwtajrywouxub`.

## Metadados do App Store Connect (fazer ao abrir a próxima versão, antes de enviar para revisão)
- **URL da Política de Privacidade** está desatualizada: Distribuição → Privacidade do app → Política de privacidade → `https://rcsolucoes.github.io/fiado-facil/privacy` (domínio antigo) → trocar para `https://fiadoapp.app.br/privacidade`. Campo está congelado na 1.0.11 (já "Pronto para distribuição"), só libera dentro de uma versão nova. Backlink de alta autoridade apontando pro lugar errado — afeta SEO além de credibilidade.
- **Idioma dos metadados**: trocar de Português (Portugal) para Português (Brasil) como principal.

## Checklist de teste em Android real com R8 ligado (fazer antes de publicar o 1.0.12)
1. Login e cadastro de novo usuário
2. Cadastro de cliente e registro de venda nova
3. Exportação de relatório em PDF
4. Envio de cobrança/extrato pelo WhatsApp
5. **Fluxo Mercado Pago de ponta a ponta**: criar preferência (`subscribe`) → pagar → voltar ao app → confirmar que `mercadopago-webhook` recebeu a notificação → `perfis.plano` virou `'pro'` no banco. Prioridade alta — é o fluxo que estava quebrado até hoje.

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

## Pendências fora do lote
- Foto de comprovante (`nova-venda.tsx:188`): o bucket `comprovantes` **não existe**, e o upload falha sem avisar. Se for ativar: bucket privado + URL assinada. Decisão de produto.
- Testes automatizados e lint: backlog de adequação (`docs/adequacao-fabrica.md`, a criar).
- Tela de Configurações continua visível/editável para funcionário mesmo sem efeito real (RLS bloqueia a escrita, mas a UI não esconde os campos) — cosmético, não bloqueante.
- Dois pagamentos offline seguidos pro mesmo cliente podem passar da checagem de saldo até sincronizar — janela estreita, sem perda de dado, mitigação futura possível.

## Antes de pedir o build ao Tiago
Checklist §8.1: lista do lote ✅ · typecheck ✅ · testes (o projeto ainda não tem) · E2E local (teste manual dos fluxos: busca, cliente, pagamento, desfazer venda, excluir cliente, **assinatura Android/IAP com o app minificado — prioridade alta por causa do item 8**) · versão proposta: **1.0.12** (iOS build 82 / Android vc 44) · plataformas: iOS + Android.

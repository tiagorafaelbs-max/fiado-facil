# Ciclo de manutenção — 25/09/2026

Registro do Agente Fiscal para o ciclo de manutenção pedido pelo Tiago. Cobre o code review do
que já estava pronto e não commitado, a validação dos itens de `app/planos.tsx`, a habilitação de
R8/ProGuard e a decisão sobre o backlog não-bloqueante.

## 1. Code review do commit `3dbfc3d` (22/09) e do `docs/release/PROXIMO-BUILD.md`

- **Commit `3dbfc3d`**: revisado integralmente (diff completo). Filtro `usuario_id` explícito e
  coerente em todas as consultas tocadas (busca, painel, cliente, pagamentos, vendas, exclusões);
  segue o mesmo padrão em todos os arquivos (obter sessão → validar `uid`/`usuario?.id` → filtrar).
  Sem regressão aparente: os `useCallback`/`useEffect` que passaram a depender de `usuario?.id`
  foram atualizados nas dependências correspondentes. `runtimeVersion` migrado corretamente para
  `{ "policy": "fingerprint" }`. **Aprovado, sem achados.**
- **`docs/release/PROXIMO-BUILD.md`**: lote de 7 itens ainda faz sentido — nenhum ficou obsoleto.
  Adicionado o item 8 (R8/ProGuard, ver seção 3) e ampliado o checklist de teste antes do build.
- **Estado do branch**: `main` está 15 commits à frente de `origin/main` (nunca houve push). Isso é
  decisão do Tiago — **não foi tentado nenhum `git push`**, conforme instruído. Rodar
  `git push origin main` no terminal dele quando quiser sincronizar.

## 2. `app/planos.tsx` — os 3 itens pedidos já estavam implementados

Antes de mexer, o Agente Fiscal conferiu o arquivo atual e descobriu que os três pontos do pedido
já foram corrigidos em commits anteriores a este ciclo — nenhuma mudança nova foi necessária:

| Item pedido | Situação encontrada | Onde |
|---|---|---|
| a) "Cobre todos os vencidos com um toque" em `RECURSOS_PRO` | **Já presente** (linha 47) | commit `6fd9fe4` |
| b) Preço Android hardcoded R$19,00/R$149,00 → R$19,90/R$149,90 | **Já corrigido** — `precoMensal`/`precoAnual` e labels já usam os valores certos; `-33%` já é `-37%` | commit `6b3acb8` |
| c) "Garantia de 7 dias" dando a entender reembolso | **Já trocado** para "Cancele quando quiser" / "Sem fidelidade e sem multa..." — não há lógica de reembolso no código (confirmado: nenhuma função de estorno/refund em `planos.tsx`, edge functions ou migrations) | commit `3da2d44` |

Não existe reembolso automático real no fluxo de assinatura (nem Apple IAP nem MercadoPago) — o
texto atual está correto e não contradiz os termos.

## 3. `planos.tsx:85` — erro de tipo do IAP pré-existente

Também já corrigido, dentro do próprio commit `3dbfc3d` (item 6 do lote): o tipo do IAP v15 não
lista `'failed'` em `purchaseState`, mas o valor pode chegar em runtime. A correção converte para
`String(purchase.purchaseState)` antes de comparar, evitando o erro de tipo sem mudar o
comportamento em runtime. `tsc --noEmit` confirma **0 erros no app** (os erros que aparecem em
`supabase/functions/**` são esperados — módulos Deno fora do escopo do `tsconfig.json` do app, não
fazem parte do RN/Expo e não foram tocados).

## 4. R8/ProGuard (achado do Play Console, 24/09)

`app.json`, `package.json` e `package-lock.json` já tinham a configuração pronta (plugin
`expo-build-properties` com `enableMinifyInReleaseBuilds` e `enableShrinkResourcesInReleaseBuilds`)
mas **não commitada**. Validado e commitado neste ciclo (commit `7da4a74`):

- `npx expo prebuild --platform android` regenera `android/gradle.properties` com
  `android.enableMinifyInReleaseBuilds=true` e `android.enableShrinkResourcesInReleaseBuilds=true`,
  e `android/app/build.gradle` já lê essas properties corretamente (`minifyEnabled`,
  `shrinkResources`) — a pasta `android/` é gerada (está no `.gitignore`), então a fonte da verdade
  é o `app.json`.
- Revisão de risco de reflection: `react-native-iap`, `expo`, `expo-modules-core`,
  `expo-notifications`, `expo-updates`, `react-native` (core), `react-native-reanimated`,
  `react-native-svg` e `react-native-worklets` já trazem `proguard-rules.pro`/`consumer-rules.pro`
  próprios no pacote, que o R8 aplica automaticamente via AAR — não é necessário adicionar keep
  rules manuais para essas libs. O bundle JS (Hermes) não é afetado por shrink de classes
  Java/Kotlin, então a lógica do Supabase (puro JS) não corre risco.
- **Não testado em device/emulador real**: este ambiente não tem Android SDK nem JDK 17 (só JDK 8),
  então não foi possível rodar `./gradlew assembleRelease` localmente nem instalar um `.aab`/`.apk`
  minificado. **Recomendação:** no primeiro build com essa flag, fazer smoke test manual completo
  — login, nova venda, pagamento, exclusão de cliente e, com atenção especial, o fluxo de
  assinatura Android via IAP/MercadoPago (é o mais sensível a reflection quebrada por R8). Adicionado
  ao checklist do `PROXIMO-BUILD.md`.

## 5. Backlog não-bloqueante — decisões

### 5.1 Webhooks MercadoPago duplicados (`mp-webhook` × `mercadopago-webhook`)
**Decisão: não mexer neste ciclo.** Os dois estão ACTIVE e nenhum é chamado pelo código do app (são
invocados via HTTP diretamente pelo MercadoPago, não por import). Não dá para saber pelo código
qual está cadastrado como webhook oficial no painel do MercadoPago — isso só o Tiago pode conferir
(acesso à conta MP). **Ação pendente do Tiago:** abrir o painel do MercadoPago → Webhooks e
confirmar qual URL está ativa; aí sim dá pra desativar a função órfã com segurança. Risco de
consolidar às cegas: desativar a que está recebendo eventos de verdade e parar pagamentos de
funcionar silenciosamente — por isso não foi feito agora.

### 5.2 Dead code do RevenueCat
**Achado mais preciso do que o suspeitado:** `hooks/useSubscription.ts` (lê a view
`active_subscriptions`) está de fato órfão — nenhum import em nenhuma tela. Mas `app/_layout.tsx`
**ainda chama `initRevenueCat()`** no login (inicializa o SDK nativo do RevenueCat e vincula o
usuário), então o SDK está ativo em runtime, só que sem função: o gating real de recursos Pro usa
`perfis.plano` via `hooks/useModulos.ts`, não RevenueCat. **Decisão: não remover neste ciclo.**
Remover com segurança exige tirar a chamada em `_layout.tsx`, o hook, a view, o
`revenuecat-webhook` e o SDK nativo (`Purchases.configure` em outro lugar de init, se houver) — é
uma tarefa de escopo maior que "3 itens isolados", com risco de deixar rastro de configuração nativa
pela metade. **Ação recomendada para o próximo ciclo:** tarefa dedicada de remoção completa do
RevenueCat (código + view `active_subscriptions` + `revenuecat-webhook` + dependência no
`package.json`), com Agente Backend + Fiscal validando que `useModulos.ts` continua sendo a única
fonte de verdade do plano.

### 5.3 `lib/whatsapp.ts` — cálculo próprio do total em aberto
**Achado:** `montarExtratoWhatsApp` soma `valor` de todas as vendas com `pago: false` recebidas por
parâmetro — não lê a view `clientes_com_saldo`. Isso diverge do saldo real sempre que há pagamento
**parcial** de uma venda (o total do extrato pode aparecer maior que o `saldo_devedor` real, já que
a lógica de FIFO de pagamentos parciais, corrigida em 09/09 conforme a memória do projeto, só vive
na view). **Decisão: não corrigir neste ciclo** — é um bug real de exibição (não de segurança nem de
dinheiro de verdade, o saldo do banco está correto), mas ajustar exige garantir que quem chama
`montarExtratoWhatsApp` tenha o saldo por venda já descontado dos pagamentos parciais aplicados
(FIFO), o que toca lógica de negócio além do escopo pedido ("não mexer no resto do fluxo de
pagamento"). **Recomendado para o próximo ciclo:** Agente Backend revisa se `vendas` deveria trazer
um campo `saldo_restante` já calculado (FIFO) para o extrato usar, em vez de recalcular a partir de
`pago`/`valor`.

## Resumo do que muda no próximo `eas build`
Nenhuma mudança de comportamento visível ao usuário além do que já estava no lote de 22/09. O único
item novo é o R8/ProGuard (nativo, invisível ao usuário, resolve o aviso do Play Console).

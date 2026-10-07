# Google Play Billing — passo a passo manual (Tiago)

Faça nesta ordem. Tempo total: ~1 a 1,5 h, mais a espera de propagação do Google. Os menus do Google mudam de nome com frequência; se um nome estiver diferente, procure o equivalente.

Valores que vão aparecer várias vezes:

| O quê | Valor |
|---|---|
| Pacote do app | `com.fiadofacil.app` |
| Assinatura mensal (ID do produto) | `com.fiadofacil.app.pro.monthly` |
| Assinatura anual (ID do produto) | `com.fiadofacil.app.pro.annual` |
| Plano base mensal (ID) | `mensal` |
| Plano base anual (ID) | `anual` |
| Preço mensal / anual | R$ 19,90 / R$ 149,90 (conferir que são os mesmos da App Store) |
| Projeto Supabase | `eyipcpwmwtajrywouxub` |
| Endereço da função de notificações | `https://eyipcpwmwtajrywouxub.supabase.co/functions/v1/google-play-rtdn` |

**Importante:** o ID do produto e o ID do plano base NÃO podem ser mudados depois de criados. Digite exatamente como acima.

Conferido sem build: o binário Android 54 (versionCode 54) já tem a permissão `com.android.vending.BILLING` e a Billing Library 8 ou mais nova. Não precisa de build novo; o código novo vai por OTA.

---

## Parte A — Google Play Console (criar os produtos)

1. Abra https://play.google.com/console e entre no app **FiadoApp**.
2. Menu da esquerda: **Monetizar com o Google Play** → **Produtos** → **Assinaturas** → **Criar assinatura**.
3. **ID do produto:** `com.fiadofacil.app.pro.monthly` · **Nome:** `FiadoApp Pro Mensal` → Criar.
4. Dentro da assinatura: **Adicionar plano base**.
   - **ID do plano base:** `mensal`
   - Tipo: **Renovação automática** · Período de faturamento: **A cada 1 mês**
   - Período de tolerância (grace) e retenção de conta: deixe os padrões ou ative "Período de carência" (recomendado: ativado).
   - **Preço:** defina R$ 19,90 para o Brasil e use "Atualizar preços" para os outros países (ou deixe só o Brasil disponível).
   - **Salvar** e depois **Ativar** o plano base.
5. Repita para o anual: ID do produto `com.fiadofacil.app.pro.annual`, nome `FiadoApp Pro Anual`, plano base `anual`, **A cada 1 ano**, R$ 149,90, ativar.
6. Confira que os dois planos aparecem como **Ativo**.

> Se o Play Console recusar criar o produto por "o app precisa de um APK com permissão de faturamento": já conferimos que o build 54 tem a permissão; basta esperar o build 54 estar na faixa de produção (já está).

## Parte B — Testador de licença (comprar de graça para testar)

1. Play Console, tela inicial (fora do app): **Configurações** → **Testes de licença**.
2. Em "Adicionar testadores de licença" digite `tiagorafael.bs@gmail.com` → **Salvar**.
3. No Samsung, a conta Google principal da Play Store tem que ser essa mesma. Compras feitas por ela são de teste (cobrança zero, renovações aceleradas: a mensal renova a cada ~5 min, no máximo 6 vezes).

## Parte C — Google Cloud (acesso da API)

1. Abra https://console.cloud.google.com e **selecione o projeto vinculado ao Play Console** (Play Console → Configurações → **Acesso à API** mostra qual é o projeto; se não houver, clique em "Criar novo projeto" ali e depois volte ao Google Cloud nele). Anote o **ID do projeto** (ex.: `fiadoapp-123456`); vamos chamar de `PROJETO`.
2. **APIs e serviços** → **Biblioteca** → procure **Google Play Android Developer API** → **Ativar**.
3. **IAM e administrador** → **Contas de serviço** → **Criar conta de serviço**:
   - Nome: `play-billing` → Criar e continuar → pule as permissões (não precisa de papel no Google Cloud) → Concluir.
   - Anote o e-mail da conta: `play-billing@PROJETO.iam.gserviceaccount.com`.
4. Clique na conta criada → aba **Chaves** → **Adicionar chave** → **Criar nova chave** → **JSON** → Criar. Um arquivo `.json` é baixado. **Guarde fora de pastas de projeto e nunca envie por chat.**
   - Se o botão de criar chave estiver bloqueado ("política da organização"): em **IAM e administrador → Políticas da organização**, desative `iam.disableServiceAccountKeyCreation` para o projeto (ou me avise).
5. **Dar acesso à conta no Play Console:** Play Console (fora do app) → **Usuários e permissões** → **Convidar novos usuários** → e-mail `play-billing@PROJETO.iam.gserviceaccount.com`.
   - Em permissões **de conta** marque: **Ver informações financeiras, pedidos e respostas da pesquisa de cancelamento** e **Gerenciar pedidos e assinaturas**.
   - Convidar. (Pode levar de minutos a algumas horas para a API reconhecer.)

## Parte D — Pub/Sub (avisos de renovação/cancelamento em tempo real)

1. Google Cloud, projeto `PROJETO`: **APIs e serviços** → **Biblioteca** → **Cloud Pub/Sub API** → **Ativar**.
2. **Pub/Sub** → **Tópicos** → **Criar tópico**: ID `play-rtdn` (desmarque "adicionar assinatura padrão") → Criar. O nome completo fica `projects/PROJETO/topics/play-rtdn`.
3. Abra o tópico → aba **Permissões** (ou "Informações") → **Adicionar principal**:
   - Principal: `google-play-developer-notifications@system.gserviceaccount.com`
   - Papel: **Pub/Sub Publisher** → Salvar.
4. Conta de serviço para o push (separada da anterior): **IAM → Contas de serviço → Criar**: nome `pubsub-push` → e-mail `pubsub-push@PROJETO.iam.gserviceaccount.com`. Sem papéis.
5. Dar permissão do Pub/Sub para "assinar" tokens dessa conta: **IAM e administrador → IAM → Conceder acesso**: principal `service-NUMERO_DO_PROJETO@gcp-sa-pubsub.iam.gserviceaccount.com` (o número do projeto aparece em **Configurações do projeto**), papel **Criador de token de conta de serviço** (Service Account Token Creator). Salvar.
6. **Pub/Sub → Assinaturas → Criar assinatura**:
   - ID: `play-rtdn-push` · Tópico: `play-rtdn`
   - Tipo de entrega: **Push**
   - URL do endpoint: `https://eyipcpwmwtajrywouxub.supabase.co/functions/v1/google-play-rtdn`
   - Marque **Ativar autenticação**: conta de serviço `pubsub-push@PROJETO.iam.gserviceaccount.com`; **Público (audience)**: o mesmo endereço do endpoint (cole igual).
   - Prazo de confirmação: 30 s. Política de repetição: **Recuo exponencial** (min 10 s, máx 600 s). Criar.
7. **Play Console** → app → **Monetizar com o Google Play** → **Configuração de monetização** → **Notificações para desenvolvedores em tempo real**:
   - Nome do tópico: `projects/PROJETO/topics/play-rtdn`
   - Tipo de notificação: **Somente notificações de assinatura**
   - Salvar → **Enviar notificação de teste** (só vai funcionar depois que eu publicar a função; antes disso o teste aparece como erro no Pub/Sub e é reenviado, sem problema).

## Parte E — Segredos na Supabase

Painel: https://supabase.com/dashboard/project/eyipcpwmwtajrywouxub/functions/secrets (ou **Edge Functions → Secrets**). Crie 4 segredos:

| Nome | Valor |
|---|---|
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | o conteúdo **inteiro** do arquivo `.json` baixado na Parte C (passo 4), colado como uma linha ou várias; copiar do arquivo e colar |
| `GOOGLE_RTDN_AUDIENCE` | `https://eyipcpwmwtajrywouxub.supabase.co/functions/v1/google-play-rtdn` |
| `GOOGLE_RTDN_SA_EMAIL` | `pubsub-push@PROJETO.iam.gserviceaccount.com` |
| `GOOGLE_PLAY_PACKAGE_NAME` | `com.fiadofacil.app` |

Depois de colar o JSON na Supabase, **apague o arquivo `.json` do computador** (ou guarde num cofre de senhas). Nunca commitar.

## Parte F — O que eu faço depois (só com a sua ordem)

1. Aplicar a migration `google_play_billing.sql` (status `pending` + trava do trigger).
2. Publicar as funções `google-play-verify` (com JWT) e `google-play-rtdn` (sem JWT, autenticada pelo OIDC do Google).
3. OTA Android.
4. Teste no Samsung com a conta de testador: comprar mensal → conferir no banco → cancelar no Play → renovação/expiração via Pub/Sub → "Restaurar compras".

O Play Console só mostra "notificação de teste recebida" depois do passo 2.

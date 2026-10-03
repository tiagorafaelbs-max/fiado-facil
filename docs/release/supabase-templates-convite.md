# Convite / recuperação de senha — rollout e ajustes manuais no painel do Supabase

> **STATUS 02/10 (decisão do Tiago):** OTA publicada (Android `01a0fd85-84ec-796e-a059-0fe59e413747`, iOS `01a0fd88-fa3a-7e36-b50d-cae92c2a54b9`). **NÃO trocar os templates agora** — os usuários reais ainda estão no 1.0.11, que não entende `?token_hash`: convite e recuperação deles quebrariam. A troca fica para quando o 1.0.12 for maioria. A página ponte proposta está em `docs/release/PROPOSTA-auth-ponte.html` (destino sugerido `https://fiadoapp.app.br/auth`, não publicada; repassa query + fragmento, serve aos dois formatos). Quando for a hora, usar nos templates `https://fiadoapp.app.br/auth?token_hash={{ .TokenHash }}&type=invite` (e `type=recovery`) em vez da opção A.

Contexto (incidente 02/10): o link de convite falhou em silêncio (provável token já consumido, volta como `fiadofacil://nova-senha#error=...otp_expired`) e a tela `nova-senha` trocou a senha do DONO que estava logado no aparelho. O app agora só troca a senha depois de validar o link (`lib/linkAuth.ts`), pergunta antes de trocar de conta, mostra o e-mail da conta do link e aceita `?token_hash=...&type=...` (validado com `verifyOtp`: funciona em qualquer aparelho e não é consumido por pré-visualização de e-mail).

## 0. PRONTO PARA COLAR AGORA — template "Reset Password" em português (formato de link ATUAL)

Mantém `{{ .ConfirmationURL }}` (a troca para `token_hash` continua adiada até o 1.0.12 ser maioria) — por isso pode ser colado já, sem risco para o 1.0.11.
Painel: Supabase → Authentication → Emails → Templates → **Reset Password**. Guarde o HTML original antes de trocar.

**Assunto (Subject heading):**
```
Redefina sua senha do FiadoApp
```

**Corpo (Message body):**
```html
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #14352A;">
  <h2 style="margin: 0 0 12px; font-size: 22px;">Redefinir sua senha</h2>
  <p style="font-size: 15px; line-height: 1.5;">Olá! Recebemos um pedido para redefinir a senha da sua conta no <strong>FiadoApp</strong>.</p>
  <p style="font-size: 15px; line-height: 1.5;">Toque no botão abaixo, <strong>no celular onde o FiadoApp está instalado</strong>, para criar uma nova senha:</p>
  <p style="margin: 24px 0;">
    <a href="{{ .ConfirmationURL }}" style="display: inline-block; background: #14352A; color: #ffffff; text-decoration: none; padding: 14px 22px; border-radius: 10px; font-weight: bold; font-size: 15px;">Criar nova senha</a>
  </p>
  <p style="font-size: 13px; line-height: 1.5; color: #3D5347;">Se você não pediu para redefinir a senha, pode ignorar este e-mail: sua senha continua a mesma. O link expira em pouco tempo e só pode ser usado uma vez.</p>
  <p style="font-size: 13px; line-height: 1.5; color: #3D5347;">Dúvidas? Escreva para fiadoapp.contato@gmail.com.</p>
  <p style="font-size: 12px; line-height: 1.5; color: #7A8C82; word-break: break-all;">Se o botão não funcionar, copie e cole este endereço no navegador do celular:<br>{{ .ConfirmationURL }}</p>
  <p style="font-size: 14px; margin-top: 24px;">— Equipe FiadoApp</p>
</div>
```

Observações: o texto segue o tom das mensagens do app (não tive acesso ao template de convite do painel — compare o tom ao colar). Para o e-mail de **convite**, vale o mesmo cuidado se ainda houver texto em inglês ou "Supabase" no assunto/corpo.

### Nome do remetente ("Supabase")
- **(doc oficial)** O nome e o e-mail do remetente **não são editáveis no remetente padrão do Supabase**; o padrão só entrega a membros autorizados da equipe e limita a 2 e-mails/hora. Eles só existem no **SMTP próprio**: Authentication → Emails → **SMTP Settings** (`supabase.com/dashboard/project/_/auth/smtp`), campos **Sender email** (`smtp_admin_email`) e **Sender name** (`smtp_sender_name`).
- ATENÇÃO — confirme no painel o estado atual (isto é DEDUÇÃO minha, não fato da doc): como a recuperação de senha já chega a lojistas, é provável que o SMTP próprio JÁ esteja ligado e o nome esteja apenas como "Supabase": nesse caso basta trocar **Sender name** para `FiadoApp` e **Sender email** para um endereço do seu domínio (ex.: `nao-responder@SEU-DOMINIO`). Se o painel mostrar SMTP desligado, o que seguiria é o item abaixo.
- **Se precisar montar SMTP próprio** (só descrição, nada foi configurado): (1) um provedor de envio (**doc oficial** cita Resend, AWS SES, Postmark, SendGrid, ZeptoMail, Brevo); (2) um domínio seu para o remetente (ex.: `fiadoapp.app.br`) com os registros DNS **SPF, DKIM e DMARC** (**doc oficial** recomenda) que o provedor pedir — sem eles o e-mail tende a cair no spam; (3) os dados SMTP do provedor: host, porta, usuário e senha/API key; (4) preencher esses campos no painel + Sender email/name, e salvar; (5) testar com uma recuperação de senha para uma conta `+teste`. Ajustar também o limite de envios em Authentication → Rate Limits se necessário.

---

## 1. OTA primeiro (ordem obrigatória)

1. Publicar a correção por `eas update --channel production` (receita abaixo — o fingerprint do Android exige um passo extra).
2. A OTA só é aplicada no **próximo** cold start depois do download: quem está no 54/88 precisa abrir o app **duas vezes** (ou fechar e abrir de novo) para rodar o código novo.
3. Só depois de testar a OTA nos aparelhos mexer nos templates (seção 2).

### Receita do `eas update` (verificada em 02/10, só leitura)
`runtimeVersion` usa `policy: fingerprint` e o `expoConfig` entra no hash (inclui `ios.buildNumber`). Resultado atual:

| Plataforma | runtime do build publicado | fingerprint da árvore atual | OTA chega? |
|---|---|---|---|
| iOS 88 | `3ae31820…` | `3ae31820…` | Sim, publicando da árvore atual |
| Android 54 | `61a2955d…` | `6806c5f0…` | **Não**, a menos que `ios.buildNumber` volte a `"87"` |

(O build iOS 88 mudou `ios.buildNumber` para 88 DEPOIS do Android 54 ter sido gerado com 87.)

Passos:
```bash
# iOS (árvore como está, buildNumber 88)
npx eas update --channel production --platform ios --message "fix: convite/senha + fila offline"

# Android: voltar ios.buildNumber para "87" SÓ para publicar, depois restaurar "88"
#  1) editar app.json: "buildNumber": "88"  ->  "87"
#  2) conferir (deve imprimir 61a2955d95431f5815a796a21f192ddebd4da50e):
npx eas fingerprint:generate --platform android --json --non-interactive
#  3) publicar
npx eas update --channel production --platform android --message "fix: convite/senha + fila offline"
#  4) restaurar app.json: "buildNumber": "87"  ->  "88"   (git diff app.json deve ficar vazio)
```
Não rodar `eas build` entre os passos (o autoincrement muda o fingerprint). Confira no resumo do `eas update` que o "Runtime version" de cada plataforma é o da tabela.

**Antes de publicar:** a OTA empacota o JS com o `.env` local — confirme que `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` do `.env` apontam para o projeto de PRODUÇÃO (`eyipcpwmwtajrywouxub`). URL errada/vazia derruba o app para todo mundo que receber a OTA.

**Reversão, se o teste nos aparelhos falhar:** `npx eas update:rollback --channel production` (ou republicar a OTA anterior com `eas update:republish`). Um runtime errado não chega a ninguém e não quebra o app.

## 2. Templates do Supabase (Authentication → Emails)

Guarde o HTML original de cada template antes de editar (para voltar atrás).

### "Invite user"
Trocar o link `{{ .ConfirmationURL }}` por:
```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite">Criar minha senha e entrar</a>
```

### "Reset Password"
Trocar o link `{{ .ConfirmationURL }}` por:
```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery">Redefinir minha senha</a>
```

`{{ .RedirectTo }}` vale `fiadofacil://nova-senha` quando o convite/recuperação sai do app (`supabase/functions/convidar-funcionario/index.ts` e `hooks/useAuth.ts` já mandam esse `redirectTo`; não precisa mudar edge function). **Atenção:** convite ou recuperação disparado pelo painel do Supabase, ou sem `redirectTo`, faz `{{ .RedirectTo }}` cair no Site URL e o link vai para o site, não para o app.

Em Authentication → URL Configuration, conferir que `fiadofacil://nova-senha` segue na lista de Redirect URLs (já está).

### Gmail provavelmente NÃO abre link `fiadofacil://` — teste e use a página ponte
Clientes de e-mail (Gmail em especial) costumam remover/não tornar clicável `href` que não seja `https://`. **Teste no app Gmail (Android e iOS) antes de dar por concluído.** Se o link não abrir o app, usar a **opção B — página ponte https** (hospedar em qualquer site seu, ex.: `https://SEU-SITE/abrir-app.html`) e nos templates usar
`https://SEU-SITE/abrir-app.html?token_hash={{ .TokenHash }}&type=invite` (e `type=recovery` no outro):

```html
<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Abrir o FiadoApp</title>
<p id="msg">Abrindo o FiadoApp…</p>
<p><a id="botao" href="#">Toque aqui se o app não abrir</a></p>
<script>
  var destino = 'fiadofacil://nova-senha' + location.search;
  document.getElementById('botao').href = destino;
  location.href = destino;
</script>
```
A página é estática e não consome o token (só o app consome, via `verifyOtp`).

## 3. Builds antigos (importante)
- O JS antigo ignora `?token_hash`: **depois de trocar os templates, convite e recuperação deixam de funcionar para quem não recebeu a OTA** (builds anteriores ao 54/88 não têm `channel` e não recebem OTA; 54/88 só depois do passo 1).
- Esses mesmos builds antigos **continuam vulneráveis ao bug do dono** (abrem `nova-senha` e chamam `updateUser` na sessão ativa) — isso já é verdade hoje, independente dos templates. Mitigação até a adoção: orientar que o convite seja aberto SEMPRE no celular do funcionário, nunca no do dono; avaliar forçar atualização da loja (próximo build nativo).
- Sugestão: esperar a adoção da OTA nos aparelhos que enviam convites antes de trocar os templates.

## 4. O que NÃO muda
- Templates `Confirm signup` e `Magic Link`.
- Nenhuma migration; nenhuma edge function a republicar.

## 5. Roteiro de teste (conta `+teste`, nunca conta de cliente)
1. Convite aberto num aparelho **logado como dono** → aparece "Trocar de conta?"; **Cancelar** não altera nada (conferir `auth.users.updated_at` do dono); **Continuar** entra como funcionário com a senha criada.
2. Convite aberto em aparelho **sem sessão** → funcionário fica com senha e logado.
3. Recuperação de senha aberta **em outro aparelho** → funciona.
4. Link reaberto depois de usado / expirado → "Não foi possível abrir o link", nenhuma senha alterada, conta atual continua logada.
5. `fiadofacil://nova-senha` sem token → mesma tela de erro.

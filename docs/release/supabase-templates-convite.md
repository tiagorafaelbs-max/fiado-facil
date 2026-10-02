# Convite / recuperação de senha — rollout e ajustes manuais no painel do Supabase

Contexto (incidente 02/10): o link de convite falhou em silêncio (provável token já consumido, volta como `fiadofacil://nova-senha#error=...otp_expired`) e a tela `nova-senha` trocou a senha do DONO que estava logado no aparelho. O app agora só troca a senha depois de validar o link (`lib/linkAuth.ts`), pergunta antes de trocar de conta, mostra o e-mail da conta do link e aceita `?token_hash=...&type=...` (validado com `verifyOtp`: funciona em qualquer aparelho e não é consumido por pré-visualização de e-mail).

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

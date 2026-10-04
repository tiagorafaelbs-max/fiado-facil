# Mensagem de cobrança personalizável (pedido do André, 04/10)

Status: **PARA REVISÃO** — migration NÃO aplicada, OTA NÃO publicada.

## O que muda para o lojista

Configurações → card "💳 Pix & Cobranças" ganha a linha **Mensagem de cobrança** (com "· Pro" no plano grátis; "Ver mensagem de cobrança" para funcionário). Abre a tela `app/mensagem-cobranca.tsx`.

```
┌ Mensagem de cobrança ─────────────────────────┐
│ [PRO] Mensagem personalizada é do plano Pro   │  ← só dono no plano grátis
│       Teste à vontade e veja a prévia...      │
│                                               │
│ Texto da cobrança                             │
│ É a mensagem que abre no WhatsApp quando...   │
│ ┌───────────────────────────────────────────┐ │
│ │ Olá, {nome}! 👋                           │ │
│ │                                           │ │
│ │ Passando para lembrar que você possui um  │ │
│ │ saldo de *{valor}* em aberto conosco      │ │
│ │ ({negocio}).                              │ │
│ │ ...                                       │ │
│ └───────────────────────────────────────────┘ │
│                                      312/1000 │
│ TOQUE PARA INSERIR NO TEXTO                   │
│ [{nome}] [{valor}] [{negocio}] [{pix}]        │
│ [{vencimento}]   (cada chip com uma dica)     │
│ ⚠ Esta mensagem não mostra o valor da dívida. │  ← avisos inline (âmbar)
│                                               │
│ PRÉVIA                                        │
│ Cliente de exemplo: Maria Souza · deve R$ 150 │
│ ┌ balão verde estilo WhatsApp ──────────────┐ │
│ │ Olá, Maria Souza! 👋 ...                  │ │
│ └───────────────────────────────────────────┘ │
│                                               │
│ [ Salvar mensagem ]   (grátis: [🚀 Desbloquear com o Pro] → /planos)
│ [ Voltar ao padrão ]                          │
└───────────────────────────────────────────────┘
```

Regras:
- **Variáveis** `{nome} {valor} {negocio} {pix} {vencimento}` (maiúsculas/minúsculas tanto faz). Os chips inserem na posição do cursor.
- **Prévia ao vivo** com cliente de exemplo (Maria Souza, R$ 150,00, negócio e Pix reais do lojista; sem Pix cadastrado aparece "(sua chave Pix)" e um aviso).
- **Salvar**: texto vazio é recusado; acima de 1.000 caracteres é recusado; sem `{valor}` pergunta *"Sua mensagem não mostra o valor da dívida. Quer manter assim?"* (Manter assim / Voltar e editar); variável que não existe (ex. `{cliente}`) pergunta antes, pois sairia literal para o cliente.
- **Voltar ao padrão**: se havia modelo salvo, confirma e apaga (volta a `NULL`); senão só restaura o texto no editor. Texto salvo idêntico ao padrão também grava `NULL` (melhorias futuras do padrão valem para quem não personalizou).
- **Plano grátis**: vê a tela e a prévia e pode "testar" digitando, mas o botão é "Desbloquear com o Pro" (vai para Planos). As cobranças dele seguem com o texto padrão. (Para travar a digitação também, é uma linha: `editable`.)
- **Funcionário**: só lê (campo travado, sem chips, sem botões) o que vale nas cobranças do dono.
- **Downgrade Pro→grátis**: o modelo fica guardado, mas as cobranças voltam ao padrão (a regra está dentro de `montarMensagemCobranca`); ao voltar ao Pro ele reaparece.

## Onde o texto é montado (antes: 7 pontos divergentes)

Tudo passa por `lib/whatsapp.ts → montarMensagemCobranca(cliente, saldo, perfil, opcoes)`:

| Tela | Antes | Agora |
|---|---|---|
| `lib/whatsapp.ts` (`cobrarViaWhatsApp`, `montarUrlWhatsApp`; `cobrarVencidoWhatsApp` era código morto e saiu) | 3 textos | função única |
| `app/(tabs)/clientes.tsx` (lista e aba Ranking) | texto próprio, sem negócio nem Pix | função única |
| `app/(tabs)/relatorios.tsx` (maiores devedores) | texto próprio | função única |
| `app/ranking.tsx` | texto próprio | função única |
| `app/cobrancas.tsx` (vencidos, em aberto, "Cobrar vencidos") | `montarUrlWhatsApp` | função única |
| `app/cliente/[id].tsx` e `app/(tabs)/nova-venda.tsx` | `cobrarViaWhatsApp`/`montarUrlWhatsApp` | função única |

Efeito colateral bom e intencional: clientes/relatórios/ranking passam a incluir "(nome do negócio)" e a linha do Pix, como as demais telas, e o telefone com `55` não duplica mais o prefixo.
O **texto padrão** (cobrança em aberto e "em atraso há N dias") é idêntico ao que a tela de Cobranças já usava — testado caractere a caractere contra o texto antigo, com e sem Pix.

`{vencimento}` = vencimento mais antigo em aberto do cliente. Só consulta o banco se o modelo do dono usa `{vencimento}`; sem data, sai "sem data definida". A linha que tem `{pix}` some inteira se o lojista não cadastrou a chave.

## Migration para revisão: `supabase/migrations/mensagem_cobranca_modelo.sql`

1. `perfis.mensagem_cobranca_modelo text` (nula) — nenhuma linha existente muda.
2. `check` de 1 a 1.000 caracteres (ou NULL).
3. Trigger `trg_pro_mensagem_cobranca` (BEFORE INSERT/UPDATE da coluna): recusa gravar texto se o plano **atual** (no UPDATE, `old.plano`) não é `pro`, exceto `service_role`. Apagar (NULL) é sempre liberado. Usa `old.plano` porque `enforce_pro_modules` já impede o cliente de trocar de plano; assim "plano=pro + modelo" na mesma requisição não burla.
4. Acesso: escrever em `perfis` continua sendo só do dono (`perfil_proprio`); funcionário só lê (`perfis_leitura_equipe`) — não precisa de policy nova. `revoke` de EXECUTE da função do trigger, como no padrão do projeto.
5. Reversão comentada no fim do arquivo.

O app antigo (builds 54/88 sem a OTA) não lê nem escreve a coluna: compatível. A OTA nova, se rodar **antes** da migration, não quebra: o hook tenta o `select` com a coluna e, se falhar, repete sem ela (usa texto padrão).

## Como foi testado (sem aparelho)

- `tsc --noEmit` limpo.
- 25 verificações da função central (script em Node sobre o `lib/whatsapp.ts` real): igualdade com o texto antigo, Pro × grátis × downgrade, plano não carregado, `{vencimento}` com/sem data, linha do Pix, variáveis em maiúsculas/desconhecidas, nome com `$&`/`{valor}` (sem reexpansão), telefone com/sem `55`, limite.
- Não testado em aparelho: tela nova, chips (inserção no cursor) e o fluxo de salvar — dependem da migration aplicada e da OTA.

## Roteiro de teste no aparelho (depois da migration + OTA)

1. Conta Pro de teste: Configurações → Mensagem de cobrança → tocar `{vencimento}` no meio do texto, conferir prévia, salvar, cobrar um cliente (Clientes, Cobranças, Relatórios) e ver o texto novo no WhatsApp.
2. Apagar `{valor}` → salvar → aparece o aviso; "Voltar e editar" não salva.
3. "Voltar ao padrão" → confirma → cobrança volta ao texto antigo.
4. Conta grátis: tela abre com selo PRO, botão "Desbloquear com o Pro"; cobrança sai com o texto padrão.
5. Funcionário: campo travado, mostra o texto do dono; cobrança do funcionário usa o texto do dono.
6. Sem internet: cobrança continua com o modelo (cópia local).

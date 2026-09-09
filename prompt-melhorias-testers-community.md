# Implementar melhorias identificadas pelos testadores (Testers Community) — Android + iOS

Fonte: Feedback Report e Production Access Report da faixa de teste fechado "Testers Community" no Google Play (dia 5/16, nenhum bug ou crash relatado — só oportunidades de melhoria).

⚠️ **ATENÇÃO — pendência separada:** 2 dos 4 achados principais do relatório (ASO/palavras-chave da descrição da loja, e screenshots genéricos da Play Store) **NÃO estão cobertos por este prompt** — são ajustes de *listing*, não de código do app. Não deixe de agendar uma tarefa separada de copywriting/design de loja para isso.

**Regra obrigatória:** toda melhoria abaixo que for implementada precisa existir em **ambas as plataformas (Android e iOS)**. Se a implementação for específica de UI e usar algo já disponível só num dos lados, adapte para funcionar igual nos dois — não é aceitável a feature existir só no Android.

**Antes de implementar qualquer item, procure primeiro por código já existente que resolva o achado.** Vários dos pontos abaixo já têm implementação parcial ou completa no projeto — o objetivo pode ser só *confirmar e reforçar*, não recriar do zero.

Siga o fluxo do AGENTS.md: delegue para os agentes responsáveis (visual, backend, qualidade), rode qualidade/QA nos dois SDKs (Android e iOS) antes de considerar concluído, e só reporte como pronto após aprovação do Agente Fiscal. **Não rode `eas build` sem antes confirmar comigo.**

---

## 1. Onboarding / walkthrough para novos usuários
**Problema relatado:** "There is no onboarding or dynamic walkthrough for new users when they first open the app."

- **Já existe implementação em `app/onboarding.tsx`**, roteada automaticamente por `app/index.tsx` via flag `@fiado_onboarding_ok` no AsyncStorage (4 telas: hero + 3 passos — cadastrar cliente → registrar fiado → cobrar pelo WhatsApp). Antes de criar qualquer coisa nova, confirme que esse fluxo já resolve o achado do relatório (aparentemente sim).
- Se resolver: só valide que funciona igual em Android e iOS, e documente que já estava implementado — não crie um segundo onboarding.
- Se faltar algo específico (ex: opção de pular, clareza do fluxo), ajuste o que já existe em vez de duplicar.

## 2. Botão "Avaliar o app" nas Configurações
**Problema relatado:** "Currently, there is no option for users to provide reviews or ratings directly within the app."

- O projeto **já usa `expo-store-review`** (dependência já instalada) em `hooks/useAvaliacaoApp.ts` — já implementa avaliação in-app cross-platform (`StoreReview.isAvailableAsync()` / `requestReview()`) com fallback de link de loja tanto para Android (`market://details?id=com.fiadofacil.app`) quanto iOS, e já dispara automaticamente após 5 acessos (integrado em `app/(tabs)/index.tsx`).
- **Não implemente API nativa separada (nada de `SKStoreReviewController` direto)** — reaproveite as mesmas chamadas de `StoreReview.isAvailableAsync()`/`requestReview()` (com o mesmo fallback de link de loja) já usadas em `useAvaliacaoApp.ts`, mas como uma função separada e **sem o gate de "já avaliou" do `AsyncStorage`** — o botão manual em Configurações precisa disparar a avaliação (ou o fallback) toda vez que for tocado, independentemente da flag que controla o disparo automático dos 5 acessos. Não chame a função do hook automático diretamente: ela retorna sem fazer nada se o usuário já avaliou uma vez.
- Nota de teste: `requestReview()` da Apple tem limite de exibições do próprio sistema operacional e pode não abrir o diálogo nativo de forma confiável em simulador/Expo Go — validar esse caminho específico em dispositivo físico real quando possível. O fallback de link de loja é testável em qualquer ambiente.

## 3. Mecanismo de feedback dentro do app (extra, prioridade menor)
**Sugestão do relatório:** permitir que o usuário envie sugestões/relate problemas direto pelo app.

- Este genuinamente não existe ainda — pode ser simples: botão em Configurações → "Enviar sugestão" → abre e-mail pré-preenchido, ou um formulário curto que grava em uma tabela no Supabase.
- **Use o e-mail de suporte oficial já usado no app: `suporte@fiadofacil.com.br`** (o mesmo já referenciado em `app/(tabs)/configuracoes.tsx`) — não usar `fiadoapp.contato@gmail.com` (esse é só do Instagram). Se tiver dúvida sobre qual canal usar, me pergunte antes de implementar.
- Igual nas duas plataformas.

## 4. Notificações de cobrança pendente (extra, reforça engajamento)
**Sugestão do relatório:** notificações push para lembrar de cobranças pendentes, aumentando o engajamento.

- **Já existe cobertura substancial em `hooks/useNotificacoes.ts`**: lembrete às 9h (vencimento amanhã), às 18h ("Cobranças em atraso"), e reengajamento semanal de clientes inativos.
- Confirme que esse fluxo já atende ao achado do relatório — é bem provável que sim. Só complemente se identificar um gatilho realmente faltante (ex: cliente com fiado pendente há X dias, se isso ainda não estiver coberto).

## 5. Acessibilidade (extra, menor prioridade)
**Sugestão do relatório:** garantir que telas de onboarding e interface principal sigam boas práticas de acessibilidade.

- Hoje não há praticamente nenhum uso de `accessibilityLabel`/`accessibilityRole` no código do app (só na documentação dos agentes).
- Revisar prioritariamente estas telas: `app/onboarding.tsx`, `app/(tabs)/configuracoes.tsx`, `app/(tabs)/nova-venda.tsx` — conferir contraste de cores, tamanho de toque mínimo (44x44pt), e adicionar `accessibilityLabel` nos botões de ação e campos de formulário.

---

## Entrega esperada
Para cada item 1-4 (o item 5 pode ser incluído se rápido): confirmar que a melhoria existe e funciona **igual em Android e iOS**, testado localmente (Expo Go ou simulador/emulador), sem quebrar nada existente. Reportar no final: o que já existia vs. o que foi criado/ajustado, em quais arquivos, e confirmação de paridade entre as duas plataformas. Não subir build (EAS) — aguardar minha confirmação antes desse passo.

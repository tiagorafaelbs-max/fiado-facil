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

## Já aplicado no banco (não depende de build)
- 22/09: `supabase/migrations/revoga_privilegios_anon_tabelas.sql`: o papel `anon` perdeu todos os privilégios nas tabelas e views, e as tabelas futuras nascem sem privilégio para `anon`. Verificado: usuários logados seguem normais, e as edge functions usam a service role.

## Pendências fora do lote
- Foto de comprovante (`nova-venda.tsx:188`): o bucket `comprovantes` **não existe**, e o upload falha sem avisar. Se for ativar: bucket privado + URL assinada. Decisão de produto.
- Webhooks duplicados (`mercadopago-webhook` × `mp-webhook`) e duas libs de IAP: backlog de adequação — decisão registrada em `docs/release/2026-09-25-ciclo-manutencao.md`.
- Dead code do RevenueCat (`hooks/useSubscription.ts`, view `active_subscriptions`, `revenuecat-webhook`): backlog de adequação — decisão registrada em `docs/release/2026-09-25-ciclo-manutencao.md`.
- `lib/whatsapp.ts` (extrato com cálculo próprio de total em aberto): backlog de adequação — decisão registrada em `docs/release/2026-09-25-ciclo-manutencao.md`.
- Testes automatizados e lint: backlog de adequação (`docs/adequacao-fabrica.md`, a criar).

## Antes de pedir o build ao Tiago
Checklist §8.1: lista do lote ✅ · typecheck ✅ · testes (o projeto ainda não tem) · E2E local (teste manual dos fluxos: busca, cliente, pagamento, desfazer venda, excluir cliente, **assinatura Android/IAP com o app minificado — prioridade alta por causa do item 8**) · versão proposta: **1.0.12** (iOS build 82 / Android vc 44) · plataformas: iOS + Android.

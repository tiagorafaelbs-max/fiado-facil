# Pacote: plataforma/versão + aviso de atualização + visibilidade da equipe (04/10)

Status: **PARA REVISÃO** — 2 migrations NÃO aplicadas, OTA NÃO publicada.

Migrations (aplicar nesta ordem, ambas só criam coisas novas):
1. `supabase/migrations/dispositivos_app_e_versao_minima.sql` — tabelas `dispositivos_app` e `config_app`.
2. `supabase/migrations/equipe_autoria_confiavel_e_resumo.sql` — triggers de autoria em `vendas`/`pagamentos` + `perfis.notif_resumo_equipe`.

## O que NÃO dá para fazer (leia primeiro)

- **Quem está no 1.0.11 nunca vai aparecer em `dispositivos_app` nem ver o aviso.** O 1.0.11 não recebe OTA, então não roda código novo. O registro só existe para quem está no 1.0.12 (builds 54/88) ou mais novo. Para achar quem **ainda** está no 1.0.11, use o contrário: usuário ativo recente **sem** linha em `dispositivos_app` (consulta pronta no fim da migration 1). O aviso "atualizar" passa a valer para versões **futuras** (1.0.13+).
- **Resumo diário com números ("X vendas, R$ Y")** exige um servidor (push). Notificação local não calcula nada na hora em que aparece. Nesta entrega o aviso das 19h é fixo ("Veja o que sua equipe lançou hoje…") e leva para Relatórios, onde estão os números. Para o texto com valores é preciso: tabela de tokens de push, edge function agendada (pg_cron) e a aprovação para publicar a função — desenho abaixo, não construído.

## 1) Plataforma e versão

- Ao abrir o app, ao entrar e ao voltar para o app (`app/_layout.tsx → RegistroDispositivo`), `lib/dispositivo.ts → registrarDispositivo()` faz upsert em `dispositivos_app` por `(usuario_id, plataforma)`.
- Grava: plataforma (ios/android), versão instalada, build instalado, `runtimeVersion`, ID do update OTA em uso, canal, primeiro e último acesso (datas do **servidor**, por trigger).
- Dono e funcionário gravam cada um o seu (`usuario_id = auth.uid()`; RLS só do próprio registro; sem DELETE — some com a conta por `on delete cascade`).
- Sem IMEI, ID de publicidade, modelo, sistema operacional ou localização (LGPD).
- Throttle: nada mudou → no máximo 1 gravação a cada 3 h (essa é a precisão do "último acesso"); erro (offline/tabela ainda inexistente) → tenta de novo em 1 h; nunca mostra erro.
- Versão e build vêm de `expo-application` (já está nas builds: é dependência do `expo-notifications`; declarei em `package.json`, com a mesma versão do lockfile). O fingerprint do iOS continua `3ae31820…`; o do Android será conferido na hora da OTA.
- Quando 2 aparelhos da mesma plataforma usam a mesma conta, ficam em 1 linha (o último a abrir).

## 2) Aviso para atualizar

```
┌ Início ──────────────────────────────────────────────┐
│ ⬆  Tem uma versão nova do FiadoApp com correções     │
│    importantes.      [ Atualizar ] [ Agora não ]     │
└──────────────────────────────────────────────────────┘
```
- Compara a versão **instalada** (a da loja, não a do OTA) com `config_app.versao_minima_recomendada` (semente: `1.0.12`, então hoje ninguém vê). Para lançar uma campanha: `update public.config_app set valor = '1.0.13', atualizado_em = now() where chave = 'versao_minima_recomendada';`.
- "Atualizar" abre a loja certa (iOS `apps.apple.com/app/id6783416254`, Android `market://details?id=com.fiadofacil.app`, com endereço web de reserva). Só aviso, nunca bloqueio. Dono e funcionário veem.
- "Agora não" esconde por 3 dias; se a versão mínima mudar, o aviso volta mesmo dentro dos 3 dias. Sem internet ou sem valor válido, não aparece.

## 3) Equipe

**a) "Registrado por" para o dono — confirmado e corrigido.** O dono já via o nome, mas só de funcionário **ativo**: lançamentos de quem foi removido perdiam a identificação. Agora a lista de nomes inclui desativados (RLS conferida: dono lê os 2 registros, funcionário lê só o próprio).
Problema de fundo achado e corrigido na migration 2: `criado_por` era enviado pelo app e **não conferido pelo banco** (um funcionário podia gravar sem autor ou com o autor de outra pessoa). Agora, para usuário logado, o banco grava `criado_por = auth.uid()` no INSERT e nunca deixa o UPDATE mudá-lo. `service_role` e acesso sem JWT não são afetados. Hoje há 1 venda lançada por equipe em 3.597, então o risco de regressão é mínimo.

**b) Selo visual** (`components/ui/SeloEquipe.tsx`: ícone de pessoa + primeiro nome, ex. 👤 Ana):
- Histórico do cliente (vendas e pagamentos) — substitui o texto "Registrado por…".
- Extrato em PDF: "· por Ana" ao lado da descrição, só em lançamento da equipe.
- Extrato por WhatsApp: "| por Ana" na linha da venda, só em lançamento da equipe.
- **Cobranças não tem lançamentos** (a tela lista clientes e saldos), então não há onde pôr o selo ali.
- Atenção: os dois extratos vão **para o cliente**. Mostram só o primeiro nome do funcionário. Se preferir que o cliente não veja, é remover o argumento `nomesEquipe` nas 2 chamadas (cliente/[id].tsx).

**c) Resumo diário (Equipe → "Resumo diário às 19h")**: chave desligada por padrão, só dono (a tela de Equipe já é só dele; o agendamento só roda para dono com papel confirmado). Grava `perfis.notif_resumo_equipe`, pede a permissão de notificações ao ligar e reagenda. Se a coluna ainda não existir, a tela abre normalmente com a chave desligada.
Fase 2 (não construída; precisa da sua aprovação): tabela `push_tokens` (usuario_id, token, plataforma, RLS própria), edge function diária via pg_cron que soma vendas/pagamentos do dia por `criado_por` e envia o texto "Hoje sua equipe lançou X vendas (R$ Y) e Z pagamentos (R$ W)" só ao dono que ligou a opção.

**d) Relatórios → "👥 Por funcionário"** (só dono, só quando há equipe cadastrada): para o período escolhido, cada pessoa com nº e total de vendas e de pagamentos; toque abre os 10 lançamentos mais recentes dela. "Você (dono)" inclui lançamentos antigos sem autor; funcionário removido aparece com o nome dele. É um quadro por pessoa (usa o seletor de período da própria tela), não um filtro que recalcula os demais cartões — fazer isso mexeria nos totais, no PDF e nos rankings; posso fazer depois se preferir.

## Como foi testado (sem aparelho)

- `tsc --noEmit` limpo.
- 21 verificações (Node, sobre os arquivos reais): comparação de versões (1.0.9 < 1.0.12, sufixo, inválidas), nome curto, agrupamento por autor (dono + sem autor, desativado, autor desconhecido, conservação dos totais), extrato por WhatsApp com e sem selo. Mais as 27 da mensagem de cobrança (continuam passando).
- Banco (só leitura, em transação revertida): dono vê os 2 registros de `membros_equipe` (1 desativado); funcionário vê só o dele.
- Não testado em aparelho: registro de versão, faixa de atualização, selo, relatório por funcionário, chave do resumo. Dependem das migrations e da OTA.

## Roteiro de teste (depois das migrations + OTA)

1. Abrir o app (Android e iOS) → conferir 1 linha por plataforma em `dispositivos_app`; abrir de novo em <3 h não duplica nem regrava; trocar de conta cria a linha da outra conta.
2. Funcionário (conta de teste) lança venda e pagamento → `criado_por` = id dele; dono vê o selo no cliente e no extrato; fechar sessão do funcionário, desativar e conferir que o selo continua com o nome.
3. `update config_app set valor='1.0.99'` (em conta de teste, depois voltar a 1.0.12) → faixa aparece no Início; "Atualizar" abre a loja certa; "Agora não" esconde por 3 dias.
4. Equipe → ligar "Resumo diário": pede permissão; às 19h chega o aviso e toca em Relatórios. Desligar cancela.
5. Relatórios → Por funcionário com período "Hoje" e "Mês atual"; somas batem com os totais do período.

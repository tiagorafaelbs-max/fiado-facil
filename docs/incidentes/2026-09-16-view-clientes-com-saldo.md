# Registro de incidente de segurança — FiadoApp

> **RASCUNHO para revisão do advogado.** Não é parecer jurídico. Elaborado em 22/09/2026 a partir do código, do histórico do git e dos logs de acesso do Supabase. Itens marcados **[A CONFIRMAR]** dependem de verificação adicional ou de decisão do controlador.

## 1. Identificação

| Campo | Valor |
|---|---|
| Controlador | [A PREENCHER: razão social / CNPJ / responsável — Tiago Rafael] |
| Produto | FiadoApp (app "caderneta de fiado"), iOS e Android |
| Sistema afetado | Banco de dados Supabase, projeto "Fiado facil" (`eyipcpwmwtajrywouxub`), view `public.clientes_com_saldo` |
| Data da descoberta | 16/09/2026 |
| Data da correção | 16/09/2026, 19:36 (horário de Brasília): commit `e49f441` + migration `fecha_vazamento_view_clientes_com_saldo.sql` |
| Registro elaborado em | 22/09/2026 |

## 2. O que aconteceu (em linguagem simples)

O FiadoApp guarda, para cada comerciante (usuário do app), a lista dos **clientes dele** que compram fiado. As regras de privacidade do banco (RLS) garantem que cada comerciante só veja os próprios clientes.

Uma "visão" do banco (`clientes_com_saldo`), que calcula o saldo devedor de cada cliente, **rodava com permissões de administrador e ignorava essas regras de privacidade**. Ela também estava liberada para o papel público (`anon`), que é a chave pública embutida no app.

**Consequências técnicas enquanto a falha existiu:**
- **(a) Acesso sem login:** qualquer pessoa que extraísse a chave pública do app poderia, tecnicamente, ler os clientes de **todos** os comerciantes sem fazer login.
- **(b) Acesso entre comerciantes:** telas do próprio app que consultavam essa visão **sem filtrar pelo comerciante** (a busca de clientes, o contador de "clientes para cobrar" e as notificações de vencidos) podiam trazer dados de clientes de **outros** comerciantes.

## 3. Dados expostos

- **Titulares afetados:** clientes (pessoas físicas) dos comerciantes que usam o app.
- **Volume no momento da correção:** 473 clientes de 65 comerciantes (medido em 16/09/2026).
- **Campos da visão:** nome, telefone, CPF (quando cadastrado), endereço (quando cadastrado), saldo devedor e status de pagamento (em dia/vencido). **[A CONFIRMAR]** quantos registros tinham CPF e endereço preenchidos.
- **Categoria:** dados pessoais comuns + dados financeiros (dívida). Não há dados sensíveis do art. 5º, II da LGPD. Não há dados de cartão nem senhas.

## 4. Janela de exposição

- **Início provável:** criação da visão, com o projeto (13/06/2026). **[A CONFIRMAR]**: data exata da primeira versão da view em produção.
- **Fim:** 16/09/2026, cerca de 19:36 (BRT).
- **Período coberto pelos logs:** de 26/06/2026 até a correção. O período de 13/06 a 25/06 **não pôde ser verificado** (fora da retenção dos logs); na época o app estava em fase de testes, com uso mínimo.

## 5. Investigação nos logs de acesso (22/09/2026)

Foram analisados, dia a dia, os logs do gateway da API do Supabase (`edge_logs`) de 26/06 a 16/09/2026 (83 dias).

### 5.1 Acesso sem login (cenário "a"): **nenhuma evidência de exploração**
- **Zero** requisições sem login à visão `clientes_com_saldo` sem o filtro do próprio comerciante.
- A única requisição sem login encontrada (14/09, 17:21 UTC) veio do **próprio FiadoApp** (versão 78, iOS, Rio de Janeiro, rede Claro), com sessão expirada e filtro do próprio comerciante. **Não retornou linhas.**
- Todas as requisições à API vindas de fora do app eram **funções internas do próprio sistema** (webhooks de pagamento atualizando a tabela `perfis`) ou **1 teste do desenvolvedor** (PowerShell, 17/07) que foi **recusado** (HTTP 401). Nenhuma tocou a visão dos clientes.

### 5.2 Acesso entre comerciantes (cenário "b"): **exposição possível, a quantificar**
A tela de **busca de clientes** (`app/busca.tsx`) consultava a visão por nome **sem filtrar pelo comerciante**, confiando nas regras de privacidade que a visão ignorava.
- **Período de uso da busca:** de 28/07 a 16/09/2026.
- **Buscas realizadas:** cerca de 1.440.
- **Contas que buscaram:** **6 contas de comerciantes** (IDs iniciados por `85fcf784`, `06a90188`, `f285fa46`, `19a4cd89`, `b02681b4`, `6d72c8ef`).
- **Linhas exibidas nos resultados:** cerca de 2.870 no total, com repetições (a busca roda a cada letra digitada; no máximo 10 resultados por busca). Cada linha mostra nome, telefone e saldo devedor.
**Quem são as 6 contas** (verificado em 22/09/2026):
- `06a90188` e `19a4cd89` são **contas do próprio controlador** (Tiago / Tia Leda), segundo declaração dele e o cadastro.
- `85fcf784`, `f285fa46`, `b02681b4` e `6d72c8ef` são **4 comerciantes terceiros**.
- O app **não tem recurso de equipe compartilhada**: nenhum comerciante tinha acesso legítimo aos clientes de outro.

**Confirmação no banco** (22/09/2026, autorizada pelo controlador; somente contagens, sem extrair dados pessoais):
- **Método:** os termos buscados por cada conta (tirados dos logs) foram comparados com os clientes cadastrados até o momento da correção. Se uma busca devolveu mais resultados do que o comerciante tinha de clientes próprios com aquele nome, a diferença **com certeza** eram clientes de outros comerciantes.

| Conta (terceiro) | Termos buscados | Buscas que com certeza mostraram terceiros | Linhas de terceiros exibidas (mínimo) | Clientes de terceiros que podem ter sido vistos (máximo) | Comerciantes cujos clientes podem ter sido vistos |
|---|---|---|---|---|---|
| `6d72c8ef` (sem clientes próprios) | 2 | 2 | 12 | 12 | 10 |
| `85fcf784` | 3 | 3 | 24 | 95 | 20 |
| `b02681b4` | 4 | 4 | 24 | 27 | 13 |
| `f285fa46` | 262 | 104 | 329 | 358 | 63 |
| **Total** | — | **113** | **≥ 389** (com repetições) | **até ~490** (a soma superestima; há sobreposição entre contas) | **até 63** dos 65 comerciantes |

- **Conclusão:** está **confirmado** que clientes de outros comerciantes foram exibidos, com nome, telefone e saldo devedor, a pelo menos 4 comerciantes terceiros. O número exato de pessoas distintas não pode ser determinado: a busca mostrava no máximo 10 resultados sem ordem definida, e os logs não guardam o conteúdo das respostas. A faixa realista é de **dezenas a algumas centenas de clientes**.
- **Limitação:** as contas do controlador (`06a90188`, `19a4cd89`) também podem ter visto clientes de terceiros. Por serem do próprio controlador, não entram na contagem acima.

Outras consultas sem filtro, de **impacto menor** porque não mostram nome nem telefone:
- contador de "clientes para cobrar" no painel (`app/(tabs)/index.tsx`): apenas um **número**;
- notificações de vencidos (`hooks/useNotificacoes.ts`): IDs e saldos, sem nome. Podem ter mostrado **totais** que incluíam clientes de outros comerciantes.

## 6. Medidas tomadas

1. **16/09/2026:** a visão passou a respeitar as regras de privacidade (`security_invoker = true`), e o acesso do papel público foi revogado (`REVOKE SELECT ... FROM anon`). Teste pós-correção: o papel público recebe "permission denied", e um comerciante autenticado vê só os próprios clientes.
2. Correções de segurança relacionadas no mesmo período:
   - a exclusão de conta passou a apagar o usuário de login (`793ad7c`);
   - o webhook de pagamento passou a exigir sempre a assinatura (`822140a`);
   - foi bloqueada a autopromoção ao plano Pro (`7eb4563`);
   - foi revogada a execução pública de funções sensíveis (`068969f`).
3. **22/09/2026:** investigação dos logs (este documento). O protocolo interno de desenvolvimento passou a exigir um teste automático "sem login não lê nada" e a revisão do Security Advisor do Supabase antes de qualquer mudança no banco.

4. **22/09/2026:** filtro explícito do comerciante adicionado no código da busca, do contador do painel e das notificações (segunda camada de proteção), aprovado pelo Agente Fiscal. Entra no próximo build (`docs/release/PROXIMO-BUILD.md`). Conferido no banco: a visão continua com `security_invoker=true`, e o papel público não tem acesso.

5. **22/09/2026:** o filtro do comerciante foi estendido a todas as leituras, edições e exclusões do app (aprovado pelo Agente Fiscal).
6. **22/09/2026:** no banco, o papel público (`anon`) perdeu **todos** os privilégios em tabelas e visões (migration `revoga_privilegios_anon_tabelas.sql`), e tabelas futuras não recebem privilégio público por padrão. Agora são duas camadas independentes: privilégio + RLS.

**Recomendadas (pendentes):**
- Rodar o Security Advisor do Supabase e o teste "sem login não lê nada" em todas as tabelas e visões.
- Confirmar os itens **[A CONFIRMAR]** acima.
- Avaliar com o advogado se é preciso orientar os 4 comerciantes terceiros a não usar nem guardar dados de clientes que não são deles (ex.: contatos anotados a partir da busca).

## 7. Avaliação de risco (a validar pelo advogado)

| Fator | Avaliação preliminar |
|---|---|
| Exploração externa (sem login) | Nenhuma evidência nos 83 dias com logs; 13 dias iniciais não verificáveis |
| Exposição entre comerciantes | **Confirmada**: 4 comerciantes terceiros viram, pela busca, clientes de outros comerciantes (≥ 389 linhas; até cerca de 490 clientes e até 63 comerciantes cujos clientes podem ter sido vistos) |
| Natureza dos dados | Nome, telefone e saldo devedor (e CPF/endereço na visão, mas **não exibidos** na busca) |
| Potencial de dano | Constrangimento (exposição de dívida) e uso indevido de telefone; baixo risco de fraude financeira direta |
| Titulares identificáveis | Sim (nome + telefone) |

**Pergunta ao advogado:** à luz da Resolução CD/ANPD nº 15/2024, o incidente "pode acarretar risco ou dano relevante" aos titulares, o que exigiria comunicar a ANPD e os titulares? Se exigir, o prazo de 3 dias úteis contados do conhecimento (16/09) já passou: avaliar a comunicação tardia com justificativa.

## 8. Anexos / evidências

- Migration da correção: `supabase/migrations/fecha_vazamento_view_clientes_com_saldo.sql`
- Commits: `e49f441`, `793ad7c`, `822140a`, `7eb4563`, `068969f` (repositório `fiado-facil`)
- Consultas usadas na investigação dos logs: registradas na sessão do Claude Code de 22/09/2026 (podem ser reexecutadas enquanto os logs estiverem retidos). **Recomendação: exportar os logs de 26/06 a 16/09 agora**, antes que saiam da retenção.

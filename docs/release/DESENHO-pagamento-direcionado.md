# Pagar uma venda específica (pedido de cliente revendedora Natura) — DESENHO PARA REVISÃO

Status: **desenho + migration para revisão. Migration NÃO aplicada. Nenhum código de tela foi alterado.**
Arquivos: `supabase/migrations/pagamento_direcionado_a_venda.sql`, `supabase/simulacoes/pagamento_direcionado_simulacao.sql`, `lib/alocacao.ts` (lógica pura, ainda sem uso nas telas).

## O pedido
Hoje todo pagamento quita pela ordem FIFO (vencimento efetivo → data da venda → id). A cliente quer dizer "ela me pagou o batom (R$ 157,80)" e ver ESSA venda como paga, mesmo vencendo depois de outras.

## O que já existe (confirmado)
- `pagamentos.venda_id` **existe** (uuid, nulo, FK → `vendas(id)` `ON DELETE SET NULL`). **0 de 976 pagamentos** o usam. O app já aceita o campo em `registrarPagamento({ venda_id })` (hooks/useVendas.ts) e no tipo `Pagamento`; só nenhuma tela o preenche.
- Quem calcula quitação/atraso: view `clientes_com_saldo` (status vencido/atenção), RPC `reconciliar_pago_cliente` (flag `vendas.pago`), a estimativa `contar_vendas_sem_vencimento` (aviso das vendas antigas) e `calcularScore` em `app/cliente/[id].tsx`. O saldo (`vendido − pago`) é agregado e **não muda**.

## Regra nova (banco)
1. Um pagamento com `venda_id` quita **primeiro** essa venda, até o valor dela.
2. A **sobra** (valor acima do que falta na venda escolhida) e os pagamentos sem `venda_id` seguem o FIFO normal, sobre o que ainda falta das demais vendas.
3. Valor menor que a venda escolhida → ela fica **parcialmente paga** (`pago = false`); o resto dela volta para a fila FIFO como qualquer dívida.
4. Sem nenhum `venda_id` o resultado é **idêntico ao de hoje**.
5. Trava nova: o `venda_id` tem que ser venda do **mesmo cliente e do mesmo negócio** (a RLS atual de pagamentos não confere isso) — trigger `valida_pagamento_venda`.
6. Venda apagada → o `SET NULL` da FK solta o pagamento (vira pagamento normal) e o app já reconcilia depois de excluir venda.

Fórmula (por cliente): `resto_i = valor_i − min(direcionado_i, valor_i)`; `solto = total_pago − Σ min(direcionado_i, valor_i)`; a venda i está paga se `(resto_i = 0 e houve direcionado)` ou `Σ resto (em ordem FIFO, até i) ≤ solto`. A view usa a mesma conta para vencido/atenção.

## Simulação sobre os dados reais (somente leitura)
- **Vendas cujo `pago` mudaria se aplicada hoje: 0 de 4.130** (nova alocação × atual, sem direcionamento).
- **Clientes cujo status/saldo mudaria: 0 de 2.362** (268 vencidos antes e depois).
- Custo da view: 2,07 s × 2,11 s na varredura total (mesma ordem; por loja é muito menos). Sem regressão.
- Cenário hipotético (nada gravado), cliente com 24 vendas em aberto, pagamento de R$ 42 "escolhendo" a última: hoje, solto, o dinheiro quitaria as 2 mais antigas (R$ 13 + R$ 22) e sobraria R$ 7; direcionado, quita a venda de R$ 42 e as demais ficam como estão.
- Testes da versão em JS (`lib/alocacao.ts`, 14 verificações + 6.000 casos aleatórios): sem `venda_id` = FIFO de sempre; nunca paga mais que a venda; soma paga = min(total pago, total vendido). Caso batom R$ 157,80 coberto (quitado, parcial R$ 100/157,80, sobra de R$ 42,20 vai para a mais antiga).

## Telas (a implementar depois da migration aprovada e aplicada)
**Registrar pagamento** (modal de `app/cliente/[id].tsx` e `app/novo-pagamento.tsx`; o Registrador Rápido pode ganhar depois):
```
Valor  [ R$ 157,80 ]
Aplicar em
 (•) Parcela mais antiga (padrão)          ← comportamento de hoje
 ( ) Escolher venda
      ▸ Batons e presente      R$ 157,80   vence 20/10
        Perfume                R$ 200,00   vence 10/10
        Creme (R$ 40 pagos de R$ 90)  falta R$ 50
 Se o valor passar do que falta na venda, o que sobrar quita as próximas por ordem.
```
- Lista = vendas em aberto do cliente (da alocação do app, `lib/alocacao.ts`) com o que falta de cada uma. Vendas lançadas **offline e ainda não sincronizadas** aparecem desabilitadas ("sincronizando…"): o id real só existe depois do envio.
- "Parcelado": as parcelas herdam a venda escolhida.
- Funciona offline: o `venda_id` entra no payload da fila (já vai em `registrarPagamento`); a validação do banco roda quando sincroniza. **Se a venda foi apagada antes disso, o banco devolve 23514 e a fila tentaria para sempre: na implementação, ao receber 23514 a fila reenvia o pagamento SEM `venda_id` (vira pagamento solto, o dinheiro entra) e avisa o usuário** (recomendação do Fiscal).
- Funcionário usa igual (RLS de inserir pagamento já cobre; a trava confere cliente/negócio).
- Plano: **grátis e Pro** (nenhuma trava).

**Histórico do cliente:** no pagamento, "→ Batons e presente" (descrição da venda; "→ venda removida" não aparece porque o `venda_id` vira nulo). Na venda com pagamento direcionado parcial: "R$ 100,00 pagos de R$ 157,80". Só aparece para venda que recebeu pagamento direcionado (o limite do FIFO continua como hoje).

## Ordem de entrega
1. Você revisa/aprova a migration → eu aplico (com roteiros em transação revertida, como nas anteriores).
2. Fiscal revisa as telas → OTA (Android e iOS; builds 54/88 recebem; 1.0.13 também).
3. Builds antigos que ainda não têm a tela simplesmente não mandam `venda_id`: nada muda para eles. Se alguém registrar pagamento direcionado e abrir um build antigo, o `calcularScore` local ignora o direcionamento (só o selo "ótimo/bom pagador"), enquanto saldo, vencidos e Cobranças já usam a regra nova.

## Pontos para você decidir
1. **Sobra do pagamento direcionado** segue o FIFO (como pedido). Alternativa: recusar valor maior que o que falta na venda escolhida.
2. **Editar o destino** de um pagamento já lançado: fica fora da primeira versão (hoje só dá para excluir e refazer).
3. **Registrador Rápido** (botão flutuante) fica sem a opção na primeira versão, para não carregar a tela.
4. "R$ X pagos de R$ Y" só para direcionado parcial (não para a sobra do FIFO).

## Como foi conferido / o que falta
- Conferido: sintaxe e lógica por leitura, simulação em dados reais (acima), testes em Node, tsc.
- **Não** foi rodado DDL no banco. Roteiros pós-aplicação (cada um em transação revertida): pagamento com `venda_id` de outro cliente é recusado; direcionado quita a venda escolhida e a sobra cai no FIFO; excluir a venda solta o pagamento; `clientes_com_saldo` mantém `security_invoker` e as mesmas colunas.

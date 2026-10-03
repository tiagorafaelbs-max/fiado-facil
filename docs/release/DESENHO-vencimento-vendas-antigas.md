# DESENHO (não implementado) — vendas antigas sem data de vencimento

Status: **só desenho, aguardando decisão do Tiago.** Mexe em dados de clientes reais — nada foi implementado nem executado.

## Contexto
- 38% das 2.630 vendas em aberto dos últimos 30 dias (todos os clientes) não têm `data_vencimento`: nunca viram "vencidas", não entram em Cobranças/Vencidos nem nos lembretes.
- Já implementado (OTA futura): vendas NOVAS ganham vencimento padrão (hoje + 30 dias ou próximo `dia_cobranca` a ≥ 7 dias), editável, com "Sem vencimento" explícito; dívida anterior vence na data informada + 30 dias.
- Este desenho trata só das vendas ANTIGAS (`pago = false` e `data_vencimento is null`).

## Riscos a ter em mente
1. **Ordem da quitação (FIFO).** As RPCs/views ordenam por `data_vencimento ASC NULLS LAST` (`reconciliar_pago_cliente_rpc.sql`, `fix_datas_plausiveis_e_view_saldo_fifo.sql`). Com o padrão nas vendas novas, uma venda nova COM data passa a ser quitada ANTES de uma antiga SEM data do mesmo cliente: no extrato a nova aparece paga e a antiga em aberto. Preencher as antigas (este item) corrige isso — é um argumento a favor de fazer o (c).
2. **Efeito imediato nas Cobranças.** Dependendo da regra de data, muitas vendas antigas passam a "vencidas" de uma vez (lista de Cobranças e lembretes das 18h crescem de repente).
3. **Dado de cliente real:** precisa de confirmação explícita, escopo mínimo, registro do que mudou e como desfazer.

## Decisão 1 — a base dos 30 dias (preciso da sua escolha)
- **Opção A (recomendada): `data_venda + 30 dias`.** Coerente com a dívida anterior e com a regra das vendas novas; vendas com mais de 30 dias nascem vencidas (é o que realmente são). Antes de confirmar, o dono vê quantas ficarão vencidas de imediato.
- **Opção B: `hoje + 30 dias`.** Nenhuma venda vira vencida de imediato (dá um "prazo de graça"), mas perde o atraso real e mantém o item 1 acima parcialmente.
- Pode ser um escolha na própria confirmação ("A partir da data da venda" / "A partir de hoje").

## Desenho da tela
- **Quem vê:** só o **dono com papel confirmado** (`podeVerTotais`). Funcionário não vê o aviso (nem contagem) — assim nunca aparece valor somado para ele (regra (d)) e a ação em massa fica no dono. *Alternativa:* funcionário vê só "N vendas sem vencimento" sem botão (me diga se prefere).
- **Onde:** faixa no Início (abaixo do checklist/alertas) e no topo de Cobranças.
- **Texto:** "N vendas em aberto sem data de vencimento. Elas nunca aparecem como vencidas. Definir 30 dias para elas?" — botões **Revisar** e **Agora não** (esconde por 7 dias, guardado por tenant no aparelho). Sem valores em R$.
- **Tela de confirmação (obrigatória):** mostra N total, quantas ficarão **vencidas hoje** e quantas **a vencer**, a escolha da base (A/B), e o aviso "isso altera N vendas; dá para desfazer em até 30 dias". Botão final **Confirmar e definir vencimentos**. Desligado sem internet.
- Depois: toast "N vendas atualizadas", recarrega Início/Cobranças e reagenda as notificações (`agendarNotificacoesVencimento`).

## Desenho técnico (precisa de migration — só aplico com sua autorização)
- **RPC `definir_vencimento_padrao_vendas(p_base text)`** (`security definer`, `set search_path = public`, `grant execute` só para `authenticated`):
  - exige `auth.uid() = tenant_id_atual()` e que quem chama seja o **dono** (não funcionário);
  - `UPDATE vendas SET data_vencimento = <data_venda + 30  |  current_date + 30> WHERE usuario_id = <dono> AND pago = false AND data_vencimento IS NULL` (nada além disso; respeita a constraint `vendas_datas_plausiveis`);
  - grava cada venda alterada numa tabela de auditoria e retorna a contagem;
  - **idempotente** (rodar de novo não pega mais nada) e dentro de uma transação.
- **Tabela `vendas_vencimento_backfill`** (`id`, `usuario_id`, `venda_id`, `executado_em`, `executado_por`, `base`): é o que permite **desfazer** (`UPDATE ... SET data_vencimento = NULL` só para esses `venda_id` que ainda estejam com a data que a RPC colocou). RLS: só o dono lê.
- **RPC `desfazer_vencimento_padrao_vendas()`**: reverte, apenas para vendas ainda `pago = false` e que não foram editadas depois (compara a data gravada).
- **RPC de contagem `contar_vendas_sem_vencimento()`** (somente leitura): devolve N e o recorte vencidas/a vencer para o aviso — nenhuma soma em R$.
- Pós-execução: `reconciliarPagoCliente` não é necessário (a flag `pago` não muda), mas as views FIFO passam a ordenar pelas novas datas — conferir um cliente de teste.

## Plano de execução seguro (sem tocar em cliente real antes da hora)
1. Você escolhe a base (A/B) e aprova o desenho.
2. Eu escrevo a migration + telas e o Fiscal revisa; **nada aplicado**.
3. Aplico a migration só com sua autorização explícita; primeiro rodo só a contagem (somente leitura) para dimensionar.
4. Teste com **conta de teste** (nunca conta de cliente): criar vendas sem vencimento, rodar, conferir Cobranças/FIFO, desfazer.
5. Publicar por OTA só depois; o dono de cada loja confirma por conta própria dentro do app.

## Perguntas para decidir
1. Base dos 30 dias: **A (data da venda)** ou **B (hoje)**?
2. Funcionário: não vê nada (recomendado) ou vê só a contagem?
3. Posso incluir a tabela de auditoria + RPC de desfazer (recomendado)?
4. "Agora não" esconde por 7 dias — ok?

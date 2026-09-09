# FiadoApp — Levantamento estratégico do Instagram + Prompt para imagens no GPT

## 1) Pesquisa de mercado — o que realmente funciona em 2026

Cruzando várias fontes de marketing atualizadas (Sprout Social, Salesforce, Social Champ, Slam Media Lab):

- **Reels são o motor de descoberta**, não o feed estático. Posts de grade servem pra reter quem já segue; Reels são o que te coloca na frente de gente nova. Perfil que só posta carrossel cresce devagar.
- **O perfil precisa comunicar "quem sou e por que devo importar" em segundos** — bio, foto e destaques (Stories em destaque) são a vitrine, não decoração.
- **Comunidade engajada > número de seguidores.** 1.000 seguidores que comentam e usam o produto valem mais que 10 mil parados. Isso favorece conteúdo que gera comentário/salvamento (educativo, depoimento real), não só curtida.
- **Microinfluenciadores locais** (5 mil–50 mil seguidores) convertem melhor que parcerias grandes — pra vocês, isso é literalmente "comerciante de bairro com Instagram ativo", não celebridade.

**O que isso muda no nosso plano atual:** o calendário de 30 dias que já existe é forte em carrossel/estático (bom pra retenção), mas fraco em Reels (motor de crescimento). Recomendo layer extra: transformar os roteiros de Reels já escritos (dias 3, 7, 10, 15, 19, 24, 27, 30) em prioridade real de produção — são 8 dos 30 dias, mas deveriam ser o foco de esforço, não os carrosséis.

**Contexto Brasil (as fontes pesquisadas são globais/EUA — isso aqui é o ajuste local):**
- O CTA que mais converte com comerciante de bairro brasileiro é **"chama no WhatsApp"**, não link externo/bio genérica — o público migra pra conversa direta muito mais fácil que pra um site.
- Horário de pico de engajamento desse público tende a seguir a **rotina do comércio local**: antes de abrir a loja (~7h-8h) e à noite após fechar (~19h-21h) — não os horários genéricos internacionais que os guias de marketing recomendam.
- No Brasil, pra esse público, o Instagram ainda domina sobre TikTok/Threads — faz sentido concentrar o esforço só aqui por enquanto.

## 2) Onde as fotos reais (com pessoas) entram

Do calendário, os pontos que pedem foto real de gente (não card gráfico) são exatamente os que você quer gerar no GPT:
- **Arte 4** — mão real segurando celular com o app, balcão desfocado atrás
- **Arte 5** — caderno de fiado gasto sobre balcão (sem pessoa, mas precisa parecer foto real, não render)
- **Arte 7** — mão registrando venda no celular, no balcão
- Depoimentos (Artes 3, e os do calendário: Seu Zé, Dona Marta, Seu João) — hoje sem imagem, poderiam ganhar uma foto de "mão seg apenas parte do rosto ou ambiente" pra não inventar rosto de pessoa que não existe

## 3) Regra obrigatória de uso — leia antes de gerar qualquer imagem

**Nunca combine uma foto gerada por IA com uma citação atribuída a um nome específico de cliente** (Seu Zé, Dona Marta, Seu João, ou qualquer nome real de depoimento). Mesmo com o rosto oculto ou de costas, colocar uma "pessoa ambientada" ao lado de uma frase entre aspas com nome cria a impressão de prova social real — isso é depoimento fabricado, e o público não distingue "imagem ilustrativa" de "cliente de verdade" sem um rótulo explícito.

**Como usar essas fotos com responsabilidade:**
- Fotos ambientadas geradas por IA (mão no celular, balcão, caderno) só em posts **educativos/genéricos** — "como o fiado funciona", "rotina de quem usa o app" — nunca coladas a uma citação com nome próprio.
- Depoimento com nome só quando for de um cliente real (como já fizemos com a Erika Soares, avaliação verdadeira da App Store) — nesse caso, sem foto de rosto gerada, só o texto real + estrelas.
- Se algum dia quiser imagem "tipo depoimento", rotule explicitamente como "imagem ilustrativa" no post, ou use um card gráfico com iniciais/avatar estilizado (não fotorrealista) em vez de uma foto realista.

## 4) Por que imagem de IA "entrega o jogo" (e como evitar)

Pesquisei especificamente isso. As fontes (ArtSmart, Pixova, MiraFlow, guias de prompt pra GPT-4o) convergem em:

- **Falta de imperfeição é o maior delator**: pele muito lisa, simetria perfeita, luz genérica. Precisa pedir explicitamente poros, sardas, assimetria leve, textura de tecido.
- **Câmera e lente precisam ser nomeadas**: "Canon EOS 5D, lente 85mm f/1.8" não é frescura — é isso que ancora o modelo a gerar profundidade de campo e compressão de foto real, não ilustração.
- **Luz precisa ser específica**: "luz de janela lateral suave", "hora dourada" — nunca deixar sem especificar, senão vem luz de estúdio genérica (o "tell" mais comum de IA).
- **Para o GPT-4o especificamente**: prompts conversacionais e iterativos funcionam melhor que um texto gigante único — vale gerar, olhar, e refinar em 2-3 rodadas ao invés de tentar acertar tudo de uma vez.

---

## 5) O PROMPT — cole no GPT (imagem)

### Prompt-base (use para qualquer foto do FiadoApp com pessoas/ambiente)

```
Fotografia realista, não ilustração, não render 3D, não CGI, não estilo cartoon.

Cena: [DESCREVER A CENA ESPECÍFICA — ver variações abaixo]

Pessoa: [descrever] — brasileiro(a), entre 35-55 anos, pele com textura real e poros visíveis, leve assimetria natural no rosto, expressão humana genuína e não performática (não é sorriso de banco de imagens — é uma expressão de trabalho real: concentração, cansaço leve, satisfação discreta). Roupa de trabalho real e usada (avental de mercado, camisa de botão desgastada, ou uniforme simples), sem estar impecável.

Ambiente: comércio de bairro brasileiro real — balcão de fórmica com desgaste, prateleiras com produtos reais (não genéricos), iluminação de loja comum (fluorescente ou luz de entrada lateral), levemente desorganizado como um comércio de verdade, nunca um cenário "de estúdio" ou perfeitamente arrumado.

Câmera e lente: simular Canon EOS 5D Mark IV, lente 85mm f/1.8, profundidade de campo rasa com o fundo desfocado (bokeh real de lente, não desfoque artificial uniforme).

Luz: luz natural de janela lateral suave OU luz de loja fluorescente levemente amarelada — nunca luz de estúdio genérica, nunca iluminação perfeitamente uniforme.

Textura e imperfeição: grão de filme sutil, pequenas imperfeições de pele (poros, uma ruguinha, uma marca de expressão), tecido da roupa com textura visível e amassados reais, reflexos e sombras inconsistentes como em foto tirada de verdade.

Enquadramento: [especificar — close na mão, plano médio, etc.]

Formato de saída: [9:16 para Stories/Reels | 4:5 para feed | 1:1 quadrado]

Paleta sutil: quando possível, um elemento discreto da cena (avental, caneca, detalhe de roupa) em tom verde-escuro ou âmbar terroso, sem parecer produto de marketing — nunca cores neon ou saturação de propaganda.

Evitar completamente: pele lisa/plástica, simetria perfeita de rosto, sorriso de banco de imagem, iluminação de estúdio genérica, fundo genérico/borrado sem contexto, mãos deformadas, textos ou logotipos inventados na cena, aparência de render 3D ou jogo, cores saturadas demais tipo publicidade genérica. Qualquer texto, número ou letra em embalagens, placas ou telas ao fundo deve ficar desfocado o suficiente pra não gerar texto quebrado/ilegível — nunca pedir texto nítido de fundo.

Qualidade: fotorrealista, alta resolução, aparência de foto tirada com celular ou câmera profissional em ambiente real — não still de campanha publicitária.
```

### Variações prontas (troque o trecho "[DESCREVER A CENA]" acima por uma dessas)

**Para a Arte 4 — mockup do app na mão:**
> Cena: close-up de uma mão de comerciante segurando um smartphone Android comum (não um iPhone genérico de propaganda — um modelo comum, com case simples ou até arranhado), tela do celular acesa mostrando um app de finanças com fundo verde escuro (não precisa ficar nítido o conteúdo da tela, só sugerir). A mão está apoiada perto de um balcão de loja real, com produtos desfocados ao fundo.

**Para a Arte 7 — registrando uma venda:**
> Cena: mão de comerciante digitando no celular em cima do balcão de uma mercearia/padaria, ao lado tem uma caneta parada e um bloquinho de papel antigo (contraste proposital entre o jeito velho e o novo), luz de balcão de loja real.

**Para post educativo genérico (rotina de quem usa o app) — NUNCA usar ao lado de citação com nome:**
> Cena: pessoa de meia-idade atrás do balcão de uma mercearia/bar de bairro brasileiro, de costas ou de perfil (rosto não totalmente visível, pra não simular um "rosto real" específico que não existe), organizando produtos ou olhando o celular, expressão tranquila e cotidiana, nada posado.
>
> ⚠️ Uso: só em post educativo/ilustrativo genérico. Não usar em post de depoimento com nome (ver regra na seção 3).

---

## 6) Validação

Esse documento passou por um agente validador antes de chegar até você. Veredito: **aprovado com ajustes** — os ajustes já foram aplicados nas seções acima:
- ✅ Adicionado contexto Brasil (WhatsApp como CTA, horários locais) na seção 1.
- ✅ Adicionada regra obrigatória contra combinar foto de IA com depoimento nomeado (seção 3, era o risco mais sério apontado).
- ✅ Adicionado campo de formato de saída (9:16/4:5/1:1) e reforço contra texto ilegível de fundo no prompt.
- ✅ Adicionada orientação de paleta sutil (verde/âmbar) nas cenas ambientadas.

O documento já reflete a versão final validada.

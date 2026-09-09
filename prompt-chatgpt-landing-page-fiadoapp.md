# FiadoApp — Pesquisa validada + Prompt final para o ChatGPT criar a landing page

Processo usado: 3 agentes de setor (SEO, Copywriting, Design) pesquisaram em paralelo → cada um foi auditado por um validador independente do próprio setor → só depois disso os achados foram consolidados aqui. Todos os 3 setores voltaram **"aprovado com ajustes"** — os ajustes já estão aplicados no que segue.

---

## 1) SEO — palavras-chave validadas (com as correções do validador)

**Termos comerciais prioritários** (pessoa pronta pra baixar):
`app de controle de fiado` · `caderno de fiado digital` · `app de fiado grátis` · `cobrar cliente pelo whatsapp` · `app para MEI controlar vendas fiado` · `controle de vendas a prazo` · `app fiado para mercadinho/lanchonete/bar/salão` · `receber pix fiado` · `app de fiado sem mensalidade` · `app de fiado seguro` · `app de fiado offline`

**Termos informacionais** (topo de funil, bom pra blog/FAQ):
`como controlar fiado no caderno ou app` · `evitar calote cliente fiado` · `cliente não paga fiado o que fazer` · `planilha de fiado` (concorrente de comportamento — muita gente usa Excel/Sheets)

**Ressalva do validador:** essa lista é qualitativa (baseada em concorrência real, não em ferramenta de volume tipo Keyword Planner/Semrush) — trate como ponto de partida, não como dado de volume confirmado.

**Recomendações técnicas:**
- Title 50-60 caracteres, keyword no início + marca no fim
- Meta description 150-160 caracteres, com CTA
- H1 único com a keyword principal; H2s por variação/vertical (MEI, mercadinho, lanchonete)
- Schema `SoftwareApplication` com `aggregateRating` — **schema `FAQPage` pode ser implementado mas não prometa rich snippet garantido** (Google restringiu elegibilidade desde 2023, majoritariamente pra sites governamentais/saúde)
- Core Web Vitals mobile-first (LCP baixo, imagens em WebP, sem JS bloqueante)

---

## 2) Copywriting — gatilhos validados (com as correções do validador)

**Eixo central (3 gatilhos que são a mesma dor reformulada — usar como reforço, não como 3 mensagens independentes):**
- Medo do calote / perda evitável: *"Chega de perder dinheiro porque esqueceu quem te deve."*
- Segurança e controle, não lucro fácil: *"Você não vende menos fiado, você para de perder o que já vendeu."*
- Urgência de perda contínua: *"Cada dia sem anotar é um cliente que você pode esquecer de cobrar."*

**Gatilhos independentes (promovidos pelo validador):**
- **Vergonha de cobrar conhecido** (dor social distinta do medo do calote): *"Cobre sem passar vergonha — a mensagem sai pronta, você só confere e envia."*
- **Segurança/privacidade dos dados do cliente**: *"Só você vê quem te deve. Seus dados não são vendidos nem compartilhados."*
- Simplicidade: *"Se você sabe usar WhatsApp, você sabe usar o FiadoApp."*
- Reciprocidade prática: *"É grátis e continua grátis — sem pegadinha, sem cartão, sem contrato."*
- Autoridade por transparência: *"Veja como fica sua lista de fiado — sem precisar cadastrar cartão pra testar."*

**Palavras/expressões de alta conversão:** sem enrolação · na prática/de verdade · sem pegadinha · direto ao ponto · continua grátis · cobrar sem constrangimento · organize o fiado
**CTAs:** "Quero controlar meu fiado" · "Testar agora, sem cartão" · "Começar de graça" · "Ver como funciona"

**Armadilhas a evitar (nominal, por pedido do validador):** nunca usar "alavancar", "potencializar", "ecossistema" ou qualquer jargão fintech genérico. Nunca prometer ganho exagerado (padrão de golpe de renda extra). Nunca dizer só "grátis" sem negar explicitamente cartão/depósito/CPF antecipado.

**Nota:** o dado "74,8 milhões de negativados" apareceu numa busca sem fonte primária clara — **não usar** sem confirmar direto no site da Serasa/CNDL.

---

## 3) Design/Estrutura — validado (a estrutura já é a certa)

Estrutura confirmada como correta pelo validador — **não reordenar**:
**Hero → Prova social → Problema → Solução → Como funciona → Planos → FAQ → CTA final**

Único refinamento aprovado: destacar UM depoimento real (nome, foto/iniciais, tipo de negócio) com mais espaço dentro da seção de prova social, em vez de criar uma seção nova.

**Anti-"cara de IA" (checklist):**
- Paleta própria, nunca gradiente roxo-azul genérico
- Tipografia com personalidade, nunca só Inter default
- Screenshot real do app, nunca ilustração cartoon genérica
- Nunca 3 cards cinza arredondados idênticos em fileira (assinatura de template raso)
- Copy específica e concreta — headline tipo "Aumente sua conversão hoje" é sinal de IA
- Microinterações intencionais, não "fade-in em tudo"
- Espaço em branco generoso, hierarquia clara
- Dark mode OK **se** auto-detectado (respeita preferência do sistema) e não-forçado, com o claro como tema dominante — dark mode "porque sim"/decorativo é que é sinal de IA

**Credibilidade prioritária:** nota/selo de loja de app + nº de usuários · depoimento real nomeado · garantia simples sem risco (grátis, sem cartão, cancele quando quiser).

---

## 4) O PROMPT — copie e cole no ChatGPT

```
Crie uma landing page completa (HTML + CSS + JS, tudo num arquivo único) para o FiadoApp,
um aplicativo brasileiro que ajuda pequenos comerciantes (donos de mercadinho, lanchonete,
bar, salão de beleza, MEI) a controlar vendas fiado (a prazo), organizar quem deve, e cobrar
pelo WhatsApp com Pix. NÃO é um banco, é "o app do comerciante".

REGRA MAIS IMPORTANTE: essa página não pode parecer feita por IA. Isso significa,
especificamente:
- Nada de gradiente roxo-azul genérico. Use uma paleta própria: verde escuro (#007A3C),
  âmbar (#F59E0B), fundo levemente acinzentado (#F8FAFC), texto quase-preto (#0F172A).
- Nada de fonte Inter genérica sem intenção. Use uma combinação de fonte serifada com
  personalidade para títulos + uma sans-serif limpa para o corpo do texto.
- Nada de ilustração cartoon genérica de "pessoa mexendo em celular gigante". Descreva
  elementos visuais como se fossem screenshots reais do app (mockup de celular com uma
  tela mostrando: nome do cliente, valor da dívida, botão de cobrar pelo WhatsApp) — não
  arte abstrata.
- Nada de 3 cards cinza com cantos arredondados idênticos em fileira — isso é a marca
  registrada de landing page de template raso.
- Nada de headline vaga tipo "Aumente sua conversão hoje" ou "Solução inteligente para
  o seu negócio" — toda frase precisa ser específica e concreta sobre FIADO, não sobre
  "gestão" genérica.
- Micro-interações discretas e intencionais (hover sutil em botões, uma transição de
  scroll bem calibrada) — nunca "fade-in em tudo que existe na página".
- Modo escuro é permitido, mas só se for auto-detectado pela preferência do sistema
  (prefers-color-scheme) e nunca forçado — o tema claro deve ser o dominante.

PÚBLICO-ALVO: dono de comércio de bairro brasileiro, 30-55 anos, usa WhatsApp no dia a dia,
não tem tempo pra aprender sistema complicado, e é DESCONFIADO de coisa que promete
"ganhar dinheiro fácil" (associa a golpe). Fale a língua dele: "fiado", "caderninho",
"cobrar", "anotar" — nunca "alavancar", "potencializar", "ecossistema" ou qualquer
jargão de fintech corporativa.

ESTRUTURA DA PÁGINA (nesta ordem exata):
1. Hero — headline específica sobre a dor real do fiado + subheadline + CTA único
   ("Testar agora, sem cartão" / "Começar de graça") + mockup de celular mostrando o app
2. Prova social — nota/estrelas de avaliação de loja de app, número de comerciantes
   usando, e UM depoimento real em destaque (nome, tipo de negócio, ex: "Dona Marta,
   mercearia") com mais espaço visual que os outros elementos dessa seção
3. Problema — em prosa curta, sem bullet points, descreva a realidade do caderno de
   fiado: o constrangimento de cobrar conhecido, o dinheiro perdido por esquecimento,
   a bagunça de anotar em papel
4. Solução — 4 funcionalidades focadas em RESULTADO, não em feature técnica (ex: não
   "registro de vendas", e sim "anote o fiado em 5 segundos, sem esquecer")
5. Como funciona — 3 passos visuais: cadastrar cliente → registrar fiado → cobrar
   pelo WhatsApp com Pix
6. Planos — Grátis vs Pro, preço visível e claro (nunca esconder atrás de "fale conosco"),
   com garantia "sem cartão, sem fidelidade, cancele quando quiser"
7. FAQ — responda objeções reais: "é seguro?", "funciona sem internet?", "preciso saber
   mexer bem no celular?", "tem fidelidade?", "meus dados são vendidos pra alguém?"
8. CTA final — repete a ação do hero, reforça a garantia sem risco

GATILHOS QUE PRECISAM APARECER NO TEXTO (não literalmente como lista, mas como ideia
por trás da copy):
- Medo de perder dinheiro por falta de controle (não "ganhar mais", e sim "parar de
  perder o que já vendeu")
- Vergonha de cobrar um conhecido — a mensagem de cobrança "já sai pronta", a pessoa só
  confere e envia
- "Grátis" sempre acompanhado da negação explícita do que dá desconfiança: "sem cartão,
  sem contrato, sem pegadinha"
- Segurança dos dados: "só você vê quem te deve, seus dados não são vendidos"
- Simplicidade: "se você sabe usar WhatsApp, você sabe usar o FiadoApp"

SEO — inclua naturalmente no texto da página (title, meta description, headings, corpo),
sem forçar/repetir de forma robótica:
controle de fiado · caderno de fiado digital · app de fiado grátis · cobrar cliente pelo
whatsapp · app para MEI · controle de vendas a prazo · receber pix fiado · app de fiado
seguro

Gere o HTML completo, responsivo (mobile-first — esse público usa celular), com o
<title> e a <meta name="description"> já otimizados com as palavras-chave acima.
```

---

## 5) Como usar

Cole o prompt da seção 4 direto no ChatGPT. Se ele gerar algo genérico demais na primeira tentativa, use os pontos da seção "Anti-cara de IA" (item 3) como prompt de correção — ex: "isso ainda parece de IA porque usou gradiente/ilustração genérica, refaça seguindo a regra de paleta própria e screenshot real do app".

**Nota de transparência:** a landing page que já construímos juntos (a que está publicada como Artifact) já segue quase todas essas diretrizes — paleta própria, tipografia própria, screenshot real, depoimentos reais, estrutura validada. Esse prompt serve como ponto de partida caso você queira gerar uma versão alternativa no ChatGPT pra comparar, ou como documentação reutilizável pra qualquer pessoa do time no futuro.

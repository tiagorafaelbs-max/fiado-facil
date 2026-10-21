// Regras puras dos ITENS na tela Nova venda (testáveis em Node): descrição automática, soma dos preços, categoria da venda
// e ordem "mais usados primeiro". Item é atalho, nunca obrigatório: venda sem item segue como sempre.

export interface ItemCadastrado {
  id: string
  nome: string
  preco: number | null     // em reais; null = sem preço fixo
  categoria: string
  ativo: boolean
  ordem: number
}

export interface ItemEscolhido {
  id: string
  nome: string
  qtd: number
  preco: number | null
  categoria: string
}

const cent = (n: number) => Math.round(n * 100)
const LIMITE_DESCRICAO = 160

// "2× Arroz, 1× Óleo". Muitos itens: corta e diz quantos faltam ("…e mais 3").
export function montarDescricaoItens(escolhidos: Pick<ItemEscolhido, 'nome' | 'qtd'>[]): string {
  const partes = escolhidos.filter(i => i.qtd > 0).map(i => `${i.qtd}× ${i.nome}`)
  let texto = ''
  for (let k = 0; k < partes.length; k++) {
    const proximo = texto ? `${texto}, ${partes[k]}` : partes[k]
    if (proximo.length > LIMITE_DESCRICAO) return `${texto}, …e mais ${partes.length - k}`
    texto = proximo
  }
  return texto
}

// Soma qtd × preço dos que têm preço; `semPreco` = quantos itens escolhidos não têm preço (o lojista completa o valor).
export function somarItens(escolhidos: Pick<ItemEscolhido, 'qtd' | 'preco'>[]): { total: number; semPreco: number } {
  let total = 0
  let semPreco = 0
  for (const i of escolhidos) {
    if (i.qtd <= 0) continue
    if (i.preco === null || i.preco === undefined) semPreco++
    else total += cent(i.preco) * i.qtd
  }
  return { total: total / 100, semPreco }
}

// Categoria da venda vem do item de MAIOR valor (qtd × preço); sem preços ou empate, do primeiro escolhido.
export function categoriaDosItens(escolhidos: Pick<ItemEscolhido, 'qtd' | 'preco' | 'categoria'>[], padrao = 'Mercadoria'): string {
  const ativos = escolhidos.filter(i => i.qtd > 0)
  if (ativos.length === 0) return padrao
  let melhor = ativos[0]
  let melhorValor = melhor.preco ? cent(melhor.preco) * melhor.qtd : 0
  for (const i of ativos.slice(1)) {
    const v = i.preco ? cent(i.preco) * i.qtd : 0
    if (v > melhorValor) { melhor = i; melhorValor = v }
  }
  return melhor.categoria || padrao
}

// Mais usados primeiro; empate pela ordem escolhida pelo lojista, depois pelo nome.
export function ordenarPorUso(itens: ItemCadastrado[], uso: Record<string, number>): ItemCadastrado[] {
  return [...itens].sort((a, b) =>
    (uso[b.id] ?? 0) - (uso[a.id] ?? 0) || a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'))
}

export const LIMITE_ITENS_GRATUITO = 10

// "150,00" (mesmo formato do campo Valor do app).
export function formatarReais(total: number): string {
  const c = Math.round(total * 100)
  return Math.floor(c / 100) + ',' + String(c % 100).padStart(2, '0')
}

// O que a escolha de itens preenche. Soma TODOS os itens com preço (qtd × preço); itens sem preço não entram na soma
// (o app avisa para completar o valor). Descrição/valor que o lojista já digitou à mão só mudam com `forcar`.
export function proximoPreenchimento(
  escolhidos: ItemEscolhido[],
  manual: { descricaoManual: boolean; valorManual: boolean },
  forcar = false,
  categoriaPadrao = 'Mercadoria',
): { descricao: string | null; valor: string | null; categoria: string } {
  const { total } = somarItens(escolhidos)
  return {
    descricao: forcar || !manual.descricaoManual ? montarDescricaoItens(escolhidos) : null,
    valor: (forcar || !manual.valorManual) && total > 0 ? formatarReais(total) : null,
    categoria: categoriaDosItens(escolhidos, categoriaPadrao),
  }
}

// Edição MANUAL = o texto do campo mudou para algo diferente do que o próprio app preencheu por último. Em alguns aparelhos o
// TextInput devolve o valor preenchido por código como se fosse digitação: comparar com o último valor automático evita
// travar o preenchimento depois do 1º item (o valor ficava só com o primeiro item).
export function ehEdicaoManual(textoNovo: string, ultimoAutomatico: string | null): boolean {
  return ultimoAutomatico === null || textoNovo !== ultimoAutomatico
}

// ── O que foi vendido, guardado em vendas.itens (jsonb) para o relatório "Por item" ──
export interface ItemVenda {
  id: string
  nome: string
  qtd: number
  preco: number | null
}

const LIMITE_ITENS_POR_VENDA = 50

// Foto do que foi escolhido na hora da venda (nome e preço congelados: mudar o cadastro depois não reescreve o passado).
export function montarItensVenda(escolhidos: Pick<ItemEscolhido, 'id' | 'nome' | 'qtd' | 'preco'>[]): ItemVenda[] {
  return escolhidos
    .filter(i => i.qtd > 0)
    .slice(0, LIMITE_ITENS_POR_VENDA)
    .map(i => ({ id: i.id, nome: i.nome.slice(0, 60), qtd: Math.min(99, Math.round(i.qtd)), preco: i.preco === null || i.preco === undefined ? null : Math.round(i.preco * 100) / 100 }))
}

// Lê vendas.itens com tolerância: venda antiga (NULL), JSON estranho ou item quebrado nunca derrubam o relatório.
export function lerItensVenda(bruto: unknown): ItemVenda[] {
  if (!Array.isArray(bruto)) return []
  const saida: ItemVenda[] = []
  for (const x of bruto) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const nome = typeof o.nome === 'string' ? o.nome.trim() : ''
    const qtd = Number(o.qtd)
    if (!nome || !Number.isFinite(qtd) || qtd <= 0) continue
    const preco = o.preco === null || o.preco === undefined ? null : Number(o.preco)
    saida.push({
      id: typeof o.id === 'string' && o.id ? o.id : 'nome:' + nome.toLowerCase(),
      nome,
      qtd,
      preco: preco !== null && Number.isFinite(preco) && preco >= 0 ? preco : null,
    })
  }
  return saida
}

export interface LinhaPorItem { chave: string; nome: string; qtd: number; valor: number; semPreco: boolean; vendas: number }
export interface PorItem {
  linhas: LinhaPorItem[]
  semItem: { vendas: number; valor: number }   // vendas lançadas sem escolher item (inclui todas as anteriores a esta função)
  vendasComItem: number
}

// "Camisa (2/3)": parcelas 2..n não repetem os itens (ficam só na 1ª); não contam como "Sem item".
function ehParcelaDeContinuacao(descricao: string | null | undefined): boolean {
  const m = /\((\d+)\/(\d+)\)\s*$/.exec(descricao ?? '')
  return !!m && Number(m[1]) >= 2 && Number(m[2]) >= Number(m[1])
}

// Quantidade e valor (qtd × preço da hora da venda) por item no período; o nome mostrado é o da venda mais recente.
export function agruparPorItem(vendas: { valor: number; itens?: unknown; descricao?: string | null; data?: string | null }[]): PorItem {
  const mapa = new Map<string, LinhaPorItem & { nomeData: string }>()
  const semItem = { vendas: 0, valor: 0 }
  let vendasComItem = 0
  for (const v of vendas) {
    const itens = lerItensVenda(v.itens)
    if (itens.length === 0) {
      if (ehParcelaDeContinuacao(v.descricao)) continue
      semItem.vendas++
      semItem.valor += Number(v.valor) || 0
      continue
    }
    vendasComItem++
    for (const i of itens) {
      const atual = mapa.get(i.id) ?? { chave: i.id, nome: i.nome, qtd: 0, valor: 0, semPreco: false, vendas: 0, nomeData: '' }
      atual.qtd += i.qtd
      atual.vendas++
      if (i.preco === null) atual.semPreco = true
      else atual.valor += Math.round(i.preco * 100) * i.qtd / 100
      const d = v.data ?? ''
      if (d >= atual.nomeData) { atual.nome = i.nome; atual.nomeData = d }
      mapa.set(i.id, atual)
    }
  }
  const linhas = [...mapa.values()]
    .map(({ nomeData: _n, ...l }) => ({ ...l, valor: Math.round(l.valor * 100) / 100 }))
    .sort((a, b) => b.valor - a.valor || b.qtd - a.qtd || a.nome.localeCompare(b.nome, 'pt-BR'))
  return { linhas, semItem: { vendas: semItem.vendas, valor: Math.round(semItem.valor * 100) / 100 }, vendasComItem }
}

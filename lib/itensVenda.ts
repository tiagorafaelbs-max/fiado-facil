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

// Primeiro nome, com no máximo 12 letras — cabe no selo ao lado do lançamento.
export function nomeCurto(nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? ''
  return primeiro.length > 12 ? primeiro.slice(0, 11) + '…' : primeiro
}

export interface LancamentoAutor {
  valor: number
  criado_por?: string | null
}

export interface ResumoAutor {
  chave: string           // id de quem lançou, ou 'dono' (dono + lançamentos antigos sem autor)
  nome: string
  ehDono: boolean
  vendas: number
  totalVendas: number
  pagamentos: number
  totalPagamentos: number
}

export const CHAVE_DONO = 'dono'

// Agrupa vendas e pagamentos do período por quem lançou. O dono entra sempre (inclui os lançamentos
// antigos, de antes de existir o campo de autor). Funcionários ATIVOS de `nomes` aparecem sempre; funcionário
// desativado (`desativados`) só aparece se lançou algo no período. Ordena por total vendido (maior primeiro), dono primeiro em empate.
export function agruparPorAutor(
  vendas: LancamentoAutor[],
  pagamentos: LancamentoAutor[],
  donoId: string,
  nomes: Record<string, string>,
  desativados: ReadonlySet<string> = new Set(),
): ResumoAutor[] {
  const mapa = new Map<string, ResumoAutor>()
  const obter = (id: string | null | undefined): ResumoAutor => {
    const chave = !id || id === donoId ? CHAVE_DONO : id
    let r = mapa.get(chave)
    if (!r) {
      r = {
        chave,
        nome: chave === CHAVE_DONO ? 'Você (dono)' : nomes[chave] ?? 'Ex-funcionário',
        ehDono: chave === CHAVE_DONO,
        vendas: 0, totalVendas: 0, pagamentos: 0, totalPagamentos: 0,
      }
      mapa.set(chave, r)
    }
    return r
  }
  obter(null)
  for (const id of Object.keys(nomes)) if (id !== donoId && !desativados.has(id)) obter(id)
  for (const v of vendas) { const r = obter(v.criado_por); r.vendas++; r.totalVendas += v.valor }
  for (const p of pagamentos) { const r = obter(p.criado_por); r.pagamentos++; r.totalPagamentos += p.valor }
  return [...mapa.values()].sort((a, b) => b.totalVendas - a.totalVendas || Number(b.ehDono) - Number(a.ehDono))
}

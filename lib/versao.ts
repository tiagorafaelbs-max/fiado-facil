// Compara versões no formato "1.0.12" (partes numéricas separadas por ponto; sufixos como "-beta" são ignorados).
// Retorna -1 se a < b, 0 se iguais, 1 se a > b. Parte ausente conta como 0 ("1.0" = "1.0.0").
export function compararVersoes(a: string, b: string): -1 | 0 | 1 {
  const partes = (v: string) => v.trim().split('-')[0].split('.').map(p => parseInt(p, 10) || 0)
  const pa = partes(a)
  const pb = partes(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

// Só aceita algo que pareça uma versão ("1.0.12"): evita comparar lixo vindo da configuração.
export function versaoValida(v: unknown): v is string {
  return typeof v === 'string' && /^\d+(\.\d+){0,3}(-[\w.]+)?$/.test(v.trim())
}

// Vencimento padrão de uma venda quando o lojista não escolhe: sem data a venda nunca
// vira "vencida", não entra em Cobranças/Vencidos nem nos lembretes (38% das vendas
// em aberto dos últimos 30 dias estavam assim). Regra do Tiago: hoje + 30 dias ou, se o
// perfil tem dia_cobranca, o próximo dia de cobrança a pelo menos 7 dias de hoje.
export const DIAS_VENCIMENTO_PADRAO = 30
const MIN_DIAS_ATE_DIA_COBRANCA = 7

function meioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)
}

function ultimoDiaDoMes(ano: number, mes0: number): number {
  return new Date(ano, mes0 + 1, 0).getDate()
}

export function calcularVencimentoPadrao(hoje: Date = new Date(), diaCobranca?: number | null): Date {
  const base = meioDoDia(hoje)
  if (diaCobranca && Number.isInteger(diaCobranca) && diaCobranca >= 1 && diaCobranca <= 31) {
    const minimo = new Date(base)
    minimo.setDate(minimo.getDate() + MIN_DIAS_ATE_DIA_COBRANCA)
    // Este mês e os seguintes até cumprir o mínimo de 7 dias (dia 31 vira o último dia do
    // mês curto). Três meses sempre bastam: com hoje no fim do mês e dia pequeno, o mês
    // seguinte ainda pode ficar a menos de 7 dias.
    for (let i = 0; i < 3; i++) {
      const mes0 = base.getMonth() + i
      const ano = base.getFullYear()
      const candidato = new Date(ano, mes0, Math.min(diaCobranca, ultimoDiaDoMes(ano, mes0)), 12)
      if (candidato >= minimo) return candidato
    }
  }
  const padrao = new Date(base)
  padrao.setDate(padrao.getDate() + DIAS_VENCIMENTO_PADRAO)
  return padrao
}

// Formatação local (toISOString() converte para UTC e pode virar o dia).
export function dataParaISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function dataParaBR(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export function somarDiasAoISO(iso: string, dias: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return dataParaISO(d)
}

// Soma meses sem estourar o mês curto (31/10 + 1 mês = 30/11, não 01/12).
export function somarMesesLimitando(base: Date, meses: number): Date {
  const mes0 = base.getMonth() + meses
  const ano = base.getFullYear()
  return new Date(ano, mes0, Math.min(base.getDate(), ultimoDiaDoMes(ano, mes0)), 12)
}

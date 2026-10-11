export function validarEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

// Telefone brasileiro só com DDD + número (10 ou 11 dígitos). Tira tudo que não é dígito, os zeros à esquerda
// (0 de operadora, "015 31 ..."), o código do operador que sobra e o DDI 55 (+55 / 55 vindo da agenda).
// Se não der para reconhecer, devolve os dígitos como estão (a validação recusa).
export function normalizarTelefone(tel: string): string {
  let d = (tel ?? '').replace(/\D/g, '')
  const tinhaZero = d.startsWith('0')
  d = d.replace(/^0+/, '')
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d.slice(2)
  if (tinhaZero && d.length === 13) return d.slice(-11)  // 0 + operadora(2) + DDD + celular
  if (tinhaZero && d.length === 12) return d.slice(-10)  // 0 + operadora(2) + DDD + fixo
  return d
}

// Contato da agenda sem nome vem com o próprio número no lugar do nome. Só vale como nome se tiver alguma letra.
export function nomeDeContatoValido(nome?: string | null): boolean {
  return !!nome && /\p{L}/u.test(nome)
}

export function validarTelefone(tel: string): boolean {
  const limpo = normalizarTelefone(tel)
  return limpo.length >= 10 && limpo.length <= 11
}

export function validarSenha(senha: string): { valida: boolean; mensagem?: string } {
  if (senha.length < 8) return { valida: false, mensagem: 'Senha deve ter pelo menos 8 caracteres.' }
  if (!/[A-Z]/.test(senha)) return { valida: false, mensagem: 'Senha deve conter ao menos uma letra maiúscula.' }
  if (!/[0-9]/.test(senha)) return { valida: false, mensagem: 'Senha deve conter ao menos um número.' }
  return { valida: true }
}

export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Formata input monetário automaticamente: digitar "150" → "1,50"
// Use no onChangeText de campos de valor (R$)
export function formatarInputMoeda(texto: string): string {
  const digitos = texto.replace(/\D/g, '')
  if (!digitos || digitos === '0') return ''
  const centavos = parseInt(digitos, 10)
  const reais = Math.floor(centavos / 100)
  const cents = centavos % 100
  return `${reais},${String(cents).padStart(2, '0')}`
}

// Converte string formatada de volta para número
export function parseMoeda(texto: string): number {
  return parseFloat(texto.replace(',', '.')) || 0
}

export function formatarTelefone(tel: string): string {
  const limpo = normalizarTelefone(tel)
  if (limpo.length === 11) return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 7)}-${limpo.slice(7)}`
  if (limpo.length === 10) return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 6)}-${limpo.slice(6)}`
  return tel
}

export function sanitizarTexto(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ')
}

// Valida uma data no formato DD/MM/AAAA vinda de input.
// Rejeita datas impossíveis e anos implausíveis (ex.: "10/10/1026" digitado
// no lugar de "10/10/2026"), que quebram os cálculos de vencimento.
// Campo vazio é considerado válido (data é opcional em vendas).
export function validarDataBR(display: string): { valida: boolean; mensagem?: string } {
  const t = (display ?? '').trim()
  if (!t) return { valida: true }
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return { valida: false, mensagem: 'Data inválida. Use o formato DD/MM/AAAA.' }
  const dia = parseInt(m[1], 10)
  const mes = parseInt(m[2], 10)
  const ano = parseInt(m[3], 10)
  const anoAtual = new Date().getFullYear()
  // Janela larga no passado para permitir lançar dívidas antigas; ainda pega
  // erros grosseiros de digitação (ex.: "1026" no lugar de "2026").
  if (ano < anoAtual - 20 || ano > anoAtual + 10) {
    return { valida: false, mensagem: `O ano ${ano} parece incorreto. Confira a data.` }
  }
  const d = new Date(ano, mes - 1, dia)
  if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) {
    return { valida: false, mensagem: 'Essa data não existe. Confira o dia e o mês.' }
  }
  return { valida: true }
}

// Converte "DD/MM/AAAA" validado para "AAAA-MM-DD". Retorna null se inválido.
export function dataBRParaISO(display: string): string | null {
  const check = validarDataBR(display)
  if (!check.valida) return null
  const t = (display ?? '').trim()
  if (!t) return null
  const [dd, mm, aaaa] = t.split('/')
  return `${aaaa}-${mm}-${dd}`
}

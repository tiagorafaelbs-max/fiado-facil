// Regras (puras, testáveis em Node) do pedido de avaliação na loja: só em "momento de sucesso",
// com a conta madura, no máximo 1 tentativa a cada 60 dias e 3 no total. Sem pré-filtro do tipo
// "você gostou?" (as lojas proíbem): a decisão é só sobre QUANDO chamar o diálogo nativo.

export const DIAS_MINIMOS_CONTA = 7
export const VENDAS_MINIMAS = 10
export const INTERVALO_DIAS = 60
export const MAX_TENTATIVAS = 3

export type EventoSucesso = 'pagamento' | 'cobranca_whatsapp'

export interface EstadoPedido {
  agora: number            // ms
  tentativas: number       // quantas vezes o diálogo já foi chamado
  ultimaTentativa: number | null  // ms
  criadaEm: number | null  // ms (data de criação da conta)
  vendas: number           // vendas lançadas pela conta
  online: boolean
  souDono: boolean         // false = funcionário (ou papel ainda não confirmado)
}

const DIA = 24 * 3600 * 1000

export function podePedirAvaliacao(e: EstadoPedido): boolean {
  if (!e.souDono || !e.online) return false
  if (e.tentativas >= MAX_TENTATIVAS) return false
  if (e.ultimaTentativa != null && e.agora - e.ultimaTentativa < INTERVALO_DIAS * DIA) return false
  if (e.criadaEm == null || e.agora - e.criadaEm < DIAS_MINIMOS_CONTA * DIA) return false
  if (e.vendas < VENDAS_MINIMAS) return false
  return true
}

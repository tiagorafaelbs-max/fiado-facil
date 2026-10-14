// Regras (puras, testáveis em Node) do pedido de avaliação na loja: só em "momento de sucesso",
// com a conta madura, no máximo 1 tentativa a cada 60 dias e 3 no total. Sem pré-filtro do tipo
// "você gostou?" (as lojas proíbem): a decisão é só sobre QUANDO chamar o diálogo nativo.

export const DIAS_MINIMOS_CONTA = 7
export const VENDAS_MINIMAS = 10
export const INTERVALO_DIAS = 60
export const MAX_TENTATIVAS = 3

// Card "Está gostando do FiadoApp?" na tela Início: discreto e dispensável. Mesmas condições de conta madura e dono,
// mais um momento de sucesso já ocorrido; "Avaliar" encerra para sempre; "Agora não"/X volta em 60 dias, até 3 vezes.
export const MAX_APARICOES_CARD = 3

export interface EstadoCard {
  agora: number
  criadaEm: number | null
  vendas: number
  souDono: boolean
  houveSucesso: boolean            // já registrou pagamento ou enviou cobrança (hook useAvaliacaoApp)
  avaliou: boolean                 // tocou em "Avaliar"
  dispensas: number                // "Agora não"/X até agora
  ultimaDispensa: number | null    // ms
  outroBannerVisivel: boolean      // um banner por vez
}

export function podeMostrarCardAvaliacao(e: EstadoCard): boolean {
  if (!e.souDono || e.outroBannerVisivel || !e.houveSucesso || e.avaliou) return false
  if (e.dispensas >= MAX_APARICOES_CARD) return false
  if (e.ultimaDispensa != null && e.agora - e.ultimaDispensa < INTERVALO_DIAS * DIA) return false
  if (e.criadaEm == null || e.agora - e.criadaEm < DIAS_MINIMOS_CONTA * DIA) return false
  if (e.vendas < VENDAS_MINIMAS) return false
  return true
}

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

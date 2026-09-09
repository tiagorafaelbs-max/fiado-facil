export const LIMITE_GRATUITO_CLIENTES = 10

export const CATEGORIAS = [
  'Mercadoria',
  'Alimento',
  'Serviço',
  'Bebida',
  'Outro',
] as const

export type Categoria = (typeof CATEGORIAS)[number]

export const CORES_STATUS = {
  em_dia: '#0F6E56',
  atencao: '#BA7517',
  vencido: '#A32D2D',
} as const

export const DIAS_ATENCAO = 3
export const DIAS_VENCIDO = 0

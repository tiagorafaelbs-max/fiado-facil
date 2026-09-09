export type PlanoTipo = 'gratuito' | 'pro'

export interface Usuario {
  id: string
  email: string
  nome_negocio: string
  telefone?: string
  plano: PlanoTipo
  criado_em: string
}

export interface Cliente {
  id: string
  usuario_id: string
  nome: string
  telefone?: string
  cpf?: string
  empresa?: string
  endereco?: string
  observacao?: string
  ativo: boolean
  criado_em: string
  saldo_devedor?: number
  ultima_compra?: string
  status_pagamento?: 'em_dia' | 'atencao' | 'vencido' | 'devendo'
  limite_credito?: number
}

export interface Venda {
  id: string
  usuario_id: string
  cliente_id: string
  descricao: string
  valor: number
  data_venda: string
  data_vencimento?: string
  categoria: string
  pago: boolean
  criado_em: string
  foto_url?: string
  cliente?: Cliente
}

export interface Pagamento {
  id: string
  usuario_id: string
  cliente_id: string
  venda_id?: string
  valor: number
  data_pagamento: string
  observacao?: string
  criado_em: string
}

export interface DashboardResumo {
  total_em_aberto: number
  recebido_hoje: number
  clientes_ativos: number
  clientes_vencidos: number
}

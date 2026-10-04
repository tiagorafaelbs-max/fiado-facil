import { Linking, Platform } from 'react-native'
import { supabase } from './supabase'
import { formatarMoeda } from './validacao'
import { nomeCurto } from './equipe'
import type { Cliente } from '../types'

type ClienteBasico = Pick<Cliente, 'id' | 'nome' | 'telefone'>

// ── Mensagem de cobrança (texto único, usado por TODAS as telas) ──────────────────────
//
// O lojista Pro pode trocar o texto em Configurações → Mensagem de cobrança (coluna
// perfis.mensagem_cobranca_modelo). Sem modelo salvo (ou fora do Pro) vale o texto padrão.

export const LIMITE_MODELO_COBRANCA = 1000

// Variáveis que o lojista pode usar no modelo. Qualquer outro {texto} sai literal.
export const VARIAVEIS_COBRANCA = ['nome', 'valor', 'negocio', 'pix', 'vencimento'] as const
export type VariavelCobranca = typeof VARIAVEIS_COBRANCA[number]

// Texto padrão (cobrança "em aberto"). É também o que o editor mostra quando não há modelo salvo.
// A linha do Pix some sozinha quando o lojista não cadastrou a chave.
export const MODELO_PADRAO_COBRANCA =
  'Olá, {nome}! 👋\n\n' +
  'Passando para lembrar que você possui um saldo de *{valor}* em aberto conosco ({negocio}).\n\n' +
  'Para pagar via Pix, use a chave: *{pix}*\n\n' +
  'Quando puder, entre em contato para acertarmos. Obrigado! 😊'

// Padrão para cliente com atraso: usa {atraso}, que só existe nos textos internos (não é variável do lojista).
const MODELO_PADRAO_VENCIDO =
  'Olá, {nome}! 👋\n\n' +
  '⚠️ Seu pagamento de *{valor}* está em atraso há *{atraso}* conosco ({negocio}).\n\n' +
  'Para pagar via Pix, use a chave: *{pix}*\n\n' +
  'Por favor, entre em contato o quanto antes para regularizarmos. 🙏'

export interface PerfilCobranca {
  nome_negocio?: string | null
  chave_pix?: string | null
  plano?: 'gratuito' | 'pro' | null
  mensagem_cobranca_modelo?: string | null
}

export interface OpcoesCobranca {
  vencido?: boolean
  diasAtraso?: number
  // Vencimento mais antigo em aberto do cliente (yyyy-mm-dd). Só é usado se o modelo tem {vencimento}.
  vencimento?: string | null
}

const REGEX_VARIAVEL = /\{([a-zA-Z_]+)\}/g

// Modelo personalizado só vale no plano Pro (o banco também recusa gravar fora do Pro).
// Plano ainda não carregado = trata como sem modelo, cai no texto padrão.
export function modeloEfetivo(perfil?: PerfilCobranca | null): string | null {
  if (perfil?.plano !== 'pro') return null
  const modelo = perfil.mensagem_cobranca_modelo?.trim()
  return modelo ? modelo : null
}

export function modeloUsaVencimento(perfil?: PerfilCobranca | null): boolean {
  return /\{vencimento\}/i.test(modeloEfetivo(perfil) ?? '')
}

export function modeloTemValor(modelo: string): boolean {
  return /\{valor\}/i.test(modelo)
}

// Variáveis escritas pelo lojista que não existem (ex.: {Valor2}, {cliente}) — saem literais na mensagem.
export function variaveisDesconhecidas(modelo: string): string[] {
  const achadas = new Set<string>()
  for (const m of modelo.matchAll(REGEX_VARIAVEL)) {
    if (!(VARIAVEIS_COBRANCA as readonly string[]).includes(m[1].toLowerCase())) achadas.add(`{${m[1]}}`)
  }
  return [...achadas]
}

type ValoresModelo = Partial<Record<VariavelCobranca | 'atraso', string>>

export function renderizarModelo(modelo: string, valores: ValoresModelo): string {
  let linhas = modelo.replace(/\r\n/g, '\n').split('\n')
  // Sem chave Pix cadastrada, a linha que só tem o Pix sai inteira (senão sobra "use a chave: **").
  // Linha que tem {pix} E outra variável (ex.: "Você deve {valor}. Pix: {pix}") fica: {pix} vira vazio,
  // para nunca sumir nome/valor da cobrança. Se o modelo inteiro for essa linha, também fica.
  if (!valores.pix) {
    const soPix = (l: string) => /\{pix\}/i.test(l) && !/\{(?!pix\})[a-zA-Z_]+\}/i.test(l)
    const semPix = linhas.filter(l => !soPix(l))
    if (semPix.some(l => l.trim())) linhas = semPix
  }
  return linhas.join('\n')
    .replace(REGEX_VARIAVEL, (achado, nome: string) => valores[nome.toLowerCase() as keyof ValoresModelo] ?? achado)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function formatarVencimento(iso?: string | null): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null
  return m ? `${m[3]}/${m[2]}/${m[1]}` : 'sem data definida'
}

// Função única de texto da cobrança: nenhuma tela monta mensagem por conta própria.
export function montarMensagemCobranca(
  cliente: Pick<Cliente, 'nome'>,
  saldoDevedor: number,
  perfil?: PerfilCobranca | null,
  opcoes: OpcoesCobranca = {},
): string {
  const dias = opcoes.diasAtraso ?? 0
  const valores: ValoresModelo = {
    nome: cliente.nome,
    valor: formatarMoeda(saldoDevedor),
    negocio: perfil?.nome_negocio?.trim() || 'nossa loja',
    pix: perfil?.chave_pix?.trim() || '',
    vencimento: formatarVencimento(opcoes.vencimento),
  }
  const personalizado = modeloEfetivo(perfil)
  if (personalizado) return renderizarModelo(personalizado, valores)
  if (opcoes.vencido && dias > 0) {
    return renderizarModelo(MODELO_PADRAO_VENCIDO, { ...valores, atraso: dias === 1 ? '1 dia' : `${dias} dias` })
  }
  return renderizarModelo(MODELO_PADRAO_COBRANCA, valores)
}

// Vencimento mais antigo em aberto de cada cliente (yyyy-mm-dd). Só chame quando o modelo usa
// {vencimento} (modeloUsaVencimento). Falha ou demora de rede = mapa parcial/vazio (a mensagem sai com "sem data definida").
export async function buscarVencimentosEmAberto(
  tenantId: string,
  clienteIds: string[],
): Promise<Record<string, string>> {
  const mapa: Record<string, string> = {}
  const buscar = async () => {
    for (let i = 0; i < clienteIds.length; i += 100) {
      const { data } = await supabase
        .from('vendas')
        .select('cliente_id, data_vencimento')
        .eq('usuario_id', tenantId)
        .eq('pago', false)
        .not('data_vencimento', 'is', null)
        .in('cliente_id', clienteIds.slice(i, i + 100))
        .order('data_vencimento', { ascending: true })
      for (const v of data ?? []) {
        if (!mapa[v.cliente_id]) mapa[v.cliente_id] = v.data_vencimento
      }
    }
  }
  // Rede lenta não pode atrasar a abertura do WhatsApp (a cota de cobranças já foi contada):
  // espera no máximo 3s e segue com o que veio.
  try {
    await Promise.race([buscar(), new Promise<void>(resolve => setTimeout(resolve, 3000))])
  } catch {
    // sem rede: segue sem as datas
  }
  return mapa
}

function telefoneWhatsApp(telefone: string): string {
  let tel = telefone.replace(/\D/g, '')
  if (tel.startsWith('55') && tel.length >= 12) tel = tel.slice(2)
  return tel
}

export function montarUrlWhatsApp(
  cliente: ClienteBasico,
  saldoDevedor: number,
  perfil?: PerfilCobranca | null,
  opcoes: OpcoesCobranca = {},
): string {
  const texto = montarMensagemCobranca(cliente, saldoDevedor, perfil, opcoes)
  return `https://wa.me/55${telefoneWhatsApp(cliente.telefone!)}?text=${encodeURIComponent(texto)}`
}

export async function cobrarViaWhatsApp(
  cliente: ClienteBasico,
  saldoDevedor: number,
  perfil?: PerfilCobranca | null,
  opcoes: OpcoesCobranca = {},
): Promise<void> {
  if (!cliente.telefone) {
    throw new Error('Cliente não possui telefone cadastrado.')
  }

  const url = montarUrlWhatsApp(cliente, saldoDevedor, perfil, opcoes)

  if (Platform.OS === 'web') {
    window.open(url, '_blank')
  } else {
    try {
      await Linking.openURL(url)
    } catch {
      throw new Error('Não foi possível abrir o WhatsApp. Verifique se está instalado.')
    }
  }
}

export function montarExtratoWhatsApp(
  cliente: ClienteBasico & { saldo_devedor?: number },
  vendas: { descricao: string; valor: number; data_venda: string; pago: boolean; criado_por?: string }[],
  nomeNegocio: string,
  chavePix?: string,
  nomesEquipe: Record<string, string> = {},
): string | null {
  if (!cliente.telefone) return null

  const abertas = vendas.filter(v => !v.pago)
  // Total exibido usa o saldo já calculado pela view clientes_com_saldo (FIFO de
  // pagamentos), não a soma bruta das vendas em aberto — evita divergir do saldo
  // real quando um pagamento não cobre integralmente a próxima venda da fila.
  const total = cliente.saldo_devedor ?? abertas.reduce((s, v) => s + v.valor, 0)
  const hoje = new Date().toLocaleDateString('pt-BR')

  const linhasVendas = abertas.map((v, i) => {
    const data = v.data_venda.split('-').reverse().join('/')
    const nomeAutor = v.criado_por ? nomesEquipe[v.criado_por] : undefined
    return `${i + 1}. ${v.descricao}\n   ${data}  |  *${formatarMoeda(v.valor)}*${nomeAutor ? `  |  por ${nomeCurto(nomeAutor)}` : ''}`
  }).join('\n')

  const pixLinha = chavePix ? `\n🔑 Pague via Pix: *${chavePix}*` : ''

  const texto =
    `📋 *Extrato de Dívidas*\n` +
    `Estabelecimento: *${nomeNegocio}*\n` +
    `Cliente: *${cliente.nome}*\n` +
    `Data: ${hoje}\n` +
    `─────────────────────\n` +
    `${linhasVendas}\n` +
    `─────────────────────\n` +
    `💰 *Total em aberto: ${formatarMoeda(total)}*${pixLinha}\n\n` +
    `Em caso de dúvidas, entre em contato. Obrigado! 🙏`

  return `https://wa.me/55${telefoneWhatsApp(cliente.telefone)}?text=${encodeURIComponent(texto)}`
}

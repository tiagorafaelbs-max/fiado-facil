import { Linking, Platform } from 'react-native'
import { supabase } from './supabase'
import { formatarMoeda, normalizarTelefone } from './validacao'
import { calcularDetalheCobranca, type DetalheCobranca } from './cobrancaVencidos'
import { dataParaISO } from './vencimento'
import type { Cliente } from '../types'

type ClienteBasico = Pick<Cliente, 'id' | 'nome' | 'telefone'>

// ── Mensagem de cobrança (texto único, usado por TODAS as telas) ──────────────────────
//
// O lojista Pro pode trocar o texto em Configurações → Mensagem de cobrança (coluna
// perfis.mensagem_cobranca_modelo). Sem modelo salvo (ou fora do Pro) vale o texto padrão.

export const LIMITE_MODELO_COBRANCA = 1000

// Variáveis que o lojista pode usar no modelo. Qualquer outro {texto} sai literal.
// {valor} é o valor COBRADO: o que já venceu (nada vencido → a próxima parcela; cliente sem datas → o saldo total), igual à
// mensagem padrão. {saldo_total} é o total em aberto. {parcelas_vencidas} lista as parcelas (até 3 + "e mais N").
// {valor_vencido} continua valendo como sinônimo de {valor} (modelos já salvos), mas não aparece nos botões da tela.
export const VARIAVEIS_COBRANCA = ['nome', 'valor', 'saldo_total', 'parcelas_vencidas', 'negocio', 'pix', 'vencimento'] as const
const VARIAVEIS_RECONHECIDAS: readonly string[] = [...VARIAVEIS_COBRANCA, 'valor_vencido']
export type VariavelCobranca = typeof VARIAVEIS_COBRANCA[number] | 'valor_vencido'

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

// Textos usados quando o cliente tem vendas/parcelas com vencimentos (e o lojista não personalizou a mensagem):
// cobram só o que venceu; sem nada vencido, lembram a próxima parcela. {saldo_total_linha} só aparece se o saldo total
// for diferente do valor cobrado. Variáveis internas: não aparecem para o lojista.
const MODELO_PADRAO_VENCIDOS =
  'Olá, {nome}! 👋\n\n' +
  'Passando para lembrar que você tem *{valor_vencido}* {situacao} conosco ({negocio}):\n' +
  '{parcelas_vencidas}\n' +
  '{saldo_total_linha}\n\n' +
  'Para pagar via Pix, use a chave: *{pix}*\n\n' +
  'Por favor, entre em contato o quanto antes para regularizarmos. 🙏'

const MODELO_PADRAO_PROXIMA =
  'Olá, {nome}! 👋\n\n' +
  'Passando para lembrar da próxima parcela com {negocio}:\n' +
  '{parcelas_vencidas}\n' +
  '{saldo_total_linha}\n\n' +
  'Para pagar via Pix, use a chave: *{pix}*\n\n' +
  'Qualquer dúvida, é só chamar. Obrigado! 😊'

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
  // Parcelas vencidas do cliente (buscarContextoCobranca). Sem isto vale o saldo total, como sempre.
  detalhe?: DetalheCobranca | null
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
  return /\{(valor|valor_vencido|saldo_total)\}/i.test(modelo)
}

// Variáveis escritas pelo lojista que não existem (ex.: {Valor2}, {cliente}) — saem literais na mensagem.
export function variaveisDesconhecidas(modelo: string): string[] {
  const achadas = new Set<string>()
  for (const m of modelo.matchAll(REGEX_VARIAVEL)) {
    if (!VARIAVEIS_RECONHECIDAS.includes(m[1].toLowerCase())) achadas.add(`{${m[1]}}`)
  }
  return [...achadas]
}

type ValoresModelo = Partial<Record<VariavelCobranca | 'atraso' | 'saldo_total_linha' | 'situacao', string>>

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

function diaMes(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}` : iso
}

// Linhas das parcelas (até 3 mais antigas + "e mais N") e o valor que está sendo cobrado.
function descreverDetalhe(d: DetalheCobranca, saldoTotal: number): { valorBase: number; parcelas: string; saldoLinha: string; vencidos: boolean; situacao: string } {
  let linhas: string[]
  let valorBase: number
  const hoje = dataParaISO(new Date())
  const vencidos = d.vencidos.length > 0
  // o que vence HOJE entra no valor cobrado, mas não é "vencido": a linha diz "vence hoje"
  const soHoje = vencidos && d.vencidos.every(i => i.vencimento >= hoje)
  if (vencidos) {
    linhas = d.vencidos.slice(0, 3).map(i => `• ${i.descricao} — ${formatarMoeda(i.restante)} — ${i.vencimento >= hoje ? 'vence hoje' : `venceu ${diaMes(i.vencimento)}`}`)
    if (d.vencidos.length > 3) linhas.push(`e mais ${d.vencidos.length - 3}`)
    valorBase = d.valorVencido
  } else {
    const p = d.proxima!
    linhas = [`• ${p.descricao} — ${formatarMoeda(p.restante)} — vence ${diaMes(p.vencimento)}`]
    valorBase = p.restante
  }
  const saldoLinha = Math.abs(saldoTotal - valorBase) > 0.005 ? `Saldo total em aberto: ${formatarMoeda(saldoTotal)}` : ''
  return { valorBase, parcelas: linhas.join('\n'), saldoLinha, vencidos, situacao: soHoje ? 'vencendo hoje' : 'vencido' }
}

// Função única de texto da cobrança: nenhuma tela monta mensagem por conta própria.
export function montarMensagemCobranca(
  cliente: Pick<Cliente, 'nome'>,
  saldoDevedor: number,
  perfil?: PerfilCobranca | null,
  opcoes: OpcoesCobranca = {},
): string {
  const dias = opcoes.diasAtraso ?? 0
  const det = opcoes.detalhe ? descreverDetalhe(opcoes.detalhe, saldoDevedor) : null
  const valores: ValoresModelo = {
    nome: cliente.nome,
    valor: formatarMoeda(det ? det.valorBase : saldoDevedor),   // valor COBRADO (sem datas = saldo total)
    valor_vencido: formatarMoeda(det ? det.valorBase : saldoDevedor),   // sinônimo de {valor}
    saldo_total: formatarMoeda(saldoDevedor),
    parcelas_vencidas: det ? det.parcelas : '',
    saldo_total_linha: det ? det.saldoLinha : '',
    situacao: det ? det.situacao : 'vencido',
    negocio: perfil?.nome_negocio?.trim() || 'nossa loja',
    pix: perfil?.chave_pix?.trim() || '',
    vencimento: formatarVencimento(opcoes.vencimento),
  }
  const personalizado = modeloEfetivo(perfil)
  if (personalizado) return renderizarModelo(personalizado, valores)
  if (det) return renderizarModelo(det.vencidos ? MODELO_PADRAO_VENCIDOS : MODELO_PADRAO_PROXIMA, valores)
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

// Parcelas vencidas de cada cliente (já descontados os pagamentos, mesma alocação do banco). Uma consulta de vendas e
// uma de pagamentos por bloco de clientes. Falha, lista grande demais (limite de linhas do servidor) ou demora de rede
// = cliente fica sem detalhe e a mensagem sai com o saldo total, como antes. Espera no máximo 3 s.
export async function buscarDetalhesCobranca(
  tenantId: string,
  clienteIds: string[],
): Promise<Record<string, DetalheCobranca>> {
  const mapa: Record<string, DetalheCobranca> = {}
  const LIMITE = 1000
  const hoje = dataParaISO(new Date())
  const blocos: string[][] = []
  for (let i = 0; i < clienteIds.length; i += 20) blocos.push(clienteIds.slice(i, i + 20))
  const umBloco = async (bloco: string[]) => {
    {
      const [rv, rp] = await Promise.all([
        supabase.from('vendas').select('id, cliente_id, descricao, valor, data_venda, data_vencimento').eq('usuario_id', tenantId).in('cliente_id', bloco).limit(LIMITE),
        supabase.from('pagamentos').select('cliente_id, valor, venda_id').eq('usuario_id', tenantId).in('cliente_id', bloco).limit(LIMITE),
      ])
      // sem os dados completos não dá para alocar com segurança: segue com o saldo total
      if (rv.error || rp.error || (rv.data?.length ?? 0) >= LIMITE || (rp.data?.length ?? 0) >= LIMITE) return
      for (const id of bloco) {
        const d = calcularDetalheCobranca(
          (rv.data ?? []).filter(v => v.cliente_id === id),
          (rp.data ?? []).filter(p => p.cliente_id === id),
          hoje,
        )
        if (d) mapa[id] = d
      }
    }
  }
  const buscar = async () => {
    for (let i = 0; i < blocos.length; i += 4) await Promise.all(blocos.slice(i, i + 4).map(umBloco))
  }
  try {
    await Promise.race([buscar(), new Promise<void>(resolve => setTimeout(resolve, 3000))])
  } catch {
    // sem rede: saldo total
  }
  return mapa
}

// Tudo que a mensagem de cobrança precisa além de nome/saldo, por cliente: vencimento mais antigo (só se o modelo usa
// {vencimento}) e as parcelas vencidas. Cada tela passa o resultado de ctx[id] em montarUrlWhatsApp/cobrarViaWhatsApp.
export async function buscarContextoCobranca(
  tenantId: string | null | undefined,
  perfil: PerfilCobranca | null | undefined,
  clienteIds: string[],
): Promise<Record<string, OpcoesCobranca>> {
  if (!tenantId || clienteIds.length === 0) return {}
  const [vencimentos, detalhes] = await Promise.all([
    modeloUsaVencimento(perfil) ? buscarVencimentosEmAberto(tenantId, clienteIds) : Promise.resolve({} as Record<string, string>),
    buscarDetalhesCobranca(tenantId, clienteIds),
  ])
  const ctx: Record<string, OpcoesCobranca> = {}
  for (const id of clienteIds) {
    ctx[id] = { vencimento: vencimentos[id], detalhe: detalhes[id] ?? null }
  }
  return ctx
}

// Número só com DDD + telefone; o link do wa.me acrescenta o 55 (nunca duplica).
function telefoneWhatsApp(telefone: string): string {
  return normalizarTelefone(telefone)
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
  vendas: { descricao: string; valor: number; data_venda: string; pago: boolean }[],
  nomeNegocio: string,
  chavePix?: string,
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
    return `${i + 1}. ${v.descricao}\n   ${data}  |  *${formatarMoeda(v.valor)}*`
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

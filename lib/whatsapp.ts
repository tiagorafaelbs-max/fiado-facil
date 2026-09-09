import { Linking, Platform } from 'react-native'
import { formatarMoeda } from './validacao'
import type { Cliente } from '../types'

type ClienteBasico = Pick<Cliente, 'id' | 'nome' | 'telefone'>

export async function cobrarViaWhatsApp(
  cliente: ClienteBasico,
  saldoDevedor: number,
  nomeNegocio: string,
  chavePix?: string,
): Promise<void> {
  if (!cliente.telefone) {
    throw new Error('Cliente não possui telefone cadastrado.')
  }

  let telefone = cliente.telefone.replace(/\D/g, '')
  if (telefone.startsWith('55') && telefone.length >= 12) telefone = telefone.slice(2)
  const valor = formatarMoeda(saldoDevedor)
  const pixLinha = chavePix ? `\n\nPara pagar via Pix, use a chave: *${chavePix}*` : ''
  const mensagem = encodeURIComponent(
    `Olá, ${cliente.nome}! 👋\n\n` +
    `Passando para lembrar que você possui um saldo de *${valor}* em aberto conosco (${nomeNegocio}).${pixLinha}\n\n` +
    `Quando puder, entre em contato para acertarmos. Obrigado! 😊`,
  )

  const url = `https://wa.me/55${telefone}?text=${mensagem}`

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

export async function cobrarVencidoWhatsApp(
  cliente: ClienteBasico,
  saldoDevedor: number,
  nomeNegocio: string,
  diasAtraso: number,
  chavePix?: string,
): Promise<void> {
  if (!cliente.telefone) {
    throw new Error('Cliente não possui telefone cadastrado.')
  }

  let telefone = cliente.telefone.replace(/\D/g, '')
  if (telefone.startsWith('55') && telefone.length >= 12) telefone = telefone.slice(2)
  const valor = formatarMoeda(saldoDevedor)
  const atrasoTexto = diasAtraso === 1 ? '1 dia' : `${diasAtraso} dias`
  const pixLinha = chavePix ? `\n\nPara pagar via Pix, use a chave: *${chavePix}*` : ''
  const mensagem = encodeURIComponent(
    `Olá, ${cliente.nome}! 👋\n\n` +
    `⚠️ Seu pagamento de *${valor}* está em atraso há *${atrasoTexto}* conosco (${nomeNegocio}).${pixLinha}\n\n` +
    `Por favor, entre em contato o quanto antes para regularizarmos. Estamos à disposição! 🙏`,
  )

  const url = `https://wa.me/55${telefone}?text=${mensagem}`

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

export function montarUrlWhatsApp(
  cliente: ClienteBasico,
  saldoDevedor: number,
  nomeNegocio: string,
  vencido = false,
  diasAtraso = 0,
  chavePix?: string,
): string {
  let telefone = cliente.telefone!.replace(/\D/g, '')
  if (telefone.startsWith('55') && telefone.length >= 12) telefone = telefone.slice(2)
  const valor = formatarMoeda(saldoDevedor)
  const pixLinha = chavePix ? `\n\nPara pagar via Pix, use a chave: *${chavePix}*` : ''

  let texto: string
  if (vencido && diasAtraso > 0) {
    const atrasoTexto = diasAtraso === 1 ? '1 dia' : `${diasAtraso} dias`
    texto =
      `Olá, ${cliente.nome}! 👋\n\n` +
      `⚠️ Seu pagamento de *${valor}* está em atraso há *${atrasoTexto}* conosco (${nomeNegocio}).${pixLinha}\n\n` +
      `Por favor, entre em contato o quanto antes para regularizarmos. 🙏`
  } else {
    texto =
      `Olá, ${cliente.nome}! 👋\n\n` +
      `Passando para lembrar que você possui um saldo de *${valor}* em aberto conosco (${nomeNegocio}).${pixLinha}\n\n` +
      `Quando puder, entre em contato para acertarmos. Obrigado! 😊`
  }

  return `https://wa.me/55${telefone}?text=${encodeURIComponent(texto)}`
}

export function montarExtratoWhatsApp(
  cliente: ClienteBasico,
  vendas: { descricao: string; valor: number; data_venda: string; pago: boolean }[],
  nomeNegocio: string,
  chavePix?: string,
): string | null {
  if (!cliente.telefone) return null

  const abertas = vendas.filter(v => !v.pago)
  const total = abertas.reduce((s, v) => s + v.valor, 0)
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

  let tel = cliente.telefone.replace(/\D/g, '')
  if (tel.startsWith('55') && tel.length >= 12) tel = tel.slice(2)
  return `https://wa.me/55${tel}?text=${encodeURIComponent(texto)}`
}

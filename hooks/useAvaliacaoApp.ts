import { AppState, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import * as StoreReview from 'expo-store-review'
import { supabase } from '../lib/supabase'
import { obterContextoEquipe } from '../lib/tenant'
import { podePedirAvaliacao, type EventoSucesso } from '../lib/avaliacaoRegras'

const CHAVE_TENTATIVAS = '@fiado_facil:avaliacao_tentativas'
const CHAVE_ULTIMA = '@fiado_facil:avaliacao_ultima'
export const CHAVE_ULTIMA_NATIVO = CHAVE_ULTIMA
const CHAVE_CARD = '@fiado_facil:avaliacao_card'   // estado do card da tela Início (useCardAvaliacao)
// Chave do modelo antigo ("5º acesso, uma vez na vida"). Quem já recebeu aquele pedido conta como 1 tentativa.
const CHAVE_ANTIGA = '@fiado_facil:avaliacao_solicitada'
// Marca que o lojista já teve um momento de sucesso (pagamento registrado / cobrança enviada): libera o card da tela Início.
export const CHAVE_SUCESSO = '@fiado_facil:avaliacao_sucesso'

let emAndamento = false

// Chamar logo DEPOIS de um momento de sucesso do lojista (pagamento registrado com sucesso ou
// cobrança aberta no WhatsApp). Dispara o diálogo NATIVO das lojas só se as regras permitirem;
// qualquer falha é silenciosa e nunca atrapalha o fluxo que a chamou.
export function pedirAvaliacaoNoSucesso(evento: EventoSucesso): void {
  if (Platform.OS === 'web') return
  AsyncStorage.setItem(CHAVE_SUCESSO, '1').catch(() => {})
  if (evento === 'cobranca_whatsapp') {
    // O app acabou de abrir o WhatsApp: o momento certo é quando o lojista VOLTA (cobrou e voltou).
    esperarRetornoAoApp(() => pedir(evento).catch(() => {}))
    return
  }
  pedir(evento).catch(() => {})
}

const PRAZO_RETORNO_MS = 15 * 60 * 1000
let assinaturaRetorno: ReturnType<typeof AppState.addEventListener> | null = null
let prazoRetorno: ReturnType<typeof setTimeout> | null = null

function esperarRetornoAoApp(aoVoltar: () => void) {
  limparEsperaRetorno()   // só uma espera por vez: cobranças seguidas não empilham pedidos
  prazoRetorno = setTimeout(limparEsperaRetorno, PRAZO_RETORNO_MS)
  let saiu = AppState.currentState !== 'active'
  assinaturaRetorno = AppState.addEventListener('change', (estado) => {
    if (estado !== 'active') { saiu = true; return }
    if (!saiu) return
    limparEsperaRetorno()
    aoVoltar()
  })
}

function limparEsperaRetorno() {
  assinaturaRetorno?.remove(); assinaturaRetorno = null
  if (prazoRetorno) { clearTimeout(prazoRetorno); prazoRetorno = null }
}

async function pedir(evento: EventoSucesso) {
  if (emAndamento) return
  emAndamento = true
  try {
    const rede = await NetInfo.fetch()
    if (!rede.isConnected || rede.isInternetReachable === false) return

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return
    const ctx = await obterContextoEquipe(session.user.id)
    if (ctx.souFuncionario || !ctx.papelConfirmado) return

    let tentativas = parseInt((await AsyncStorage.getItem(CHAVE_TENTATIVAS)) ?? '', 10)
    let ultima = parseInt((await AsyncStorage.getItem(CHAVE_ULTIMA)) ?? '', 10)
    if (!Number.isFinite(tentativas)) {
      const antigo = await AsyncStorage.getItem(CHAVE_ANTIGA)
      tentativas = antigo === 'true' ? 1 : 0
      ultima = antigo === 'true' ? Date.now() : NaN
      if (antigo === 'true') {
        // Converte UMA vez: sem gravar, cada chamada recomeçaria a contagem de 60 dias para sempre.
        await AsyncStorage.setItem(CHAVE_TENTATIVAS, String(tentativas))
        await AsyncStorage.setItem(CHAVE_ULTIMA, String(ultima))
        await AsyncStorage.removeItem(CHAVE_ANTIGA)
      }
    }

    // O card da tela Início já cuidou do convite: avaliou, ou dispensou há menos de 60 dias. Sem dois pedidos seguidos.
    try {
      const card = JSON.parse((await AsyncStorage.getItem(CHAVE_CARD)) ?? 'null')
      if (card?.avaliou === true) return
      if (Number.isFinite(card?.ultimaDispensa) && Date.now() - card.ultimaDispensa < 60 * 24 * 3600 * 1000) return
    } catch { /* sem estado do card */ }

    // Cobrança por WhatsApp só abre a PRIMEIRA vez que o pedido é feito; depois disso quem pede é o pagamento recebido.
    if (evento === 'cobranca_whatsapp' && tentativas > 0) return

    // A contagem de vendas também prova que há conexão de verdade com o servidor.
    const { count, error } = await supabase
      .from('vendas').select('id', { count: 'exact', head: true }).eq('usuario_id', ctx.tenantId)
    if (error) return

    const ok = podePedirAvaliacao({
      agora: Date.now(),
      tentativas,
      ultimaTentativa: Number.isFinite(ultima) ? ultima : null,
      criadaEm: session.user.created_at ? Date.parse(session.user.created_at) : null,
      vendas: count ?? 0,
      online: true,
      souDono: true,
    })
    if (!ok) return
    if (!(await StoreReview.isAvailableAsync())) return

    // Dá um respiro depois da ação do usuário. Se ele saiu do app nesse meio-tempo (ex.: foi pro
    // WhatsApp), não gasta a tentativa: o diálogo apareceria fora de hora.
    await new Promise(r => setTimeout(r, 1500))
    if (AppState.currentState !== 'active') return

    await AsyncStorage.setItem(CHAVE_TENTATIVAS, String(tentativas + 1))
    await AsyncStorage.setItem(CHAVE_ULTIMA, String(Date.now()))
    await StoreReview.requestReview()
  } finally {
    emAndamento = false
  }
}

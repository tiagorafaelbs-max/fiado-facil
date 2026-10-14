import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { podeMostrarCardAvaliacao } from '../lib/avaliacaoRegras'
import { abrirAvaliacaoNaLoja } from '../lib/loja'
import { evento } from '../lib/instalacao'
import { CHAVE_SUCESSO, CHAVE_ULTIMA_NATIVO } from './useAvaliacaoApp'

const CHAVE_CARD = '@fiado_facil:avaliacao_card'

interface EstadoSalvo { avaliou: boolean; dispensas: number; ultimaDispensa: number | null }
const VAZIO: EstadoSalvo = { avaliou: false, dispensas: 0, ultimaDispensa: null }

async function lerEstado(): Promise<EstadoSalvo> {
  try {
    const bruto = await AsyncStorage.getItem(CHAVE_CARD)
    if (!bruto) return VAZIO
    const e = JSON.parse(bruto)
    return {
      avaliou: e?.avaliou === true,
      dispensas: Number.isFinite(e?.dispensas) ? e.dispensas : 0,
      ultimaDispensa: Number.isFinite(e?.ultimaDispensa) ? e.ultimaDispensa : null,
    }
  } catch { return VAZIO }
}

async function gravarEstado(e: EstadoSalvo) {
  try { await AsyncStorage.setItem(CHAVE_CARD, JSON.stringify(e)) } catch { /* sem armazenamento: o card só reaparece depois */ }
}

// Card de avaliação da tela Início. `souDono` = dono com papel confirmado; `outroBannerVisivel` = um banner por vez.
// Recalcula quando a tela ganha foco (chamar `recalcular`). Falha em qualquer etapa = não mostra.
export function useCardAvaliacao(tenantId: string, souDono: boolean, outroBannerVisivel: boolean) {
  const [visivel, setVisivel] = useState(false)
  const jaRegistrouExibicao = useRef(false)

  const recalcular = useCallback(async () => {
    // iOS fora: a Apple (5.6.1) só aceita o pedido nativo; o card é só do Android
    if (Platform.OS !== 'android' || !souDono || !tenantId || outroBannerVisivel) { setVisivel(false); return }
    try {
      const [{ data: { session } }, sucesso, estado, ultimoNativo] = await Promise.all([
        supabase.auth.getSession(),
        AsyncStorage.getItem(CHAVE_SUCESSO),
        lerEstado(),
        AsyncStorage.getItem(CHAVE_ULTIMA_NATIVO),
      ])
      if (!session?.user) { setVisivel(false); return }
      // dois pedidos seguidos não: se o diálogo nativo saiu há menos de 60 dias, o card espera
      const nativo = parseInt(ultimoNativo ?? '', 10)
      if (Number.isFinite(nativo) && Date.now() - nativo < 60 * 24 * 3600 * 1000) { setVisivel(false); return }
      // barato primeiro: só conta as vendas no servidor se o resto já permite
      const base = {
        agora: Date.now(),
        criadaEm: session.user.created_at ? Date.parse(session.user.created_at) : null,
        souDono,
        houveSucesso: sucesso === '1',
        avaliou: estado.avaliou,
        dispensas: estado.dispensas,
        ultimaDispensa: estado.ultimaDispensa,
        outroBannerVisivel,
      }
      if (!podeMostrarCardAvaliacao({ ...base, vendas: Number.MAX_SAFE_INTEGER })) { setVisivel(false); return }
      const { count, error } = await supabase.from('vendas').select('id', { count: 'exact', head: true }).eq('usuario_id', tenantId)
      if (error) { setVisivel(false); return }
      const ok = podeMostrarCardAvaliacao({ ...base, vendas: count ?? 0 })
      setVisivel(ok)
      if (ok && !jaRegistrouExibicao.current) {
        jaRegistrouExibicao.current = true
        evento('avaliar_card')   // funil anônimo: o card foi exibido
      }
    } catch {
      setVisivel(false)
    }
  }, [tenantId, souDono, outroBannerVisivel])

  useEffect(() => { recalcular() }, [recalcular])

  const avaliar = useCallback(async () => {
    setVisivel(false)
    const e = await lerEstado()
    await gravarEstado({ ...e, avaliou: true })   // nunca mais mostra
    evento('avaliar_toque')
    await abrirAvaliacaoNaLoja()
  }, [])

  const dispensar = useCallback(async () => {
    setVisivel(false)
    const e = await lerEstado()
    await gravarEstado({ ...e, dispensas: e.dispensas + 1, ultimaDispensa: Date.now() })   // volta só em 60 dias, até 3 vezes
  }, [])

  return { visivel, recalcular, avaliar, dispensar }
}

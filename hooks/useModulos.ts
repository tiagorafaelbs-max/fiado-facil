import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'

export interface Modulos {
  foto_comprovante: boolean
  qr_pix: boolean
  score_cliente: boolean
  limite_credito: boolean
  relatorio_categoria: boolean
  cobranca_automatica: boolean
  categorias: boolean
  equipe: boolean
}

export const MODULOS_PADRAO: Modulos = {
  foto_comprovante: true,
  qr_pix: true,
  score_cliente: false,
  limite_credito: true,
  relatorio_categoria: false,
  cobranca_automatica: false,
  categorias: true,
  equipe: false,
}

export const INFO_MODULOS: Record<keyof Modulos, { label: string; descricao: string; icone: string; pro?: boolean }> = {
  foto_comprovante: { label: 'Foto de comprovante', descricao: 'Tire foto da compra ao registrar venda', icone: 'camera-outline' },
  qr_pix: { label: 'QR Code Pix', descricao: 'Gere QR Pix na hora do pagamento', icone: 'qr-code-outline' },
  score_cliente: { label: 'Score do cliente', descricao: 'Avaliação de histórico de pagamentos', icone: 'star-outline', pro: true },
  limite_credito: { label: 'Limite de crédito', descricao: 'Defina teto de fiado por cliente', icone: 'card-outline' },
  relatorio_categoria: { label: 'Ranking por categoria', descricao: 'Top clientes por categoria no relatório', icone: 'bar-chart-outline', pro: true },
  cobranca_automatica: { label: 'Cobrar todos com 1 clique', descricao: 'Habilita o botão "Cobrar todos" na tela de Cobranças — abre o WhatsApp para cada cliente vencido em sequência, com a mensagem já pronta.', icone: 'send-outline', pro: true },
  categorias: { label: 'Categorias de produto', descricao: 'Classifique vendas por tipo', icone: 'pricetag-outline' },
  equipe: { label: 'Equipe & funcionários', descricao: 'Convide funcionários para usar o app', icone: 'people-outline', pro: true },
}

const CACHE_KEY = '@fiado_modulos'

export function useModulos(usuarioId?: string) {
  const [modulos, setModulos] = useState<Modulos>(MODULOS_PADRAO)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    // Carrega do cache local primeiro (sem delay)
    AsyncStorage.getItem(CACHE_KEY).then(raw => {
      if (raw) setModulos({ ...MODULOS_PADRAO, ...JSON.parse(raw) })
    })

    if (!usuarioId) { setCarregando(false); return }

    // Depois sincroniza com Supabase
    const carregar = async () => {
      try {
        const { data } = await supabase.from('perfis').select('modulos').eq('id', usuarioId).single()
        if (data?.modulos) {
          const merged = { ...MODULOS_PADRAO, ...data.modulos }
          setModulos(merged)
          AsyncStorage.setItem(CACHE_KEY, JSON.stringify(merged))
        }
      } catch {
        // usa padrão do cache
      } finally {
        setCarregando(false)
      }
    }
    carregar()
  }, [usuarioId])

  const alternar = useCallback(async (modulo: keyof Modulos, valor: boolean) => {
    const novo = { ...modulos, [modulo]: valor }
    setModulos(novo)
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(novo))
    if (usuarioId) {
      await supabase.from('perfis').update({ modulos: novo }).eq('id', usuarioId)
    }
  }, [modulos, usuarioId])

  return { modulos, carregando, alternar }
}

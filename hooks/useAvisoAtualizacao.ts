import { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { lerInfoApp } from '../lib/dispositivo'
import { compararVersoes, versaoValida } from '../lib/versao'
import { abrirPaginaDaLoja } from '../lib/loja'

const CHAVE_ESCONDER = '@fiado_aviso_atualizacao_ate'
const TRES_DIAS_MS = 3 * 24 * 60 * 60 * 1000

// Aviso (nunca bloqueio) de que existe uma versão mais nova do app. Compara a versão INSTALADA
// (a da loja, não a do update OTA) com config_app.versao_minima_recomendada. "Agora não" esconde por
// 3 dias; se a versão mínima mudar (nova campanha), o aviso volta mesmo dentro dos 3 dias.
export function useAvisoAtualizacao() {
  const [mostrar, setMostrar] = useState(false)
  const [versaoMinima, setVersaoMinima] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    ;(async () => {
      const instalada = lerInfoApp()?.versao_app
      if (!instalada) return    // web: não tem loja
      const { data, error } = await supabase
        .from('config_app').select('valor').eq('chave', 'versao_minima_recomendada').maybeSingle()
      const minima = data?.valor
      if (error || !ativo || !versaoValida(minima) || !versaoValida(instalada)) return
      if (compararVersoes(instalada, minima) >= 0) return

      try {
        const bruto = await AsyncStorage.getItem(CHAVE_ESCONDER)
        if (bruto) {
          const { ate, para } = JSON.parse(bruto) as { ate: number; para: string }
          if (para === minima && Date.now() < ate) return
        }
      } catch { /* sem preferência salva: mostra */ }
      if (!ativo) return
      setVersaoMinima(minima)
      setMostrar(true)
    })()
    return () => { ativo = false }
  }, [])

  const agoraNao = useCallback(async () => {
    setMostrar(false)
    if (versaoMinima) {
      await AsyncStorage.setItem(CHAVE_ESCONDER, JSON.stringify({ ate: Date.now() + TRES_DIAS_MS, para: versaoMinima })).catch(() => {})
    }
  }, [versaoMinima])

  const atualizar = useCallback(() => { abrirPaginaDaLoja() }, [])

  return { mostrar, agoraNao, atualizar }
}

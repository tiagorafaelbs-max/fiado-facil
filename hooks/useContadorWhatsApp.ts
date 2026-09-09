import { useState, useEffect, useCallback, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'

const LIMITE_GRATUITO = 10

function chaveDoMes() {
  const d = new Date()
  return `@fiado_wa_count_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function useContadorWhatsApp(
  plano: 'gratuito' | 'pro' | null,
  usuarioId?: string,
) {
  const [usado, setUsado] = useState(0)
  const registrando = useRef(false)

  const carregar = useCallback(async () => {
    if (plano === 'pro') { setUsado(0); return }
    if (usuarioId) {
      const { data } = await supabase
        .from('perfis')
        .select('wpp_cobrado_mes, wpp_mes_ref')
        .eq('id', usuarioId)
        .single()
      if (data) {
        const mesAtual = new Date().toISOString().slice(0, 7)
        const count = data.wpp_mes_ref === mesAtual ? (parseInt(String(data.wpp_cobrado_mes ?? '0'), 10) || 0) : 0
        setUsado(count)
        return
      }
    }
    // Fallback offline: AsyncStorage
    const chave = chaveDoMes()
    const raw = await AsyncStorage.getItem(chave)
    setUsado(parseInt(raw ?? '0', 10) || 0)
  }, [plano, usuarioId])

  useEffect(() => { carregar() }, [carregar])

  const registrarUso = useCallback(async (): Promise<boolean> => {
    if (plano === 'pro') return true
    if (registrando.current) return false
    registrando.current = true
    try {
      if (usuarioId) {
        const { data, error } = await supabase.rpc('incrementar_contador_wpp', {
          p_usuario_id: usuarioId,
        })
        if (error) throw error
        const resultado = data as { permitido: boolean; usado: number }
        setUsado(resultado.usado)
        return resultado.permitido
      }
      // Fallback offline: AsyncStorage
      const chave = chaveDoMes()
      const raw = await AsyncStorage.getItem(chave)
      const atual = parseInt(raw ?? '0', 10) || 0
      if (atual >= LIMITE_GRATUITO) return false
      const novo = atual + 1
      await AsyncStorage.setItem(chave, String(novo))
      setUsado(novo)
      return true
    } finally {
      registrando.current = false
    }
  }, [plano, usuarioId])

  const reverterUso = useCallback(async (): Promise<void> => {
    if (plano === 'pro') return
    if (usuarioId) {
      await supabase.rpc('reverter_contador_wpp', { p_usuario_id: usuarioId })
      setUsado(prev => Math.max(0, prev - 1))
      return
    }
    // Fallback offline: AsyncStorage
    const chave = chaveDoMes()
    const raw = await AsyncStorage.getItem(chave)
    const atual = parseInt(raw ?? '0', 10) || 0
    const novo = Math.max(0, atual - 1)
    await AsyncStorage.setItem(chave, String(novo))
    setUsado(novo)
  }, [plano, usuarioId])

  const restante = plano === 'pro' ? Infinity : Math.max(0, LIMITE_GRATUITO - usado)
  const atingiuLimite = plano !== 'pro' && plano !== null && usado >= LIMITE_GRATUITO

  return { usado, restante, atingiuLimite, limite: LIMITE_GRATUITO, registrarUso, reverterUso, carregar }
}

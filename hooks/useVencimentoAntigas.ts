import { useCallback, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { useTenant } from './useTenant'

// 3c — vendas ANTIGAS sem data de vencimento. Só o DONO com papel confirmado vê e usa isto
// (as RPCs também recusam funcionário). Nada é alterado sem o toque de confirmação na tela.
const DIAS_ESCONDER = 7

export interface ImpactoVencimento {
  total: number
  jaVencidas: number
  aVencer: number
  clientesAfetados: number
  novosVencidos: number
  desfazivel: number
  ultimaExecucao: string | null
}

interface LinhaContagem {
  total?: number | string | null
  ja_vencidas?: number | string | null
  a_vencer?: number | string | null
  clientes_afetados?: number | string | null
  novos_vencidos?: number | string | null
  desfazivel?: number | string | null
  ultima_execucao?: string | null
}

export function useVencimentoAntigas() {
  const { tenantId, podeVerTotais } = useTenant()
  const [impacto, setImpacto] = useState<ImpactoVencimento | null>(null)
  const [escondido, setEscondido] = useState(true)
  const [processando, setProcessando] = useState(false)
  const chaveEscondido = '@fiado_aviso_venc_antigas_ate:' + tenantId
  const sequencia = useRef(0)   // descarta respostas fora de ordem

  const carregar = useCallback(async () => {
    const minha = ++sequencia.current
    if (!podeVerTotais || !tenantId) { setImpacto(null); return }
    const { data, error } = await supabase.rpc('contar_vendas_sem_vencimento')
    // Offline, ou migration ainda não aplicada: sem aviso, sem erro na tela.
    if (error || !data || minha !== sequencia.current) return
    const r = (Array.isArray(data) ? data[0] : data) as LinhaContagem | undefined
    if (!r) return
    setImpacto({
      total: Number(r.total ?? 0),
      jaVencidas: Number(r.ja_vencidas ?? 0),
      aVencer: Number(r.a_vencer ?? 0),
      clientesAfetados: Number(r.clientes_afetados ?? 0),
      novosVencidos: Number(r.novos_vencidos ?? 0),
      desfazivel: Number(r.desfazivel ?? 0),
      ultimaExecucao: r.ultima_execucao ?? null,
    })
    const ate = await AsyncStorage.getItem(chaveEscondido).catch(() => null)
    if (minha !== sequencia.current) return
    setEscondido(!!ate && Date.now() < Number(ate))
  }, [podeVerTotais, tenantId, chaveEscondido])

  // Recarrega ao montar e ao voltar para a tela (o Início fica montado: sem isso o aviso e o
  // "Desfazer" ficariam desatualizados depois de uma ação em Cobranças).
  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  // "Agora não": esconde o aviso por 7 dias neste aparelho (por loja).
  const agoraNao = useCallback(async () => {
    await AsyncStorage.setItem(chaveEscondido, String(Date.now() + DIAS_ESCONDER * 24 * 60 * 60 * 1000)).catch(() => {})
    setEscondido(true)
  }, [chaveEscondido])

  const definir = useCallback(async (): Promise<number> => {
    setProcessando(true)
    try {
      const { data, error } = await supabase.rpc('definir_vencimento_vendas_antigas')
      if (error) throw error
      await carregar()
      return Number(data ?? 0)
    } finally {
      setProcessando(false)
    }
  }, [carregar])

  const desfazer = useCallback(async (): Promise<number> => {
    setProcessando(true)
    try {
      const { data, error } = await supabase.rpc('desfazer_vencimento_vendas_antigas')
      if (error) throw error
      await carregar()
      return Number(data ?? 0)
    } finally {
      setProcessando(false)
    }
  }, [carregar])

  return { impacto, escondido, processando, carregar, agoraNao, definir, desfazer }
}

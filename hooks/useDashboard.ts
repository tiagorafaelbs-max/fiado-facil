import { useState, useCallback, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { resolverTenantId } from '../lib/tenant'
import type { DashboardResumo, Cliente } from '../types'
import { format } from 'date-fns'

// Chaveado por uid (tenant) -- achado do Fiscal: sem persistência, abrir o app
// já offline (sem nenhum resumo "bom" ainda em memória) continuava mostrando
// zerado, porque o fallback anterior só preservava o último estado em RAM.
const DASHBOARD_CACHE_PREFIX = '@fiado_dashboard_cache:'

export function useDashboard() {
  const [resumo, setResumo] = useState<DashboardResumo>({
    total_em_aberto: 0,
    recebido_hoje: 0,
    clientes_ativos: 0,
    clientes_vencidos: 0,
  })
  const [topDevedores, setTopDevedores] = useState<Cliente[]>([])
  const [carregando, setCarregando] = useState(false)
  const [plano, setPlano] = useState<'gratuito' | 'pro'>('gratuito')
  // true quando a última tentativa falhou (provavelmente offline) -- o Início
  // usa isto pra NÃO tratar o resumo atual como "conta vazia de verdade" e não
  // mostrar o checklist de primeiros passos com base em dado que não é real.
  const [offline, setOffline] = useState(false)
  // Descarta respostas que chegam fora de ordem -- ex: uma tentativa offline
  // ainda tentando quando a reconexão já disparou outra buscar() que terminou
  // primeiro; sem isto a resposta antiga podia sobrescrever o resumo bom com
  // offline=true (achado do Fiscal).
  const requisicaoRef = useRef(0)

  const buscar = useCallback(async () => {
    setCarregando(true)
    const idRequisicao = ++requisicaoRef.current
    let cacheKey: string | undefined
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      const uid = await resolverTenantId(session.user.id)
      cacheKey = DASHBOARD_CACHE_PREFIX + uid
      const hoje = format(new Date(), 'yyyy-MM-dd')

      const [
        { data: clientes, error: erroClientes },
        { data: recebidoHoje, error: erroPagamentos },
        { data: perfil, error: erroPerfil },
      ] = await Promise.all([
        supabase
          .from('clientes_com_saldo')
          .select('*')
          .eq('usuario_id', uid)
          .eq('ativo', true),
        supabase
          .from('pagamentos')
          .select('valor')
          .eq('data_pagamento', hoje)
          .eq('usuario_id', uid),
        supabase
          .from('perfis')
          .select('plano')
          .eq('id', uid)
          .single(),
      ])
      if (erroClientes || erroPagamentos || erroPerfil) throw (erroClientes ?? erroPagamentos ?? erroPerfil)
      if (idRequisicao !== requisicaoRef.current) return // resposta velha -- uma mais nova já resolveu

      const planoResolvido = (perfil?.plano as 'gratuito' | 'pro') ?? 'gratuito'
      const totalEmAberto = (clientes ?? []).reduce((acc, c) => acc + (c.saldo_devedor ?? 0), 0)
      const recebidoHojeTotal = (recebidoHoje ?? []).reduce((acc, p) => acc + p.valor, 0)
      // Fonte única de verdade: a view clientes_com_saldo já calcula o status
      // por alocação FIFO de pagamentos, imune a flag `pago` desatualizada.
      const vencidos = (clientes ?? []).filter(
        c => c.status_pagamento === 'vencido' && (c.saldo_devedor ?? 0) > 0
      ).length
      const top = [...(clientes ?? [])]
        .filter((c) => (c.saldo_devedor ?? 0) > 0)
        .sort((a, b) => (b.saldo_devedor ?? 0) - (a.saldo_devedor ?? 0))
        .slice(0, 5)
      const resumoNovo = {
        total_em_aberto: totalEmAberto,
        recebido_hoje: recebidoHojeTotal,
        clientes_ativos: (clientes ?? []).length,
        clientes_vencidos: vencidos,
      }

      setPlano(planoResolvido)
      setResumo(resumoNovo)
      setTopDevedores(top)
      setOffline(false)
      AsyncStorage.setItem(cacheKey, JSON.stringify({ resumo: resumoNovo, topDevedores: top, plano: planoResolvido })).catch(() => {})
    } catch {
      if (idRequisicao !== requisicaoRef.current) return
      // Falha de rede: tenta o último resumo salvo deste tenant em vez de
      // zerar tudo (achado do Tiago: Início mostrava R$ 0,00/0 clientes como
      // se a conta fosse nova, inclusive abrindo o app já offline). setOffline
      // avisa o Início pra não confiar neste resumo como "conta realmente vazia".
      if (cacheKey) {
        try {
          const cache = await AsyncStorage.getItem(cacheKey)
          if (cache) {
            const salvo = JSON.parse(cache)
            setResumo(salvo.resumo)
            setTopDevedores(salvo.topDevedores)
            setPlano(salvo.plano)
          }
        } catch { /* sem cache -- resumo continua no que já estava (pode ser o inicial zerado) */ }
      }
      setOffline(true)
    } finally {
      if (idRequisicao === requisicaoRef.current) setCarregando(false)
    }
  }, [])

  return { resumo, topDevedores, carregando, buscar, plano, offline }
}

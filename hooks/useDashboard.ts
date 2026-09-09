import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { DashboardResumo, Cliente } from '../types'
import { format } from 'date-fns'

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

  const buscar = useCallback(async () => {
    setCarregando(true)
    setResumo({ total_em_aberto: 0, recebido_hoje: 0, clientes_ativos: 0, clientes_vencidos: 0 })
    try {
      const hoje = format(new Date(), 'yyyy-MM-dd')

      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id

      const [{ data: clientes }, { data: recebidoHoje }, { data: perfil }] = await Promise.all([
        supabase
          .from('clientes_com_saldo')
          .select('*')
          .eq('usuario_id', uid ?? '')
          .eq('ativo', true),
        supabase
          .from('pagamentos')
          .select('valor')
          .eq('data_pagamento', hoje)
          .eq('usuario_id', uid ?? ''),
        supabase
          .from('perfis')
          .select('plano')
          .eq('id', uid ?? '')
          .single(),
      ])

      setPlano((perfil?.plano as 'gratuito' | 'pro') ?? 'gratuito')

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

      setResumo({
        total_em_aberto: totalEmAberto,
        recebido_hoje: recebidoHojeTotal,
        clientes_ativos: (clientes ?? []).length,
        clientes_vencidos: vencidos,
      })
      setTopDevedores(top)
    } finally {
      setCarregando(false)
    }
  }, [])

  return { resumo, topDevedores, carregando, buscar, plano }
}

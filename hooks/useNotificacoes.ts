import { useEffect } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import { supabase } from '../lib/supabase'
import { formatarMoeda } from '../lib/validacao'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export async function solicitarPermissaoNotificacoes(): Promise<boolean> {
  if (Platform.OS === 'web') return false
  const { status: atual } = await Notifications.getPermissionsAsync()
  if (atual === 'granted') return true
  const { status } = await Notifications.requestPermissionsAsync()
  return status === 'granted'
}

export async function agendarNotificacoesVencimento() {
  if (Platform.OS === 'web') return

  await Notifications.cancelAllScheduledNotificationsAsync()

  try {
    const hoje = new Date()
    const amanha = new Date(hoje)
    amanha.setDate(amanha.getDate() + 1)
    const dataAmanha = amanha.toISOString().split('T')[0]

    const { data: vendasAmanha } = await supabase
      .from('vendas')
      .select('id, valor, data_vencimento, clientes(nome)')
      .eq('pago', false)
      .eq('data_vencimento', dataAmanha)

    // Vencidos pela view (alocação FIFO) — mesma fonte do dashboard/cobranças
    const { data: clientesVencidos } = await supabase
      .from('clientes_com_saldo')
      .select('id, saldo_devedor')
      .eq('ativo', true)
      .eq('status_pagamento', 'vencido')
      .gt('saldo_devedor', 0)

    // Notificação das 9h — vencimentos de amanhã
    if (vendasAmanha && vendasAmanha.length > 0) {
      const totalAmanha = (vendasAmanha as any[]).reduce((acc, v) => acc + v.valor, 0)
      const nomes = [...new Set((vendasAmanha as any[]).map(v => (v.clientes as any)?.nome).filter(Boolean))]
      const texto = nomes.length === 1
        ? `${nomes[0]} vence amanhã — ${formatarMoeda(totalAmanha)}`
        : `${nomes.length} clientes vencem amanhã — ${formatarMoeda(totalAmanha)}`

      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⏰ Vencimentos amanhã',
          body: texto,
          sound: true,
          data: { tela: 'relatorios' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: 9,
          minute: 0,
        },
      })
    }

    // Notificação das 18h — cobranças vencidas (lembrete fim de expediente)
    if (clientesVencidos && clientesVencidos.length > 0) {
      const totalVencido = (clientesVencidos as any[]).reduce((acc, c) => acc + (c.saldo_devedor ?? 0), 0)

      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🔴 Cobranças em atraso',
          body: `${clientesVencidos.length} cliente${clientesVencidos.length > 1 ? 's' : ''} em atraso · ${formatarMoeda(totalVencido)} a receber`,
          sound: true,
          data: { tela: 'clientes' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: 18,
          minute: 0,
        },
      })
    }

    // Notificação das 10h (sábado) — clientes sem compra há 5+ dias (reengajamento)
    const cincoAntras = new Date(hoje)
    cincoAntras.setDate(cincoAntras.getDate() - 5)
    const dataCinco = cincoAntras.toISOString().split('T')[0]

    const { data: clientesInativos } = await supabase
      .from('clientes')
      .select('id, nome')
      .lt('ultima_compra', dataCinco)
      .not('ultima_compra', 'is', null)
      .eq('ativo', true)
      .limit(3)

    if (clientesInativos && clientesInativos.length > 0) {
      const nomes = (clientesInativos as any[]).map(c => c.nome)
      const body = nomes.length === 1
        ? `${nomes[0]} não compra há 5 dias. Hora de um contato!`
        : `${nomes[0]} e mais ${nomes.length - 1} clientes estão sumidos. Hora de contato!`

      await Notifications.scheduleNotificationAsync({
        content: {
          title: '💬 Clientes sumidos',
          body,
          sound: true,
          data: { tela: 'clientes' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: 7,
          hour: 10,
          minute: 0,
        },
      })
    }
  } catch {
    // notificações são opcionais — falha silenciosa
  }
}

export function useNotificacoes() {
  useEffect(() => {
    if (Platform.OS === 'web') return
    // Apenas reagenda se o usuário JÁ concedeu permissão — nunca pede aqui.
    // O pedido de permissão é feito após a primeira venda (nova-venda.tsx).
    Notifications.getPermissionsAsync().then(({ status }) => {
      if (status === 'granted') agendarNotificacoesVencimento()
    })
  }, [])
}

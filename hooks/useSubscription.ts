import { useState, useEffect, useCallback } from 'react'
import { Platform } from 'react-native'
import { supabase } from '../lib/supabase'

// react-native-purchases só carrega em builds nativos (não no Expo Go)
let Purchases: any = null
try {
  Purchases = require('react-native-purchases').default
} catch {
  // Expo Go ou web — sem IAP
}

export function useSubscription() {
  const [isPro, setIsPro] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const checkStatus = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const uid = user?.id
      if (!uid) {
        setIsPro(false)
        return
      }

      // Fonte de verdade: Supabase — filtrado pelo uid do usuário atual
      const { data } = await supabase
        .from('active_subscriptions')
        .select('user_id')
        .eq('user_id', uid)
        .maybeSingle()

      if (data) {
        setIsPro(true)
        return
      }

      // Fallback: RevenueCat SDK (resolve race condition pós-compra e offline)
      if (Purchases) {
        const customerInfo = await Purchases.getCustomerInfo()
        const active = customerInfo.entitlements.active['pro']
        if (active) {
          setIsPro(true)
          // Forçar sync — o webhook pode ter atrasado
          supabase.functions.invoke('sync-revenuecat-status').catch(() => {})
          return
        }
      }

      setIsPro(false)
    } catch (e) {
      console.warn('useSubscription error:', e)
      // Em caso de erro de rede, manter estado anterior (sem regredir acesso)
      setIsPro((prev) => prev ?? false)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  return { isPro, isLoading, refresh: checkStatus }
}

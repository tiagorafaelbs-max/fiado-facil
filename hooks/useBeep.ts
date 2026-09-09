import { useCallback } from 'react'
import { Vibration } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

const CHAVE = 'beep_confirmacao'

export async function getBeepAtivo(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(CHAVE)
    return v === null ? true : v === 'true'
  } catch {
    return true
  }
}

export async function setBeepAtivo(ativo: boolean): Promise<void> {
  await AsyncStorage.setItem(CHAVE, ativo ? 'true' : 'false')
}

export function useBeep() {
  const tocar = useCallback(async () => {
    try {
      const ativo = await getBeepAtivo()
      if (!ativo) return
      // Padrão de vibração que simula um beep de confirmação
      Vibration.vibrate([0, 80, 40, 80])
    } catch {
      // silencioso — beep é opcional
    }
  }, [])

  return { tocar }
}

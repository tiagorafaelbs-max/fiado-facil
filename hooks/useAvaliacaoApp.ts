import { useEffect, useCallback } from 'react'
import { Alert, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as StoreReview from 'expo-store-review'

const CHAVE_ACESSOS = '@fiado_facil:contagem_acessos'
const CHAVE_AVALIADO = '@fiado_facil:avaliacao_solicitada'
const MINIMO_ACESSOS = 5

export function useAvaliacaoApp() {
  const verificarEPedirAvaliacao = useCallback(async () => {
    if (Platform.OS === 'web') return

    try {
      const jaAvaliou = await AsyncStorage.getItem(CHAVE_AVALIADO)
      if (jaAvaliou === 'true') return

      const contagemStr = await AsyncStorage.getItem(CHAVE_ACESSOS)
      const contagem = parseInt(contagemStr ?? '0', 10) + 1
      await AsyncStorage.setItem(CHAVE_ACESSOS, String(contagem))

      if (contagem < MINIMO_ACESSOS) return

      // Marca como solicitada antes de mostrar — evita loop se o usuário fechar
      await AsyncStorage.setItem(CHAVE_AVALIADO, 'true')

      const disponivel = await StoreReview.isAvailableAsync()
      if (disponivel) {
        // Aguarda 2s para não aparecer junto com animações de entrada
        setTimeout(() => StoreReview.requestReview(), 2000)
      } else {
        // Fallback: dialog manual com link para a loja
        setTimeout(() => {
          Alert.alert(
            'Está gostando do FiadoApp? 😊',
            'Sua avaliação ajuda outros comerciantes a encontrar o app e nos motiva a melhorar cada vez mais!',
            [
              { text: 'Agora não', style: 'cancel' },
              {
                text: '⭐ Avaliar agora',
                onPress: () => {
                  const url = Platform.OS === 'android'
                    ? 'market://details?id=com.fiadofacil.app'
                    : 'itms-apps://itunes.apple.com/app/id6477870794?action=write-review'
                  require('react-native').Linking.openURL(url).catch(() => {})
                },
              },
            ]
          )
        }, 2000)
      }
    } catch {
      // silencioso
    }
  }, [])

  useEffect(() => {
    verificarEPedirAvaliacao()
  }, [])
}

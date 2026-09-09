import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { C } from '../constants/colors'

// O tour interativo é exibido diretamente no dashboard ao entrar pela primeira vez.
// Esta tela apenas redireciona para o app.
export default function TourScreen() {
  const router = useRouter()
  useEffect(() => { router.replace('/(tabs)') }, [])
  return (
    <View style={{ flex: 1, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="rgba(255,255,255,0.7)" />
    </View>
  )
}

import { useEffect } from 'react'
import { View, Text, StyleSheet, Platform, Image } from 'react-native'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuth } from '../hooks/useAuth'

const VERDE = '#14352A'
const AMBAR = '#E8A63A'

export default function SplashScreen() {
  const { session, carregando } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (carregando) return
    if (session) {
      AsyncStorage.getItem('@fiado_tour_ok').then(ok => {
        router.replace(ok ? '/(tabs)' : '/tour')
      })
    } else {
      AsyncStorage.getItem('@fiado_onboarding_ok').then(ok => {
        router.replace(ok ? '/(auth)/login' : '/onboarding')
      })
    }
  }, [session, carregando])

  return (
    <View style={s.container}>
      {/* Linha âmbar no topo */}
      <View style={s.topBar} />

      {/* Conteúdo central */}
      <View style={s.centro}>
        <Image
          source={require('../assets/icon.png')}
          style={s.icone}
          resizeMode="contain"
        />

        <Text style={s.nome}>
          Fiado<Text style={s.destaque}>App</Text>
        </Text>

        <Text style={s.tagline}>Controle do fiado no seu bolso</Text>

        <View style={s.chips}>
          {['Clientes & fiado', 'Cobrança WhatsApp', 'Pix na hora'].map(item => (
            <View key={item} style={s.chip}>
              <View style={s.chipDot} />
              <Text style={s.chipTexto}>{item}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Rodapé com loading */}
      <View style={s.rodape}>
        <View style={s.loadingRow}>
          <View style={s.dot} />
          <View style={[s.dot, s.dotMid]} />
          <View style={s.dot} />
        </View>
        <Text style={s.versao}>v1.0.4</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: VERDE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingHorizontal: 28,
    paddingBottom: 40,
  },

  topBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 3,
    backgroundColor: AMBAR,
  },

  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },

  icone: {
    width: 120,
    height: 120,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },

  nome: {
    fontSize: 48,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -1.5,
  },
  destaque: { color: AMBAR },

  tagline: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    letterSpacing: 0.2,
  },

  chips: { gap: 10, alignSelf: 'stretch' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  chipDot: {
    width: 6, height: 6,
    borderRadius: 3,
    backgroundColor: AMBAR,
  },
  chipTexto: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.82)',
  },

  rodape: {
    alignItems: 'center',
    gap: 12,
  },
  loadingRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  dot: {
    width: 6, height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotMid: {
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  versao: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
})

import { useState, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
  Dimensions, Animated, Image, StatusBar,
} from 'react-native'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'

const { width } = Dimensions.get('window')

const VERDE   = '#14352A'
const AMBAR   = '#E8A63A'
const BRANCO  = '#FFFFFF'

const PASSOS = [
  {
    key: 'clientes',
    icone: 'people-outline' as const,
    titulo: 'Cadastre seus clientes',
    texto: 'Nome, telefone e histórico\ncompleto. Chega de caderno perdido.',
  },
  {
    key: 'vendas',
    icone: 'receipt-outline' as const,
    titulo: 'Lance o fiado em segundos',
    texto: 'Registre valor e vencimento\nna hora, sem complicação.',
  },
  {
    key: 'whatsapp',
    icone: 'logo-whatsapp' as const,
    titulo: 'Cobre no WhatsApp',
    texto: 'Um toque e a cobrança vai direto\nno celular do cliente.',
  },
]

export default function OnboardingScreen() {
  const router = useRouter()
  const [passo, setPasso] = useState(-1)   // -1 = hero
  const fadeAnim  = useRef(new Animated.Value(1)).current
  const slideAnim = useRef(new Animated.Value(0)).current

  async function concluir() {
    await AsyncStorage.setItem('@fiado_onboarding_ok', '1')
    router.replace('/(auth)/login')
  }

  function avancar() {
    const proximo = passo + 1
    if (proximo < PASSOS.length) {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(fadeAnim,  { toValue: 0,   duration: 100, useNativeDriver: true }),
          Animated.timing(fadeAnim,  { toValue: 1,   duration: 200, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(slideAnim, { toValue: -16, duration: 100, useNativeDriver: true }),
          Animated.timing(slideAnim, { toValue: 0,   duration: 200, useNativeDriver: true }),
        ]),
      ]).start()
      setPasso(proximo)
    } else {
      concluir()
    }
  }

  // ─── HERO ────────────────────────────────────────────────────────────────────
  if (passo === -1) {
    return (
      <View style={s.container}>
        <StatusBar barStyle="light-content" backgroundColor={VERDE} />

        {/* Linha âmbar no topo — assinatura visual do app */}
        <View style={s.topBar} />

        {/* Centro */}
        <View style={s.heroCentro}>
          {/* Ícone oficial grande */}
          <Image
            source={require('../assets/icon.png')}
            style={s.heroIcone}
            resizeMode="contain"
          />

          {/* Tagline */}
          <Text style={s.heroTagline}>
            Controle do fiado{'\n'}no seu celular
          </Text>

          {/* Destaques rápidos */}
          <View style={s.chips}>
            <Chip texto="Clientes & fiado" />
            <Chip texto="Cobrança WhatsApp" />
            <Chip texto="Pix na hora" />
          </View>
        </View>

        {/* Rodapé */}
        <View style={s.heroRodape}>
          <TouchableOpacity
            style={s.btnPrimario}
            onPress={avancar}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Começar grátis"
          >
            <Text style={s.btnPrimarioTexto}>Começar grátis</Text>
            <Ionicons name="arrow-forward" size={16} color={VERDE} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={concluir}
            style={s.linkWrap}
            activeOpacity={0.7}
            accessibilityRole="link"
            accessibilityLabel="Já tenho conta"
          >
            <Text style={s.link}>Já tenho conta</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ─── FEATURE ─────────────────────────────────────────────────────────────────
  const feature = PASSOS[passo]
  const ultimo  = passo === PASSOS.length - 1

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={VERDE} />
      <View style={s.topBar} />

      {/* Barras de progresso */}
      <View style={s.progressoWrap}>
        {PASSOS.map((_, i) => (
          <View
            key={i}
            style={[s.progressoBarra, i <= passo && s.progressoAtivo]}
          />
        ))}
      </View>

      {/* Pular */}
      <TouchableOpacity
        onPress={concluir}
        style={s.pularBtn}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Pular apresentação"
      >
        <Text style={s.pularTexto}>Pular</Text>
      </TouchableOpacity>

      {/* Conteúdo animado */}
      <Animated.View style={[s.featCentro, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={[s.featIconeWrap, feature.icone === 'logo-whatsapp' && s.featIconeWa]}>
          <Ionicons
            name={feature.icone}
            size={48}
            color={feature.icone === 'logo-whatsapp' ? '#25D366' : AMBAR}
          />
        </View>

        <Text style={s.featTitulo}>{feature.titulo}</Text>
        <Text style={s.featTexto}>{feature.texto}</Text>
      </Animated.View>

      {/* Rodapé */}
      <View style={s.featRodape}>
        {/* Dots */}
        <View style={s.dots}>
          {PASSOS.map((_, i) => (
            <View key={i} style={[s.dot, i === passo && s.dotAtivo]} />
          ))}
        </View>

        <TouchableOpacity
          style={s.btnPrimario}
          onPress={avancar}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={ultimo ? 'Entrar no app' : 'Próximo'}
        >
          <Text style={s.btnPrimarioTexto}>
            {ultimo ? 'Entrar no app' : 'Próximo'}
          </Text>
          <Ionicons name={ultimo ? 'checkmark' : 'arrow-forward'} size={16} color={VERDE} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

function Chip({ texto }: { texto: string }) {
  return (
    <View style={s.chip}>
      <View style={s.chipDot} />
      <Text style={s.chipTexto}>{texto}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: VERDE,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingHorizontal: 28,
    paddingBottom: Platform.OS === 'ios' ? 52 : 36,
  },

  topBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 3,
    backgroundColor: AMBAR,
  },

  // ── HERO ──────────────────────────────────────
  heroCentro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
  },

  heroIcone: {
    width: 140,
    height: 140,
    borderRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.45,
    shadowRadius: 32,
    elevation: 16,
  },

  heroTagline: {
    fontSize: 22,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    lineHeight: 32,
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
    paddingVertical: 14,
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

  heroRodape: { gap: 0, alignItems: 'center' },

  btnPrimario: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: AMBAR,
    borderRadius: 14,
    paddingVertical: 17,
    alignSelf: 'stretch',
    shadowColor: AMBAR,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 6,
  },
  btnPrimarioTexto: {
    fontSize: 16,
    fontWeight: '800',
    color: VERDE,
    letterSpacing: -0.2,
  },

  linkWrap: { marginTop: 20 },
  link: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
  },

  // ── FEATURE ───────────────────────────────────
  progressoWrap: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  progressoBarra: {
    flex: 1, height: 3, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  progressoAtivo: { backgroundColor: AMBAR },

  pularBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 99,
    marginBottom: 4,
  },
  pularTexto: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.45)' },

  featCentro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },

  featIconeWrap: {
    width: 100, height: 100,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  featIconeWa: {
    backgroundColor: 'rgba(37,211,102,0.08)',
    borderColor: 'rgba(37,211,102,0.15)',
  },

  featTitulo: {
    fontSize: 28,
    fontWeight: '900',
    color: BRANCO,
    textAlign: 'center',
    letterSpacing: -0.4,
    lineHeight: 36,
  },
  featTexto: {
    fontSize: 17,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 26,
  },

  featRodape: { gap: 20 },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: {
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dotAtivo: { width: 28, backgroundColor: AMBAR },
})

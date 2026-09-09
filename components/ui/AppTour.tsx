import { useEffect, useRef, useState } from 'react'
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  Dimensions, Animated, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { C } from '../../constants/colors'

const { width: SW, height: SH } = Dimensions.get('window')

export interface TourStep {
  titulo: string
  texto: string
  posicao: { x: number; y: number; width: number; height: number } | null
  tooltipLado?: 'cima' | 'baixo' | 'esquerda' | 'direita'
}

interface Props {
  steps: TourStep[]
  visivel: boolean
  onConcluir: () => void
}

const PAD = 10
const TOOLTIP_W = Math.min(SW - 48, 320)

export function AppTour({ steps, visivel, onConcluir }: Props) {
  const [passo, setPasso] = useState(0)
  const fadeAnim = useRef(new Animated.Value(0)).current
  const pulseAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (visivel) {
      setPasso(0)
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start()
    } else {
      fadeAnim.setValue(0)
    }
  }, [visivel])

  useEffect(() => {
    // Pulso no destaque
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [passo])

  if (!visivel || steps.length === 0) return null

  const step = steps[passo]
  const pos = step.posicao
  const ultimo = passo === steps.length - 1

  // Calcular posição do tooltip
  function calcTooltipPos() {
    if (!pos) return { top: SH / 2 - 80, left: (SW - TOOLTIP_W) / 2 }

    const lado = step.tooltipLado ?? (pos.y > SH / 2 ? 'cima' : 'baixo')
    const cx = pos.x + pos.width / 2
    let left = Math.max(16, Math.min(cx - TOOLTIP_W / 2, SW - TOOLTIP_W - 16))

    if (lado === 'baixo') return { top: pos.y + pos.height + PAD + 14, left }
    if (lado === 'cima') return { top: pos.y - 130 - PAD, left }
    if (lado === 'direita') return { top: pos.y + pos.height / 2 - 60, left: pos.x + pos.width + PAD + 14 }
    return { top: pos.y + pos.height / 2 - 60, left: pos.x - TOOLTIP_W - PAD - 14 }
  }

  function calcSetaPos() {
    if (!pos) return null
    const lado = step.tooltipLado ?? (pos.y > SH / 2 ? 'cima' : 'baixo')
    const cx = pos.x + pos.width / 2
    const tooltipPos = calcTooltipPos()

    if (lado === 'baixo') {
      return { top: pos.y + pos.height + PAD + 2, left: cx - 8 }
    }
    if (lado === 'cima') {
      return { top: pos.y - PAD - 18, left: cx - 8 }
    }
    return null
  }

  const tooltipPos = calcTooltipPos()
  const setaPos = calcSetaPos()
  const lado = pos ? (step.tooltipLado ?? (pos.y > SH / 2 ? 'cima' : 'baixo')) : 'baixo'

  return (
    <Modal visible={visivel} transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[estilos.overlay, { opacity: fadeAnim }]}>

        {/* Máscara: 4 retângulos escuros ao redor do elemento destacado */}
        {pos ? (
          <>
            {/* Topo */}
            <View style={[estilos.mascara, { top: 0, left: 0, right: 0, height: pos.y - PAD }]} />
            {/* Esquerda */}
            <View style={[estilos.mascara, {
              top: pos.y - PAD, left: 0,
              width: pos.x - PAD,
              height: pos.height + PAD * 2,
            }]} />
            {/* Direita */}
            <View style={[estilos.mascara, {
              top: pos.y - PAD,
              left: pos.x + pos.width + PAD,
              right: 0,
              height: pos.height + PAD * 2,
            }]} />
            {/* Base */}
            <View style={[estilos.mascara, {
              top: pos.y + pos.height + PAD, left: 0, right: 0, bottom: 0,
            }]} />

            {/* Borda pulsante ao redor do elemento */}
            <Animated.View style={[
              estilos.destaque,
              {
                top: pos.y - PAD,
                left: pos.x - PAD,
                width: pos.width + PAD * 2,
                height: pos.height + PAD * 2,
                borderRadius: 14,
                transform: [{ scale: pulseAnim }],
              },
            ]} />
          </>
        ) : (
          <View style={[estilos.mascara, { top: 0, left: 0, right: 0, bottom: 0 }]} />
        )}

        {/* Seta apontando para o elemento */}
        {setaPos && (
          <View style={[
            estilos.seta,
            setaPos,
            lado === 'cima' && estilos.setaBaixo,
          ]} />
        )}

        {/* Tooltip */}
        <View style={[estilos.tooltip, tooltipPos]}>
          {/* Cabeçalho */}
          <View style={estilos.tooltipHeader}>
            <View style={estilos.stepBadge}>
              <Text style={estilos.stepBadgeTexto}>{passo + 1}/{steps.length}</Text>
            </View>
            <TouchableOpacity onPress={onConcluir} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={18} color={C.text2} />
            </TouchableOpacity>
          </View>

          <Text style={estilos.tooltipTitulo}>{step.titulo}</Text>
          <Text style={estilos.tooltipTexto}>{step.texto}</Text>

          {/* Barra de progresso */}
          <View style={estilos.progressoBarra}>
            <View style={[estilos.progressoPreenchido, { width: `${((passo + 1) / steps.length) * 100}%` as any }]} />
          </View>

          {/* Botões */}
          <View style={estilos.tooltipBotoes}>
            {passo > 0 && (
              <TouchableOpacity style={estilos.btnVoltar} onPress={() => setPasso(p => p - 1)}>
                <Ionicons name="arrow-back" size={16} color={C.text2} />
                <Text style={estilos.btnVoltarTexto}>Voltar</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[estilos.btnProximo, ultimo && estilos.btnConcluir]}
              onPress={ultimo ? onConcluir : () => setPasso(p => p + 1)}
            >
              <Text style={estilos.btnProximoTexto}>{ultimo ? 'Entendi!' : 'Próximo'}</Text>
              <Ionicons name={ultimo ? 'checkmark' : 'arrow-forward'} size={16} color={C.white} />
            </TouchableOpacity>
          </View>

          {!ultimo && (
            <TouchableOpacity style={estilos.btnPular} onPress={onConcluir}>
              <Text style={estilos.btnPularTexto}>Pular tour</Text>
            </TouchableOpacity>
          )}
        </View>

      </Animated.View>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 9999 },
  mascara: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  destaque: {
    position: 'absolute',
    borderWidth: 2.5,
    borderColor: C.green,
    shadowColor: C.green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 0,
  },
  seta: {
    position: 'absolute',
    width: 0, height: 0,
    borderLeftWidth: 10, borderRightWidth: 10, borderBottomWidth: 14,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderBottomColor: C.white,
  },
  setaBaixo: {
    borderBottomWidth: 0,
    borderTopWidth: 14,
    borderTopColor: C.white,
    borderBottomColor: 'transparent',
  },
  tooltip: {
    position: 'absolute',
    width: TOOLTIP_W,
    backgroundColor: C.white,
    borderRadius: 18,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 20,
  },
  tooltipHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  stepBadge: {
    backgroundColor: C.greenLight, borderRadius: 99,
    paddingHorizontal: 10, paddingVertical: 3,
    borderWidth: 1, borderColor: C.greenMid,
  },
  stepBadgeTexto: { fontSize: 11, color: C.green, fontWeight: '700' },
  tooltipTitulo: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 6 },
  tooltipTexto: { fontSize: 13, color: C.text2, lineHeight: 20, marginBottom: 14 },
  progressoBarra: {
    height: 3, backgroundColor: C.border, borderRadius: 99, marginBottom: 14, overflow: 'hidden',
  },
  progressoPreenchido: { height: 3, backgroundColor: C.green, borderRadius: 99 },
  tooltipBotoes: { flexDirection: 'row', gap: 10 },
  btnVoltar: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: C.border,
  },
  btnVoltarTexto: { fontSize: 13, color: C.text2, fontWeight: '600' },
  btnProximo: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: C.green, borderRadius: 12, paddingVertical: 10,
  },
  btnConcluir: { backgroundColor: C.greenDark },
  btnProximoTexto: { color: C.white, fontWeight: '700', fontSize: 14 },
  btnPular: { alignItems: 'center', marginTop: 10 },
  btnPularTexto: { fontSize: 12, color: C.text3 },
})

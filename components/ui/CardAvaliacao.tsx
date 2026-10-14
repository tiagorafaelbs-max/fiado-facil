import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { C } from '../../constants/colors'

interface Props {
  onAvaliar: () => void
  onAgoraNao: () => void
}

// Convite discreto para avaliar o app na loja (SÓ ANDROID: a Apple, regra 5.6.1, proíbe convite próprio; no iOS vale o pedido
// nativo automático). Sem prêmio, sem pedir nota e sem pergunta de opinião (regras das lojas).
export function CardAvaliacao({ onAvaliar, onAgoraNao }: Props) {
  return (
    <View style={estilos.card}>
      <TouchableOpacity
        onPress={onAgoraNao}
        style={estilos.fechar}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Fechar"
      >
        <Ionicons name="close" size={16} color={C.text3} />
      </TouchableOpacity>
      <Text style={estilos.texto}>⭐ Sua avaliação na loja ajuda outros comerciantes a encontrar o FiadoApp.</Text>
      <View style={estilos.botoes}>
        <TouchableOpacity onPress={onAvaliar} style={estilos.btnPrimario} accessibilityRole="button">
          <Text style={estilos.btnPrimarioTexto}>Avaliar</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onAgoraNao} style={estilos.btnSecundario} accessibilityRole="button">
          <Text style={estilos.btnSecundarioTexto}>Agora não</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const estilos = StyleSheet.create({
  card: {
    backgroundColor: C.card, borderRadius: 12, padding: 12, paddingRight: 32, marginBottom: 10,
    borderWidth: 1, borderColor: C.border, gap: 10,
  },
  fechar: { position: 'absolute', top: 10, right: 10 },
  texto: { fontSize: 13, color: C.text2, lineHeight: 18 },
  botoes: { flexDirection: 'row', gap: 8 },
  btnPrimario: { backgroundColor: C.green, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  btnPrimarioTexto: { color: C.white, fontSize: 13, fontWeight: '700' },
  btnSecundario: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  btnSecundarioTexto: { color: C.text2, fontSize: 13, fontWeight: '600' },
})

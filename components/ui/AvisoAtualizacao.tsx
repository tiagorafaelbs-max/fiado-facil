import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAvisoAtualizacao } from '../../hooks/useAvisoAtualizacao'
import { C } from '../../constants/colors'

// Faixa discreta no Início: só avisa, nunca bloqueia. Aparece para dono e funcionário.
export function AvisoAtualizacao() {
  const { mostrar, agoraNao, atualizar } = useAvisoAtualizacao()
  if (!mostrar) return null

  return (
    <View style={estilos.faixa} accessibilityRole="alert">
      <Ionicons name="arrow-up-circle-outline" size={20} color={C.greenDark} />
      <Text style={estilos.texto}>Tem uma versão nova do FiadoApp com correções importantes.</Text>
      <View style={estilos.botoes}>
        <TouchableOpacity onPress={atualizar} style={estilos.btnPrimario} accessibilityRole="button" accessibilityLabel="Atualizar o aplicativo na loja">
          <Text style={estilos.btnPrimarioTexto}>Atualizar</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={agoraNao} style={estilos.btnSecundario} accessibilityRole="button">
          <Text style={estilos.btnSecundarioTexto}>Agora não</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const estilos = StyleSheet.create({
  faixa: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10,
    backgroundColor: C.greenLight, borderColor: C.greenMid, borderWidth: 1,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12,
  },
  texto: { flex: 1, minWidth: 180, fontSize: 13, fontWeight: '600', color: C.text, lineHeight: 18 },
  botoes: { flexDirection: 'row', gap: 8 },
  btnPrimario: { backgroundColor: C.green, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  btnPrimarioTexto: { color: C.white, fontSize: 12, fontWeight: '800' },
  btnSecundario: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  btnSecundarioTexto: { color: C.text2, fontSize: 12, fontWeight: '700' },
})

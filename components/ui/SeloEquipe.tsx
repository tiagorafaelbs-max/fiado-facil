import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { nomeCurto } from '../../lib/equipe'
import { C } from '../../constants/colors'

// Selo de "lançado pela equipe": ícone de pessoa + primeiro nome. Mesmo visual em todas as telas.
export function SeloEquipe({ nome }: { nome: string }) {
  return (
    <View style={estilos.selo} accessibilityLabel={`Registrado por ${nome}`}>
      <Ionicons name="person-outline" size={11} color={C.text2} />
      <Text style={estilos.texto} numberOfLines={1}>{nomeCurto(nome)}</Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  selo: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 2, marginTop: 4,
  },
  texto: { fontSize: 11, fontWeight: '600', color: C.text2, maxWidth: 110 },
})

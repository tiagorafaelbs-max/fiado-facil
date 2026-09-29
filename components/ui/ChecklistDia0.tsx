import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { C } from '../../constants/colors'

interface Props {
  primeiroCliente: boolean
  primeiraVenda: boolean
  segundoCliente: boolean
  segundaVenda: boolean
  onDispensar: () => void
}

const PASSOS = [
  { chave: 'primeiroCliente', texto: '1º cliente' },
  { chave: 'primeiraVenda', texto: '1ª venda' },
  { chave: 'segundoCliente', texto: '2º cliente' },
  { chave: 'segundaVenda', texto: '2ª venda' },
] as const

export function ChecklistDia0(props: Props) {
  return (
    <View style={s.card}>
      <View style={s.cabecalho}>
        <Text style={s.titulo}>Primeiros passos</Text>
        <TouchableOpacity onPress={props.onDispensar} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={16} color={C.text3} />
        </TouchableOpacity>
      </View>
      <View style={s.passos}>
        {PASSOS.map((p) => {
          const feito = props[p.chave]
          return (
            <View key={p.chave} style={s.passo}>
              <Ionicons
                name={feito ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={feito ? C.green : C.text3}
              />
              <Text style={[s.passoTexto, feito && s.passoTextoFeito]}>{p.texto}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
  },
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  titulo: { fontSize: 12, fontWeight: '800', color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5 },
  passos: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  passo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  passoTexto: { fontSize: 12, color: C.text3, fontWeight: '600' },
  passoTextoFeito: { color: C.text, textDecorationLine: 'line-through' },
})

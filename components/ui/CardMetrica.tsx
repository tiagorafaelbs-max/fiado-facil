import { View, Text, StyleSheet } from 'react-native'

interface Props {
  label: string
  valor: string
  corValor?: string
  icone?: string
}

export function CardMetrica({ label, valor, corValor = '#111827', icone }: Props) {
  return (
    <View style={estilos.card}>
      {icone ? <Text style={estilos.icone}>{icone}</Text> : null}
      <Text style={estilos.label}>{label}</Text>
      <Text style={[estilos.valor, { color: corValor }]}>{valor}</Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  icone: { fontSize: 20, marginBottom: 8 },
  label: { fontSize: 11, color: '#9CA3AF', fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  valor: { fontSize: 22, fontWeight: '700' },
})

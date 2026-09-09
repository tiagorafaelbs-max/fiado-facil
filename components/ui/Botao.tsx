import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native'
import { C } from '../../constants/colors'

interface Props {
  titulo: string
  onPress: () => void
  variante?: 'primario' | 'secundario' | 'perigo'
  carregando?: boolean
  desabilitado?: boolean
  estilo?: ViewStyle
}

export function Botao({ titulo, onPress, variante = 'primario', carregando, desabilitado, estilo }: Props) {
  const desab = carregando || desabilitado
  return (
    <TouchableOpacity
      style={[estilos.base, estilos[variante], desab && estilos.desabilitado, estilo]}
      onPress={onPress}
      disabled={desab}
      activeOpacity={0.85}
    >
      {carregando
        ? <ActivityIndicator color={variante === 'secundario' ? C.green : C.white} />
        : <Text style={[estilos.texto, variante === 'secundario' && estilos.textoSecundario, variante === 'perigo' && estilos.textoPerigo]}>{titulo}</Text>
      }
    </TouchableOpacity>
  )
}

const estilos = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primario: {
    backgroundColor: C.green,
    shadowColor: C.greenDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 5,
  },
  secundario: {
    backgroundColor: C.white,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  perigo: {
    backgroundColor: C.redLight,
    borderWidth: 1.5,
    borderColor: C.redBorder,
  },
  desabilitado: { opacity: 0.5 },
  texto: { color: C.white, fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  textoSecundario: { color: C.green },
  textoPerigo: { color: C.red },
})

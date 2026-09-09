import { View, Text, StyleSheet } from 'react-native'
import type { Cliente } from '../../types'

const CONFIG = {
  em_dia: { label: 'Em dia', fundo: '#ECFDF5', texto: '#059669', borda: '#A7F3D0' },
  atencao: { label: 'Atenção', fundo: '#FFFBEB', texto: '#D97706', borda: '#FDE68A' },
  vencido: { label: 'Vencido', fundo: '#FEF2F2', texto: '#dc2626', borda: '#FECACA' },
}

interface Props {
  status: Cliente['status_pagamento']
}

export function BadgeStatus({ status }: Props) {
  if (!status) return null
  const config = CONFIG[status as keyof typeof CONFIG]
  if (!config) return null
  const { label, fundo, texto, borda } = config
  return (
    <View style={[estilos.badge, { backgroundColor: fundo, borderColor: borda }]}>
      <View style={[estilos.dot, { backgroundColor: texto }]} />
      <Text style={[estilos.texto, { color: texto }]}>{label}</Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 99, borderWidth: 1, alignSelf: 'flex-start',
  },
  dot: { width: 5, height: 5, borderRadius: 99 },
  texto: { fontSize: 11, fontWeight: '600' },
})

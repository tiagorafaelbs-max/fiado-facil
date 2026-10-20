import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { formatarMoeda } from '../../lib/validacao'
import type { VencimentoDoDia } from '../../lib/vencemHoje'
import { C } from '../../constants/colors'

interface Props {
  itens: VencimentoDoDia[]
  cobrandoId: string | null
  onCobrar: (item: VencimentoDoDia) => void
}

const MAX_CARTOES = 5

// "📅 Vencem hoje — cobrar": um cartão por cliente com o valor que vence HOJE (não o saldo total) e o botão Cobrar, que abre
// a mesma mensagem de cobrança do WhatsApp. Até 5 cartões + "Ver todos". Só aparece se houver algum vencimento no dia.
export function QuadroVencemHoje({ itens, cobrandoId, onCobrar }: Props) {
  const [todos, setTodos] = useState(false)
  if (itens.length === 0) return null
  const visiveis = todos ? itens : itens.slice(0, MAX_CARTOES)
  const total = itens.reduce((s, i) => s + Math.round(i.valor * 100), 0) / 100

  return (
    <View style={estilos.quadro} accessibilityRole="summary">
      <View style={estilos.cabecalho}>
        <Text style={estilos.titulo}>📅 Vencem hoje — cobrar</Text>
        <Text style={estilos.total}>{formatarMoeda(total)}</Text>
      </View>
      {visiveis.map(item => (
        <View key={item.clienteId} style={estilos.cartao}>
          <View style={estilos.info}>
            <Text style={estilos.nome} numberOfLines={1}>{item.nome}</Text>
            <Text style={estilos.valor}>{formatarMoeda(item.valor)} vence hoje</Text>
          </View>
          {item.telefone ? (
            <TouchableOpacity
              style={estilos.botao}
              onPress={() => onCobrar(item)}
              disabled={cobrandoId !== null}
              accessibilityRole="button"
              accessibilityLabel={`Cobrar ${item.nome}`}
            >
              {cobrandoId === item.clienteId
                ? <ActivityIndicator color={C.white} size="small" />
                : <><Ionicons name="logo-whatsapp" size={15} color={C.white} /><Text style={estilos.botaoTexto}>Cobrar</Text></>}
            </TouchableOpacity>
          ) : (
            <Text style={estilos.semTel}>sem telefone</Text>
          )}
        </View>
      ))}
      {itens.length > MAX_CARTOES && (
        <TouchableOpacity onPress={() => setTodos(t => !t)} accessibilityRole="button">
          <Text style={estilos.verTodos}>{todos ? 'Mostrar menos' : `Ver todos (${itens.length})`}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const estilos = StyleSheet.create({
  quadro: { backgroundColor: C.yellowLight, borderRadius: 14, borderWidth: 1, borderColor: C.yellowBorder, padding: 12, marginBottom: 12, gap: 8 },
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titulo: { fontSize: 14, fontWeight: '800', color: C.text },
  total: { fontSize: 13, fontWeight: '700', color: C.yellow },
  cartao: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: C.border },
  info: { flex: 1, minWidth: 0 },
  nome: { fontSize: 14, fontWeight: '700', color: C.text },
  valor: { fontSize: 12, color: C.text2, marginTop: 2 },
  botao: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#25D366', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, minWidth: 84, justifyContent: 'center' },
  botaoTexto: { color: C.white, fontSize: 13, fontWeight: '700' },
  semTel: { fontSize: 11, color: C.text3 },
  verTodos: { fontSize: 13, fontWeight: '700', color: C.green, textAlign: 'center', paddingVertical: 4 },
})

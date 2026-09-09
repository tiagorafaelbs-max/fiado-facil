import { useState } from 'react'
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Avatar } from '../components/ui/Avatar'
import { formatarMoeda } from '../lib/validacao'
import { C } from '../constants/colors'

interface Resultado {
  tipo: 'cliente' | 'venda'
  id: string
  clienteId?: string
  titulo: string
  sub: string
  valor?: number
}

export default function BuscaScreen() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [buscando, setBuscando] = useState(false)
  const [buscou, setBuscou] = useState(false)

  async function buscar(texto: string) {
    setQuery(texto)
    if (texto.trim().length < 2) { setResultados([]); setBuscou(false); return }
    setBuscando(true)
    try {
      const [{ data: clientes }, { data: vendas }] = await Promise.all([
        supabase
          .from('clientes_com_saldo')
          .select('id, nome, saldo_devedor, telefone')
          .ilike('nome', `%${texto}%`)
          .limit(10),
        supabase
          .from('vendas')
          .select('id, descricao, valor, cliente_id, clientes(nome)')
          .ilike('descricao', `%${texto}%`)
          .limit(10),
      ])

      const res: Resultado[] = [
        ...(clientes ?? []).map(c => ({
          tipo: 'cliente' as const,
          id: c.id,
          titulo: c.nome,
          sub: c.saldo_devedor > 0 ? `${formatarMoeda(c.saldo_devedor)} em aberto` : 'Em dia ✓',
          valor: c.saldo_devedor,
        })),
        ...(vendas ?? []).map(v => ({
          tipo: 'venda' as const,
          id: v.id,
          clienteId: v.cliente_id,
          titulo: v.descricao,
          sub: (v.clientes as any)?.nome ?? '',
          valor: v.valor,
        })),
      ]
      setResultados(res)
      setBuscou(true)
    } finally {
      setBuscando(false)
    }
  }

  function navegar(r: Resultado) {
    if (r.tipo === 'cliente') router.push(`/cliente/${r.id}`)
    else router.push(`/cliente/${r.clienteId}`)
  }

  return (
    <View style={estilos.container}>
      <View style={estilos.inputBox}>
        <Ionicons name="search-outline" size={18} color={C.text3} />
        <TextInput
          style={estilos.input}
          placeholder="Buscar cliente ou venda..."
          placeholderTextColor={C.text3}
          value={query}
          onChangeText={buscar}
          autoFocus
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(''); setResultados([]); setBuscou(false) }}>
            <Ionicons name="close-circle" size={18} color={C.text3} />
          </TouchableOpacity>
        )}
      </View>

      {buscando && <ActivityIndicator color={C.green} style={{ marginTop: 32 }} />}

      {!buscando && buscou && resultados.length === 0 && (
        <View style={estilos.vazio}>
          <Text style={{ fontSize: 36 }}>🔍</Text>
          <Text style={estilos.vazioTitulo}>Nenhum resultado</Text>
          <Text style={estilos.vazioTexto}>Tente outro nome ou descrição.</Text>
        </View>
      )}

      <FlatList
        data={resultados}
        keyExtractor={(r) => `${r.tipo}-${r.id}`}
        renderItem={({ item: r }) => (
          <TouchableOpacity style={estilos.row} onPress={() => navegar(r)}>
            {r.tipo === 'cliente' ? (
              <Avatar nome={r.titulo} tamanho={42} />
            ) : (
              <View style={estilos.vendaIcone}>
                <Ionicons name="receipt-outline" size={18} color={C.red} />
              </View>
            )}
            <View style={estilos.info}>
              <Text style={estilos.titulo} numberOfLines={1}>{r.titulo}</Text>
              <Text style={estilos.sub} numberOfLines={1}>{r.sub}</Text>
            </View>
            <View style={estilos.direita}>
              {r.valor !== undefined && r.valor > 0 && (
                <Text style={[estilos.valor, { color: r.tipo === 'cliente' ? C.red : C.text2 }]}>
                  {formatarMoeda(r.valor)}
                </Text>
              )}
              <Ionicons name="chevron-forward" size={14} color={C.text3} />
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          resultados.length > 0 ? (
            <Text style={estilos.qtd}>{resultados.length} resultado{resultados.length !== 1 ? 's' : ''}</Text>
          ) : null
        }
      />
    </View>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  inputBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.card, margin: 16, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: C.border,
  },
  input: { flex: 1, fontSize: 16, color: C.text },
  qtd: { fontSize: 12, color: C.text2, fontWeight: '500', marginBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: C.border,
  },
  vendaIcone: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: C.redLight, alignItems: 'center', justifyContent: 'center',
  },
  info: { flex: 1, minWidth: 0 },
  titulo: { fontSize: 15, fontWeight: '600', color: C.text },
  sub: { fontSize: 12, color: C.text2, marginTop: 2 },
  direita: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  valor: { fontSize: 13, fontWeight: '700' },
  vazio: { alignItems: 'center', paddingTop: 60, gap: 8 },
  vazioTitulo: { fontSize: 17, fontWeight: '700', color: C.text },
  vazioTexto: { fontSize: 14, color: C.text2 },
})

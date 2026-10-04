import { useMemo, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { agruparPorAutor } from '../../lib/equipe'
import { formatarMoeda } from '../../lib/validacao'
import { C } from '../../constants/colors'

export interface LancamentoPeriodo {
  id: string
  tipo: 'venda' | 'pagamento'
  valor: number
  data: string            // yyyy-mm-dd
  clienteNome: string
  descricao?: string
  criado_por?: string | null
}

interface Props {
  lancamentos: LancamentoPeriodo[]
  donoId: string
  nomes: Record<string, string>
}

const MAX_ITENS = 10

// "Por funcionário" nos Relatórios (só dono): quanto cada pessoa lançou de vendas e de pagamentos no
// período escolhido lá em cima. Toque numa pessoa para ver os lançamentos dela (os 10 mais recentes).
export function ResumoPorFuncionario({ lancamentos, donoId, nomes }: Props) {
  const [aberto, setAberto] = useState<string | null>(null)
  const resumos = useMemo(
    () => agruparPorAutor(
      lancamentos.filter(l => l.tipo === 'venda'),
      lancamentos.filter(l => l.tipo === 'pagamento'),
      donoId, nomes,
    ),
    [lancamentos, donoId, nomes],
  )

  return (
    <View style={estilos.card}>
      <Text style={estilos.titulo}>👥 Por funcionário</Text>
      <Text style={estilos.sub}>O que cada pessoa lançou no período. Lançamentos antigos, de antes do registro de autoria, aparecem em "Você (dono)".</Text>
      {resumos.map((r, i) => {
        const abertoAqui = aberto === r.chave
        const itens = abertoAqui
          ? lancamentos
              .filter(l => (!l.criado_por || l.criado_por === donoId ? 'dono' : l.criado_por) === r.chave)
              .sort((a, b) => b.data.localeCompare(a.data))
              .slice(0, MAX_ITENS)
          : []
        return (
          <View key={r.chave} style={[estilos.linha, i === resumos.length - 1 && { borderBottomWidth: 0 }]}>
            <TouchableOpacity
              style={estilos.cabecalho}
              onPress={() => setAberto(abertoAqui ? null : r.chave)}
              accessibilityRole="button"
              accessibilityLabel={`${r.nome}: ${r.vendas} vendas e ${r.pagamentos} pagamentos. Toque para ${abertoAqui ? 'recolher' : 'ver os lançamentos'}`}
            >
              <View style={estilos.icone}><Ionicons name="person-outline" size={14} color={C.text2} /></View>
              <View style={{ flex: 1 }}>
                <Text style={estilos.nome} numberOfLines={1}>{r.nome}</Text>
                <Text style={estilos.detalhe}>
                  {r.vendas} {r.vendas === 1 ? 'venda' : 'vendas'} · {formatarMoeda(r.totalVendas)}
                </Text>
                <Text style={estilos.detalhe}>
                  {r.pagamentos} {r.pagamentos === 1 ? 'pagamento' : 'pagamentos'} · {formatarMoeda(r.totalPagamentos)}
                </Text>
              </View>
              <Ionicons name={abertoAqui ? 'chevron-up' : 'chevron-down'} size={16} color={C.text3} />
            </TouchableOpacity>
            {abertoAqui && (
              <View style={estilos.itens}>
                {itens.length === 0 ? (
                  <Text style={estilos.vazio}>Nada lançado no período.</Text>
                ) : itens.map(l => (
                  <View key={`${l.tipo}-${l.id}`} style={estilos.item}>
                    <Ionicons
                      name={l.tipo === 'venda' ? 'receipt-outline' : 'checkmark'}
                      size={13}
                      color={l.tipo === 'venda' ? C.red : C.green}
                    />
                    <Text style={estilos.itemTexto} numberOfLines={1}>
                      {l.clienteNome}{l.descricao ? ` · ${l.descricao}` : ''}
                    </Text>
                    <Text style={[estilos.itemValor, { color: l.tipo === 'venda' ? C.red : C.green }]}>
                      {l.tipo === 'venda' ? '-' : '+'} {formatarMoeda(l.valor)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )
      })}
    </View>
  )
}

const estilos = StyleSheet.create({
  card: {
    backgroundColor: C.card, borderRadius: 18, padding: 18, marginTop: 10,
    borderWidth: 1, borderColor: C.border,
  },
  titulo: { fontSize: 14, fontWeight: '700', color: C.text },
  sub: { fontSize: 12, color: C.text2, marginTop: 4, marginBottom: 8, lineHeight: 17 },
  linha: { borderBottomWidth: 1, borderBottomColor: C.border },
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  icone: { width: 32, height: 32, borderRadius: 9, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  nome: { fontSize: 14, fontWeight: '700', color: C.text },
  detalhe: { fontSize: 12, color: C.text2, marginTop: 1 },
  itens: { paddingBottom: 10, paddingLeft: 44, gap: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemTexto: { flex: 1, fontSize: 12, color: C.text2 },
  itemValor: { fontSize: 12, fontWeight: '700' },
  vazio: { fontSize: 12, color: C.text3 },
})

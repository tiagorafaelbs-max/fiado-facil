import { useEffect, useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { previaDaAplicacao, type ItemAberto } from '../../lib/alocacao'
import { formatarMoeda } from '../../lib/validacao'
import { C } from '../../constants/colors'

interface Props {
  abertas: ItemAberto[]
  valor: number                     // valor digitado (0 se ainda inválido)
  escolhida: string | null          // null = parcela mais antiga (o padrão de sempre)
  aoEscolher: (vendaId: string | null) => void
  vendasSincronizando?: number      // vendas lançadas offline que ainda não foram enviadas
  listaIndisponivel?: boolean       // sem rede e sem cópia local das vendas
  erro?: string
}

const dia = (iso: string) => format(new Date(iso + 'T12:00:00'), 'd MMM', { locale: ptBR })

// "Aplicar em: parcela mais antiga (padrão) | escolher venda". Escolher venda = o valor quita PRIMEIRO essa venda
// (o que sobrar segue a ordem normal). Funciona offline com a última lista que o aparelho tem.
export function AplicarPagamentoEm({ abertas, valor, escolhida, aoEscolher, vendasSincronizando = 0, listaIndisponivel, erro }: Props) {
  const modoEscolher = escolhida !== null
  const itemEscolhido = abertas.find(a => a.id === escolhida) ?? null
  // A venda escolhida deixou de estar em aberto (a lista recarregou e outro pagamento a quitou): pede nova escolha.
  useEffect(() => {
    if (escolhida && !abertas.some(a => a.id === escolhida)) aoEscolher(abertas.length > 0 ? '' : null)
  }, [abertas, escolhida])

  const previa = useMemo(() => (itemEscolhido && valor > 0 ? previaDaAplicacao(itemEscolhido, valor) : null), [itemEscolhido, valor])

  return (
    <View style={estilos.caixa}>
      <Text style={estilos.rotulo}>Aplicar em</Text>
      <View style={estilos.opcoes}>
        <TouchableOpacity
          style={[estilos.opcao, !modoEscolher && estilos.opcaoAtiva]}
          onPress={() => aoEscolher(null)}
          accessibilityRole="radio"
          accessibilityState={{ selected: !modoEscolher }}
        >
          <Text style={[estilos.opcaoTexto, !modoEscolher && estilos.opcaoTextoAtivo]}>Parcela mais antiga</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[estilos.opcao, modoEscolher && estilos.opcaoAtiva, (abertas.length === 0) && { opacity: 0.5 }]}
          onPress={() => abertas.length > 0 && aoEscolher(escolhida ?? '')}
          disabled={abertas.length === 0}
          accessibilityRole="radio"
          accessibilityState={{ selected: modoEscolher }}
        >
          <Text style={[estilos.opcaoTexto, modoEscolher && estilos.opcaoTextoAtivo]}>Escolher venda</Text>
        </TouchableOpacity>
      </View>

      {listaIndisponivel && (
        <Text style={estilos.aviso}>Sem conexão e sem a lista de vendas salva neste aparelho: o pagamento segue a parcela mais antiga.</Text>
      )}

      {modoEscolher && (
        <>
          <ScrollView style={estilos.lista} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {abertas.map(a => {
              const marcada = a.id === escolhida
              return (
                <TouchableOpacity
                  key={a.id}
                  style={[estilos.linha, marcada && estilos.linhaMarcada]}
                  onPress={() => aoEscolher(a.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: marcada }}
                  accessibilityLabel={`${a.descricao}, falta ${formatarMoeda(a.falta)}`}
                >
                  <Ionicons name={marcada ? 'radio-button-on' : 'radio-button-off'} size={20} color={marcada ? C.green : C.text3} />
                  <View style={{ flex: 1 }}>
                    <Text style={estilos.descricao} numberOfLines={1}>{a.descricao}</Text>
                    <Text style={estilos.meta}>
                      {dia(a.data_venda)}{a.data_vencimento ? ` · vence ${dia(a.data_vencimento)}` : ''}
                      {a.dirigido > 0 ? ` · ${formatarMoeda(a.dirigido)} pagos de ${formatarMoeda(a.valor)}` : ''}
                    </Text>
                  </View>
                  <Text style={estilos.falta}>falta {formatarMoeda(a.falta)}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          {vendasSincronizando > 0 && (
            <Text style={estilos.aviso}>
              {vendasSincronizando === 1 ? '1 venda ainda está sincronizando e' : `${vendasSincronizando} vendas ainda estão sincronizando e`} não aparece{vendasSincronizando === 1 ? '' : 'm'} aqui.
            </Text>
          )}

          {escolhida === '' && !erro && <Text style={estilos.aviso}>Toque na venda que foi paga.</Text>}

          {previa && (
            <View style={[estilos.previa, previa.quitada ? estilos.previaOk : estilos.previaAviso]}>
              <Ionicons name={previa.quitada ? 'checkmark-circle' : 'information-circle'} size={16} color={previa.quitada ? C.greenDark : C.yellow} />
              <Text style={estilos.previaTexto}>
                {previa.quitada
                  ? previa.sobra > 0
                    ? `Esta venda fica quitada. ${formatarMoeda(previa.sobra)} vão para a venda mais antiga em aberto.`
                    : 'Esta venda fica quitada.'
                  : `Esta venda fica com ${formatarMoeda(previa.ficaFaltando)} em aberto.`}
              </Text>
            </View>
          )}
        </>
      )}
      {!!erro && <Text style={estilos.erro}>{erro}</Text>}
    </View>
  )
}

const estilos = StyleSheet.create({
  caixa: { marginBottom: 16 },
  rotulo: { fontSize: 13, color: C.text2, fontWeight: '600', marginBottom: 8 },
  opcoes: { flexDirection: 'row', gap: 8 },
  opcao: {
    flex: 1, paddingVertical: 11, paddingHorizontal: 8, borderRadius: 12, alignItems: 'center',
    backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.border,
  },
  opcaoAtiva: { backgroundColor: C.green, borderColor: C.green },
  opcaoTexto: { fontSize: 13, fontWeight: '700', color: C.text2 },
  opcaoTextoAtivo: { color: C.white },
  lista: { maxHeight: 220, marginTop: 10, borderWidth: 1, borderColor: C.border, borderRadius: 12, backgroundColor: C.card },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  linhaMarcada: { backgroundColor: C.greenLight },
  descricao: { fontSize: 14, fontWeight: '700', color: C.text },
  meta: { fontSize: 11, color: C.text3, marginTop: 2 },
  falta: { fontSize: 12, fontWeight: '800', color: C.red },
  aviso: { fontSize: 12, color: C.text2, marginTop: 8, lineHeight: 17 },
  previa: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, padding: 10, marginTop: 10, borderWidth: 1 },
  previaOk: { backgroundColor: C.greenLight, borderColor: C.greenMid },
  previaAviso: { backgroundColor: C.yellowLight, borderColor: C.yellowBorder },
  previaTexto: { flex: 1, fontSize: 12, color: C.text, lineHeight: 17, fontWeight: '600' },
  erro: { fontSize: 12, color: C.red, marginTop: 6 },
})

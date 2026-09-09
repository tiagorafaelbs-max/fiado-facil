import { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Platform, useWindowDimensions,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Avatar } from '../components/ui/Avatar'
import { formatarMoeda } from '../lib/validacao'
import { C } from '../constants/colors'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type Aba = 'consumo' | 'melhores' | 'devedores' | 'lista_negra'

interface ClienteRanking {
  id: string
  nome: string
  telefone?: string
  totalComprado: number
  totalPago: number
  saldoDevedor: number
  qtdCompras: number
  qtdPagamentos: number
  taxaPagamento: number       // 0..1
  diasAtraso: number          // maior atraso em dias
  comprasVencidas: number     // qtd vendas vencidas não pagas
  ultimaCompra?: string
}

function medalha(i: number) {
  if (i === 0) return '🥇'
  if (i === 1) return '🥈'
  if (i === 2) return '🥉'
  return `${i + 1}º`
}

function scoreMelhorCliente(c: ClienteRanking): number {
  // Pontos por volume + bônus por taxa de pagamento alta
  return c.totalComprado * (0.5 + c.taxaPagamento * 0.5)
}

function scoreListaNegra(c: ClienteRanking): number {
  // Maior pontuação = pior cliente
  return c.saldoDevedor * 2 + c.diasAtraso * 100 + c.comprasVencidas * 500
}

function StarRating({ rate }: { rate: number }) {
  const stars = rate >= 0.9 ? 5 : rate >= 0.7 ? 4 : rate >= 0.5 ? 3 : rate >= 0.3 ? 2 : 1
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[1, 2, 3, 4, 5].map(s => (
        <Ionicons key={s} name="star" size={11} color={s <= stars ? '#F59E0B' : C.border} />
      ))}
    </View>
  )
}

function TaxaBadge({ taxa }: { taxa: number }) {
  const pct = Math.round(taxa * 100)
  const cor = taxa >= 0.8 ? C.green : taxa >= 0.5 ? C.yellow : C.red
  return (
    <View style={[estilos.taxaBadge, { backgroundColor: cor + '20', borderColor: cor + '40' }]}>
      <Text style={[estilos.taxaBadgeTexto, { color: cor }]}>{pct}%</Text>
    </View>
  )
}

export default function RankingScreen() {
  const router = useRouter()
  const { usuario } = useAuth()
  const { width } = useWindowDimensions()
  const isTablet = width >= 768
  const [aba, setAba] = useState<Aba>('melhores')
  const [clientes, setClientes] = useState<ClienteRanking[]>([])
  const [carregando, setCarregando] = useState(false)

  async function carregar() {
    setCarregando(true)
    try {
      const { data: { session: rSess } } = await supabase.auth.getSession()
      const rUid = rSess?.user?.id ?? ''
      const hoje = new Date()
      const hojeISO = format(hoje, 'yyyy-MM-dd')

      const [{ data: vendas }, { data: pagamentos }, { data: clientesBase }] = await Promise.all([
        supabase.from('vendas').select('id, cliente_id, valor, data_venda, data_vencimento, pago').eq('usuario_id', rUid),
        supabase.from('pagamentos').select('id, cliente_id, valor').eq('usuario_id', rUid),
        supabase.from('clientes_com_saldo').select('id, nome, telefone, saldo_devedor, status_pagamento').eq('usuario_id', rUid).eq('ativo', true),
      ])

      // Só contam vendas em atraso para clientes que a view (FIFO) marca como
      // 'vencido' — evita atraso fantasma por flag `pago` desatualizada.
      const clienteVencido = new Set((clientesBase ?? []).filter(c => c.status_pagamento === 'vencido').map(c => c.id))

      const map: Record<string, ClienteRanking> = {}

      for (const c of (clientesBase ?? [])) {
        map[c.id] = {
          id: c.id,
          nome: c.nome,
          telefone: c.telefone ?? undefined,
          totalComprado: 0,
          totalPago: 0,
          saldoDevedor: c.saldo_devedor ?? 0,
          qtdCompras: 0,
          qtdPagamentos: 0,
          taxaPagamento: 0,
          diasAtraso: 0,
          comprasVencidas: 0,
          ultimaCompra: undefined,
        }
      }

      for (const v of (vendas ?? [])) {
        if (!map[v.cliente_id]) continue
        const cl = map[v.cliente_id]
        cl.totalComprado += v.valor
        cl.qtdCompras++
        if (!cl.ultimaCompra || v.data_venda > cl.ultimaCompra) cl.ultimaCompra = v.data_venda
        if (v.data_vencimento && !v.pago && v.data_vencimento < hojeISO && clienteVencido.has(v.cliente_id)) {
          cl.comprasVencidas++
          const diffMs = hoje.getTime() - new Date(v.data_vencimento + 'T12:00:00').getTime()
          const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24))
          if (dias > cl.diasAtraso) cl.diasAtraso = dias
        }
      }

      for (const p of (pagamentos ?? [])) {
        if (!map[p.cliente_id]) continue
        map[p.cliente_id].totalPago += p.valor
        map[p.cliente_id].qtdPagamentos++
      }

      for (const cl of Object.values(map)) {
        cl.taxaPagamento = cl.totalComprado > 0 ? Math.min(cl.totalPago / cl.totalComprado, 1) : 1
      }

      setClientes(Object.values(map).filter(c => c.qtdCompras > 0))
    } finally {
      setCarregando(false)
    }
  }

  useFocusEffect(useCallback(() => { carregar() }, []))

  function abrirWhatsApp(c: ClienteRanking) {
    if (!c.telefone) return
    const tel = c.telefone.replace(/\D/g, '')
    const msg = encodeURIComponent(
      `Olá, ${c.nome}! 👋\n\nPassando para lembrar que você possui um saldo de *${formatarMoeda(c.saldoDevedor)}* em aberto.\n\nQuando puder, entre em contato. Obrigado! 😊`
    )
    const url = `https://wa.me/55${tel}?text=${msg}`
    if (Platform.OS === 'web') window.open(url, '_blank')
    else require('react-native').Linking.openURL(url)
  }

  const porConsumo = [...clientes].sort((a, b) => b.totalComprado - a.totalComprado).slice(0, 10)
  const melhores = [...clientes].sort((a, b) => scoreMelhorCliente(b) - scoreMelhorCliente(a)).slice(0, 10)
  const devedores = [...clientes].filter(c => c.saldoDevedor > 0).sort((a, b) => b.saldoDevedor - a.saldoDevedor).slice(0, 10)
  const listaNegra = [...clientes].filter(c => c.comprasVencidas > 0 || c.saldoDevedor > 0)
    .sort((a, b) => scoreListaNegra(b) - scoreListaNegra(a)).slice(0, 10)

  const ABAS: { key: Aba; icon: string; label: string; cor: string }[] = [
    { key: 'melhores',    icon: '🏆', label: 'Melhores',  cor: C.green  },
    { key: 'consumo',     icon: '🛒', label: 'Consumo',   cor: '#7C3AED' },
    { key: 'devedores',   icon: '⏳', label: 'Devedores', cor: C.yellow },
    { key: 'lista_negra', icon: '🚫', label: 'Lista negra', cor: C.red  },
  ]

  const abaAtual = ABAS.find(a => a.key === aba)!

  function renderLista() {
    if (carregando) return <ActivityIndicator color={C.green} style={{ marginTop: 48 }} />

    if (aba === 'melhores') return <ListaMelhores data={melhores} />
    if (aba === 'consumo')  return <ListaConsumo  data={porConsumo} />
    if (aba === 'devedores') return <ListaDevedores data={devedores} onWhatsApp={abrirWhatsApp} onCliente={id => router.push(`/cliente/${id}`)} />
    if (aba === 'lista_negra') return <ListaNegra data={listaNegra} onWhatsApp={abrirWhatsApp} onCliente={id => router.push(`/cliente/${id}`)} />
    return null
  }

  return (
    <View style={estilos.tela}>
      {/* Header */}
      <View style={estilos.header}>
        <TouchableOpacity style={estilos.voltarBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={C.text} />
        </TouchableOpacity>
        <View>
          <Text style={estilos.headerTitulo}>Ranking de Clientes</Text>
          <Text style={estilos.headerSub}>{clientes.length} clientes com histórico</Text>
        </View>
      </View>

      {/* Seletor de aba */}
      <View style={estilos.abaContainer}>
        {ABAS.map(a => (
          <TouchableOpacity
            key={a.key}
            style={[estilos.abaBotao, aba === a.key && { backgroundColor: a.cor + '18', borderColor: a.cor }]}
            onPress={() => setAba(a.key)}
          >
            <Text style={{ fontSize: 16 }}>{a.icon}</Text>
            <Text style={[estilos.abaLabel, aba === a.key && { color: a.cor, fontWeight: '800' }]}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Descrição da aba */}
      <View style={[estilos.abaDescBox, { borderLeftColor: abaAtual.cor }]}>
        <Text style={estilos.abaDescTexto}>{descricaoAba(aba)}</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[estilos.scroll, isTablet && { maxWidth: 720, alignSelf: 'center', width: '100%' }]}
      >
        {renderLista()}
      </ScrollView>
    </View>
  )
}

function descricaoAba(aba: Aba) {
  if (aba === 'melhores')    return 'Clientes com maior volume de compras E boa taxa de pagamento. Os mais valiosos para o negócio.'
  if (aba === 'consumo')     return 'Quem mais comprou no total, independente de pagamento. Clientes de alto volume.'
  if (aba === 'devedores')   return 'Clientes com maior saldo devedor em aberto no momento.'
  if (aba === 'lista_negra') return 'Clientes com pagamentos vencidos, histórico de inadimplência ou dívidas antigas. Atenção redobrada.'
  return ''
}

// ── Listas ─────────────────────────────────────────────────────────────────

function ListaMelhores({ data }: { data: ClienteRanking[] }) {
  const router = useRouter()
  if (data.length === 0) return <Vazio texto="Nenhum cliente com histórico ainda." />
  return (
    <>
      <InfoBox icone="ℹ️" texto="Score = volume de compras × taxa de pagamento. Clientes que compram muito E pagam em dia ficam no topo." />
      {data.map((c, i) => (
        <TouchableOpacity key={c.id} style={estilos.card} onPress={() => router.push(`/cliente/${c.id}`)}>
          <Text style={estilos.pos}>{medalha(i)}</Text>
          <Avatar nome={c.nome} tamanho={42} />
          <View style={{ flex: 1 }}>
            <Text style={estilos.nome} numberOfLines={1}>{c.nome}</Text>
            <View style={estilos.metaRow}>
              <Text style={estilos.metaTexto}>{c.qtdCompras} compra{c.qtdCompras !== 1 ? 's' : ''}</Text>
              <Text style={estilos.metaSep}>·</Text>
              <StarRating rate={c.taxaPagamento} />
            </View>
          </View>
          <View style={estilos.cardDireita}>
            <Text style={[estilos.valorPrincipal, { color: C.green }]}>{formatarMoeda(c.totalComprado)}</Text>
            <TaxaBadge taxa={c.taxaPagamento} />
          </View>
        </TouchableOpacity>
      ))}
    </>
  )
}

function ListaConsumo({ data }: { data: ClienteRanking[] }) {
  const router = useRouter()
  if (data.length === 0) return <Vazio texto="Nenhum cliente com compras ainda." />
  const max = data[0]?.totalComprado ?? 1
  return (
    <>
      <InfoBox icone="📊" texto="Ordenado pelo total comprado no histórico completo. A barra mostra proporção em relação ao 1º colocado." />
      {data.map((c, i) => (
        <TouchableOpacity key={c.id} style={estilos.card} onPress={() => router.push(`/cliente/${c.id}`)}>
          <Text style={estilos.pos}>{medalha(i)}</Text>
          <Avatar nome={c.nome} tamanho={42} />
          <View style={{ flex: 1 }}>
            <Text style={estilos.nome} numberOfLines={1}>{c.nome}</Text>
            <View style={{ marginTop: 6 }}>
              <View style={estilos.barraFundo}>
                <View style={[estilos.barraPreenche, { width: `${Math.round((c.totalComprado / max) * 100)}%`, backgroundColor: '#7C3AED' }]} />
              </View>
            </View>
            <View style={estilos.metaRow}>
              <Text style={estilos.metaTexto}>{c.qtdCompras} compra{c.qtdCompras !== 1 ? 's' : ''}</Text>
              {c.ultimaCompra && (
                <>
                  <Text style={estilos.metaSep}>·</Text>
                  <Text style={estilos.metaTexto}>
                    Última: {format(new Date(c.ultimaCompra + 'T12:00:00'), "d MMM", { locale: ptBR })}
                  </Text>
                </>
              )}
            </View>
          </View>
          <Text style={[estilos.valorPrincipal, { color: '#7C3AED' }]}>{formatarMoeda(c.totalComprado)}</Text>
        </TouchableOpacity>
      ))}
    </>
  )
}

function ListaDevedores({ data, onWhatsApp, onCliente }: { data: ClienteRanking[]; onWhatsApp: (c: ClienteRanking) => void; onCliente: (id: string) => void }) {
  if (data.length === 0) return <Vazio texto="Nenhum devedor no momento. 🎉" />
  const max = data[0]?.saldoDevedor ?? 1
  return (
    <>
      <InfoBox icone="⚠️" texto="Clientes com maior saldo devedor atual. Toque no WhatsApp para cobrar diretamente." />
      {data.map((c, i) => (
        <View key={c.id} style={estilos.card}>
          <Text style={estilos.pos}>{medalha(i)}</Text>
          <TouchableOpacity style={{ flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center' }} onPress={() => onCliente(c.id)}>
            <Avatar nome={c.nome} tamanho={42} />
            <View style={{ flex: 1 }}>
              <Text style={estilos.nome} numberOfLines={1}>{c.nome}</Text>
              <View style={{ marginTop: 6 }}>
                <View style={estilos.barraFundo}>
                  <View style={[estilos.barraPreenche, { width: `${Math.round((c.saldoDevedor / max) * 100)}%`, backgroundColor: C.red }]} />
                </View>
              </View>
              <View style={estilos.metaRow}>
                {c.diasAtraso > 0 && (
                  <View style={estilos.atrasoBadge}>
                    <Ionicons name="time-outline" size={10} color={C.red} />
                    <Text style={estilos.atrasoTexto}>{c.diasAtraso}d em atraso</Text>
                  </View>
                )}
                <Text style={estilos.metaTexto}>{c.comprasVencidas} venc.</Text>
              </View>
            </View>
          </TouchableOpacity>
          <View style={estilos.cardDireita}>
            <Text style={[estilos.valorPrincipal, { color: C.red }]}>{formatarMoeda(c.saldoDevedor)}</Text>
            {c.telefone && (
              <TouchableOpacity style={estilos.btnWhats} onPress={() => onWhatsApp(c)}>
                <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}
    </>
  )
}

function ListaNegra({ data, onWhatsApp, onCliente }: { data: ClienteRanking[]; onWhatsApp: (c: ClienteRanking) => void; onCliente: (id: string) => void }) {
  if (data.length === 0) return <Vazio texto="Nenhum cliente inadimplente. Ótimo! 🎉" />
  return (
    <>
      <InfoBox icone="🚫" texto="Clientes com dívidas vencidas ou histórico ruim de pagamento. Considere restringir o crédito." />
      {data.map((c, i) => {
        const risco = c.taxaPagamento < 0.3 || c.diasAtraso > 60 ? 'alto'
          : c.taxaPagamento < 0.6 || c.diasAtraso > 30 ? 'medio' : 'baixo'
        const corRisco = risco === 'alto' ? C.red : risco === 'medio' ? C.yellow : '#F97316'
        const labelRisco = risco === 'alto' ? 'Alto risco' : risco === 'medio' ? 'Médio risco' : 'Atenção'
        return (
          <View key={c.id} style={[estilos.card, estilos.cardNegra]}>
            <Text style={estilos.pos}>{medalha(i)}</Text>
            <TouchableOpacity style={{ flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center' }} onPress={() => onCliente(c.id)}>
              <Avatar nome={c.nome} tamanho={42} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={estilos.nome} numberOfLines={1}>{c.nome}</Text>
                  <View style={[estilos.riscoBadge, { backgroundColor: corRisco + '20', borderColor: corRisco + '50' }]}>
                    <Text style={[estilos.riscoTexto, { color: corRisco }]}>{labelRisco}</Text>
                  </View>
                </View>
                <View style={estilos.negritoRow}>
                  {c.comprasVencidas > 0 && (
                    <View style={estilos.negraChip}>
                      <Ionicons name="warning-outline" size={10} color={C.red} />
                      <Text style={estilos.negraChipTexto}>{c.comprasVencidas} venc.</Text>
                    </View>
                  )}
                  {c.diasAtraso > 0 && (
                    <View style={estilos.negraChip}>
                      <Ionicons name="time-outline" size={10} color={C.red} />
                      <Text style={estilos.negraChipTexto}>{c.diasAtraso}d atraso</Text>
                    </View>
                  )}
                  <View style={estilos.negraChipCinza}>
                    <Text style={estilos.negraChipTexto}>Pagou {Math.round(c.taxaPagamento * 100)}%</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
            <View style={estilos.cardDireita}>
              <Text style={[estilos.valorPrincipal, { color: C.red }]}>{formatarMoeda(c.saldoDevedor)}</Text>
              {c.telefone && (
                <TouchableOpacity style={estilos.btnWhats} onPress={() => onWhatsApp(c)}>
                  <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )
      })}
    </>
  )
}

function InfoBox({ icone, texto }: { icone: string; texto: string }) {
  return (
    <View style={estilos.infoBox}>
      <Text style={{ fontSize: 14 }}>{icone}</Text>
      <Text style={estilos.infoTexto}>{texto}</Text>
    </View>
  )
}

function Vazio({ texto }: { texto: string }) {
  return (
    <View style={estilos.vazio}>
      <Text style={{ fontSize: 38 }}>📋</Text>
      <Text style={estilos.vazioTexto}>{texto}</Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 16, paddingBottom: 14,
    backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  voltarBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  headerTitulo: { fontSize: 17, fontWeight: '800', color: C.text },
  headerSub: { fontSize: 12, color: C.text2, marginTop: 1 },

  abaContainer: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: C.card },
  abaBotao: {
    flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: 12,
    backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.border,
  },
  abaLabel: { fontSize: 11, fontWeight: '600', color: C.text2 },

  abaDescBox: { marginHorizontal: 16, marginTop: 12, marginBottom: 4, borderLeftWidth: 3, paddingLeft: 10 },
  abaDescTexto: { fontSize: 12, color: C.text2, lineHeight: 17 },

  scroll: { padding: 16, paddingBottom: 60 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  cardNegra: { borderColor: C.redBorder, backgroundColor: '#FFFBFB' },
  pos: { width: 26, fontSize: 16, textAlign: 'center' },
  nome: { fontSize: 14, fontWeight: '700', color: C.text, flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  metaTexto: { fontSize: 11, color: C.text2 },
  metaSep: { fontSize: 11, color: C.text3 },
  cardDireita: { alignItems: 'flex-end', gap: 6 },
  valorPrincipal: { fontSize: 14, fontWeight: '800' },

  barraFundo: { height: 5, backgroundColor: C.border, borderRadius: 99, overflow: 'hidden' },
  barraPreenche: { height: 5, borderRadius: 99 },

  taxaBadge: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
  taxaBadgeTexto: { fontSize: 11, fontWeight: '700' },

  atrasoBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.redLight, borderRadius: 99, paddingHorizontal: 6, paddingVertical: 2 },
  atrasoTexto: { fontSize: 10, color: C.red, fontWeight: '600' },

  btnWhats: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: '#E7FBF0', borderWidth: 1, borderColor: '#B7F0CC',
    alignItems: 'center', justifyContent: 'center',
  },

  riscoBadge: { borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  riscoTexto: { fontSize: 10, fontWeight: '700' },
  negritoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 },
  negraChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: C.redLight, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2,
  },
  negraChipCinza: { backgroundColor: C.bg, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: C.border },
  negraChipTexto: { fontSize: 10, color: C.text2, fontWeight: '600' },

  infoBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: C.card, borderRadius: 12, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: C.border,
  },
  infoTexto: { flex: 1, fontSize: 12, color: C.text2, lineHeight: 18 },

  vazio: { alignItems: 'center', paddingTop: 48, gap: 10 },
  vazioTexto: { fontSize: 14, color: C.text2, textAlign: 'center' },
})

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  View, Text, FlatList, SectionList, TouchableOpacity, TextInput,
  StyleSheet, RefreshControl, ActivityIndicator, Modal, ScrollView, Platform,
  KeyboardAvoidingView, Alert,
} from 'react-native'
import * as Contacts from 'expo-contacts'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useClientes } from '../../hooks/useClientes'
import { useModulos } from '../../hooks/useModulos'
import { useAuth } from '../../hooks/useAuth'
import { Avatar } from '../../components/ui/Avatar'
import { Campo } from '../../components/ui/Campo'
import { Botao } from '../../components/ui/Botao'
import { KeyboardToolbar } from '../../components/ui/KeyboardToolbar'
import { formatarMoeda, validarTelefone, sanitizarTexto, formatarInputMoeda } from '../../lib/validacao'
import { C } from '../../constants/colors'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Cliente } from '../../types'

// ── tipos ranking ─────────────────────────────────────────────────────────────

type AbaTop = 'lista' | 'empresas' | 'ranking'
type AbaRanking = 'melhores' | 'consumo' | 'devedores' | 'lista_negra'

interface ClienteRanking {
  id: string; nome: string; telefone?: string
  totalComprado: number; totalPago: number; saldoDevedor: number
  qtdCompras: number; taxaPagamento: number
  diasAtraso: number; comprasVencidas: number; ultimaCompra?: string
}

function medalha(i: number) {
  if (i === 0) return '🥇'
  if (i === 1) return '🥈'
  if (i === 2) return '🥉'
  return `${i + 1}º`
}

function scoreMelhor(c: ClienteRanking) { return c.totalComprado * (0.5 + c.taxaPagamento * 0.5) }
function scoreNegra(c: ClienteRanking)  { return c.saldoDevedor * 2 + c.diasAtraso * 100 + c.comprasVencidas * 500 }

function StarRating({ rate }: { rate: number }) {
  const stars = rate >= 0.9 ? 5 : rate >= 0.7 ? 4 : rate >= 0.5 ? 3 : rate >= 0.3 ? 2 : 1
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[1,2,3,4,5].map(s => (
        <Ionicons key={s} name="star" size={11} color={s <= stars ? '#F59E0B' : C.border} />
      ))}
    </View>
  )
}

function TaxaBadge({ taxa }: { taxa: number }) {
  const pct = Math.round(taxa * 100)
  const cor = taxa >= 0.8 ? C.green : taxa >= 0.5 ? C.yellow : C.red
  return (
    <View style={[r.taxaBadge, { backgroundColor: cor + '20', borderColor: cor + '40' }]}>
      <Text style={[r.taxaBadgeTexto, { color: cor }]}>{pct}%</Text>
    </View>
  )
}

function abrirWhatsApp(nome: string, saldo: number, telefone: string) {
  const tel = telefone.replace(/\D/g, '')
  const msg = encodeURIComponent(
    `Olá, ${nome}! 👋\n\nPassando para lembrar que você possui um saldo de *${formatarMoeda(saldo)}* em aberto.\n\nQuando puder, entre em contato para acertarmos. Obrigado! 😊`
  )
  const url = `https://wa.me/55${tel}?text=${msg}`
  if (Platform.OS === 'web') window.open(url, '_blank')
  else require('react-native').Linking.openURL(url)
}

// ══════════════════════════════════════════════════════════════════════════════
// Tela principal
// ══════════════════════════════════════════════════════════════════════════════

export default function ClientesScreen() {
  const router = useRouter()
  const { usuario } = useAuth()
  const { clientes, carregando, criar, buscar } = useClientes()
  const { modulos } = useModulos(usuario?.id)

  const [abaTop, setAbaTop] = useState<AbaTop>('lista')
  const [busca, setBusca] = useState('')
  const [plano, setPlano] = useState<'gratuito' | 'pro'>('gratuito')

  // form novo cliente
  const [modalAberto, setModalAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [endereco, setEndereco] = useState('')
  const [observacao, setObservacao] = useState('')
  const [limiteCredito, setLimiteCredito] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [erroGeral, setErroGeral] = useState('')

  // busca de contatos da agenda
  const [modalContatosAberto, setModalContatosAberto] = useState(false)
  const [buscaContato, setBuscaContato] = useState('')
  const todosContatos = useRef<Contacts.ExistingContact[]>([])

  const contatosFiltrados = buscaContato.length > 0
    ? todosContatos.current.filter(c =>
        c.name?.toLowerCase().includes(buscaContato.toLowerCase()) ||
        c.phoneNumbers?.[0]?.number?.includes(buscaContato)
      ).slice(0, 50)
    : todosContatos.current.slice(0, 100)

  async function abrirAgenda() {
    try {
      const { status } = await Contacts.requestPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert(
          'Permissão necessária',
          'Permita o acesso aos contatos nas configurações do dispositivo para usar esta função.',
          [{ text: 'OK' }]
        )
        return
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
      })
      todosContatos.current = data.filter(c => c.name && c.phoneNumbers?.length).sort((a, b) =>
        (a.name ?? '').localeCompare(b.name ?? '', 'pt-BR')
      )
      setBuscaContato('')
      setModalContatosAberto(true)
    } catch {
      Alert.alert('Erro', 'Não foi possível acessar os contatos.')
    }
  }

  function selecionarContato(contato: Contacts.ExistingContact) {
    setNome(contato.name ?? '')
    const tel = contato.phoneNumbers?.[0]?.number ?? ''
    setTelefone(tel.replace(/\D/g, ''))
    setModalContatosAberto(false)
  }

  // ranking
  const [abaRanking, setAbaRanking] = useState<AbaRanking>('melhores')
  const [ranking, setRanking] = useState<ClienteRanking[]>([])
  const [carregandoRanking, setCarregandoRanking] = useState(false)
  const [rankingCarregado, setRankingCarregado] = useState(false)

  useFocusEffect(useCallback(() => {
    buscar()
    if (usuario?.id) {
      supabase.from('perfis').select('plano').eq('id', usuario.id).single()
        .then(({ data }) => { if (data) setPlano(data.plano) })
    }
  }, [buscar, usuario]))

  // ── filtro e agrupamento ────────────────────────────────────────────────────

  const clientesFiltrados = clientes.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (c.telefone ?? '').includes(busca) ||
    (c.empresa ?? '').toLowerCase().includes(busca.toLowerCase())
  )

  // Agrupamento por empresa para aba "empresas"
  const secoesPorEmpresa = (() => {
    const grupos: Record<string, Cliente[]> = {}
    for (const c of clientesFiltrados) {
      const chave = c.empresa?.trim() || '— Sem empresa'
      if (!grupos[chave]) grupos[chave] = []
      grupos[chave].push(c)
    }
    return Object.entries(grupos)
      .sort(([a], [b]) => {
        if (a === '— Sem empresa') return 1
        if (b === '— Sem empresa') return -1
        return a.localeCompare(b)
      })
      .map(([titulo, data]) => ({ titulo, data }))
  })()

  // ── novo cliente ────────────────────────────────────────────────────────────

  function validarNovoCliente() {
    const e: Record<string, string> = {}
    if (sanitizarTexto(nome).length < 2) e.nome = 'Nome deve ter ao menos 2 caracteres.'
    if (telefone && !validarTelefone(telefone)) e.telefone = 'Telefone inválido.'
    setErros(e); return Object.keys(e).length === 0
  }

  function abrirModal() {
    setModalAberto(true)
  }

  function fecharModal() {
    setModalAberto(false)
    setNome(''); setTelefone(''); setEmpresa(''); setEndereco('')
    setObservacao(''); setLimiteCredito(''); setErros({}); setErroGeral('')
    setBuscaContato('')
  }

  async function handleCriar() {
    if (!validarNovoCliente()) return
    setSalvando(true); setErroGeral('')
    try {
      await criar({
        nome: sanitizarTexto(nome),
        telefone: telefone || undefined,
        empresa: empresa.trim() || undefined,
        endereco: endereco.trim() || undefined,
        observacao: observacao || undefined,
        limite_credito: limiteCredito ? parseFloat(limiteCredito.replace(',', '.')) : undefined,
      })
      fecharModal()
    } catch (e: any) {
      setErroGeral(e.message ?? 'Erro ao salvar cliente.')
    } finally {
      setSalvando(false)
    }
  }

  // ── ranking ─────────────────────────────────────────────────────────────────

  async function carregarRanking() {
    setCarregandoRanking(true)
    try {
      const hoje = new Date()
      const hojeISO = format(hoje, 'yyyy-MM-dd')
      const { data: { session: cSess } } = await supabase.auth.getSession()
      const cUid = cSess?.user?.id ?? ''
      const [{ data: vendas }, { data: pagamentos }, { data: base }] = await Promise.all([
        supabase.from('vendas').select('id, cliente_id, valor, data_venda, data_vencimento, pago').eq('usuario_id', cUid),
        supabase.from('pagamentos').select('id, cliente_id, valor').eq('usuario_id', cUid),
        supabase.from('clientes_com_saldo').select('id, nome, telefone, saldo_devedor').eq('usuario_id', cUid).eq('ativo', true),
      ])
      const map: Record<string, ClienteRanking> = {}
      for (const c of (base ?? [])) {
        map[c.id] = { id: c.id, nome: c.nome, telefone: c.telefone ?? undefined, totalComprado: 0, totalPago: 0, saldoDevedor: c.saldo_devedor ?? 0, qtdCompras: 0, taxaPagamento: 0, diasAtraso: 0, comprasVencidas: 0 }
      }
      for (const v of (vendas ?? [])) {
        if (!map[v.cliente_id]) continue
        const cl = map[v.cliente_id]
        cl.totalComprado += v.valor; cl.qtdCompras++
        if (!cl.ultimaCompra || v.data_venda > cl.ultimaCompra) cl.ultimaCompra = v.data_venda
        if (v.data_vencimento && !v.pago && v.data_vencimento < hojeISO) {
          cl.comprasVencidas++
          const dias = Math.floor((hoje.getTime() - new Date(v.data_vencimento + 'T12:00:00').getTime()) / 86400000)
          if (dias > cl.diasAtraso) cl.diasAtraso = dias
        }
      }
      for (const p of (pagamentos ?? [])) {
        if (map[p.cliente_id]) map[p.cliente_id].totalPago += p.valor
      }
      for (const cl of Object.values(map)) {
        cl.taxaPagamento = cl.totalComprado > 0 ? Math.min(cl.totalPago / cl.totalComprado, 1) : 1
      }
      setRanking(Object.values(map).filter(c => c.qtdCompras > 0))
    } finally {
      setCarregandoRanking(false)
    }
  }

  function abrirRanking() {
    setAbaTop('ranking')
    if (plano === 'pro' && !rankingCarregado) { carregarRanking(); setRankingCarregado(true) }
  }

  // ── render card cliente ─────────────────────────────────────────────────────

  function corStatusCliente(item: Cliente) {
    if (item.status_pagamento === 'vencido') return C.red
    if ((item.saldo_devedor ?? 0) > 0) return C.yellow
    return C.green
  }

  function renderCliente({ item }: { item: Cliente }) {
    const temSaldo = (item.saldo_devedor ?? 0) > 0
    const cor = corStatusCliente(item)
    const isVencido = item.status_pagamento === 'vencido'
    return (
      <TouchableOpacity
        style={[estilos.row, isVencido && estilos.rowVencido]}
        onPress={() => router.push(`/cliente/${item.id}`)}
      >
        <View style={[estilos.statusBar, { backgroundColor: cor }]} />
        <Avatar nome={item.nome} tamanho={44} />
        <View style={estilos.info}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={estilos.nomeCliente}>{item.nome}</Text>
            {isVencido && (
              <View style={estilos.chipVencido}>
                <Text style={estilos.chipVencidoTexto}>VENCIDO</Text>
              </View>
            )}
          </View>
          {item.empresa ? (
            <View style={estilos.empresaRow}>
              <Ionicons name="business-outline" size={11} color={C.text3} />
              <Text style={estilos.empresaTexto} numberOfLines={1}>{item.empresa}</Text>
            </View>
          ) : null}
          <View style={estilos.rowMeta}>
            {temSaldo
              ? <Text style={[estilos.metaDevendo, { color: cor }]}>
                  {formatarMoeda(item.saldo_devedor!)} em aberto
                </Text>
              : <Text style={estilos.metaOk}>Em dia</Text>
            }
          </View>
        </View>
        <View style={estilos.direita}>
          {item.telefone && temSaldo && (
            <TouchableOpacity
              style={estilos.btnWhats}
              onPress={(e) => { e.stopPropagation?.(); abrirWhatsApp(item.nome, item.saldo_devedor ?? 0, item.telefone!) }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
            </TouchableOpacity>
          )}
          <Ionicons name="chevron-forward" size={14} color={C.text3} />
        </View>
      </TouchableOpacity>
    )
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <>
    <KeyboardToolbar />
    <View style={estilos.container}>

      {/* Abas topo */}
      <View style={estilos.abaTop}>
        <TouchableOpacity style={[estilos.abaTopBtn, abaTop === 'lista' && estilos.abaTopAtivo]} onPress={() => setAbaTop('lista')}>
          <Ionicons name="people-outline" size={16} color={abaTop === 'lista' ? C.green : C.text2} />
          <Text style={[estilos.abaTopLabel, abaTop === 'lista' && { color: C.green, fontWeight: '800' }]}>Clientes</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[estilos.abaTopBtn, abaTop === 'empresas' && estilos.abaTopAtivo]} onPress={() => setAbaTop('empresas')}>
          <Ionicons name="business-outline" size={16} color={abaTop === 'empresas' ? C.green : C.text2} />
          <Text style={[estilos.abaTopLabel, abaTop === 'empresas' && { color: C.green, fontWeight: '800' }]}>Por empresa</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[estilos.abaTopBtn, abaTop === 'ranking' && estilos.abaTopAtivo]} onPress={abrirRanking}>
          <Text style={{ fontSize: 15 }}>🏆</Text>
          <Text style={[estilos.abaTopLabel, abaTop === 'ranking' && { color: C.green, fontWeight: '800' }]}>Ranking</Text>
          {plano !== 'pro' && <Ionicons name="lock-closed" size={11} color={C.text3} />}
        </TouchableOpacity>
      </View>

      {/* Barra de busca + botão novo (compartilhada entre lista e empresas) */}
      {abaTop !== 'ranking' && (
        <View style={estilos.cabecalho}>
          <View style={estilos.buscaWrapper}>
            <Ionicons name="search-outline" size={16} color={C.text3} style={{ marginRight: 8 }} />
            <TextInput
              style={estilos.busca}
              placeholder={abaTop === 'empresas' ? 'Buscar por nome ou empresa...' : 'Buscar cliente...'}
              placeholderTextColor={C.text3}
              value={busca}
              onChangeText={setBusca}
            />
            {busca.length > 0 && (
              <TouchableOpacity onPress={() => setBusca('')}>
                <Ionicons name="close-circle" size={16} color={C.text3} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={estilos.btnAdicionar} onPress={abrirModal}>
            <Ionicons name="add" size={18} color={C.white} />
            <Text style={estilos.btnAdicionarTexto}>Novo</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── ABA LISTA ── */}
      {abaTop === 'lista' && (
        <>
          {/* Banner vencidos */}
          {(() => {
            const vencidos = clientes.filter(c => c.status_pagamento === 'vencido')
            if (vencidos.length === 0) return null
            return (
              <TouchableOpacity
                style={estilos.bannerVencido}
                onPress={() => router.push('/cobrancas')}
              >
                <Ionicons name="alert-circle" size={18} color={C.red} />
                <Text style={estilos.bannerVencidoTexto}>
                  {vencidos.length === 1
                    ? `${vencidos[0].nome} tem pagamento vencido`
                    : `${vencidos.length} clientes com pagamento vencido`}
                </Text>
                <Text style={estilos.bannerVencidoLink}>Ver →</Text>
              </TouchableOpacity>
            )
          })()}
          {clientes.length > 0 && (
            <Text style={estilos.contagem}>
              {clientesFiltrados.length} {clientesFiltrados.length === 1 ? 'cliente' : 'clientes'}
            </Text>
          )}
          <FlatList
            data={clientesFiltrados}
            keyExtractor={i => i.id}
            renderItem={renderCliente}
            refreshControl={<RefreshControl refreshing={carregando} onRefresh={buscar} tintColor={C.green} />}
            ListEmptyComponent={
              !carregando ? (
                <View style={estilos.vazio}>
                  <View style={estilos.vazioIcone}><Text style={{ fontSize: 36 }}>👥</Text></View>
                  <Text style={estilos.vazioTitulo}>Nenhum cliente ainda</Text>
                  <Text style={estilos.vazioTexto}>Toque em + para adicionar seu primeiro cliente.</Text>
                </View>
              ) : <ActivityIndicator color={C.green} style={{ marginTop: 40 }} />
            }
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100, paddingTop: 4 }}
          />
        </>
      )}

      {/* ── ABA POR EMPRESA ── */}
      {abaTop === 'empresas' && (
        <>
          {secoesPorEmpresa.length > 0 && (
            <Text style={estilos.contagem}>
              {secoesPorEmpresa.length} empresa{secoesPorEmpresa.length !== 1 ? 's' : ''} · {clientesFiltrados.length} cliente{clientesFiltrados.length !== 1 ? 's' : ''}
            </Text>
          )}
          <SectionList
            sections={secoesPorEmpresa.map(s => ({ title: s.titulo, data: s.data }))}
            keyExtractor={i => i.id}
            renderItem={renderCliente}
            refreshControl={<RefreshControl refreshing={carregando} onRefresh={buscar} tintColor={C.green} />}
            renderSectionHeader={({ section }) => (
              <View style={estilos.secaoHeader}>
                {section.title !== '— Sem empresa'
                  ? <Ionicons name="business" size={13} color={C.green} />
                  : <Ionicons name="person-outline" size={13} color={C.text3} />
                }
                <Text style={[estilos.secaoTitulo, section.title === '— Sem empresa' && { color: C.text3 }]}>
                  {section.title}
                </Text>
                <View style={estilos.secaoBadge}>
                  <Text style={estilos.secaoBadgeTexto}>{section.data.length}</Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              !carregando ? (
                <View style={estilos.vazio}>
                  <View style={estilos.vazioIcone}><Text style={{ fontSize: 36 }}>🏢</Text></View>
                  <Text style={estilos.vazioTitulo}>Nenhum resultado</Text>
                  <Text style={estilos.vazioTexto}>Tente outro termo de busca.</Text>
                </View>
              ) : <ActivityIndicator color={C.green} style={{ marginTop: 40 }} />
            }
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100, paddingTop: 4 }}
            stickySectionHeadersEnabled
          />
        </>
      )}

      {/* ── ABA RANKING ── */}
      {abaTop === 'ranking' && (
        plano !== 'pro' ? (
          <ScrollView contentContainerStyle={r.paywallContainer}>
            <View style={r.paywallIcone}>
              <Text style={{ fontSize: 44 }}>🏆</Text>
            </View>
            <View style={r.proBadgeGrande}>
              <Text style={r.proBadgeTexto}>PRO</Text>
            </View>
            <Text style={r.paywallTitulo}>Ranking de Clientes</Text>
            <Text style={r.paywallSub}>
              Veja quem são seus melhores clientes, quem mais consome, os maiores devedores e a lista negra de inadimplentes.
            </Text>

            <View style={r.paywallItens}>
              {[
                { icon: '🏆', texto: 'Melhores clientes por score' },
                { icon: '🛒', texto: 'Quem mais consome no total' },
                { icon: '⏳', texto: 'Maiores devedores em aberto' },
                { icon: '🚫', texto: 'Lista negra de inadimplentes' },
              ].map((item, i) => (
                <View key={i} style={r.paywallItem}>
                  <Text style={{ fontSize: 18 }}>{item.icon}</Text>
                  <Text style={r.paywallItemTexto}>{item.texto}</Text>
                  <Ionicons name="checkmark-circle" size={18} color={C.green} />
                </View>
              ))}
            </View>

            <TouchableOpacity style={r.paywallBtn} onPress={() => router.push('/planos')}>
              <Ionicons name="rocket" size={18} color={C.white} />
              <Text style={r.paywallBtnTexto}>Fazer upgrade para Pro</Text>
            </TouchableOpacity>
            <Text style={r.paywallPreco}>R$ 19/mês · Cancele quando quiser</Text>
          </ScrollView>
        ) : (
          <RankingPanel
            dados={ranking}
            carregando={carregandoRanking}
            aba={abaRanking}
            onAba={setAbaRanking}
            onRefresh={carregarRanking}
            onCliente={id => router.push(`/cliente/${id}`)}
          />
        )
      )}

      {/* Modal seleção de contatos da agenda */}
      <Modal visible={modalContatosAberto} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalContatosAberto(false)}>
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <TouchableOpacity onPress={() => setModalContatosAberto(false)}>
              <Ionicons name="close" size={24} color={C.text} />
            </TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.text, flex: 1 }}>Selecionar contato</Text>
          </View>
          <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 12, gap: 8, borderWidth: 1, borderColor: C.border }}>
              <Ionicons name="search" size={18} color={C.text2} />
              <TextInput
                style={{ flex: 1, height: 44, color: C.text, fontSize: 15 }}
                placeholder="Buscar contato..."
                placeholderTextColor={C.text2}
                value={buscaContato}
                onChangeText={setBuscaContato}
                autoFocus
              />
              {buscaContato.length > 0 && (
                <TouchableOpacity onPress={() => setBuscaContato('')}>
                  <Ionicons name="close-circle" size={18} color={C.text2} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <FlatList
            data={contatosFiltrados}
            keyExtractor={(c, i) => c.id ?? String(i)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: c }) => (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: C.border }}
                onPress={() => selecionarContato(c)}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.greenLight, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: C.green }}>{(c.name ?? '?')[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: C.text }}>{c.name}</Text>
                  {c.phoneNumbers?.[0]?.number ? (
                    <Text style={{ fontSize: 13, color: C.text2 }}>{c.phoneNumbers[0].number}</Text>
                  ) : null}
                </View>
                <Ionicons name="person-add-outline" size={18} color={C.green} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={{ padding: 32, alignItems: 'center' }}>
                <Text style={{ color: C.text2, fontSize: 15 }}>Nenhum contato encontrado</Text>
              </View>
            }
          />
        </View>
      </Modal>

      {/* Modal novo cliente */}
      <Modal visible={modalAberto} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={estilos.modalContainer}>
            <View style={estilos.modalHandle} />
            <ScrollView contentContainerStyle={estilos.modal} keyboardShouldPersistTaps="handled">
              <View style={estilos.modalHeader}>
                <View>
                  <Text style={estilos.modalTitulo}>Novo cliente</Text>
                  <Text style={estilos.modalSub}>Preencha os dados do cliente</Text>
                </View>
                <TouchableOpacity style={estilos.fecharBtn} onPress={fecharModal}>
                  <Ionicons name="close" size={20} color={C.text2} />
                </TouchableOpacity>
              </View>

              <Campo
                label="Nome *"
                value={nome}
                onChangeText={setNome}
                erro={erros.nome}
                placeholder="Nome do cliente"
                autoCapitalize="words"
              />

              {/* Campo telefone com botão de agenda */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Campo
                    label="Telefone / WhatsApp"
                    value={telefone}
                    onChangeText={setTelefone}
                    erro={erros.telefone}
                    placeholder="(00) 00000-0000"
                    keyboardType="phone-pad"
                  />
                </View>
                <TouchableOpacity
                  style={estilos.agendaBtn}
                  onPress={abrirAgenda}
                >
                  <Ionicons name="people-outline" size={22} color={C.white} />
                </TouchableOpacity>
              </View>
              <Campo label="Empresa (opcional)" value={empresa} onChangeText={setEmpresa} placeholder="Ex: Mercado do João" autoCapitalize="words" />
              <Campo label="Endereço (opcional)" value={endereco} onChangeText={setEndereco} placeholder="Ex: Rua das Flores, 123" autoCapitalize="words" />
              <Campo label="Observação" value={observacao} onChangeText={setObservacao} placeholder="Opcional" multiline numberOfLines={3} />
              {modulos.limite_credito && (
                <Campo label="Limite de crédito (R$)" value={limiteCredito} onChangeText={v => setLimiteCredito(formatarInputMoeda(v))} keyboardType="decimal-pad" placeholder="Ex: 200,00 (opcional)" />
              )}

              {erroGeral ? (
                <View style={estilos.erroBox}>
                  <Ionicons name="alert-circle" size={16} color={C.red} />
                  <Text style={estilos.erroTexto}>{erroGeral}</Text>
                </View>
              ) : null}

              <Botao titulo="Salvar cliente" onPress={handleCriar} carregando={salvando} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Painel Ranking (igual ao anterior)
// ══════════════════════════════════════════════════════════════════════════════

const ABAS_RANKING: { key: AbaRanking; icon: string; label: string; cor: string; desc: string }[] = [
  { key: 'melhores',    icon: '🏆', label: 'Melhores',    cor: C.green,   desc: 'Maior volume E boa taxa de pagamento. Os mais valiosos.' },
  { key: 'consumo',     icon: '🛒', label: 'Consumo',     cor: '#7C3AED', desc: 'Quem mais comprou no total, independente de pagamento.' },
  { key: 'devedores',   icon: '⏳', label: 'Devedores',   cor: C.yellow,  desc: 'Maior saldo devedor em aberto no momento.' },
  { key: 'lista_negra', icon: '🚫', label: 'Lista negra', cor: C.red,     desc: 'Dívidas vencidas e histórico de inadimplência.' },
]

function RankingPanel({ dados, carregando, aba, onAba, onRefresh, onCliente }: {
  dados: ClienteRanking[]; carregando: boolean; aba: AbaRanking
  onAba: (a: AbaRanking) => void; onRefresh: () => void; onCliente: (id: string) => void
}) {
  const abaInfo = ABAS_RANKING.find(a => a.key === aba)!
  const melhores  = [...dados].sort((a, b) => scoreMelhor(b) - scoreMelhor(a)).slice(0, 10)
  const consumo   = [...dados].sort((a, b) => b.totalComprado - a.totalComprado).slice(0, 10)
  const devedores = [...dados].filter(c => c.saldoDevedor > 0).sort((a, b) => b.saldoDevedor - a.saldoDevedor).slice(0, 10)
  const negra     = [...dados].filter(c => c.comprasVencidas > 0 || c.saldoDevedor > 0).sort((a, b) => scoreNegra(b) - scoreNegra(a)).slice(0, 10)
  const lista = aba === 'melhores' ? melhores : aba === 'consumo' ? consumo : aba === 'devedores' ? devedores : negra
  const maxVal = aba === 'consumo' ? (consumo[0]?.totalComprado ?? 1) : aba === 'devedores' ? (devedores[0]?.saldoDevedor ?? 1) : 1

  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={r.abasRow}>
        {ABAS_RANKING.map(a => (
          <TouchableOpacity key={a.key} style={[r.abaBtn, aba === a.key && { backgroundColor: a.cor + '18', borderColor: a.cor }]} onPress={() => onAba(a.key)}>
            <Text style={{ fontSize: 15 }}>{a.icon}</Text>
            <Text style={[r.abaLabel, aba === a.key && { color: a.cor, fontWeight: '800' }]}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={[r.desc, { borderLeftColor: abaInfo.cor }]}>
        <Text style={r.descTexto}>{abaInfo.desc}</Text>
      </View>

      {carregando ? (
        <ActivityIndicator color={C.green} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={lista}
          keyExtractor={i => i.id}
          refreshControl={<RefreshControl refreshing={carregando} onRefresh={onRefresh} tintColor={C.green} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100, paddingTop: 8 }}
          ListEmptyComponent={
            <View style={r.vazio}>
              <Text style={{ fontSize: 38 }}>📋</Text>
              <Text style={r.vazioTexto}>
                {aba === 'devedores' ? 'Nenhum devedor no momento. 🎉' : aba === 'lista_negra' ? 'Nenhum inadimplente. Ótimo! 🎉' : 'Nenhum cliente com histórico ainda.'}
              </Text>
            </View>
          }
          renderItem={({ item: c, index: i }) => {
            if (aba === 'melhores') return (
              <TouchableOpacity style={r.card} onPress={() => onCliente(c.id)}>
                <Text style={r.pos}>{medalha(i)}</Text>
                <Avatar nome={c.nome} tamanho={42} />
                <View style={{ flex: 1 }}>
                  <Text style={r.nome} numberOfLines={1}>{c.nome}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Text style={r.meta}>{c.qtdCompras} compra{c.qtdCompras !== 1 ? 's' : ''}</Text>
                    <Text style={r.sep}>·</Text>
                    <StarRating rate={c.taxaPagamento} />
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 5 }}>
                  <Text style={[r.valor, { color: C.green }]}>{formatarMoeda(c.totalComprado)}</Text>
                  <TaxaBadge taxa={c.taxaPagamento} />
                </View>
              </TouchableOpacity>
            )
            if (aba === 'consumo') return (
              <TouchableOpacity style={r.card} onPress={() => onCliente(c.id)}>
                <Text style={r.pos}>{medalha(i)}</Text>
                <Avatar nome={c.nome} tamanho={42} />
                <View style={{ flex: 1 }}>
                  <Text style={r.nome} numberOfLines={1}>{c.nome}</Text>
                  <View style={r.barraBg}>
                    <View style={[r.barraPreenche, { width: `${Math.round((c.totalComprado / maxVal) * 100)}%`, backgroundColor: '#7C3AED' }]} />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                    <Text style={r.meta}>{c.qtdCompras} compra{c.qtdCompras !== 1 ? 's' : ''}</Text>
                    {c.ultimaCompra && <><Text style={r.sep}>·</Text><Text style={r.meta}>Última: {format(new Date(c.ultimaCompra + 'T12:00:00'), 'd MMM', { locale: ptBR })}</Text></>}
                  </View>
                </View>
                <Text style={[r.valor, { color: '#7C3AED' }]}>{formatarMoeda(c.totalComprado)}</Text>
              </TouchableOpacity>
            )
            if (aba === 'devedores') return (
              <View style={r.card}>
                <Text style={r.pos}>{medalha(i)}</Text>
                <TouchableOpacity style={{ flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center' }} onPress={() => onCliente(c.id)}>
                  <Avatar nome={c.nome} tamanho={42} />
                  <View style={{ flex: 1 }}>
                    <Text style={r.nome} numberOfLines={1}>{c.nome}</Text>
                    <View style={r.barraBg}><View style={[r.barraPreenche, { width: `${Math.round((c.saldoDevedor / maxVal) * 100)}%`, backgroundColor: C.red }]} /></View>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 2, alignItems: 'center' }}>
                      {c.diasAtraso > 0 && <View style={r.atrasoBadge}><Ionicons name="time-outline" size={10} color={C.red} /><Text style={r.atrasoTexto}>{c.diasAtraso}d atraso</Text></View>}
                      <Text style={r.meta}>{c.comprasVencidas} vencida{c.comprasVencidas !== 1 ? 's' : ''}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={[r.valor, { color: C.red }]}>{formatarMoeda(c.saldoDevedor)}</Text>
                  {c.telefone && <TouchableOpacity style={r.btnWa} onPress={() => abrirWhatsApp(c.nome, c.saldoDevedor, c.telefone!)}><Ionicons name="logo-whatsapp" size={16} color="#25D366" /></TouchableOpacity>}
                </View>
              </View>
            )
            // lista_negra
            const risco = c.taxaPagamento < 0.3 || c.diasAtraso > 60 ? 'alto' : c.taxaPagamento < 0.6 || c.diasAtraso > 30 ? 'medio' : 'baixo'
            const corRisco = risco === 'alto' ? C.red : risco === 'medio' ? C.yellow : '#F97316'
            const labelRisco = risco === 'alto' ? 'Alto risco' : risco === 'medio' ? 'Médio risco' : 'Atenção'
            return (
              <View style={[r.card, { borderColor: C.redBorder, backgroundColor: '#FFFBFB' }]}>
                <Text style={r.pos}>{medalha(i)}</Text>
                <TouchableOpacity style={{ flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center' }} onPress={() => onCliente(c.id)}>
                  <Avatar nome={c.nome} tamanho={42} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={r.nome} numberOfLines={1}>{c.nome}</Text>
                      <View style={[r.riscoBadge, { backgroundColor: corRisco + '20', borderColor: corRisco + '50' }]}><Text style={[r.riscoTexto, { color: corRisco }]}>{labelRisco}</Text></View>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                      {c.comprasVencidas > 0 && <View style={r.chip}><Ionicons name="warning-outline" size={10} color={C.red} /><Text style={r.chipTexto}>{c.comprasVencidas} venc.</Text></View>}
                      {c.diasAtraso > 0 && <View style={r.chip}><Ionicons name="time-outline" size={10} color={C.red} /><Text style={r.chipTexto}>{c.diasAtraso}d atraso</Text></View>}
                      <View style={r.chipCinza}><Text style={r.chipTexto}>Pagou {Math.round(c.taxaPagamento * 100)}%</Text></View>
                    </View>
                  </View>
                </TouchableOpacity>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={[r.valor, { color: C.red }]}>{formatarMoeda(c.saldoDevedor)}</Text>
                  {c.telefone && <TouchableOpacity style={r.btnWa} onPress={() => abrirWhatsApp(c.nome, c.saldoDevedor, c.telefone!)}><Ionicons name="logo-whatsapp" size={16} color="#25D366" /></TouchableOpacity>}
                </View>
              </View>
            )
          }}
        />
      )}
    </View>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Estilos
// ══════════════════════════════════════════════════════════════════════════════

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  abaTop: { flexDirection: 'row', backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 12, paddingTop: 10, gap: 6 },
  abaTopBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10, borderBottomWidth: 0, borderBottomColor: 'transparent', marginBottom: 8 },
  abaTopAtivo: { backgroundColor: C.greenLight },
  abaTopLabel: { fontSize: 12, fontWeight: '600', color: C.text2 },

  cabecalho: { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 8 },
  buscaWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12 },
  busca: { flex: 1, height: 44, fontSize: 15, color: C.text },
  btnAdicionar: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.green, borderRadius: 12, paddingHorizontal: 14, height: 44, shadowColor: C.green, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
  btnAdicionarTexto: { color: C.white, fontSize: 14, fontWeight: '700' },
  contagem: { fontSize: 12, color: C.text2, fontWeight: '500', paddingHorizontal: 16, marginBottom: 4 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 18, marginBottom: 8, borderWidth: 1, borderColor: C.border, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  rowVencido: { backgroundColor: '#FFF5F5', borderColor: '#FFCDD2' },
  chipVencido: { backgroundColor: C.red, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  chipVencidoTexto: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  statusBar: { width: 4, alignSelf: 'stretch' },
  info: { flex: 1, gap: 3, paddingVertical: 14 },
  nomeCliente: { fontSize: 15, fontWeight: '700', color: C.text },
  empresaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  empresaTexto: { fontSize: 12, color: C.green, fontWeight: '500' },
  enderecoRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  enderecoTexto: { fontSize: 11, color: C.text3 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  metaDevendo: { fontSize: 12, color: C.red, fontWeight: '500' },
  metaOk: { fontSize: 12, color: C.green, fontWeight: '500' },
  direita: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 14, paddingVertical: 14 },
  btnWhats: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#E7FBF0', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#B7F0CC' },

  secaoHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.bg, paddingVertical: 8, paddingHorizontal: 4, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  secaoTitulo: { flex: 1, fontSize: 13, fontWeight: '700', color: C.green },
  secaoBadge: { backgroundColor: C.greenLight, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: C.greenMid },
  secaoBadgeTexto: { fontSize: 11, color: C.green, fontWeight: '700' },

  vazio: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 32, gap: 10 },
  vazioIcone: { width: 80, height: 80, borderRadius: 24, backgroundColor: C.greenLight, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  vazioTitulo: { fontSize: 17, fontWeight: '700', color: C.text },
  vazioTexto: { fontSize: 14, color: C.text2, textAlign: 'center', lineHeight: 20 },

  modalContainer: { flex: 1, backgroundColor: C.bg },
  modalHandle: { width: 40, height: 4, borderRadius: 99, backgroundColor: C.border, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  modal: { padding: 24, paddingTop: 12 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  modalTitulo: { fontSize: 20, fontWeight: '800', color: C.text },
  modalSub: { fontSize: 13, color: C.text2, marginTop: 2 },
  fecharBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
  erroBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.redLight, borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: C.redBorder },
  erroTexto: { color: C.red, fontSize: 13, fontWeight: '500', flex: 1 },

  agendaBtn: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: C.green, alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },

  bannerVencido: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.redLight, borderWidth: 1, borderColor: C.redBorder,
    borderRadius: 12, marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  bannerVencidoTexto: { flex: 1, fontSize: 13, fontWeight: '600', color: C.red },
  bannerVencidoLink: { fontSize: 13, fontWeight: '800', color: C.red },
})

const r = StyleSheet.create({
  abasRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  abaBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.border },
  abaLabel: { fontSize: 12, fontWeight: '600', color: C.text2 },
  desc: { marginHorizontal: 16, marginBottom: 4, borderLeftWidth: 3, paddingLeft: 10 },
  descTexto: { fontSize: 12, color: C.text2, lineHeight: 17 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  pos: { width: 26, fontSize: 16, textAlign: 'center' },
  nome: { fontSize: 14, fontWeight: '700', color: C.text },
  meta: { fontSize: 11, color: C.text2 },
  sep: { fontSize: 11, color: C.text3 },
  valor: { fontSize: 14, fontWeight: '800' },
  barraBg: { height: 5, backgroundColor: C.border, borderRadius: 99, overflow: 'hidden', marginTop: 5 },
  barraPreenche: { height: 5, borderRadius: 99 },
  taxaBadge: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
  taxaBadgeTexto: { fontSize: 11, fontWeight: '700' },
  atrasoBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.redLight, borderRadius: 99, paddingHorizontal: 6, paddingVertical: 2 },
  atrasoTexto: { fontSize: 10, color: C.red, fontWeight: '600' },
  btnWa: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#E7FBF0', borderWidth: 1, borderColor: '#B7F0CC', alignItems: 'center', justifyContent: 'center' },
  riscoBadge: { borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  riscoTexto: { fontSize: 10, fontWeight: '700' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.redLight, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 },
  chipCinza: { backgroundColor: C.bg, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: C.border },
  chipTexto: { fontSize: 10, color: C.text2, fontWeight: '600' },
  vazio: { alignItems: 'center', paddingTop: 48, gap: 10 },
  vazioTexto: { fontSize: 14, color: C.text2, textAlign: 'center' },

  paywallContainer: { alignItems: 'center', padding: 28, paddingBottom: 60 },
  paywallIcone: {
    width: 88, height: 88, borderRadius: 24,
    backgroundColor: C.yellowLight, borderWidth: 2, borderColor: C.yellowBorder,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  proBadgeGrande: { backgroundColor: C.green, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 4, marginBottom: 16 },
  proBadgeTexto: { fontSize: 12, fontWeight: '900', color: C.white, letterSpacing: 2 },
  paywallTitulo: { fontSize: 22, fontWeight: '900', color: C.text, textAlign: 'center', marginBottom: 10 },
  paywallSub: { fontSize: 14, color: C.text2, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  paywallItens: { width: '100%', gap: 10, marginBottom: 28 },
  paywallItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border },
  paywallItemTexto: { flex: 1, fontSize: 14, fontWeight: '600', color: C.text },
  paywallBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.green, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 32,
    shadowColor: C.green, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8, marginBottom: 12,
  },
  paywallBtnTexto: { color: C.white, fontSize: 16, fontWeight: '800' },
  paywallPreco: { fontSize: 12, color: C.text3 },
})

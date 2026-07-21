import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl, ActivityIndicator, Platform, useWindowDimensions
} from 'react-native'
import { RegistradorRapido } from '../../components/ui/RegistradorRapido'
import { useRouter } from 'expo-router'
import { useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useDashboard } from '../../hooks/useDashboard'
import { useOffline } from '../../hooks/useOffline'
import { useNotificacoes } from '../../hooks/useNotificacoes'
import { useAvaliacaoApp } from '../../hooks/useAvaliacaoApp'
import { useModulos } from '../../hooks/useModulos'
import { Avatar } from '../../components/ui/Avatar'
import { BadgeStatus } from '../../components/ui/BadgeStatus'
import { AppTour, type TourStep } from '../../components/ui/AppTour'
import { formatarMoeda } from '../../lib/validacao'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { Logo } from '../../components/ui/Logo'
import { C } from '../../constants/colors'
import type { Cliente } from '../../types'

export default function DashboardScreen() {
  const router = useRouter()
  const { usuario } = useAuth()
  const { resumo, topDevedores, carregando, buscar } = useDashboard()
  const { online, pendentes } = useOffline()
  const { modulos } = useModulos(usuario?.id)
  const { width } = useWindowDimensions()
  const isTablet = width >= 768
  const [diaCobranca, setDiaCobranca] = useState<number | null>(null)
  const [clientesParaCobrar, setClientesParaCobrar] = useState(0)
  const [tourVisivel, setTourVisivel] = useState(false)
  const [tourSteps, setTourSteps] = useState<TourStep[]>([])
  const [registradorVisivel, setRegistradorVisivel] = useState(false)
  const [nomeNegocio, setNomeNegocio] = useState('')
  useNotificacoes()
  useAvaliacaoApp()

  const refHero = useRef<View>(null)
  const refCards = useRef<View>(null)
  const refBusca = useRef<View>(null)
  const refSecao = useRef<View>(null)

  function medirElemento(ref: React.RefObject<View>): Promise<{ x: number; y: number; width: number; height: number } | null> {
    return new Promise(resolve => {
      if (!ref.current) return resolve(null)
      ref.current.measureInWindow((x, y, w, h) => {
        if (w === 0 && h === 0) return resolve(null)
        resolve({ x, y, width: w, height: h })
      })
    })
  }

  async function iniciarTour() {
    const [hero, cards, busca, secao] = await Promise.all([
      medirElemento(refHero),
      medirElemento(refCards),
      medirElemento(refBusca),
      medirElemento(refSecao),
    ])
    setTourSteps([
      { titulo: '👋 Bem-vindo ao FiadoApp!', texto: 'Este é seu painel principal. Vamos te mostrar cada parte do app.', posicao: null },
      { titulo: '💰 Total em aberto', texto: 'Aqui você vê o valor total que seus clientes devem.', posicao: hero, tooltipLado: 'baixo' },
      { titulo: '📊 Métricas do dia', texto: 'Veja quanto você recebeu hoje e quantos clientes estão vencidos.', posicao: cards, tooltipLado: 'baixo' },
      { titulo: '🔍 Busca rápida', texto: 'Toque aqui para buscar qualquer cliente rapidamente.', posicao: busca, tooltipLado: 'baixo' },
      { titulo: '👥 Lista de devedores', texto: 'Clientes com maior saldo. Toque para ver histórico completo.', posicao: secao, tooltipLado: 'cima' },
      { titulo: '➕ Nova venda', texto: 'O botão verde ✚ no centro da barra registra uma nova venda fiada.', posicao: null },
      { titulo: '💬 Cobrar via WhatsApp', texto: 'No perfil do cliente, toque no WhatsApp para enviar cobrança automática.', posicao: null },
    ])
    setTourVisivel(true)
  }

  async function concluirTour() {
    setTourVisivel(false)
    await AsyncStorage.setItem('@fiado_tour_ok', '1')
  }

  useEffect(() => {
    AsyncStorage.getItem('@fiado_tour_ok').then(ok => { if (!ok) setTimeout(iniciarTour, 800) })
  }, [])

  useFocusEffect(useCallback(() => { buscar() }, [buscar]))

  useEffect(() => {
    if (!usuario?.id) return
    supabase.from('perfis').select('dia_cobranca, nome_negocio').eq('id', usuario.id).single()
      .then(({ data }) => {
        if (!data) return
        if (data.nome_negocio) setNomeNegocio(data.nome_negocio)
        if (!data.dia_cobranca) return
        const hoje = new Date().getDate()
        if (hoje === data.dia_cobranca) {
          setDiaCobranca(data.dia_cobranca)
          supabase.from('clientes_com_saldo').select('id', { count: 'exact' }).gt('saldo_devedor', 0)
            .then(({ count }) => setClientesParaCobrar(count ?? 0))
        }
      })
  }, [usuario])

  function corStatus(status: string) {
    if (status === 'vencido') return C.red
    if (status === 'pendente') return C.yellow
    return C.green
  }

  function renderCliente({ item }: { item: Cliente }) {
    const cor = corStatus(item.status_pagamento)
    return (
      <TouchableOpacity style={estilos.clienteRow} onPress={() => router.push(`/cliente/${item.id}`)}>
        <View style={[estilos.clienteStatusBar, { backgroundColor: cor }]} />
        <Avatar nome={item.nome} tamanho={42} />
        <View style={estilos.clienteInfo}>
          <Text style={estilos.clienteNome} numberOfLines={1}>{item.nome}</Text>
          <BadgeStatus status={item.status_pagamento} />
        </View>
        <View style={estilos.clienteDireita}>
          <Text style={[estilos.divida, { color: cor }]}>
            {formatarMoeda(item.saldo_devedor ?? 0)}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={C.text3} />
        </View>
      </TouchableOpacity>
    )
  }

  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'

  return (
    <>
      <AppTour steps={tourSteps} visivel={tourVisivel} onConcluir={concluirTour} />
      <RegistradorRapido visivel={registradorVisivel} onFechar={() => { setRegistradorVisivel(false); buscar() }} />
      {Platform.OS !== 'web' && (
        <TouchableOpacity style={estilos.fabCaixa} onPress={() => setRegistradorVisivel(true)}>
          <Ionicons name="receipt-outline" size={22} color={C.green} />
        </TouchableOpacity>
      )}
      <FlatList
        data={topDevedores}
        keyExtractor={(i) => i.id}
        renderItem={renderCliente}
        contentContainerStyle={[estilos.container, isTablet && { maxWidth: 720, alignSelf: 'center', width: '100%' }]}
        refreshControl={<RefreshControl refreshing={carregando} onRefresh={buscar} tintColor={C.green} />}
        ListHeaderComponent={
          <View>
            {/* Topo: logo + busca */}
            <View style={estilos.topBar}>
              <Logo width={110} showTagline={false} />
              <TouchableOpacity ref={refBusca} style={estilos.buscaBtn} onPress={() => router.push('/busca')}>
                <Ionicons name="search-outline" size={19} color={C.text2} />
              </TouchableOpacity>
            </View>

            {/* Banner offline */}
            {!online && (
              <View style={estilos.offlineBanner}>
                <Ionicons name="cloud-offline-outline" size={15} color={C.red} />
                <Text style={estilos.offlineTexto}>
                  Sem conexão · {pendentes > 0 ? `${pendentes} operação(ões) pendentes` : 'dados podem estar desatualizados'}
                </Text>
              </View>
            )}

            {/* Alertas */}
            {modulos.cobranca_automatica && diaCobranca && clientesParaCobrar > 0 && (
              <TouchableOpacity style={estilos.alertaBanner} onPress={() => router.push('/cobrancas')}>
                <View style={estilos.alertaIcone}>
                  <Ionicons name="notifications" size={18} color={C.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.alertaTitulo}>Dia de cobrança!</Text>
                  <Text style={estilos.alertaSub}>{clientesParaCobrar} cliente(s) com saldo em aberto</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            )}
            {resumo.clientes_vencidos > 0 && (
              <TouchableOpacity style={[estilos.alertaBanner, { backgroundColor: C.red }]} onPress={() => router.push('/cobrancas')}>
                <View style={estilos.alertaIcone}>
                  <Ionicons name="warning" size={18} color={C.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.alertaTitulo}>Pagamentos vencidos</Text>
                  <Text style={estilos.alertaSub}>{resumo.clientes_vencidos} cliente(s) com dívida vencida</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            )}

            {/* Hero */}
            <View ref={refHero} style={estilos.hero}>
              {/* Círculos decorativos */}
              <View style={estilos.heroCirculo1} />
              <View style={estilos.heroCirculo2} />

              {/* Saudação */}
              <Text style={estilos.heroSaudacao}>{saudacao}{nomeNegocio ? `, ${nomeNegocio}` : ''} 👋</Text>

              {/* Valor */}
              <Text style={estilos.heroLabelPrincipal}>TOTAL EM ABERTO</Text>
              <Text style={estilos.heroValor}>{formatarMoeda(resumo.total_em_aberto)}</Text>

              {/* Rodapé hero */}
              <View style={estilos.heroRodape}>
                <View style={estilos.heroStat}>
                  <Ionicons name="people-outline" size={13} color="rgba(255,255,255,0.7)" />
                  <Text style={estilos.heroStatTexto}>
                    {resumo.clientes_ativos} {resumo.clientes_ativos === 1 ? 'cliente' : 'clientes'}
                  </Text>
                </View>
                <TouchableOpacity style={estilos.heroBotao} onPress={() => router.push('/(tabs)/nova-venda')}>
                  <Ionicons name="add" size={15} color={C.green} />
                  <Text style={estilos.heroBotaoTexto}>Nova venda</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Cards métricas */}
            <View ref={refCards} style={estilos.metricas}>
              <View style={[estilos.metricaCard, { borderLeftColor: C.green }]}>
                <View style={[estilos.metricaIcone, { backgroundColor: C.greenLight }]}>
                  <Ionicons name="checkmark-circle" size={18} color={C.green} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.metricaValor}>{formatarMoeda(resumo.recebido_hoje)}</Text>
                  <Text style={estilos.metricaLabel}>Recebido hoje</Text>
                </View>
              </View>
              <View style={[estilos.metricaCard, { borderLeftColor: resumo.clientes_vencidos > 0 ? C.red : C.green }]}>
                <View style={[estilos.metricaIcone, { backgroundColor: resumo.clientes_vencidos > 0 ? C.redLight : C.greenLight }]}>
                  <Ionicons
                    name={resumo.clientes_vencidos > 0 ? 'warning' : 'shield-checkmark'}
                    size={18}
                    color={resumo.clientes_vencidos > 0 ? C.red : C.green}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[estilos.metricaValor, { color: resumo.clientes_vencidos > 0 ? C.red : C.green }]}>
                    {resumo.clientes_vencidos === 0 ? 'Nenhum' : `${resumo.clientes_vencidos} cliente${resumo.clientes_vencidos !== 1 ? 's' : ''}`}
                  </Text>
                  <Text style={estilos.metricaLabel}>Vencidos</Text>
                </View>
              </View>
            </View>

            {/* Aviso limite */}
            {resumo.clientes_ativos >= 8 && resumo.clientes_ativos < 10 && (
              <TouchableOpacity style={estilos.limiteBanner} onPress={() => router.push('/planos')}>
                <Ionicons name="warning-outline" size={16} color={C.yellow} />
                <Text style={estilos.limiteBannerTexto}>{resumo.clientes_ativos}/10 clientes — quase no limite.</Text>
                <Text style={estilos.limiteBannerLink}>Upgrade →</Text>
              </TouchableOpacity>
            )}
            {resumo.clientes_ativos >= 10 && (
              <TouchableOpacity style={[estilos.limiteBanner, { backgroundColor: C.redLight, borderColor: C.redBorder }]} onPress={() => router.push('/planos')}>
                <Ionicons name="lock-closed-outline" size={16} color={C.red} />
                <Text style={[estilos.limiteBannerTexto, { color: C.red }]}>Limite atingido. Faça upgrade para adicionar mais.</Text>
                <Text style={[estilos.limiteBannerLink, { color: C.red }]}>Upgrade →</Text>
              </TouchableOpacity>
            )}

            {/* Cabeçalho seção */}
            {topDevedores.length > 0 && (
              <View ref={refSecao} style={estilos.secaoHeader}>
                <View style={estilos.secaoDot} />
                <Text style={estilos.secaoTitulo}>Maiores saldos</Text>
                <TouchableOpacity onPress={() => router.push('/(tabs)/clientes')} style={estilos.secaoLinkBtn}>
                  <Text style={estilos.secaoLink}>Ver todos</Text>
                  <Ionicons name="chevron-forward" size={13} color={C.green} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !carregando ? (
            <View style={estilos.vazio}>
              <View style={estilos.vazioIcone}>
                <Ionicons name="checkmark-circle" size={42} color={C.green} />
              </View>
              <Text style={estilos.vazioTitulo}>Tudo em dia!</Text>
              <Text style={estilos.vazioTexto}>Nenhum devedor. Registre sua primeira venda.</Text>
              <TouchableOpacity style={estilos.vazioBtn} onPress={() => router.push('/(tabs)/nova-venda')}>
                <Ionicons name="add" size={16} color={C.white} />
                <Text style={estilos.vazioBtnTexto}>Registrar venda</Text>
              </TouchableOpacity>
            </View>
          ) : <ActivityIndicator color={C.green} style={{ marginTop: 48 }} />
        }
      />
    </>
  )
}

const estilos = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 110, backgroundColor: C.bg },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 8, marginBottom: 14,
  },
  buscaBtn: {
    width: 42, height: 42, borderRadius: 13,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },

  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.redLight, borderRadius: 12, padding: 11, marginBottom: 10,
    borderWidth: 1, borderColor: C.redBorder,
  },
  offlineTexto: { flex: 1, fontSize: 12, color: C.red, fontWeight: '500' },

  alertaBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.green, borderRadius: 16, padding: 14, marginBottom: 10,
    shadowColor: C.green, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 5,
  },
  alertaIcone: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  alertaTitulo: { fontSize: 13, fontWeight: '800', color: C.white },
  alertaSub: { fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 1 },

  // ── Hero ──────────────────────────────────────────────────────────────────────
  hero: {
    backgroundColor: C.green,
    borderRadius: 26,
    padding: 24,
    marginBottom: 14,
    overflow: 'hidden',
    shadowColor: C.green,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 10,
  },
  heroCirculo1: {
    position: 'absolute', top: -50, right: -50,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroCirculo2: {
    position: 'absolute', bottom: -30, left: -30,
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  heroSaudacao: {
    fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600',
    marginBottom: 14,
  },
  heroLabelPrincipal: {
    fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4,
  },
  heroValor: {
    fontSize: 42, fontWeight: '900', color: C.white,
    letterSpacing: -1.5, marginBottom: 20,
  },
  heroRodape: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  heroStat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroStatTexto: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  heroBotao: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.white, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 99,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
  },
  heroBotaoTexto: { color: C.green, fontWeight: '800', fontSize: 13 },

  // ── Métricas ──────────────────────────────────────────────────────────────────
  metricas: { gap: 10, marginBottom: 16 },
  metricaCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.card, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: C.border,
    borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  metricaIcone: {
    width: 42, height: 42, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  metricaValor: { fontSize: 18, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  metricaLabel: { fontSize: 11, color: C.text3, fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },

  // ── Limite ────────────────────────────────────────────────────────────────────
  limiteBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.yellowLight, borderRadius: 12, padding: 11, marginBottom: 10,
    borderWidth: 1, borderColor: C.yellowBorder,
  },
  limiteBannerTexto: { flex: 1, fontSize: 12, color: C.yellow, fontWeight: '500' },
  limiteBannerLink: { fontSize: 12, color: C.yellow, fontWeight: '800' },

  // ── Seção ─────────────────────────────────────────────────────────────────────
  secaoHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 12, marginTop: 4,
  },
  secaoDot: {
    width: 4, height: 16, borderRadius: 2, backgroundColor: C.green,
  },
  secaoTitulo: { flex: 1, fontSize: 13, fontWeight: '800', color: C.text, letterSpacing: -0.2 },
  secaoLinkBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  secaoLink: { fontSize: 12, color: C.green, fontWeight: '700' },

  // ── Linha cliente ─────────────────────────────────────────────────────────────
  clienteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.card, borderRadius: 18, marginBottom: 8,
    borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  clienteStatusBar: { width: 4, alignSelf: 'stretch' },
  clienteInfo: { flex: 1, paddingVertical: 15, gap: 4 },
  clienteNome: { fontSize: 15, fontWeight: '700', color: C.text },
  clienteDireita: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingRight: 14, paddingVertical: 15,
  },
  divida: { fontSize: 15, fontWeight: '800' },

  // ── FAB caixa ─────────────────────────────────────────────────────────────────
  fabCaixa: {
    position: 'absolute', bottom: 106, right: 18,
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: C.white, borderWidth: 1.5, borderColor: C.greenMid,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.green, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 8,
    zIndex: 10,
  },

  // ── Vazio ─────────────────────────────────────────────────────────────────────
  vazio: { alignItems: 'center', paddingTop: 56, gap: 10 },
  vazioIcone: {
    width: 84, height: 84, borderRadius: 26,
    backgroundColor: C.greenLight, alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  vazioTitulo: { fontSize: 18, fontWeight: '800', color: C.text },
  vazioTexto: { fontSize: 14, color: C.text2, textAlign: 'center', lineHeight: 20, maxWidth: 260 },
  vazioBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.green, paddingHorizontal: 24, paddingVertical: 13, borderRadius: 14, marginTop: 8,
    shadowColor: C.green, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  vazioBtnTexto: { color: C.white, fontWeight: '800', fontSize: 14 },
})

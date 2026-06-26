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

function CardMetrica({ icone, label, valor, cor, bg }: { icone: string; label: string; valor: string; cor: string; bg: string }) {
  return (
    <View style={[estilos.cardMetrica, { backgroundColor: bg }]}>
      <Text style={{ fontSize: 20, marginBottom: 6 }}>{icone}</Text>
      <Text style={[estilos.cardMetricaValor, { color: cor }]}>{valor}</Text>
      <Text style={estilos.cardMetricaLabel}>{label}</Text>
    </View>
  )
}

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
  useNotificacoes()
  useAvaliacaoApp()

  // Refs para medir elementos do tour
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
      {
        titulo: '👋 Bem-vindo ao FiadoApp!',
        texto: 'Este é seu painel principal. Vamos te mostrar cada parte do app. Toque em "Próximo" para começar.',
        posicao: null,
      },
      {
        titulo: '💰 Total em aberto',
        texto: 'Aqui você vê o valor total que seus clientes devem. Atualiza em tempo real a cada pagamento.',
        posicao: hero,
        tooltipLado: 'baixo',
      },
      {
        titulo: '📊 Métricas do dia',
        texto: 'Veja quanto você recebeu hoje e quantos clientes estão com pagamentos vencidos.',
        posicao: cards,
        tooltipLado: 'baixo',
      },
      {
        titulo: '🔍 Busca rápida',
        texto: 'Toque aqui para buscar qualquer cliente pelo nome ou telefone sem precisar ir à lista.',
        posicao: busca,
        tooltipLado: 'baixo',
      },
      {
        titulo: '👥 Lista de devedores',
        texto: 'Aqui aparecem os clientes com maior saldo. Toque em um nome para ver o histórico completo e registrar pagamentos.',
        posicao: secao,
        tooltipLado: 'cima',
      },
      {
        titulo: '➕ Nova venda',
        texto: 'O botão verde ✚ no centro da barra inferior registra uma nova venda fiada. Use sempre que vender no fiado!',
        posicao: null,
      },
      {
        titulo: '💬 Cobrar via WhatsApp',
        texto: 'No perfil de cada cliente, toque no botão verde do WhatsApp para enviar uma mensagem de cobrança automática com o saldo em aberto.',
        posicao: null,
      },
    ])

    setTourVisivel(true)
  }

  async function concluirTour() {
    setTourVisivel(false)
    await AsyncStorage.setItem('@fiado_tour_ok', '1')
  }

  useEffect(() => {
    AsyncStorage.getItem('@fiado_tour_ok').then(ok => {
      if (!ok) {
        // Aguarda tela renderizar antes de medir
        setTimeout(iniciarTour, 800)
      }
    })
  }, [])

  useFocusEffect(useCallback(() => { buscar() }, [buscar]))

  useEffect(() => {
    if (!usuario?.id) return
    supabase.from('perfis').select('dia_cobranca').eq('id', usuario.id).single()
      .then(({ data }) => {
        if (!data?.dia_cobranca) return
        const hoje = new Date().getDate()
        if (hoje === data.dia_cobranca) {
          setDiaCobranca(data.dia_cobranca)
          supabase.from('clientes_com_saldo').select('id', { count: 'exact' }).gt('saldo_devedor', 0)
            .then(({ count }) => setClientesParaCobrar(count ?? 0))
        }
      })
  }, [usuario])

  function renderCliente({ item }: { item: Cliente }) {
    return (
      <TouchableOpacity style={estilos.clienteRow} onPress={() => router.push(`/cliente/${item.id}`)}>
        <Avatar nome={item.nome} tamanho={44} />
        <View style={estilos.clienteInfo}>
          <Text style={estilos.clienteNome}>{item.nome}</Text>
          <BadgeStatus status={item.status_pagamento} />
        </View>
        <View style={estilos.clienteDireita}>
          <Text style={[estilos.divida, item.status_pagamento === 'vencido' && estilos.dividaVencida]}>
            {formatarMoeda(item.saldo_devedor ?? 0)}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={C.text3} />
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <>
    <AppTour steps={tourSteps} visivel={tourVisivel} onConcluir={concluirTour} />
    <RegistradorRapido visivel={registradorVisivel} onFechar={() => { setRegistradorVisivel(false); buscar() }} />
    {Platform.OS !== 'web' && (
      <TouchableOpacity style={estilos.fabCaixa} onPress={() => setRegistradorVisivel(true)}>
        <Text style={{ fontSize: 22 }}>🧾</Text>
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
          {/* Logo + busca no topo */}
          <View style={estilos.logoTopo}>
            <Logo width={130} showTagline={false} />
            <TouchableOpacity ref={refBusca} style={estilos.buscaBtn} onPress={() => router.push('/busca')}>
              <Ionicons name="search-outline" size={20} color={C.text2} />
            </TouchableOpacity>
          </View>

          {/* Banner offline */}
          {!online && (
            <View style={estilos.offlineBanner}>
              <Ionicons name="cloud-offline-outline" size={16} color={C.red} />
              <Text style={estilos.offlineTexto}>
                Sem conexão · {pendentes > 0 ? `${pendentes} operação(ões) serão sincronizadas quando voltar online` : 'dados podem estar desatualizados'}
              </Text>
            </View>
          )}

          {/* Banner cobrança automática */}
          {modulos.cobranca_automatica && diaCobranca && clientesParaCobrar > 0 && (
            <TouchableOpacity style={estilos.cobrancaBanner} onPress={() => router.push('/cobrancas')}>
              <View style={estilos.cobrancaIcone}>
                <Ionicons name="notifications" size={20} color={C.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={estilos.cobrancaTitulo}>Dia de cobrança!</Text>
                <Text style={estilos.cobrancaSub}>{clientesParaCobrar} cliente(s) com saldo em aberto para cobrar hoje</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.white} />
            </TouchableOpacity>
          )}

          {/* Banner vencidos */}
          {resumo.clientes_vencidos > 0 && (
            <TouchableOpacity style={estilos.vencidoBanner} onPress={() => router.push('/cobrancas')}>
              <View style={estilos.vencidoIcone}>
                <Ionicons name="warning" size={20} color={C.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={estilos.vencidoTitulo}>⚠ Pagamentos vencidos!</Text>
                <Text style={estilos.vencidoSub}>{resumo.clientes_vencidos} cliente(s) com dívida vencida · Cobrar via WhatsApp</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.white} />
            </TouchableOpacity>
          )}

          {/* Hero — total em aberto */}
          <View ref={refHero} style={estilos.heroBanner}>
            <View style={estilos.heroTopo}>
              <View>
                <Text style={estilos.heroLabel}>Total em aberto</Text>
                <Text style={estilos.heroValor}>{formatarMoeda(resumo.total_em_aberto)}</Text>
              </View>
              <View style={estilos.heroIcone}>
                <Ionicons name="wallet" size={24} color={C.white} />
              </View>
            </View>
            <View style={estilos.heroRodape}>
              <Text style={estilos.heroSub}>
                {resumo.clientes_ativos} {resumo.clientes_ativos === 1 ? 'cliente ativo' : 'clientes ativos'}
              </Text>
              <TouchableOpacity style={estilos.heroBotao} onPress={() => router.push('/(tabs)/nova-venda')}>
                <Ionicons name="add" size={14} color={C.green} />
                <Text style={estilos.heroBotaoTexto}>Nova venda</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Cards métricas */}
          <View ref={refCards} style={estilos.gradeCards}>
            <CardMetrica
              icone="✅"
              label="Recebido hoje"
              valor={formatarMoeda(resumo.recebido_hoje)}
              cor={C.green}
              bg={C.greenLight}
            />
            <CardMetrica
              icone="⚠️"
              label="Vencidos"
              valor={String(resumo.clientes_vencidos)}
              cor={resumo.clientes_vencidos > 0 ? C.red : C.green}
              bg={resumo.clientes_vencidos > 0 ? C.redLight : C.greenLight}
            />
          </View>

          {/* Aviso limite gratuito próximo */}
          {resumo.clientes_ativos >= 8 && resumo.clientes_ativos < 10 && (
            <TouchableOpacity style={estilos.limiteBanner} onPress={() => router.push('/planos')}>
              <Ionicons name="warning-outline" size={18} color={C.yellow} />
              <Text style={estilos.limiteBannerTexto}>
                {resumo.clientes_ativos}/10 clientes — quase no limite. Faça upgrade para Pro.
              </Text>
              <Text style={estilos.limiteBannerLink}>Ver planos →</Text>
            </TouchableOpacity>
          )}
          {resumo.clientes_ativos >= 10 && (
            <TouchableOpacity style={[estilos.limiteBanner, estilos.limiteBannerCheio]} onPress={() => router.push('/planos')}>
              <Ionicons name="lock-closed-outline" size={18} color={C.red} />
              <Text style={[estilos.limiteBannerTexto, { color: C.red }]}>
                Limite de 10 clientes atingido. Faça upgrade para adicionar mais.
              </Text>
              <Text style={[estilos.limiteBannerLink, { color: C.red }]}>Upgrade →</Text>
            </TouchableOpacity>
          )}

          {topDevedores.length > 0 && (
            <View ref={refSecao} style={estilos.secaoHeader}>
              <Text style={estilos.secaoTitulo}>Maiores saldos</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/clientes')}>
                <Text style={estilos.secaoLink}>Ver todos →</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={
        !carregando ? (
          <View style={estilos.vazio}>
            <View style={estilos.vazioIcone}>
              <Text style={{ fontSize: 40 }}>🎉</Text>
            </View>
            <Text style={estilos.vazioTitulo}>Tudo em dia!</Text>
            <Text style={estilos.vazioTexto}>Nenhum devedor no momento. Registre sua primeira venda.</Text>
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
  container: { padding: 16, paddingBottom: 100, backgroundColor: C.bg },
  logoTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  buscaBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },

  heroBanner: {
    backgroundColor: C.green,
    borderRadius: 22,
    padding: 22,
    marginBottom: 14,
    shadowColor: C.green,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 6,
  },
  heroTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  heroLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.5, textTransform: 'uppercase' },
  heroValor: { fontSize: 38, fontWeight: '800', color: C.white, marginTop: 4, letterSpacing: -1 },
  heroIcone: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroRodape: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  heroBotao: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.white, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99,
  },
  heroBotaoTexto: { color: C.green, fontWeight: '700', fontSize: 13 },

  gradeCards: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  cardMetrica: { flex: 1, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border },
  cardMetricaValor: { fontSize: 20, fontWeight: '800' },
  cardMetricaLabel: { fontSize: 11, color: C.text2, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },

  secaoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  secaoTitulo: { fontSize: 11, fontWeight: '700', color: C.text2, textTransform: 'uppercase', letterSpacing: 0.8 },
  secaoLink: { fontSize: 13, color: C.green, fontWeight: '600' },

  clienteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.card, paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: 16, marginBottom: 8,
    borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  clienteInfo: { flex: 1, gap: 4 },
  clienteNome: { fontSize: 15, fontWeight: '600', color: C.text },
  clienteDireita: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  divida: { fontSize: 15, fontWeight: '700', color: C.text },
  dividaVencida: { color: C.red },

  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.redLight, borderRadius: 12, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: C.redBorder,
  },
  offlineTexto: { flex: 1, fontSize: 12, color: C.red, fontWeight: '500' },
  cobrancaBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.green, borderRadius: 16, padding: 16, marginBottom: 10,
  },
  cobrancaIcone: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  cobrancaTitulo: { fontSize: 14, fontWeight: '800', color: C.white },
  cobrancaSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  vencidoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.red, borderRadius: 16, padding: 16, marginBottom: 14,
    shadowColor: C.red, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  vencidoIcone: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  vencidoTitulo: { fontSize: 14, fontWeight: '800', color: C.white },
  vencidoSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  limiteBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.yellowLight, borderRadius: 12, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: C.yellowBorder,
  },
  limiteBannerCheio: { backgroundColor: C.redLight, borderColor: C.redBorder },
  limiteBannerTexto: { flex: 1, fontSize: 12, color: C.yellow, fontWeight: '500' },
  limiteBannerLink: { fontSize: 12, color: C.yellow, fontWeight: '700' },
  fabCaixa: {
    position: 'absolute', bottom: 100, right: 20,
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: C.card, borderWidth: 2, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
    zIndex: 10,
  },
  vazio: { alignItems: 'center', paddingTop: 48, gap: 10 },
  vazioIcone: { width: 80, height: 80, borderRadius: 24, backgroundColor: C.greenLight, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  vazioTitulo: { fontSize: 18, fontWeight: '700', color: C.text },
  vazioTexto: { fontSize: 14, color: C.text2, textAlign: 'center', lineHeight: 20 },
  vazioBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.green, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  vazioBtnTexto: { color: C.white, fontWeight: '700', fontSize: 14 },
})

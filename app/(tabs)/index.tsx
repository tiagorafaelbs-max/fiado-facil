import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, Modal, ScrollView,
  StyleSheet, RefreshControl, ActivityIndicator, Platform, useWindowDimensions
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RegistradorRapido } from '../../components/ui/RegistradorRapido'
import { SetupModal } from '../../components/ui/SetupModal'
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
import { C } from '../../constants/colors'
import type { Cliente } from '../../types'

export default function DashboardScreen() {
  const router = useRouter()
  const { usuario } = useAuth()
  const insets = useSafeAreaInsets()
  const { resumo, topDevedores, carregando, buscar, plano } = useDashboard()
  const { online, pendentes } = useOffline()
  const { modulos } = useModulos(usuario?.id)
  const { width } = useWindowDimensions()
  const isTablet = width >= 768
  const [diaCobranca, setDiaCobranca] = useState<number | null>(null)
  const [clientesParaCobrar, setClientesParaCobrar] = useState(0)
  const [cobrancaAutoTipo, setCobrancaAutoTipo] = useState<'vencidos' | 'todos'>('vencidos')
  const [tourVisivel, setTourVisivel] = useState(false)
  const [tourSteps, setTourSteps] = useState<TourStep[]>([])
  const [registradorVisivel, setRegistradorVisivel] = useState(false)
  const [setupVisivel, setSetupVisivel] = useState(false)
  const [nomeNegocio, setNomeNegocio] = useState('')
  const [modalVendas, setModalVendas] = useState(false)
  const [vendasDetalhadas, setVendasDetalhadas] = useState<{ id: string; data_venda: string; descricao: string; categoria?: string; valor: number; pago: boolean; clienteNome: string }[]>([])
  const [carregandoVendas, setCarregandoVendas] = useState(false)
  useNotificacoes()
  useAvaliacaoApp()

  const refHero = useRef<View>(null)
  const refCards = useRef<View>(null)
  const refBusca = useRef<View>(null)
  const refSecao = useRef<View>(null)

  function medirElemento(ref: React.RefObject<View | null>): Promise<{ x: number; y: number; width: number; height: number } | null> {
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
      { titulo: '💬 Cobrar via WhatsApp', texto: 'No perfil do cliente, toque no WhatsApp para enviar cobrança com a mensagem já pronta.', posicao: null },
    ])
    setTourVisivel(true)
  }

  async function concluirTour() {
    setTourVisivel(false)
    await AsyncStorage.setItem('@fiado_tour_ok', '1')
  }

  async function abrirRelatorioVendas() {
    setModalVendas(true)
    if (vendasDetalhadas.length > 0) return
    setCarregandoVendas(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id ?? ''
      const { data } = await supabase
        .from('vendas')
        .select('id, data_venda, descricao, categoria, valor, pago, clientes(nome)')
        .eq('usuario_id', uid)
        .order('data_venda', { ascending: false })
      setVendasDetalhadas((data ?? []).map((v: any) => ({
        id: v.id,
        data_venda: v.data_venda,
        descricao: v.descricao ?? '',
        categoria: v.categoria,
        valor: v.valor,
        pago: v.pago,
        clienteNome: v.clientes?.nome ?? 'Desconhecido',
      })))
    } finally {
      setCarregandoVendas(false)
    }
  }

  useEffect(() => {
    // Tour desativado — highlights quebravam em alguns devices
    AsyncStorage.setItem('@fiado_tour_ok', '1')
    // Mostra setup modal uma única vez após cadastro se Pix não configurado
    AsyncStorage.getItem('@fiado_setup_ok').then(async (ok) => {
      if (ok) return
      if (!usuario?.id) return
      const { data } = await supabase.from('perfis').select('chave_pix, dia_cobranca').eq('id', usuario.id).single()
      if (!data?.chave_pix && !data?.dia_cobranca) setSetupVisivel(true)
    })
  }, [usuario?.id])

  useFocusEffect(useCallback(() => { buscar() }, [buscar]))

  useEffect(() => {
    if (!usuario?.id) return
    supabase.from('perfis').select('dia_cobranca, nome_negocio, cobranca_auto_tipo').eq('id', usuario.id).single()
      .then(({ data }) => {
        if (!data) return
        if (data.nome_negocio) setNomeNegocio(data.nome_negocio)
        if (!data.dia_cobranca) return
        const agora = new Date()
        const hoje = agora.getDate()
        const ultimoDiaMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate()
        // Se o dia configurado não existe neste mês, dispara no último dia
        const diaEfetivo = Math.min(data.dia_cobranca, ultimoDiaMes)
        if (hoje === diaEfetivo) {
          setDiaCobranca(data.dia_cobranca)
          setCobrancaAutoTipo(data.cobranca_auto_tipo ?? 'vencidos')
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
    const cor = corStatus(item.status_pagamento ?? 'pendente')
    return (
      <TouchableOpacity style={estilos.clienteRow} onPress={() => router.push(`/cliente/${item.id}`)}>
        <View style={[estilos.clienteStatusBar, { backgroundColor: cor }]} />
        <Avatar nome={item.nome} tamanho={42} />
        <View style={estilos.clienteInfo}>
          <Text style={estilos.clienteNome} numberOfLines={1}>{item.nome}</Text>
          <BadgeStatus status={item.status_pagamento} />
        </View>
        <View style={estilos.clienteDireita}>
          <Text style={[estilos.divida, { color: (item.saldo_devedor ?? 0) > 0 ? C.red : C.green }]}>
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
      {usuario?.id && (
        <SetupModal
          usuarioId={usuario.id}
          visivel={setupVisivel}
          onConcluir={async () => {
            await AsyncStorage.setItem('@fiado_setup_ok', '1')
            setSetupVisivel(false)
          }}
        />
      )}
      {Platform.OS !== 'web' && (
        <TouchableOpacity style={estilos.fabCaixa} onPress={() => setRegistradorVisivel(true)}>
          <Ionicons name="receipt-outline" size={22} color={C.green} />
        </TouchableOpacity>
      )}
      {/* Modal relatório de vendas */}
      <Modal visible={modalVendas} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalVendas(false)}>
        <View style={estilos.modalContainer}>
          <View style={estilos.modalCabecalho}>
            <View>
              <Text style={estilos.modalTitulo}>Relatório de Vendas</Text>
              <Text style={estilos.modalSub}>Todas as vendas registradas</Text>
            </View>
            <TouchableOpacity onPress={() => setModalVendas(false)} style={estilos.modalFechar}>
              <Ionicons name="close" size={20} color={C.text2} />
            </TouchableOpacity>
          </View>

          {/* Resumo */}
          <View style={estilos.modalResumo}>
            <View style={estilos.modalResumoItem}>
              <Text style={estilos.modalResumoValor}>{vendasDetalhadas.length}</Text>
              <Text style={estilos.modalResumoLabel}>Vendas totais</Text>
            </View>
            <View style={estilos.modalResumoDivider} />
            <View style={estilos.modalResumoItem}>
              <Text style={[estilos.modalResumoValor, { color: C.red }]}>
                {formatarMoeda(vendasDetalhadas.filter(v => !v.pago).reduce((s, v) => s + v.valor, 0))}
              </Text>
              <Text style={estilos.modalResumoLabel}>Em aberto</Text>
            </View>
            <View style={estilos.modalResumoDivider} />
            <View style={estilos.modalResumoItem}>
              <Text style={[estilos.modalResumoValor, { color: C.green }]}>
                {formatarMoeda(vendasDetalhadas.filter(v => v.pago).reduce((s, v) => s + v.valor, 0))}
              </Text>
              <Text style={estilos.modalResumoLabel}>Recebido</Text>
            </View>
          </View>

          {carregandoVendas ? (
            <ActivityIndicator color={C.green} style={{ marginTop: 48 }} />
          ) : (
            <FlatList
              data={vendasDetalhadas}
              keyExtractor={(v) => v.id}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingTop: 48 }}>
                  <Text style={{ fontSize: 32 }}>📭</Text>
                  <Text style={{ color: C.text2, marginTop: 8 }}>Nenhuma venda registrada</Text>
                </View>
              }
              renderItem={({ item: v, index }) => {
                const dataFmt = (() => { try { return new Date(v.data_venda + 'T12:00:00').toLocaleDateString('pt-BR') } catch { return v.data_venda } })()
                return (
                  <View style={[estilos.vendaRow, index === vendasDetalhadas.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={[estilos.vendaIcone, { backgroundColor: v.pago ? C.greenLight : C.redLight }]}>
                      <Ionicons name={v.pago ? 'checkmark-circle' : 'cart-outline'} size={18} color={v.pago ? C.green : C.red} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={estilos.vendaCliente} numberOfLines={1}>{v.clienteNome}</Text>
                      <Text style={estilos.vendaMeta} numberOfLines={1}>
                        {dataFmt}{v.descricao ? ` · ${v.descricao}` : ''}{v.categoria ? ` · ${v.categoria}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Text style={[estilos.vendaValor, { color: v.pago ? C.green : C.red }]}>
                        {formatarMoeda(v.valor)}
                      </Text>
                      <Text style={[estilos.vendaStatus, { color: v.pago ? C.green : C.red }]}>
                        {v.pago ? 'Recebido' : 'Em aberto'}
                      </Text>
                    </View>
                  </View>
                )
              }}
            />
          )}
        </View>
      </Modal>

      <FlatList
        data={topDevedores}
        keyExtractor={(i) => i.id}
        renderItem={renderCliente}
        contentContainerStyle={[estilos.container, isTablet && { maxWidth: 720, alignSelf: 'center', width: '100%' }]}
        refreshControl={<RefreshControl refreshing={carregando} onRefresh={buscar} tintColor={C.green} />}
        ListHeaderComponent={
          <View>
            {/* Topo: logo + busca */}
            <View style={[estilos.topBar, { paddingTop: insets.top + 8 }]}>
              <View style={estilos.logoTexto}>
                <Text style={estilos.logoFiado}>Fiado</Text>
                <Text style={estilos.logoApp}>App</Text>
              </View>
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
              <TouchableOpacity
                style={estilos.alertaBanner}
                onPress={() => router.push(cobrancaAutoTipo === 'todos' ? '/cobrancas?aba=aberto' : '/cobrancas')}
              >
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
            <TouchableOpacity ref={refHero} style={estilos.hero} onPress={abrirRelatorioVendas} activeOpacity={0.88}>
              {/* Círculos decorativos */}
              <View style={estilos.heroCirculo1} />
              <View style={estilos.heroCirculo2} />

              {/* Saudação */}
              <Text style={estilos.heroSaudacao}>{saudacao}{nomeNegocio ? `, ${nomeNegocio}` : ''} 👋</Text>

              {/* Valor */}
              <View style={estilos.heroValorRow}>
                <View>
                  <Text style={estilos.heroLabelPrincipal}>TOTAL EM ABERTO</Text>
                  <Text style={estilos.heroValor}>{formatarMoeda(resumo.total_em_aberto)}</Text>
                </View>
                <Ionicons name="receipt-outline" size={22} color="rgba(255,255,255,0.5)" />
              </View>
              <Text style={estilos.heroRelatorioHint}>Toque para ver relatório de vendas</Text>

              {/* Rodapé hero */}
              <View style={estilos.heroRodape}>
                <TouchableOpacity style={estilos.heroStat} onPress={() => router.push('/(tabs)/clientes')}>
                  <Ionicons name="people-outline" size={13} color="rgba(255,255,255,0.7)" />
                  <Text style={estilos.heroStatTexto}>
                    {resumo.clientes_ativos} {resumo.clientes_ativos === 1 ? 'cliente' : 'clientes'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={estilos.heroBotao} onPress={() => router.push('/(tabs)/nova-venda')}>
                  <Ionicons name="add" size={15} color={C.green} />
                  <Text style={estilos.heroBotaoTexto}>Nova venda</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>

            {/* Cards métricas */}
            <View ref={refCards} style={estilos.metricas}>
              <TouchableOpacity
                style={[estilos.metricaCard, { borderLeftColor: C.green }]}
                onPress={() => router.push('/(tabs)/relatorios')}
                activeOpacity={0.75}
              >
                <View style={[estilos.metricaIcone, { backgroundColor: C.greenLight }]}>
                  <Ionicons name="checkmark-circle" size={18} color={C.green} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.metricaValor}>{formatarMoeda(resumo.recebido_hoje)}</Text>
                  <Text style={estilos.metricaLabel}>Recebido hoje</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={C.text3} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[estilos.metricaCard, { borderLeftColor: resumo.clientes_vencidos > 0 ? C.red : C.green }]}
                onPress={() => { if (resumo.clientes_vencidos > 0) router.push('/cobrancas') }}
                activeOpacity={resumo.clientes_vencidos > 0 ? 0.75 : 1}
              >
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
                {resumo.clientes_vencidos > 0 && <Ionicons name="chevron-forward" size={14} color={C.red} />}
              </TouchableOpacity>
            </View>

            {/* Aviso limite — só para plano gratuito */}
            {plano === 'gratuito' && resumo.clientes_ativos >= 8 && resumo.clientes_ativos < 10 && (
              <TouchableOpacity style={estilos.limiteBanner} onPress={() => router.push('/planos')}>
                <Ionicons name="warning-outline" size={16} color={C.yellow} />
                <Text style={estilos.limiteBannerTexto}>{resumo.clientes_ativos}/10 clientes — quase no limite.</Text>
                <Text style={estilos.limiteBannerLink}>Upgrade →</Text>
              </TouchableOpacity>
            )}
            {plano === 'gratuito' && resumo.clientes_ativos >= 10 && (
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
            resumo.clientes_ativos === 0 ? (
              // Usuário novo — sem nenhum cliente ainda
              <View style={estilos.vazio}>
                <View style={estilos.vazioIcone}>
                  <Ionicons name="storefront-outline" size={42} color={C.green} />
                </View>
                <Text style={estilos.vazioTitulo}>Bem-vindo ao FiadoApp! 👋</Text>
                <Text style={estilos.vazioTexto}>Comece cadastrando seu primeiro cliente e registrando uma venda fiada.</Text>
                <TouchableOpacity style={estilos.vazioBtn} onPress={() => router.push('/(tabs)/clientes')}>
                  <Ionicons name="person-add-outline" size={16} color={C.white} />
                  <Text style={estilos.vazioBtnTexto}>Cadastrar primeiro cliente</Text>
                </TouchableOpacity>
                <TouchableOpacity style={estilos.vazioBtnSecundario} onPress={() => router.push('/(tabs)/nova-venda')}>
                  <Text style={estilos.vazioBtnSecundarioTexto}>Já tenho cliente — registrar venda</Text>
                </TouchableOpacity>
              </View>
            ) : (
              // Tem clientes, mas nenhum devedor — todos em dia
              <View style={estilos.vazio}>
                <View style={[estilos.vazioIcone, { backgroundColor: C.greenLight }]}>
                  <Ionicons name="checkmark-circle" size={42} color={C.green} />
                </View>
                <Text style={estilos.vazioTitulo}>Tudo em dia! 🎉</Text>
                <Text style={estilos.vazioTexto}>Nenhum cliente com saldo em aberto. Continue registrando suas vendas.</Text>
                <TouchableOpacity style={estilos.vazioBtn} onPress={() => router.push('/(tabs)/nova-venda')}>
                  <Ionicons name="add" size={16} color={C.white} />
                  <Text style={estilos.vazioBtnTexto}>Registrar nova venda</Text>
                </TouchableOpacity>
              </View>
            )
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
    marginBottom: 14,
  },
  logoTexto: { flexDirection: 'row', alignItems: 'baseline', gap: 0 },
  logoFiado: { fontSize: 26, fontWeight: '900', color: C.text, letterSpacing: -1 },
  logoApp: { fontSize: 26, fontWeight: '900', color: C.green, letterSpacing: -1 },
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
    backgroundColor: C.greenDark,
    borderRadius: 26,
    padding: 24,
    marginBottom: 14,
    overflow: 'hidden',
    shadowColor: C.greenDark,
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
  heroValorRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  heroLabelPrincipal: {
    fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4,
  },
  heroValor: {
    fontSize: 42, fontWeight: '900', color: C.white,
    letterSpacing: -1.5,
  },
  heroRelatorioHint: {
    fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: '500',
    marginTop: 6, marginBottom: 16,
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
  heroBotaoTexto: { color: C.greenDark, fontWeight: '800', fontSize: 13 },

  // ── Métricas ──────────────────────────────────────────────────────────────────
  metricas: { gap: 10, marginBottom: 16 },
  metricaCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.card, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: C.border,
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

  // ── Modal Relatório Vendas ────────────────────────────────────────────────────
  modalContainer: { flex: 1, backgroundColor: C.bg },
  modalCabecalho: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    padding: 20, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  modalTitulo: { fontSize: 18, fontWeight: '800', color: C.text },
  modalSub: { fontSize: 12, color: C.text3, marginTop: 2 },
  modalFechar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  modalResumo: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginVertical: 14,
    backgroundColor: C.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: C.border,
  },
  modalResumoItem: { flex: 1, alignItems: 'center' },
  modalResumoValor: { fontSize: 17, fontWeight: '800', color: C.text },
  modalResumoLabel: { fontSize: 10, color: C.text3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 3 },
  modalResumoDivider: { width: 1, height: 36, backgroundColor: C.border },
  vendaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  vendaIcone: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  vendaCliente: { fontSize: 14, fontWeight: '700', color: C.text },
  vendaMeta: { fontSize: 11, color: C.text3, marginTop: 2 },
  vendaValor: { fontSize: 14, fontWeight: '800' },
  vendaStatus: { fontSize: 10, fontWeight: '600' },

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
  vazioBtnSecundario: { paddingVertical: 10 },
  vazioBtnSecundarioTexto: { color: C.green, fontWeight: '600', fontSize: 13 },
})

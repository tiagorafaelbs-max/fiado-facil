import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, Modal, ActivityIndicator, Platform, Image, useWindowDimensions,
  KeyboardAvoidingView, Linking
} from 'react-native'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import QRCode from 'react-native-qrcode-svg'
import { supabase } from '../../lib/supabase'
import { useVendas } from '../../hooks/useVendas'
import { useClientes } from '../../hooks/useClientes'
import { useAuth } from '../../hooks/useAuth'
import { Avatar } from '../../components/ui/Avatar'
import { BadgeStatus } from '../../components/ui/BadgeStatus'
import { Campo } from '../../components/ui/Campo'
import { Botao } from '../../components/ui/Botao'
import { cobrarViaWhatsApp, montarExtratoWhatsApp } from '../../lib/whatsapp'
import { gerarExtratoCliente } from '../../lib/pdf'
import { gerarPayloadPix } from '../../lib/pix'
import { useModulos } from '../../hooks/useModulos'
import { formatarMoeda } from '../../lib/validacao'
import { C } from '../../constants/colors'
import { useBeep } from '../../hooks/useBeep'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Cliente, Venda } from '../../types'

interface Pagamento {
  id: string; valor: number; data_pagamento: string; observacao?: string
}

type ItemHistorico =
  | { tipo: 'venda'; data: string; item: Venda }
  | { tipo: 'pagamento'; data: string; item: Pagamento }

function calcularScore(vendas: Venda[], pagamentos: Pagamento[]): { label: string; cor: string; estrelas: number; detalhes: string } {
  const comVencimento = vendas.filter(v => v.data_vencimento)
  const totalPagamentos = pagamentos.reduce((s, p) => s + p.valor, 0)
  const totalVendas = vendas.reduce((s, v) => s + v.valor, 0)
  const taxaPagamento = totalVendas > 0 ? totalPagamentos / totalVendas : 1

  const hoje = new Date()
  const atrasadas = comVencimento.filter(v => {
    const venc = new Date(v.data_vencimento!)
    return !v.pago && venc < hoje
  }).length

  if (atrasadas === 0 && taxaPagamento >= 0.8) return { label: 'Ótimo pagador', cor: C.green, estrelas: 3, detalhes: 'Sempre paga em dia' }
  if (atrasadas <= 1 && taxaPagamento >= 0.5) return { label: 'Bom pagador', cor: C.yellow, estrelas: 2, detalhes: `${atrasadas} venc. em atraso` }
  return { label: 'Devedor frequente', cor: C.red, estrelas: 1, detalhes: `${atrasadas} venc. em atraso` }
}

export default function DetalheClienteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const navigation = useNavigation()
  const router = useRouter()
  const { usuario } = useAuth()
  const { vendas, carregando, buscar, registrarPagamento, excluirVenda, editarVenda, excluirPagamento } = useVendas(id)
  const { width } = useWindowDimensions()
  const isTablet = width >= 768
  const { modulos } = useModulos(usuario?.id)
  const { tocar } = useBeep()
  const { excluir: excluirCliente } = useClientes()

  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [modalPagamento, setModalPagamento] = useState(false)
  const [modalPix, setModalPix] = useState(false)
  const [valorPagamento, setValorPagamento] = useState('')
  const [observacaoPagamento, setObservacaoPagamento] = useState('')
  const [erroPagamento, setErroPagamento] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [perfil, setPerfil] = useState<{ nome_negocio: string; chave_pix?: string } | null>(null)
  const [gerandoPDF, setGerandoPDF] = useState(false)
  const [modalEditarVenda, setModalEditarVenda] = useState<{ id: string; descricao: string; valor: string; data_vencimento: string; categoria: string } | null>(null)
  const [editandoVenda, setEditandoVenda] = useState(false)
  const [modalEditarPagamento, setModalEditarPagamento] = useState<{ id: string; valor: string; data: string; observacao: string } | null>(null)
  const [editandoPagamento, setEditandoPagamento] = useState(false)
  const [modalDividaAnterior, setModalDividaAnterior] = useState(false)
  const [dividaValor, setDividaValor] = useState('')
  const [dividaDescricao, setDividaDescricao] = useState('')
  const [dividaData, setDividaData] = useState('')
  const [dividaErro, setDividaErro] = useState('')
  const [salvandoDivida, setSalvandoDivida] = useState(false)

  const carregarCliente = useCallback(async () => {
    const { data } = await supabase.from('clientes_com_saldo').select('*').eq('id', id).single()
    if (data) {
      setCliente(data)
      navigation.setOptions({ title: data.nome })
    }
  }, [id])

  const carregarPagamentos = useCallback(async () => {
    const { data } = await supabase.from('pagamentos')
      .select('id, valor, data_pagamento, observacao')
      .eq('cliente_id', id).order('data_pagamento', { ascending: false })
    setPagamentos(data ?? [])
  }, [id])

  useEffect(() => {
    carregarCliente(); buscar(); carregarPagamentos()
    if (usuario?.id) {
      supabase.from('perfis').select('nome_negocio, chave_pix').eq('id', usuario.id).single()
        .then(({ data }) => { if (data) setPerfil(data) })
    }
  }, [])

  async function handlePagamento() {
    const valor = parseFloat(valorPagamento.replace(',', '.'))
    setErroPagamento('')
    if (isNaN(valor) || valor <= 0) { setErroPagamento('Informe um valor válido.'); return }
    if (cliente && valor > (cliente.saldo_devedor ?? 0)) { setErroPagamento('Valor maior que o saldo devedor.'); return }
    setSalvando(true)
    try {
      await registrarPagamento({ cliente_id: id, valor, observacao: observacaoPagamento || undefined })
      await Promise.all([carregarCliente(), carregarPagamentos()])
      setModalPagamento(false); setValorPagamento(''); setObservacaoPagamento('')
      tocar()
    } catch (e: any) {
      setErroPagamento(e.message)
    } finally {
      setSalvando(false)
    }
  }

  async function handleCobrar() {
    if (!cliente) return
    const nomeNeg = perfil?.nome_negocio || 'nosso estabelecimento'
    try {
      await cobrarViaWhatsApp(cliente, cliente.saldo_devedor ?? 0, nomeNeg)
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert(e.message)
      else Alert.alert('Erro', e.message)
    }
  }

  async function handleEnviarExtrato() {
    if (!cliente) return
    const nomeNeg = perfil?.nome_negocio || 'nosso estabelecimento'
    const urlOuTexto = montarExtratoWhatsApp(cliente, vendas, nomeNeg)
    if (urlOuTexto.startsWith('https://')) {
      if (Platform.OS === 'web') window.open(urlOuTexto, '_blank')
      else await Linking.openURL(urlOuTexto)
    } else {
      if (Platform.OS === 'web') {
        window.alert('Cliente sem telefone. Copie o extrato:\n\n' + urlOuTexto)
      } else {
        Alert.alert('Extrato', urlOuTexto, [{ text: 'OK' }])
      }
    }
  }

  function confirmarExclusao(titulo: string, msg: string, onConfirmar: () => void) {
    if (Platform.OS === 'web') {
      if (window.confirm(`${titulo}\n\n${msg}`)) onConfirmar()
    } else {
      Alert.alert(titulo, msg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: onConfirmar },
      ])
    }
  }

  async function handleExcluirVenda(vendaId: string) {
    confirmarExclusao('Excluir venda', 'Esta ação não pode ser desfeita.', async () => {
      try {
        await excluirVenda(vendaId)
        await carregarCliente()
      } catch (e: any) {
        Alert.alert('Erro', e.message)
      }
    })
  }

  async function handleExcluirPagamento(pagId: string) {
    confirmarExclusao('Excluir pagamento', 'Esta ação não pode ser desfeita.', async () => {
      try {
        await excluirPagamento(pagId)
        await Promise.all([carregarCliente(), carregarPagamentos()])
      } catch (e: any) {
        Alert.alert('Erro', e.message)
      }
    })
  }

  function formatarData(t: string) {
    const nums = t.replace(/\D/g, '').slice(0, 8)
    let fmt = nums
    if (nums.length > 2) fmt = nums.slice(0, 2) + '/' + nums.slice(2)
    if (nums.length > 4) fmt = nums.slice(0, 2) + '/' + nums.slice(2, 4) + '/' + nums.slice(4)
    return fmt
  }

  function isoParaDisplay(iso: string) {
    if (!iso || iso.length < 10) return ''
    const [aaaa, mm, dd] = iso.split('-')
    return `${dd}/${mm}/${aaaa}`
  }

  function displayParaIso(display: string) {
    if (display.length < 10) return null
    const [dd, mm, aaaa] = display.split('/')
    if (!dd || !mm || !aaaa) return null
    return `${aaaa}-${mm}-${dd}`
  }

  async function handleSalvarEdicaoVenda() {
    if (!modalEditarVenda) return
    const valor = parseFloat(modalEditarVenda.valor.replace(',', '.'))
    if (isNaN(valor) || valor <= 0) return
    setEditandoVenda(true)
    try {
      await editarVenda(modalEditarVenda.id, {
        descricao: modalEditarVenda.descricao,
        valor,
        categoria: modalEditarVenda.categoria || undefined,
        data_vencimento: displayParaIso(modalEditarVenda.data_vencimento),
      })
      await carregarCliente()
      setModalEditarVenda(null)
    } catch (e: any) {
      Alert.alert('Erro', e.message)
    } finally {
      setEditandoVenda(false)
    }
  }

  async function handleGerarPDF() {
    if (!cliente) return
    const nomeNeg = perfil?.nome_negocio || 'nosso estabelecimento'
    setGerandoPDF(true)
    try {
      await gerarExtratoCliente(cliente, vendas, pagamentos, nomeNeg)
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert('PDF não suportado no navegador. Use o app instalado.')
      else Alert.alert('Erro', e.message)
    } finally {
      setGerandoPDF(false)
    }
  }

  function handleExcluirCliente() {
    const msg = `Isso vai apagar "${cliente?.nome}" e todo o histórico de vendas e pagamentos. Esta ação não pode ser desfeita.`
    if (Platform.OS === 'web') {
      if (!window.confirm(`Excluir cliente?\n\n${msg}`)) return
      excluirCliente(id).then(() => router.replace('/(tabs)/clientes')).catch(e => window.alert(e.message))
    } else {
      Alert.alert('Excluir cliente?', msg, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir', style: 'destructive', onPress: async () => {
            try {
              await excluirCliente(id)
              router.replace('/(tabs)/clientes')
            } catch (e: any) {
              Alert.alert('Erro', e.message)
            }
          },
        },
      ])
    }
  }

  async function handleAdicionarDividaAnterior() {
    const valor = parseFloat(dividaValor.replace(',', '.'))
    setDividaErro('')
    if (isNaN(valor) || valor <= 0) { setDividaErro('Informe um valor válido.'); return }
    setSalvandoDivida(true)
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession()
      if (!session?.user) throw new Error('Sessão expirada.')
      // converte DD/MM/AAAA → AAAA-MM-DD, ou usa hoje
      let dataISO = new Date().toISOString().split('T')[0]
      if (dividaData.length === 10 && dividaData.includes('/')) {
        const [dd, mm, aaaa] = dividaData.split('/')
        if (dd && mm && aaaa) dataISO = `${aaaa}-${mm}-${dd}`
      }
      const { supabase } = await import('../../lib/supabase')
      await supabase.from('vendas').insert({
        cliente_id: id,
        usuario_id: session.user.id,
        descricao: dividaDescricao.trim() || 'Dívida anterior',
        valor,
        data_venda: dataISO,
        categoria: 'Dívida anterior',
        pago: false,
      })
      await Promise.all([carregarCliente(), buscar()])
      setModalDividaAnterior(false)
      setDividaValor(''); setDividaDescricao(''); setDividaData('')
      tocar()
    } catch (e: any) {
      setDividaErro(e.message ?? 'Erro ao salvar.')
    } finally {
      setSalvandoDivida(false)
    }
  }

  async function handleSalvarEdicaoPagamento() {
    if (!modalEditarPagamento) return
    const valor = parseFloat(modalEditarPagamento.valor.replace(',', '.'))
    if (isNaN(valor) || valor <= 0) return
    setEditandoPagamento(true)
    try {
      const { supabase } = await import('../../lib/supabase')
      // converte DD/MM/AAAA → AAAA-MM-DD
      let dataISO = modalEditarPagamento.data
      if (modalEditarPagamento.data.length === 10 && modalEditarPagamento.data.includes('/')) {
        const [dd, mm, aaaa] = modalEditarPagamento.data.split('/')
        if (dd && mm && aaaa) dataISO = `${aaaa}-${mm}-${dd}`
      }
      await supabase.from('pagamentos').update({
        valor,
        data_pagamento: dataISO,
        observacao: modalEditarPagamento.observacao || null,
      }).eq('id', modalEditarPagamento.id)
      await Promise.all([carregarCliente(), carregarPagamentos()])
      setModalEditarPagamento(null)
    } catch (e: any) {
      Alert.alert('Erro', e.message)
    } finally {
      setEditandoPagamento(false)
    }
  }

  if (!cliente) return <ActivityIndicator color={C.green} style={{ flex: 1 }} />

  const temSaldo = (cliente.saldo_devedor ?? 0) > 0
  const temLimite = modulos.limite_credito && (cliente.limite_credito ?? 0) > 0
  const percentualLimite = temLimite ? Math.min(((cliente.saldo_devedor ?? 0) / cliente.limite_credito!) * 100, 100) : 0
  const score = modulos.score_cliente ? calcularScore(vendas, pagamentos) : null
  const pixPayload = modulos.qr_pix && perfil?.chave_pix ? gerarPayloadPix(perfil.chave_pix, perfil.nome_negocio, cliente.saldo_devedor ?? 0) : null

  const historico: ItemHistorico[] = [
    ...vendas.map(v => ({ tipo: 'venda' as const, data: v.data_venda, item: v })),
    ...pagamentos.map(p => ({ tipo: 'pagamento' as const, data: p.data_pagamento, item: p })),
  ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())

  return (
    <ScrollView style={estilos.container} contentContainerStyle={[estilos.content, isTablet && estilos.contentTablet]}>

      {/* Header cliente */}
      <View style={estilos.clienteCard}>
        {/* linha topo: avatar + info + lixeira */}
        <View style={estilos.clienteCardTop}>
          <Avatar nome={cliente.nome} tamanho={60} />
          <View style={{ flex: 1 }}>
            <Text style={estilos.nome} numberOfLines={2}>{cliente.nome}</Text>
            {cliente.empresa && (
              <View style={estilos.telefoneRow}>
                <Ionicons name="business-outline" size={12} color={C.green} />
                <Text style={[estilos.telefone, { color: C.green, fontWeight: '600' }]}>{cliente.empresa}</Text>
              </View>
            )}
            {cliente.telefone && (
              <View style={estilos.telefoneRow}>
                <Ionicons name="call-outline" size={12} color={C.text3} />
                <Text style={estilos.telefone}>{cliente.telefone}</Text>
              </View>
            )}
            {cliente.endereco && (
              <View style={estilos.telefoneRow}>
                <Ionicons name="location-outline" size={12} color={C.text3} />
                <Text style={estilos.telefone}>{cliente.endereco}</Text>
              </View>
            )}
            <View style={{ marginTop: 6 }}>
              <BadgeStatus status={cliente.status_pagamento} />
            </View>
          </View>
          <TouchableOpacity style={estilos.btnExcluirCliente} onPress={handleExcluirCliente} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={18} color={C.red} />
          </TouchableOpacity>
        </View>
        {/* Score badge abaixo da linha de info */}
        {score && (
          <View style={[estilos.scoreBadge, { backgroundColor: score.cor + '20', borderColor: score.cor + '40' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 14 }}>{'⭐'.repeat(score.estrelas)}</Text>
              <Text style={[estilos.scoreLabel, { color: score.cor }]}>{score.label}</Text>
            </View>
            <Text style={estilos.scoreDetalhes}>{score.detalhes}</Text>
          </View>
        )}
      </View>

      {/* Saldo devedor */}
      <View style={[estilos.saldoBox, temSaldo ? estilos.saldoBoxDevendo : estilos.saldoBoxOk]}>
        <Text style={estilos.saldoLabel}>Saldo devedor</Text>
        <Text style={[estilos.saldo, temSaldo ? estilos.saldoDevendo : estilos.saldoOk]}>
          {formatarMoeda(cliente.saldo_devedor ?? 0)}
        </Text>
        {!temSaldo && <Text style={estilos.saldoEmDia}>✓ Em dia</Text>}

        {/* Barra de limite de crédito */}
        {temLimite && (
          <View style={estilos.limiteContainer}>
            <View style={estilos.limiteInfo}>
              <Text style={estilos.limiteTitulo}>Limite de crédito</Text>
              <Text style={estilos.limiteValor}>{formatarMoeda(cliente.saldo_devedor ?? 0)} / {formatarMoeda(cliente.limite_credito!)}</Text>
            </View>
            <View style={estilos.limiteBarra}>
              <View style={[estilos.limitePreenchido, {
                width: `${percentualLimite}%` as any,
                backgroundColor: percentualLimite >= 90 ? C.red : percentualLimite >= 70 ? C.yellow : C.green,
              }]} />
            </View>
            {percentualLimite >= 90 && (
              <Text style={estilos.limiteAviso}>⚠ Limite quase atingido</Text>
            )}
          </View>
        )}
      </View>

      {/* Ações */}
      <View style={[estilos.acoes, isTablet && estilos.acoesTablet]}>
        {temSaldo && (
          <TouchableOpacity style={estilos.btnPagar} onPress={() => setModalPagamento(true)}>
            <Ionicons name="cash-outline" size={18} color={C.white} />
            <Text style={estilos.btnPagarTexto}>Registrar pagamento</Text>
          </TouchableOpacity>
        )}
        {temSaldo && cliente.telefone && (
          <TouchableOpacity style={estilos.btnWhats} onPress={handleCobrar}>
            <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
            <Text style={estilos.btnWhatsTexto}>Cobrar</Text>
          </TouchableOpacity>
        )}
        {pixPayload && temSaldo && (
          <TouchableOpacity style={estilos.btnPix} onPress={() => setModalPix(true)}>
            <Ionicons name="qr-code-outline" size={20} color={C.green} />
            <Text style={estilos.btnPixTexto}>QR Pix</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={estilos.btnPDF} onPress={handleGerarPDF} disabled={gerandoPDF}>
          <Ionicons name="document-text-outline" size={18} color={C.text2} />
          <Text style={estilos.btnPDFTexto}>{gerandoPDF ? 'Gerando...' : 'Extrato PDF'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={estilos.btnWhats} onPress={handleEnviarExtrato}>
          <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
          <Text style={estilos.btnWhatsTexto}>Extrato WhatsApp</Text>
        </TouchableOpacity>
        <TouchableOpacity style={estilos.btnDividaAnterior} onPress={() => setModalDividaAnterior(true)}>
          <Ionicons name="time-outline" size={18} color={C.yellow} />
          <Text style={estilos.btnDividaAnteriorTexto}>Dívida anterior</Text>
        </TouchableOpacity>
      </View>

      {/* Histórico unificado */}
      <View style={estilos.historicoCard}>
        <Text style={estilos.historicoTitulo}>Histórico completo</Text>
        {carregando ? (
          <ActivityIndicator color={C.green} style={{ marginVertical: 24 }} />
        ) : historico.length === 0 ? (
          <View style={estilos.vazio}>
            <Text style={{ fontSize: 28 }}>📋</Text>
            <Text style={estilos.vazioTexto}>Nenhum lançamento ainda.</Text>
          </View>
        ) : (
          historico.map((h, i) => {
            const ultimo = i === historico.length - 1
            if (h.tipo === 'venda') {
              const v = h.item as Venda
              return (
                <View key={`v-${v.id}`} style={[estilos.lancamento, ultimo && { borderBottomWidth: 0 }]}>
                  <View style={[estilos.lancIcone, { backgroundColor: C.redLight }]}>
                    <Ionicons name="receipt-outline" size={14} color={C.red} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={estilos.lancDesc}>{v.descricao}</Text>
                    <View style={estilos.lancMeta}>
                      <Text style={estilos.lancData}>{format(new Date(v.data_venda + 'T12:00:00'), "d MMM yyyy", { locale: ptBR })}</Text>
                      {v.categoria && <View style={estilos.catBadge}><Text style={estilos.catBadgeTexto}>{v.categoria}</Text></View>}
                      {v.data_vencimento && <Text style={estilos.lancVenc}>Vence: {format(new Date(v.data_vencimento + 'T12:00:00'), "d MMM", { locale: ptBR })}</Text>}
                    </View>
                    {v.foto_url && (
                      <Image source={{ uri: v.foto_url }} style={estilos.fotoThumb} resizeMode="cover" />
                    )}
                  </View>
                  <View style={estilos.lancAcoes}>
                    <Text style={[estilos.lancValor, { color: C.red }]}>- {formatarMoeda(v.valor)}</Text>
                    <View style={estilos.lancBotoes}>
                      <TouchableOpacity onPress={() => setModalEditarVenda({ id: v.id, descricao: v.descricao, valor: String(v.valor), data_vencimento: isoParaDisplay(v.data_vencimento ?? ''), categoria: v.categoria ?? '' })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="pencil-outline" size={14} color={C.text2} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleExcluirVenda(v.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="trash-outline" size={14} color={C.red} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )
            } else {
              const p = h.item as Pagamento
              return (
                <View key={`p-${p.id}`} style={[estilos.lancamento, ultimo && { borderBottomWidth: 0 }]}>
                  <View style={[estilos.lancIcone, { backgroundColor: C.greenLight }]}>
                    <Ionicons name="checkmark" size={14} color={C.green} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={estilos.lancDesc}>{p.observacao ? p.observacao : 'Pagamento recebido'}</Text>
                    <Text style={estilos.lancData}>{format(new Date(p.data_pagamento + 'T12:00:00'), "d MMM yyyy", { locale: ptBR })}</Text>
                  </View>
                  <View style={estilos.lancAcoes}>
                    <Text style={[estilos.lancValor, { color: C.green }]}>+ {formatarMoeda(p.valor)}</Text>
                    <View style={estilos.lancBotoes}>
                      <TouchableOpacity onPress={() => setModalEditarPagamento({ id: p.id, valor: String(p.valor), data: p.data_pagamento.split('-').reverse().join('/'), observacao: p.observacao ?? '' })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="pencil-outline" size={14} color={C.text2} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleExcluirPagamento(p.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="trash-outline" size={14} color={C.red} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )
            }
          })
        )}
      </View>

      {/* Modal pagamento */}
      <Modal visible={modalPagamento} animationType="slide" presentationStyle="formSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={estilos.modal}>
            <View style={estilos.modalHandle} />
            <View style={estilos.modalHeader}>
              <View>
                <Text style={estilos.modalTitulo}>Registrar pagamento</Text>
                <Text style={estilos.modalSub}>Saldo devedor: {formatarMoeda(cliente.saldo_devedor ?? 0)}</Text>
              </View>
              <TouchableOpacity style={estilos.fecharBtn} onPress={() => { setModalPagamento(false); setValorPagamento(''); setObservacaoPagamento(''); setErroPagamento('') }}>
                <Ionicons name="close" size={20} color={C.text2} />
              </TouchableOpacity>
            </View>
            <Campo label="Valor recebido (R$)" value={valorPagamento} onChangeText={setValorPagamento} keyboardType="decimal-pad" placeholder="0,00" erro={erroPagamento} />
            <Campo label="Observação (opcional)" value={observacaoPagamento} onChangeText={setObservacaoPagamento} placeholder="Ex: Pix, dinheiro, parte da dívida..." />
            {pixPayload && (
              <TouchableOpacity style={estilos.btnVerPix} onPress={() => { setModalPagamento(false); setModalPix(true) }}>
                <Ionicons name="qr-code-outline" size={16} color={C.green} />
                <Text style={estilos.btnVerPixTexto}>Ver QR Code Pix</Text>
              </TouchableOpacity>
            )}
            <Botao titulo="Confirmar pagamento" onPress={handlePagamento} carregando={salvando} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal editar venda */}
      <Modal visible={!!modalEditarVenda} animationType="slide" presentationStyle="formSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={estilos.modal}>
            <View style={estilos.modalHandle} />
            <View style={estilos.modalHeader}>
              <Text style={estilos.modalTitulo}>Editar venda</Text>
              <TouchableOpacity style={estilos.fecharBtn} onPress={() => setModalEditarVenda(null)}>
                <Ionicons name="close" size={20} color={C.text2} />
              </TouchableOpacity>
            </View>
            <Campo
              label="Descrição"
              value={modalEditarVenda?.descricao ?? ''}
              onChangeText={(v) => setModalEditarVenda(prev => prev ? { ...prev, descricao: v } : null)}
            />
            <Campo
              label="Valor (R$)"
              value={modalEditarVenda?.valor ?? ''}
              onChangeText={(v) => setModalEditarVenda(prev => prev ? { ...prev, valor: v } : null)}
              keyboardType="decimal-pad"
            />
            <Campo
              label="Categoria"
              value={modalEditarVenda?.categoria ?? ''}
              onChangeText={(v) => setModalEditarVenda(prev => prev ? { ...prev, categoria: v } : null)}
              placeholder="Ex: Alimentação, Serviços..."
            />
            <Campo
              label="Data de vencimento"
              value={modalEditarVenda?.data_vencimento ?? ''}
              onChangeText={(v) => setModalEditarVenda(prev => prev ? { ...prev, data_vencimento: formatarData(v) } : null)}
              placeholder="DD/MM/AAAA"
              keyboardType="numeric"
              maxLength={10}
            />
            <Botao titulo="Salvar alterações" onPress={handleSalvarEdicaoVenda} carregando={editandoVenda} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal dívida anterior */}
      <Modal visible={modalDividaAnterior} animationType="slide" presentationStyle="formSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={estilos.modal}>
            <View style={estilos.modalHandle} />
            <View style={estilos.modalHeader}>
              <View>
                <Text style={estilos.modalTitulo}>Dívida anterior</Text>
                <Text style={estilos.modalSub}>Registre um saldo que já existia</Text>
              </View>
              <TouchableOpacity style={estilos.fecharBtn} onPress={() => { setModalDividaAnterior(false); setDividaValor(''); setDividaDescricao(''); setDividaData(''); setDividaErro('') }}>
                <Ionicons name="close" size={20} color={C.text2} />
              </TouchableOpacity>
            </View>
            <Campo
              label="Valor da dívida (R$) *"
              value={dividaValor}
              onChangeText={setDividaValor}
              keyboardType="decimal-pad"
              placeholder="0,00"
            />
            <Campo
              label="Descrição (opcional)"
              value={dividaDescricao}
              onChangeText={setDividaDescricao}
              placeholder="Ex: Conta de março, mercadoria anterior..."
            />
            <Campo
              label="Data da dívida (opcional)"
              value={dividaData}
              onChangeText={(v) => {
                const nums = v.replace(/D/g, '').slice(0, 8)
                let fmt = nums
                if (nums.length > 2) fmt = nums.slice(0, 2) + '/' + nums.slice(2)
                if (nums.length > 4) fmt = nums.slice(0, 2) + '/' + nums.slice(2, 4) + '/' + nums.slice(4)
                setDividaData(fmt)
              }}
              placeholder="DD/MM/AAAA (padrão: hoje)"
              keyboardType="numeric"
              maxLength={10}
            />
            {dividaErro ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEE2E2', borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#FECACA' }}>
                <Ionicons name="alert-circle" size={16} color={C.red} />
                <Text style={{ color: C.red, fontSize: 13, fontWeight: '500', flex: 1 }}>{dividaErro}</Text>
              </View>
            ) : null}
            <Botao titulo="Adicionar dívida" onPress={handleAdicionarDividaAnterior} carregando={salvandoDivida} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal editar pagamento */}
      <Modal visible={!!modalEditarPagamento} animationType="slide" presentationStyle="formSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={estilos.modal}>
            <View style={estilos.modalHandle} />
            <View style={estilos.modalHeader}>
              <Text style={estilos.modalTitulo}>Editar pagamento</Text>
              <TouchableOpacity style={estilos.fecharBtn} onPress={() => setModalEditarPagamento(null)}>
                <Ionicons name="close" size={20} color={C.text2} />
              </TouchableOpacity>
            </View>
            <Campo
              label="Valor recebido (R$)"
              value={modalEditarPagamento?.valor ?? ''}
              onChangeText={(v) => setModalEditarPagamento(prev => prev ? { ...prev, valor: v } : null)}
              keyboardType="decimal-pad"
              placeholder="0,00"
            />
            <Campo
              label="Data do pagamento"
              value={modalEditarPagamento?.data ?? ''}
              onChangeText={(v) => {
                const nums = v.replace(/D/g, '').slice(0, 8)
                let fmt = nums
                if (nums.length > 2) fmt = nums.slice(0, 2) + '/' + nums.slice(2)
                if (nums.length > 4) fmt = nums.slice(0, 2) + '/' + nums.slice(2, 4) + '/' + nums.slice(4)
                setModalEditarPagamento(prev => prev ? { ...prev, data: fmt } : null)
              }}
              placeholder="DD/MM/AAAA"
              keyboardType="numeric"
              maxLength={10}
            />
            <Campo
              label="Observação (opcional)"
              value={modalEditarPagamento?.observacao ?? ''}
              onChangeText={(v) => setModalEditarPagamento(prev => prev ? { ...prev, observacao: v } : null)}
              placeholder="Ex: Pix, dinheiro, parcial..."
            />
            <Botao titulo="Salvar alterações" onPress={handleSalvarEdicaoPagamento} carregando={editandoPagamento} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal QR Pix */}
      <Modal visible={modalPix} animationType="slide" presentationStyle="formSheet">
        <View style={estilos.modal}>
          <View style={estilos.modalHandle} />
          <View style={estilos.modalHeader}>
            <View>
              <Text style={estilos.modalTitulo}>QR Code Pix</Text>
              <Text style={estilos.modalSub}>Mostre para {cliente.nome} pagar</Text>
            </View>
            <TouchableOpacity style={estilos.fecharBtn} onPress={() => setModalPix(false)}>
              <Ionicons name="close" size={20} color={C.text2} />
            </TouchableOpacity>
          </View>
          <View style={estilos.qrContainer}>
            {pixPayload && (
              <QRCode value={pixPayload} size={220} color={C.text} backgroundColor={C.white} />
            )}
            <Text style={estilos.qrValor}>{formatarMoeda(cliente.saldo_devedor ?? 0)}</Text>
            <Text style={estilos.qrChave}>Chave: {perfil?.chave_pix}</Text>
          </View>
          <Text style={estilos.qrInfo}>
            O cliente lê o QR Code no app do banco e o valor é creditado automaticamente.
          </Text>
        </View>
      </Modal>

    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  contentTablet: { maxWidth: 720, alignSelf: 'center', width: '100%' },
  clienteCard: {
    backgroundColor: C.card, borderRadius: 18, padding: 18, marginBottom: 12,
    borderWidth: 1, borderColor: C.border, gap: 12,
  },
  clienteCardTop: {
    flexDirection: 'row', gap: 14, alignItems: 'flex-start',
  },
  nome: { fontSize: 18, fontWeight: '800', color: C.text },
  telefoneRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  telefone: { fontSize: 13, color: C.text2 },
  scoreBadge: {
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, alignItems: 'flex-start', gap: 2,
  },
  btnExcluirCliente: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.redLight, borderWidth: 1, borderColor: C.redBorder, alignItems: 'center', justifyContent: 'center' },
  scoreLabel: { fontSize: 12, fontWeight: '700' },
  scoreDetalhes: { fontSize: 11, color: C.text2 },
  saldoBox: { borderRadius: 18, padding: 20, alignItems: 'center', marginBottom: 12, borderWidth: 1 },
  saldoBoxDevendo: { backgroundColor: C.redLight, borderColor: C.redBorder },
  saldoBoxOk: { backgroundColor: C.greenLight, borderColor: C.greenMid },
  saldoLabel: { fontSize: 12, fontWeight: '600', color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5 },
  saldo: { fontSize: 36, fontWeight: '800', marginTop: 4 },
  saldoDevendo: { color: C.red },
  saldoOk: { color: C.green },
  saldoEmDia: { fontSize: 13, color: C.green, fontWeight: '600', marginTop: 4 },
  limiteContainer: { width: '100%', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' },
  limiteInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  limiteTitulo: { fontSize: 11, color: C.text2, fontWeight: '600' },
  limiteValor: { fontSize: 11, color: C.text2, fontWeight: '600' },
  limiteBarra: { height: 6, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 99, overflow: 'hidden' },
  limitePreenchido: { height: 6, borderRadius: 99 },
  limiteAviso: { fontSize: 11, color: C.red, fontWeight: '600', marginTop: 6, textAlign: 'center' },
  acoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  acoesTablet: { flexWrap: 'nowrap' },
  btnPagar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.green, borderRadius: 14, paddingVertical: 14, minWidth: 140,
  },
  btnPagarTexto: { color: C.white, fontWeight: '700', fontSize: 14 },
  btnWhats: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#E7FBF0', borderWidth: 1, borderColor: '#B7F0CC',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14,
  },
  btnWhatsTexto: { color: C.green, fontWeight: '700', fontSize: 14 },
  btnPix: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.greenLight, borderWidth: 1, borderColor: C.greenMid,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14,
  },
  btnPixTexto: { color: C.green, fontWeight: '700', fontSize: 14 },
  btnPDF: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14,
  },
  btnPDFTexto: { color: C.text2, fontWeight: '600', fontSize: 13 },
  btnDividaAnterior: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14,
  },
  btnDividaAnteriorTexto: { color: '#92400E', fontWeight: '600', fontSize: 13 },
  historicoCard: {
    backgroundColor: C.card, borderRadius: 18, padding: 18,
    borderWidth: 1, borderColor: C.border,
  },
  historicoTitulo: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 14 },
  lancamento: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  lancIcone: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  lancDesc: { fontSize: 14, fontWeight: '600', color: C.text },
  lancMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' },
  lancData: { fontSize: 12, color: C.text2 },
  lancVenc: { fontSize: 11, color: C.yellow, fontWeight: '600' },
  catBadge: { backgroundColor: C.greenLight, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 },
  catBadgeTexto: { fontSize: 10, color: C.green, fontWeight: '600' },
  lancAcoes: { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  lancBotoes: { flexDirection: 'row', gap: 12 },
  lancValor: { fontSize: 14, fontWeight: '700', flexShrink: 0 },
  fotoThumb: { width: 80, height: 60, borderRadius: 8, marginTop: 8 },
  vazio: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  vazioTexto: { fontSize: 14, color: C.text2 },
  modal: { flex: 1, padding: 24, paddingTop: 12, backgroundColor: C.bg },
  modalHandle: { width: 40, height: 4, borderRadius: 99, backgroundColor: C.border, alignSelf: 'center', marginBottom: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  modalTitulo: { fontSize: 20, fontWeight: '800', color: C.text },
  modalSub: { fontSize: 13, color: C.text2, marginTop: 3 },
  fecharBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
  btnVerPix: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.greenLight, borderRadius: 10, padding: 12, marginBottom: 14,
    borderWidth: 1, borderColor: C.greenMid,
  },
  btnVerPixTexto: { color: C.green, fontWeight: '600', fontSize: 14 },
  qrContainer: { alignItems: 'center', padding: 24, backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  qrValor: { fontSize: 24, fontWeight: '800', color: C.text, marginTop: 16 },
  qrChave: { fontSize: 12, color: C.text2, marginTop: 4 },
  qrInfo: { fontSize: 13, color: C.text2, textAlign: 'center', lineHeight: 20 },
})

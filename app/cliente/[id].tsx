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
import { KeyboardToolbar, KEYBOARD_TOOLBAR_ID } from '../../components/ui/KeyboardToolbar'
import { cobrarViaWhatsApp, montarExtratoWhatsApp } from '../../lib/whatsapp'
import { agendarNotificacoesVencimento } from '../../hooks/useNotificacoes'
import { gerarExtratoCliente } from '../../lib/pdf'
import { gerarPayloadPix } from '../../lib/pix'
import { useModulos } from '../../hooks/useModulos'
import { useOffline } from '../../hooks/useOffline'
import { formatarMoeda, formatarInputMoeda, validarDataBR } from '../../lib/validacao'
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
    const venc = new Date(v.data_vencimento! + 'T12:00:00')
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
  const { online } = useOffline()
  const { tocar } = useBeep()
  const { excluir: excluirCliente, atualizar: atualizarCliente } = useClientes()

  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [modalPagamento, setModalPagamento] = useState(false)
  const [modalPix, setModalPix] = useState(false)
  const [valorPagamento, setValorPagamento] = useState('')
  const [observacaoPagamento, setObservacaoPagamento] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('')
  const [erroPagamento, setErroPagamento] = useState('')
  const [tipoPagamento, setTipoPagamento] = useState<'total' | 'parcelado'>('total')
  const [numParcelas, setNumParcelas] = useState(2)
  const [salvando, setSalvando] = useState(false)
  const [perfil, setPerfil] = useState<{ nome_negocio: string; chave_pix?: string } | null>(null)
  const [gerandoPDF, setGerandoPDF] = useState(false)
  const [modalEditarVenda, setModalEditarVenda] = useState<{ id: string; descricao: string; valor: string; data_venda: string; data_vencimento: string; categoria: string } | null>(null)
  const [editandoVenda, setEditandoVenda] = useState(false)
  const [modalEditarPagamento, setModalEditarPagamento] = useState<{ id: string; valor: string; data: string; observacao: string } | null>(null)
  const [editandoPagamento, setEditandoPagamento] = useState(false)
  const [modalDividaAnterior, setModalDividaAnterior] = useState(false)
  const [dividaValor, setDividaValor] = useState('')
  const [dividaDescricao, setDividaDescricao] = useState('')
  const [dividaData, setDividaData] = useState('')
  const [dividaErro, setDividaErro] = useState('')
  const [salvandoDivida, setSalvandoDivida] = useState(false)
  const [modalEditarCliente, setModalEditarCliente] = useState(false)
  const [editNome, setEditNome] = useState('')
  const [editTelefone, setEditTelefone] = useState('')
  const [editEmpresa, setEditEmpresa] = useState('')
  const [editEndereco, setEditEndereco] = useState('')
  const [salvandoCliente, setSalvandoCliente] = useState(false)

  function abrirEditarCliente() {
    if (!cliente) return
    setEditNome(cliente.nome)
    setEditTelefone(cliente.telefone ?? '')
    setEditEmpresa(cliente.empresa ?? '')
    setEditEndereco(cliente.endereco ?? '')
    setModalEditarCliente(true)
  }

  async function handleSalvarCliente() {
    if (!editNome.trim()) return
    setSalvandoCliente(true)
    try {
      await atualizarCliente(id, {
        nome: editNome.trim(),
        telefone: editTelefone.trim() || undefined,
        empresa: editEmpresa.trim() || undefined,
        endereco: editEndereco.trim() || undefined,
      })
      await carregarCliente()
      setModalEditarCliente(false)
    } catch (e: any) {
      Alert.alert('Erro', e.message ?? 'Não foi possível salvar.')
    } finally {
      setSalvandoCliente(false)
    }
  }

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
    setCliente(null)
    carregarCliente(); buscar(); carregarPagamentos()
  }, [id])

  useEffect(() => {
    if (!usuario?.id) return
    supabase.from('perfis').select('nome_negocio, chave_pix').eq('id', usuario.id).single()
      .then(({ data }) => { if (data) setPerfil(data) })
  }, [usuario?.id])

  async function handlePagamento() {
    const valor = parseFloat(valorPagamento.replace(',', '.'))
    setErroPagamento('')
    if (isNaN(valor) || valor <= 0) { setErroPagamento('Informe um valor válido.'); return }
    if (cliente && valor > (cliente.saldo_devedor ?? 0)) { setErroPagamento('Valor maior que o saldo devedor.'); return }
    setSalvando(true)
    try {
      if (tipoPagamento === 'parcelado') {
        const valorParcela = Math.round((valor / numParcelas) * 100) / 100
        const hoje = new Date()
        for (let i = 0; i < numParcelas; i++) {
          const d = new Date(hoje)
          d.setMonth(d.getMonth() + i)
          const dataISO = d.toISOString().split('T')[0]
          const obs = `Parcela ${i + 1}/${numParcelas}${observacaoPagamento ? ' · ' + observacaoPagamento : ''}`
          await registrarPagamento({ cliente_id: id, valor: valorParcela, observacao: obs, data_pagamento: dataISO })
        }
      } else {
        await registrarPagamento({ cliente_id: id, valor, observacao: observacaoPagamento || undefined })
      }
      agendarNotificacoesVencimento() // reagenda notificações refletindo o novo estado de dívidas
      await Promise.all([carregarCliente(), carregarPagamentos()])
      setModalPagamento(false); setValorPagamento(''); setObservacaoPagamento(''); setFormaPagamento(''); setTipoPagamento('total'); setNumParcelas(2)
      tocar()
    } catch (e: any) {
      setErroPagamento(e.message)
    } finally {
      setSalvando(false)
    }
  }

  async function handleCobrar() {
    if (!cliente) return
    if (!cliente.telefone) {
      Alert.alert('Telefone não cadastrado', 'Edite o cliente e adicione o número de WhatsApp para enviar a cobrança.')
      return
    }
    const nomeNeg = perfil?.nome_negocio || 'nosso estabelecimento'
    try {
      await cobrarViaWhatsApp(cliente, cliente.saldo_devedor ?? 0, nomeNeg, perfil?.chave_pix)
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert(e.message)
      else Alert.alert('Erro', e.message)
    }
  }

  async function handleEnviarExtrato() {
    if (!cliente) return
    if (!cliente.telefone) {
      Alert.alert('Telefone não cadastrado', 'Edite o cliente e adicione o número de WhatsApp para enviar o extrato.')
      return
    }
    const nomeNeg = perfil?.nome_negocio || 'nosso estabelecimento'
    const url = montarExtratoWhatsApp(cliente, vendas, nomeNeg, perfil?.chave_pix)
    if (!url) return
    if (Platform.OS === 'web') {
      window.open(url, '_blank')
    } else {
      try {
        await Linking.openURL(url)
      } catch {
        Alert.alert('Erro', 'Não foi possível abrir o WhatsApp. Verifique se está instalado.')
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
    const cV = validarDataBR(modalEditarVenda.data_venda)
    if (!cV.valida) { Alert.alert('Data da venda', cV.mensagem!); return }
    const cVenc = validarDataBR(modalEditarVenda.data_vencimento)
    if (!cVenc.valida) { Alert.alert('Data de vencimento', cVenc.mensagem!); return }
    setEditandoVenda(true)
    try {
      await editarVenda(modalEditarVenda.id, {
        descricao: modalEditarVenda.descricao,
        valor,
        categoria: modalEditarVenda.categoria || undefined,
        data_venda: displayParaIso(modalEditarVenda.data_venda) || undefined,
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
    const cData = validarDataBR(dividaData)
    if (!cData.valida) { setDividaErro(cData.mensagem!); return }
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

  const temSaldo = parseFloat(String(cliente.saldo_devedor ?? 0)) > 0
  const temLimite = modulos.limite_credito && (cliente.limite_credito ?? 0) > 0
  const percentualLimite = temLimite ? Math.min(((cliente.saldo_devedor ?? 0) / cliente.limite_credito!) * 100, 100) : 0
  const score = modulos.score_cliente ? calcularScore(vendas, pagamentos) : null
  const pixPayload = modulos.qr_pix && perfil?.chave_pix ? gerarPayloadPix(perfil.chave_pix, perfil.nome_negocio, cliente.saldo_devedor ?? 0) : null

  const historico: ItemHistorico[] = [
    ...vendas.map(v => ({ tipo: 'venda' as const, data: v.data_venda, item: v })),
    ...pagamentos.map(p => ({ tipo: 'pagamento' as const, data: p.data_pagamento, item: p })),
  ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())

  return (
    <>
    <KeyboardToolbar />
    <ScrollView style={estilos.container} contentContainerStyle={[estilos.content, isTablet && estilos.contentTablet]}>

      {/* Header cliente */}
      <View style={estilos.clienteCard}>
        {/* Faixa colorida de status no topo */}
        <View style={[estilos.clienteCardAccent, {
          backgroundColor: cliente.status_pagamento === 'vencido' ? C.red
            : cliente.status_pagamento === 'em_dia' ? C.green
            : C.yellow,
        }]} />

        <View style={estilos.clienteCardInner}>
          {/* Avatar grande */}
          <Avatar nome={cliente.nome} tamanho={80} />

          {/* Dados principais */}
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={estilos.nome} numberOfLines={2}>{cliente.nome}</Text>

            {cliente.empresa && (
              <View style={estilos.telefoneRow}>
                <Ionicons name="business-outline" size={13} color={C.green} />
                <Text style={[estilos.telefone, { color: C.green, fontWeight: '700' }]}>{cliente.empresa}</Text>
              </View>
            )}
            {cliente.telefone && (
              <View style={estilos.telefoneRow}>
                <Ionicons name="call-outline" size={13} color={C.text3} />
                <Text style={estilos.telefone}>{cliente.telefone}</Text>
              </View>
            )}
            {cliente.endereco && (
              <View style={estilos.telefoneRow}>
                <Ionicons name="location-outline" size={13} color={C.text3} />
                <Text style={estilos.telefone} numberOfLines={1}>{cliente.endereco}</Text>
              </View>
            )}

            {/* Badge de status */}
            <View style={{ marginTop: 4 }}>
              <BadgeStatus status={cliente.status_pagamento} />
            </View>
          </View>

          {/* Botões editar / excluir */}
          <View style={{ gap: 8, alignItems: 'center' }}>
            <TouchableOpacity style={estilos.btnEditarCliente} onPress={abrirEditarCliente}>
              <Ionicons name="pencil" size={15} color={C.green} />
            </TouchableOpacity>
            <TouchableOpacity style={estilos.btnExcluirCliente} onPress={handleExcluirCliente}>
              <Ionicons name="trash-outline" size={15} color={C.red} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Score separador */}
        {score && (
          <View style={[estilos.scoreBadge, { backgroundColor: score.cor + '14', borderColor: score.cor + '30' }]}>
            <Text style={{ fontSize: 15 }}>{'⭐'.repeat(score.estrelas)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[estilos.scoreLabel, { color: score.cor }]}>{score.label}</Text>
              <Text style={estilos.scoreDetalhes}>{score.detalhes}</Text>
            </View>
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

      {/* Ações — hierarquia clara */}
      <View style={estilos.acoesContainer}>
        {/* Tier 1: ação primária — só quando há saldo */}
        {temSaldo && (
          <TouchableOpacity style={estilos.btnPagar} onPress={() => setModalPagamento(true)}>
            <Ionicons name="cash-outline" size={20} color={C.white} />
            <Text style={estilos.btnPagarTexto}>Registrar pagamento</Text>
          </TouchableOpacity>
        )}

        {/* Tier 2: cobrar + QR Pix */}
        {(temSaldo && cliente.telefone) || (pixPayload && temSaldo) ? (
          <View style={estilos.acoesTier}>
            {temSaldo && cliente.telefone && (
              <TouchableOpacity style={[estilos.btnAcao, estilos.btnCobrar]} onPress={handleCobrar}>
                <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                <Text style={estilos.btnCobrarTexto}>Cobrar</Text>
              </TouchableOpacity>
            )}
            {pixPayload && temSaldo && (
              <TouchableOpacity style={[estilos.btnAcao, estilos.btnPix]} onPress={() => setModalPix(true)}>
                <Ionicons name="qr-code-outline" size={20} color={C.green} />
                <Text style={estilos.btnPixTexto}>QR Pix</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {/* Tier 3: extrato — secundário neutro */}
        <View style={estilos.acoesTier}>
          <TouchableOpacity style={[estilos.btnAcao, estilos.btnPDF]} onPress={handleGerarPDF} disabled={gerandoPDF}>
            <Ionicons name="document-text-outline" size={17} color={C.text2} />
            <Text style={estilos.btnPDFTexto}>{gerandoPDF ? 'Gerando...' : 'Extrato PDF'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[estilos.btnAcao, estilos.btnWhats]} onPress={handleEnviarExtrato}>
            <Ionicons name="logo-whatsapp" size={17} color="#25D366" />
            <Text style={estilos.btnWhatsTexto}>Extrato WhatsApp</Text>
          </TouchableOpacity>
        </View>

        {/* Tier 4: ação rara */}
        <TouchableOpacity style={estilos.btnDividaAnterior} onPress={() => setModalDividaAnterior(true)}>
          <Ionicons name="time-outline" size={16} color={C.yellow} />
          <Text style={estilos.btnDividaAnteriorTexto}>Registrar dívida anterior</Text>
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
                      <TouchableOpacity onPress={() => setModalEditarVenda({ id: v.id, descricao: v.descricao, valor: String(v.valor), data_venda: isoParaDisplay(v.data_venda ?? ''), data_vencimento: isoParaDisplay(v.data_vencimento ?? ''), categoria: v.categoria ?? '' })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
              <TouchableOpacity style={estilos.fecharBtn} onPress={() => { setModalPagamento(false); setValorPagamento(''); setObservacaoPagamento(''); setFormaPagamento(''); setErroPagamento(''); setTipoPagamento('total'); setNumParcelas(2) }}>
                <Ionicons name="close" size={20} color={C.text2} />
              </TouchableOpacity>
            </View>

            {!online && (
              <View style={estilos.offlineBanner}>
                <Ionicons name="cloud-offline-outline" size={15} color="#7a5c00" />
                <Text style={estilos.offlineBannerTexto}>Sem conexão — conecte-se para registrar pagamentos</Text>
              </View>
            )}

            {/* Seletor à vista / parcelado */}
            <View style={estilos.tipoPagRow}>
              <TouchableOpacity
                style={[estilos.tipoPagBtn, tipoPagamento === 'total' && estilos.tipoPagBtnAtivo]}
                onPress={() => setTipoPagamento('total')}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color={tipoPagamento === 'total' ? C.white : C.text2} />
                <Text style={[estilos.tipoPagTexto, tipoPagamento === 'total' && estilos.tipoPagTextoAtivo]}>À vista</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[estilos.tipoPagBtn, tipoPagamento === 'parcelado' && estilos.tipoPagBtnAtivo]}
                onPress={() => setTipoPagamento('parcelado')}
              >
                <Ionicons name="calendar-outline" size={16} color={tipoPagamento === 'parcelado' ? C.white : C.text2} />
                <Text style={[estilos.tipoPagTexto, tipoPagamento === 'parcelado' && estilos.tipoPagTextoAtivo]}>Parcelado</Text>
              </TouchableOpacity>
            </View>

            <Campo label="Valor total (R$)" value={valorPagamento} onChangeText={v => setValorPagamento(formatarInputMoeda(v))} keyboardType="decimal-pad" placeholder="0,00" erro={erroPagamento} />

            {tipoPagamento === 'parcelado' && (
              <View style={{ marginBottom: 16 }}>
                <Text style={estilos.parcelasLabel}>Número de parcelas</Text>
                <View style={estilos.parcelasRow}>
                  {[2, 3, 4, 6, 10, 12].map(n => (
                    <TouchableOpacity
                      key={n}
                      style={[estilos.parcelaChip, numParcelas === n && estilos.parcelaChipAtivo]}
                      onPress={() => setNumParcelas(n)}
                    >
                      <Text style={[estilos.parcelaChipTexto, numParcelas === n && estilos.parcelaChipTextoAtivo]}>{n}x</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {valorPagamento.length > 0 && !isNaN(parseFloat(valorPagamento.replace(',', '.'))) && (
                  <View style={estilos.parcelaResumoBox}>
                    <Text style={estilos.parcelaResumoTexto}>
                      {numParcelas}x de{' '}
                      <Text style={{ fontWeight: '800', color: C.green }}>
                        {(Math.round((parseFloat(valorPagamento.replace(',', '.')) / numParcelas) * 100) / 100)
                          .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </Text>
                    </Text>
                    <Text style={estilos.parcelaResumoSub}>1ª parcela hoje, demais mensalmente</Text>
                  </View>
                )}
              </View>
            )}

            <View style={estilos.formaBox}>
              <Text style={estilos.formaLabel}>Forma de pagamento</Text>
              <View style={estilos.formaChips}>
                {['Dinheiro', 'Cartão', 'Pix', 'Outro'].map(f => (
                  <TouchableOpacity
                    key={f}
                    style={[estilos.formaChip, formaPagamento === f && estilos.formaChipAtivo]}
                    onPress={() => {
                      setFormaPagamento(f)
                      if (f !== 'Outro') setObservacaoPagamento(f)
                      else setObservacaoPagamento('')
                    }}
                  >
                    <Text style={[estilos.formaChipTexto, formaPagamento === f && estilos.formaChipTextoAtivo]}>
                      {f === 'Dinheiro' ? '💵 Dinheiro' : f === 'Cartão' ? '💳 Cartão' : f === 'Pix' ? '📲 Pix' : '✏️ Outro'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {formaPagamento === 'Outro' && (
                <Campo value={observacaoPagamento} onChangeText={setObservacaoPagamento} placeholder="Descreva a forma de pagamento..." />
              )}
            </View>
            {pixPayload && tipoPagamento === 'total' && (
              <TouchableOpacity style={estilos.btnVerPix} onPress={() => { setModalPagamento(false); setModalPix(true) }}>
                <Ionicons name="qr-code-outline" size={16} color={C.green} />
                <Text style={estilos.btnVerPixTexto}>Ver QR Code Pix</Text>
              </TouchableOpacity>
            )}
            <Botao
              titulo={tipoPagamento === 'parcelado' ? `Confirmar ${numParcelas}x parcelas` : 'Confirmar pagamento'}
              onPress={handlePagamento}
              carregando={salvando}
              desabilitado={!online}
            />
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
              onChangeText={(v) => setModalEditarVenda(prev => prev ? { ...prev, valor: formatarInputMoeda(v) } : null)}
              keyboardType="decimal-pad"
            />
            <Campo
              label="Categoria"
              value={modalEditarVenda?.categoria ?? ''}
              onChangeText={(v) => setModalEditarVenda(prev => prev ? { ...prev, categoria: v } : null)}
              placeholder="Ex: Alimentação, Serviços..."
            />
            <Campo
              label="Data da venda"
              value={modalEditarVenda?.data_venda ?? ''}
              onChangeText={(v) => setModalEditarVenda(prev => prev ? { ...prev, data_venda: formatarData(v) } : null)}
              placeholder="DD/MM/AAAA"
              keyboardType="numeric"
              maxLength={10}
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
              onChangeText={v => setDividaValor(formatarInputMoeda(v))}
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
                const nums = v.replace(/\D/g, '').slice(0, 8)
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
              onChangeText={(v) => setModalEditarPagamento(prev => prev ? { ...prev, valor: formatarInputMoeda(v) } : null)}
              keyboardType="decimal-pad"
              placeholder="0,00"
            />
            <Campo
              label="Data do pagamento"
              value={modalEditarPagamento?.data ?? ''}
              onChangeText={(v) => {
                const nums = v.replace(/\D/g, '').slice(0, 8)
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

    {/* Modal editar cliente */}
    <Modal visible={modalEditarCliente} animationType="slide" presentationStyle="formSheet">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={estilos.modal}>
          <View style={estilos.modalHandle} />
          <View style={estilos.modalHeader}>
            <View>
              <Text style={estilos.modalTitulo}>Editar cliente</Text>
              <Text style={estilos.modalSub}>Atualize os dados do cliente</Text>
            </View>
            <TouchableOpacity style={estilos.fecharBtn} onPress={() => setModalEditarCliente(false)}>
              <Ionicons name="close" size={20} color={C.text2} />
            </TouchableOpacity>
          </View>
          <Campo label="Nome *" value={editNome} onChangeText={setEditNome} placeholder="Nome do cliente" autoCapitalize="words" />
          <Campo label="Telefone / WhatsApp" value={editTelefone} onChangeText={setEditTelefone} placeholder="(00) 00000-0000" keyboardType="phone-pad" />
          <Campo label="Empresa (opcional)" value={editEmpresa} onChangeText={setEditEmpresa} placeholder="Nome da empresa" />
          <Campo label="Endereço (opcional)" value={editEndereco} onChangeText={setEditEndereco} placeholder="Rua, número, bairro..." />
          <Botao titulo="Salvar alterações" onPress={handleSalvarCliente} carregando={salvandoCliente} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
    </>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  contentTablet: { maxWidth: 720, alignSelf: 'center', width: '100%' },
  clienteCard: {
    backgroundColor: C.card, borderRadius: 22, marginBottom: 12,
    borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.09, shadowRadius: 12, elevation: 4,
  },
  clienteCardAccent: {
    height: 7,
  },
  clienteCardInner: {
    flexDirection: 'row', gap: 16, alignItems: 'center',
    paddingHorizontal: 18, paddingTop: 20, paddingBottom: 18,
  },
  nome: { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.4, lineHeight: 28 },
  telefoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  telefone: { fontSize: 13, color: C.text2 },
  scoreBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderTopWidth: 1, borderTopColor: C.border,
    paddingHorizontal: 18, paddingVertical: 12,
  },
  btnExcluirCliente: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: C.redLight, borderWidth: 1, borderColor: C.redBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  btnEditarCliente: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: C.greenLight, borderWidth: 1, borderColor: C.greenMid,
    alignItems: 'center', justifyContent: 'center',
  },
  scoreLabel: { fontSize: 13, fontWeight: '700' },
  scoreDetalhes: { fontSize: 12, color: C.text2, marginTop: 1 },
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
  acoesContainer: { gap: 8, marginBottom: 12 },
  acoesTier: { flexDirection: 'row', gap: 8 },
  btnPagar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: C.green, borderRadius: 16, paddingVertical: 16,
    shadowColor: C.green, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  btnPagarTexto: { color: C.white, fontWeight: '800', fontSize: 16 },
  btnAcao: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderRadius: 14, paddingVertical: 13,
  },
  btnCobrar: {
    backgroundColor: '#DC2626',
    shadowColor: '#DC2626', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  btnCobrarTexto: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnWhats: {
    backgroundColor: '#E7FBF0', borderWidth: 1, borderColor: '#B7F0CC',
  },
  btnWhatsTexto: { color: '#15803D', fontWeight: '600', fontSize: 13 },
  btnPix: {
    backgroundColor: C.greenLight, borderWidth: 1, borderColor: C.greenMid,
  },
  btnPixTexto: { color: C.green, fontWeight: '700', fontSize: 14 },
  btnPDF: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  btnPDFTexto: { color: C.text2, fontWeight: '600', fontSize: 13 },
  btnDividaAnterior: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: C.yellowLight, borderWidth: 1, borderColor: C.yellowBorder,
    borderRadius: 12, paddingVertical: 11,
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
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFF8E1', borderWidth: 1, borderColor: '#FFE082',
    borderRadius: 12, padding: 12, marginBottom: 16,
  },
  offlineBannerTexto: { color: '#7a5c00', fontSize: 13, fontWeight: '500', flex: 1 },
  modalHandle: { width: 40, height: 4, borderRadius: 99, backgroundColor: C.border, alignSelf: 'center', marginBottom: 20 },
  formaBox: { marginBottom: 12 },
  formaLabel: { fontSize: 13, fontWeight: '600', color: C.text2, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  formaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  formaChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.bg },
  formaChipAtivo: { borderColor: C.green, backgroundColor: C.greenLight },
  formaChipTexto: { fontSize: 14, color: C.text2, fontWeight: '500' },
  formaChipTextoAtivo: { color: C.green, fontWeight: '700' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  modalTitulo: { fontSize: 20, fontWeight: '800', color: C.text },
  modalSub: { fontSize: 13, color: C.text2, marginTop: 3 },
  fecharBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
  tipoPagRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  tipoPagBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.bg },
  tipoPagBtnAtivo: { backgroundColor: C.green, borderColor: C.green },
  tipoPagTexto: { fontSize: 14, fontWeight: '600', color: C.text2 },
  tipoPagTextoAtivo: { color: C.white },
  parcelasLabel: { fontSize: 13, fontWeight: '600', color: C.text2, marginBottom: 10 },
  parcelasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  parcelaChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.bg },
  parcelaChipAtivo: { backgroundColor: C.green, borderColor: C.green },
  parcelaChipTexto: { fontSize: 14, fontWeight: '700', color: C.text2 },
  parcelaChipTextoAtivo: { color: C.white },
  parcelaResumoBox: { marginTop: 12, padding: 12, backgroundColor: C.greenLight, borderRadius: 10, borderWidth: 1, borderColor: C.greenMid },
  parcelaResumoTexto: { fontSize: 15, color: C.text, textAlign: 'center' },
  parcelaResumoSub: { fontSize: 12, color: C.text2, textAlign: 'center', marginTop: 2 },
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

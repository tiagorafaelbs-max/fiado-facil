import { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, Modal, Image, Alert, Platform, KeyboardAvoidingView, ActionSheetIOS, Animated,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useVendas } from '../../hooks/useVendas'
import { useClientes } from '../../hooks/useClientes'
import { useModulos } from '../../hooks/useModulos'
import { useAuth } from '../../hooks/useAuth'
import { Avatar } from '../../components/ui/Avatar'
import { Campo } from '../../components/ui/Campo'
import { Botao } from '../../components/ui/Botao'
import { sanitizarTexto, validarTelefone, formatarMoeda, formatarInputMoeda, validarDataBR } from '../../lib/validacao'
import * as Contacts from 'expo-contacts'
import { montarUrlWhatsApp } from '../../lib/whatsapp'
import { C } from '../../constants/colors'
import { useCategorias } from '../../hooks/useCategorias'
import { useOffline } from '../../hooks/useOffline'
import { useBeep } from '../../hooks/useBeep'
import { solicitarPermissaoNotificacoes, agendarNotificacoesVencimento } from '../../hooks/useNotificacoes'
import { KeyboardToolbar, KEYBOARD_TOOLBAR_ID } from '../../components/ui/KeyboardToolbar'
import type { Cliente } from '../../types'

export default function NovaVendaScreen() {
  const router = useRouter()
  const { usuario } = useAuth()
  const toastOpacity = useRef(new Animated.Value(0)).current
  const toastTranslate = useRef(new Animated.Value(20)).current
  const { criar, vendas } = useVendas()
  const { clientes, buscar, criar: criarCliente } = useClientes()
  const { modulos } = useModulos(usuario?.id)
  const { tocar } = useBeep()

  const [clienteId, setClienteId] = useState('')
  const [buscaCliente, setBuscaCliente] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [dataVenda, setDataVenda] = useState('')
  const [dataVencimento, setDataVencimento] = useState('')
  const [categoria, setCategoria] = useState('Mercadoria')
  const [novaCategoria, setNovaCategoria] = useState('')
  const [editandoCategoria, setEditandoCategoria] = useState<string | null>(null)
  const [nomeEdicao, setNomeEdicao] = useState('')
  const { todas: todasCategorias, extras: categoriasExtra, adicionar: adicionarCat, remover: removerCat, renomear: renomearCat } = useCategorias(usuario?.id)
  const [fotoUri, setFotoUri] = useState<string | null>(null)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [ultimaVendaId, setUltimaVendaId] = useState<string | null>(null)
  const [ultimasParcelasIds, setUltimasParcelasIds] = useState<string[]>([])
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [clienteSucesso, setClienteSucesso] = useState<Cliente | null>(null)
  const [desfazendo, setDesfazendo] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [salvouOffline, setSalvouOffline] = useState(false)
  const { online } = useOffline()
  useEffect(() => {
    if (sucesso) {
      Animated.parallel([
        Animated.timing(toastOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(toastTranslate, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start()
    } else {
      toastOpacity.setValue(0)
      toastTranslate.setValue(20)
    }
  }, [sucesso])
  const [erroGeral, setErroGeral] = useState('')
  const [nomeNegocio, setNomeNegocio] = useState('nossa loja')
  const [chavePix, setChavePix] = useState<string | undefined>(undefined)
  const [primeiraVenda, setPrimeiraVenda] = useState(false)
  const [tipoPagamento, setTipoPagamento] = useState<'fiado' | 'parcelado'>('fiado')
  const [numParcelas, setNumParcelas] = useState(2)

  // Modal novo cliente inline
  const [modalNovoCliente, setModalNovoCliente] = useState(false)
  const [nomeNovoCliente, setNomeNovoCliente] = useState('')
  const [telNovoCliente, setTelNovoCliente] = useState('')

  async function buscarNaAgenda() {
    const { status } = await Contacts.requestPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permissão negada', 'Autorize o acesso aos contatos nas configurações do celular.')
      return
    }
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
    })
    const contatos = data.filter(c => c.name && c.phoneNumbers?.length).slice(0, 100)
    if (!contatos.length) return

    function selecionarContato(index: number) {
      const c = contatos[index]
      if (!c) return
      setNomeNovoCliente(c.name!)
      const tel = c.phoneNumbers?.[0]?.number?.replace(/\D/g, '') ?? ''
      setTelNovoCliente(tel)
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...contatos.map(c => c.name!), 'Cancelar'],
          cancelButtonIndex: contatos.length,
          title: 'Selecionar contato',
        },
        (index) => {
          if (index < contatos.length) selecionarContato(index)
        },
      )
    } else {
      Alert.alert(
        'Selecionar contato',
        'Escolha um contato da agenda',
        [
          ...contatos.slice(0, 20).map((c, i) => ({
            text: c.name!,
            onPress: () => selecionarContato(i),
          })),
          { text: 'Cancelar', style: 'cancel' as const },
        ],
      )
    }
  }
  const [erroNovoCliente, setErroNovoCliente] = useState('')
  const [salvandoCliente, setSalvandoCliente] = useState(false)

  useFocusEffect(useCallback(() => {
    setSucesso(false)
    setUltimaVendaId(null)
    setUltimasParcelasIds([])
    if (redirectTimer.current) { clearTimeout(redirectTimer.current); redirectTimer.current = null }
    buscar()
    if (usuario?.id) {
      import('../../lib/supabase').then(({ supabase }) => {
        supabase.from('perfis').select('nome_negocio, chave_pix').eq('id', usuario.id).single().then(({ data }) => {
          if (data?.nome_negocio) setNomeNegocio(data.nome_negocio)
          if (data?.chave_pix) setChavePix(data.chave_pix)
        })
      })
    }
  }, [usuario?.id]))

  const clientesFiltrados = buscaCliente.trim().length > 0
    ? clientes.filter(c => c.nome.toLowerCase().includes(buscaCliente.toLowerCase()))
    : clientes

  const clienteSelecionado = clientes.find(c => c.id === clienteId)

  async function tirarFoto() {
    if (Platform.OS === 'web') {
      window.alert('Foto de comprovante disponível apenas no app instalado.')
      return
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Permita o acesso à câmera nas configurações do celular.')
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true, aspect: [4, 3], quality: 0.7,
    })
    if (!result.canceled && result.assets[0]) setFotoUri(result.assets[0].uri)
  }

  async function escolherFoto() {
    if (Platform.OS === 'web') {
      window.alert('Foto de comprovante disponível apenas no app instalado.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.7,
    })
    if (!result.canceled && result.assets[0]) setFotoUri(result.assets[0].uri)
  }

  async function uploadFoto(uri: string): Promise<string | null> {
    try {
      const { supabase } = await import('../../lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return null
      const ext = uri.split('.').pop() ?? 'jpg'
      const nome = `${session.user.id}/${Date.now()}.${ext}`
      const response = await fetch(uri)
      const blob = await response.blob()
      const { error } = await supabase.storage.from('comprovantes').upload(nome, blob, { contentType: `image/${ext}` })
      if (error) return null
      const { data } = supabase.storage.from('comprovantes').getPublicUrl(nome)
      return data.publicUrl
    } catch {
      return null
    }
  }

  async function adicionarCategoria() {
    const nova = sanitizarTexto(novaCategoria)
    if (nova.length < 2) return
    const jaExiste = todasCategorias.find(c => c.toLowerCase() === nova.toLowerCase())
    if (jaExiste) { setCategoria(jaExiste); setNovaCategoria(''); return }
    await adicionarCat(nova)
    setCategoria(nova)
    setNovaCategoria('')
  }

  async function confirmarEdicao() {
    if (!editandoCategoria) return
    const ok = await renomearCat(editandoCategoria, nomeEdicao)
    if (ok && categoria === editandoCategoria) setCategoria(nomeEdicao.trim())
    setEditandoCategoria(null)
    setNomeEdicao('')
  }

  function validar(): boolean {
    const novosErros: Record<string, string> = {}
    if (!clienteId) novosErros.cliente = 'Selecione um cliente.'
    if (sanitizarTexto(descricao).length < 1) novosErros.descricao = 'Informe a descrição.'
    const v = parseFloat(valor.replace(',', '.'))
    if (isNaN(v) || v <= 0) novosErros.valor = 'Informe um valor válido (ex: 25,50).'
    const checkVenda = validarDataBR(dataVenda)
    if (!checkVenda.valida) novosErros.dataVenda = checkVenda.mensagem!
    const checkVenc = validarDataBR(dataVencimento)
    if (!checkVenc.valida) novosErros.dataVencimento = checkVenc.mensagem!
    setErros(novosErros)
    return Object.keys(novosErros).length === 0
  }

  async function handleSalvar() {
    if (!validar()) return

    // Verificar limite de crédito antes de bloquear a UI
    const clienteAtual = clientes.find(c => c.id === clienteId)
    if (clienteAtual?.limite_credito) {
      const valorNovo = parseFloat(valor.replace(',', '.'))
      const novoSaldo = (clienteAtual.saldo_devedor ?? 0) + valorNovo
      if (novoSaldo > clienteAtual.limite_credito) {
        const msg = `${clienteAtual.nome} atingirá o limite de crédito de ${formatarMoeda(clienteAtual.limite_credito)}.\n\nNovo saldo seria: ${formatarMoeda(novoSaldo)}.\n\nDeseja continuar mesmo assim?`
        if (Platform.OS === 'web') {
          if (!window.confirm(msg)) return
        } else {
          const confirmado = await new Promise<boolean>(resolve =>
            Alert.alert('Limite de crédito', msg, [
              { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continuar', onPress: () => resolve(true) },
            ])
          )
          if (!confirmado) return
        }
      }
    }

    const ehPrimeira = vendas.length === 0
    setSalvando(true); setErroGeral(''); setUltimaVendaId(null)
    try {
      // converte DD/MM/AAAA → AAAA-MM-DD
      let vendaISO: string | undefined
      if (dataVenda.length === 10) {
        const [dd, mm, aaaa] = dataVenda.split('/')
        if (dd && mm && aaaa) vendaISO = `${aaaa}-${mm}-${dd}`
      }

      let vencimentoISO: string | undefined
      if (dataVencimento.length === 10) {
        const [dd, mm, aaaa] = dataVencimento.split('/')
        if (dd && mm && aaaa) vencimentoISO = `${aaaa}-${mm}-${dd}`
      }

      let fotoUrl: string | undefined
      if (fotoUri) {
        const url = await uploadFoto(fotoUri)
        if (url) fotoUrl = url
      }

      const descricaoLimpa = sanitizarTexto(descricao)
      const valorTotal = parseFloat(valor.replace(',', '.'))

      if (tipoPagamento === 'parcelado') {
        const valorParcela = Math.round((valorTotal / numParcelas) * 100) / 100
        let primeiroId: string | null = null
        const parcelasIds: string[] = []
        const baseDate = vencimentoISO ? new Date(vencimentoISO + 'T12:00:00') : new Date()
        if (!vencimentoISO) baseDate.setMonth(baseDate.getMonth() + 1)

        for (let i = 0; i < numParcelas; i++) {
          const d = new Date(baseDate)
          d.setMonth(d.getMonth() + i)
          const parcISO = d.toISOString().split('T')[0]
          const v = await criar({
            cliente_id: clienteId,
            descricao: `${descricaoLimpa} (${i + 1}/${numParcelas})`,
            valor: valorParcela,
            data_venda: vendaISO,
            data_vencimento: parcISO,
            categoria,
            foto_url: i === 0 ? fotoUrl : undefined,
          })
          if (v?.id) parcelasIds.push(v.id)
          if (i === 0) primeiroId = v?.id ?? null
        }
        setUltimaVendaId(primeiroId)
        setUltimasParcelasIds(parcelasIds)
        setSalvouOffline(parcelasIds.some(id => id.startsWith('local_')))
      } else {
        const venda = await criar({
          cliente_id: clienteId,
          descricao: descricaoLimpa,
          valor: valorTotal,
          data_venda: vendaISO,
          data_vencimento: vencimentoISO,
          categoria,
          foto_url: fotoUrl,
        })
        setUltimaVendaId(venda?.id ?? null)
        setSalvouOffline(venda?.id?.startsWith('local_') ?? false)
      }

      setClienteSucesso(clienteSelecionado ?? null)
      setPrimeiraVenda(ehPrimeira)
      setSucesso(true)
      tocar()
      solicitarPermissaoNotificacoes().then(ok => { if (ok) agendarNotificacoesVencimento() })
      // Volta para o início automaticamente após 2s
      redirectTimer.current = setTimeout(() => router.replace('/(tabs)'), 2000)
      setClienteId(''); setBuscaCliente(''); setDescricao(''); setValor(''); setDataVenda(''); setDataVencimento(''); setCategoria('Mercadoria'); setErros({}); setFotoUri(null); setTipoPagamento('fiado'); setNumParcelas(2)
    } catch (e: any) {
      setErroGeral(e.message ?? 'Erro ao salvar. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  async function handleDesfazer() {
    if (!ultimaVendaId || ultimaVendaId.startsWith('local_')) return
    setDesfazendo(true)
    try {
      const { supabase } = await import('../../lib/supabase')
      const idsParaDeletar = ultimasParcelasIds.length > 0 ? ultimasParcelasIds : [ultimaVendaId]
      await supabase.from('vendas').delete().in('id', idsParaDeletar)
      setUltimaVendaId(null)
      setUltimasParcelasIds([])
      if (redirectTimer.current) { clearTimeout(redirectTimer.current); redirectTimer.current = null }
      setSucesso(false)
    } catch {
      // silencioso
    } finally {
      setDesfazendo(false)
    }
  }

  function handleNovaVenda() {
    if (redirectTimer.current) { clearTimeout(redirectTimer.current); redirectTimer.current = null }
    setSucesso(false)
    setUltimaVendaId(null)
    setUltimasParcelasIds([])
  }

  async function handleAdicionarCliente() {
    const nome = sanitizarTexto(nomeNovoCliente)
    if (nome.length < 2) { setErroNovoCliente('Nome muito curto.'); return }
    if (telNovoCliente && !validarTelefone(telNovoCliente)) { setErroNovoCliente('Telefone inválido.'); return }
    setSalvandoCliente(true); setErroNovoCliente('')
    try {
      const novo = await criarCliente({ nome, telefone: telNovoCliente || undefined })
      setClienteId(novo.id)
      setBuscaCliente(nome)
      setModalNovoCliente(false)
      setNomeNovoCliente(''); setTelNovoCliente('')
    } catch (e: any) {
      setErroNovoCliente(e.message ?? 'Erro ao salvar.')
    } finally {
      setSalvandoCliente(false)
    }
  }

  function abrirModalNovoCliente() {
    setNomeNovoCliente(buscaCliente)
    setModalNovoCliente(true)
  }

  function handleCobrarWhatsApp() {
    if (!clienteSucesso?.telefone) return
    const url = montarUrlWhatsApp(clienteSucesso, clienteSucesso.saldo_devedor ?? 0, nomeNegocio, false, 0, chavePix)
    if (Platform.OS === 'web') window.open(url, '_blank')
    else require('react-native').Linking.openURL(url)
  }

  return (
    <View style={{ flex: 1 }}>
    <KeyboardToolbar />
    <ScrollView style={estilos.container} contentContainerStyle={estilos.content} keyboardShouldPersistTaps="handled">

      {!online && (
        <View style={estilos.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color="#7a5c00" />
          <Text style={estilos.offlineBannerTexto}>Sem conexão — vendas serão salvas e sincronizadas ao reconectar</Text>
        </View>
      )}

      {erroGeral ? (
        <View style={estilos.erroGeralBox}>
          <Ionicons name="alert-circle" size={18} color={C.red} />
          <Text style={estilos.erroGeralTexto}>{erroGeral}</Text>
        </View>
      ) : null}

      {/* Cliente */}
      <View style={estilos.secaoBox}>
        <Text style={estilos.secaoLabel}>👤 Cliente</Text>
        {erros.cliente && (
          <View style={estilos.erroInline}>
            <Ionicons name="alert-circle" size={13} color={C.red} />
            <Text style={estilos.erroInlineTexto}>{erros.cliente}</Text>
          </View>
        )}

        {/* Busca de cliente */}
        <View style={estilos.buscaClienteRow}>
          <View style={estilos.buscaClienteInput}>
            <Ionicons name="search-outline" size={15} color={C.text3} />
            <TextInput
              style={estilos.buscaClienteTexto}
              value={buscaCliente}
              onChangeText={(t) => { setBuscaCliente(t); if (clienteId) setClienteId('') }}
              placeholder="Buscar ou adicionar cliente..."
              placeholderTextColor={C.text3}
            />
            {buscaCliente.length > 0 && (
              <TouchableOpacity onPress={() => { setBuscaCliente(''); setClienteId('') }}>
                <Ionicons name="close-circle" size={16} color={C.text3} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={estilos.btnNovoCliente}
            onPress={abrirModalNovoCliente}
            accessibilityRole="button"
            accessibilityLabel="Adicionar novo cliente"
          >
            <Ionicons name="person-add-outline" size={18} color={C.green} />
          </TouchableOpacity>
        </View>

        {/* Cliente selecionado */}
        {clienteSelecionado ? (
          <View style={estilos.clienteSelecionadoBox}>
            <Avatar nome={clienteSelecionado.nome} tamanho={32} />
            <Text style={estilos.clienteSelecionadoNome}>{clienteSelecionado.nome}</Text>
            <Ionicons name="checkmark-circle" size={18} color={C.green} />
          </View>
        ) : (
          <>
            {/* Lista de resultados */}
            {clientesFiltrados.slice(0, 20).map((c: Cliente) => (
              <TouchableOpacity
                key={c.id}
                style={estilos.clienteResultado}
                onPress={() => { setClienteId(c.id); setBuscaCliente(c.nome) }}
              >
                <Avatar nome={c.nome} tamanho={34} />
                <View style={{ flex: 1 }}>
                  <Text style={estilos.clienteResultadoNome}>{c.nome}</Text>
                  {(c.saldo_devedor ?? 0) > 0 && (
                    <Text style={estilos.clienteResultadoSaldo}>Saldo: {(c.saldo_devedor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={14} color={C.text3} />
              </TouchableOpacity>
            ))}

            {/* Sugestão adicionar novo */}
            {buscaCliente.trim().length >= 2 && clientesFiltrados.length === 0 && (
              <TouchableOpacity style={estilos.adicionarNovoRow} onPress={abrirModalNovoCliente}>
                <View style={estilos.adicionarNovoIcone}>
                  <Ionicons name="person-add" size={18} color={C.green} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.adicionarNovoTexto}>Adicionar "{buscaCliente}" como novo cliente</Text>
                  <Text style={estilos.adicionarNovoSub}>Toque para cadastrar agora</Text>
                </View>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* Detalhes */}
      <View style={estilos.secaoBox}>
        <Text style={estilos.secaoLabel}>🧾 Detalhes</Text>
        <Campo label="Descrição" value={descricao} onChangeText={setDescricao} erro={erros.descricao} placeholder="Ex: Arroz, Feijão, Serviço..." />
        <Campo label="Valor (R$)" value={valor} onChangeText={v => setValor(formatarInputMoeda(v))} erro={erros.valor} keyboardType="decimal-pad" placeholder="0,00" />

        {/* Data da venda */}
        <View style={{ marginBottom: 12 }}>
          <Text style={estilos.labelDataRapida}>Data da venda</Text>
          <View style={estilos.datasRapidasRow}>
            {[
              { label: 'Hoje', dias: 0 },
              { label: 'Ontem', dias: -1 },
              { label: 'Limpar', dias: null },
            ].map(({ label, dias }) => {
              const d = new Date()
              if (dias !== null) d.setDate(d.getDate() + dias)
              const iso = dias !== null
                ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
                : ''
              const ativo = dias !== null && dataVenda === iso
              return (
                <TouchableOpacity
                  key={label}
                  style={[estilos.dataChip, dias === null && estilos.dataChipLimpar, ativo && { backgroundColor: '#00A651', borderColor: '#00A651' }]}
                  onPress={() => setDataVenda(dias === null ? '' : iso)}
                >
                  <Text style={[estilos.dataChipTexto, dias === null && estilos.dataChipTextoLimpar, ativo && { color: '#fff' }]}>{label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          <TextInput
            style={estilos.dataInput}
            value={dataVenda}
            inputAccessoryViewID={Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_ID : undefined}
            returnKeyType="done"
            blurOnSubmit
            onChangeText={(t) => {
              const nums = t.replace(/\D/g, '').slice(0, 8)
              let fmt = nums
              if (nums.length > 2) fmt = nums.slice(0, 2) + '/' + nums.slice(2)
              if (nums.length > 4) fmt = nums.slice(0, 2) + '/' + nums.slice(2, 4) + '/' + nums.slice(4)
              setDataVenda(fmt)
            }}
            placeholder="DD/MM/AAAA (padrão: hoje)"
            placeholderTextColor={C.text3}
            keyboardType="numeric"
          />
          {erros.dataVenda && (
            <View style={estilos.erroInline}>
              <Text style={estilos.erroInlineTexto}>{erros.dataVenda}</Text>
            </View>
          )}
        </View>

        <View style={{ marginBottom: 4 }}>
          <Text style={estilos.labelDataRapida}>Vencimento (opcional)</Text>
          <View style={estilos.datasRapidasRow}>
            {[
              { label: '7 dias', dias: 7 },
              { label: '15 dias', dias: 15 },
              { label: '30 dias', dias: 30 },
              { label: 'Limpar', dias: -1 },
            ].map(({ label, dias }) => (
              <TouchableOpacity
                key={label}
                style={[estilos.dataChip, dias === -1 && estilos.dataChipLimpar]}
                onPress={() => {
                  if (dias === -1) { setDataVencimento(''); return }
                  const d = new Date()
                  d.setDate(d.getDate() + dias)
                  const dd = String(d.getDate()).padStart(2, '0')
                  const mm = String(d.getMonth() + 1).padStart(2, '0')
                  const aaaa = d.getFullYear()
                  setDataVencimento(`${dd}/${mm}/${aaaa}`)
                }}
              >
                <Text style={[estilos.dataChipTexto, dias === -1 && estilos.dataChipTextoLimpar]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={estilos.dataInput}
            value={dataVencimento}
            inputAccessoryViewID={Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_ID : undefined}
            returnKeyType="done"
            blurOnSubmit
            onChangeText={(t) => {
              const nums = t.replace(/\D/g, '').slice(0, 8)
              let fmt = nums
              if (nums.length > 2) fmt = nums.slice(0, 2) + '/' + nums.slice(2)
              if (nums.length > 4) fmt = nums.slice(0, 2) + '/' + nums.slice(2, 4) + '/' + nums.slice(4)
              setDataVencimento(fmt)
            }}
            placeholder="DD/MM/AAAA"
            placeholderTextColor={C.text3}
            keyboardType="numeric"
          />
          {erros.dataVencimento && (
            <View style={estilos.erroInline}>
              <Text style={estilos.erroInlineTexto}>{erros.dataVencimento}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Tipo de pagamento — logo abaixo de Detalhes */}
      <View style={estilos.secaoBox}>
        <Text style={estilos.secaoLabel}>💳 Forma de lançamento</Text>
        <View style={estilos.tipoPagRow}>
          <TouchableOpacity
            style={[estilos.tipoPagBtn, tipoPagamento === 'fiado' && estilos.tipoPagBtnAtivo]}
            onPress={() => setTipoPagamento('fiado')}
            accessibilityRole="radio"
            accessibilityLabel="Fiado normal"
            accessibilityState={{ selected: tipoPagamento === 'fiado' }}
          >
            <Ionicons name="wallet-outline" size={18} color={tipoPagamento === 'fiado' ? C.white : C.text2} />
            <Text style={[estilos.tipoPagTexto, tipoPagamento === 'fiado' && estilos.tipoPagTextoAtivo]}>Fiado normal</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[estilos.tipoPagBtn, tipoPagamento === 'parcelado' && estilos.tipoPagBtnAtivo]}
            onPress={() => setTipoPagamento('parcelado')}
            accessibilityRole="radio"
            accessibilityLabel="Parcelar"
            accessibilityState={{ selected: tipoPagamento === 'parcelado' }}
          >
            <Ionicons name="calendar-outline" size={18} color={tipoPagamento === 'parcelado' ? C.white : C.text2} />
            <Text style={[estilos.tipoPagTexto, tipoPagamento === 'parcelado' && estilos.tipoPagTextoAtivo]}>Parcelar</Text>
          </TouchableOpacity>
        </View>

        {tipoPagamento === 'parcelado' && (
          <View style={{ marginTop: 14 }}>
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
            {valor.length > 0 && !isNaN(parseFloat(valor.replace(',', '.'))) && (
              <View style={estilos.parcelaResumoBox}>
                <Text style={estilos.parcelaResumoTexto}>
                  {numParcelas}x de{' '}
                  <Text style={{ fontWeight: '800', color: C.green }}>
                    {(Math.round((parseFloat(valor.replace(',', '.')) / numParcelas) * 100) / 100)
                      .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </Text>
                </Text>
                <Text style={estilos.parcelaResumoSub}>a cada vencimento configurado</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Foto comprovante */}
      {modulos.foto_comprovante && <View style={estilos.secaoBox}>
        <Text style={estilos.secaoLabel}>📷 Comprovante (opcional)</Text>
        {fotoUri ? (
          <View style={estilos.fotoPreview}>
            <Image source={{ uri: fotoUri }} style={estilos.fotoImagem} resizeMode="cover" />
            <TouchableOpacity style={estilos.fotoRemover} onPress={() => setFotoUri(null)}>
              <Ionicons name="close-circle" size={24} color={C.red} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={estilos.fotoBotoes}>
            <TouchableOpacity style={estilos.fotoBotao} onPress={tirarFoto}>
              <Ionicons name="camera-outline" size={22} color={C.green} />
              <Text style={estilos.fotoBotaoTexto}>Câmera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={estilos.fotoBotao} onPress={escolherFoto}>
              <Ionicons name="image-outline" size={22} color={C.green} />
              <Text style={estilos.fotoBotaoTexto}>Galeria</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>}

      {/* Categoria */}
      {modulos.categorias && <View style={estilos.secaoBox}>
        <Text style={estilos.secaoLabel}>🏷️ Categoria</Text>

        {/* Modal editar categoria */}
        <Modal visible={!!editandoCategoria} transparent animationType="fade">
          <View style={estilos.editOverlay}>
            <View style={estilos.editModal}>
              <Text style={estilos.editTitulo}>Renomear categoria</Text>
              <TextInput
                style={estilos.editInput}
                value={nomeEdicao}
                onChangeText={setNomeEdicao}
                autoFocus
                onSubmitEditing={confirmarEdicao}
                returnKeyType="done"
              />
              <View style={estilos.editBtns}>
                <TouchableOpacity style={estilos.editBtnCancelar} onPress={() => { setEditandoCategoria(null); setNomeEdicao('') }}>
                  <Text style={{ color: C.text2, fontWeight: '600' }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={estilos.editBtnSalvar} onPress={confirmarEdicao}>
                  <Text style={{ color: C.white, fontWeight: '700' }}>Salvar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <View style={estilos.categorias}>
          {todasCategorias.map((cat) => {
            const isExtra = categoriasExtra.includes(cat)
            const isAtiva = categoria === cat
            return (
              <View key={cat} style={[estilos.chip, isAtiva && estilos.chipAtivo, { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: isExtra ? 4 : undefined }]}>
                <TouchableOpacity onPress={() => setCategoria(cat)}>
                  <Text style={[estilos.chipTexto, isAtiva && estilos.chipTextoAtivo]}>{cat}</Text>
                </TouchableOpacity>
                {isExtra && (
                  <TouchableOpacity
                    onPress={() => { setEditandoCategoria(cat); setNomeEdicao(cat) }}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  >
                    <Ionicons name="pencil-outline" size={13} color={isAtiva ? C.green : C.text3} />
                  </TouchableOpacity>
                )}
                {isExtra && (
                  <TouchableOpacity
                    onPress={() => {
                      removerCat(cat)
                      if (categoria === cat) setCategoria('Mercadoria')
                    }}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 6 }}
                  >
                    <Ionicons name="close" size={13} color={isAtiva ? C.white : C.text3} />
                  </TouchableOpacity>
                )}
              </View>
            )
          })}
        </View>
        <View style={estilos.novaCatRow}>
          <TextInput
            style={estilos.novaCatInput}
            value={novaCategoria}
            onChangeText={setNovaCategoria}
            placeholder="Nova categoria..."
            placeholderTextColor={C.text3}
            onSubmitEditing={adicionarCategoria}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[estilos.novaCatBtn, novaCategoria.length < 2 && estilos.novaCatBtnDesab]}
            onPress={adicionarCategoria}
            disabled={novaCategoria.length < 2}
          >
            <Ionicons name="add" size={20} color={novaCategoria.length >= 2 ? C.white : C.text3} />
          </TouchableOpacity>
        </View>
      </View>}

      {/* Rodapé */}
      <View style={estilos.rodape}>
        {clienteSelecionado && (
          <View style={estilos.resumoCliente}>
            <Avatar nome={clienteSelecionado.nome} tamanho={32} />
            <Text style={estilos.resumoClienteNome}>
              Para: <Text style={{ color: C.green, fontWeight: '700' }}>{clienteSelecionado.nome}</Text>
            </Text>
          </View>
        )}
        <Botao
          titulo={tipoPagamento === 'parcelado' ? `Registrar ${numParcelas}x parcelas` : 'Registrar venda fiado'}
          onPress={handleSalvar}
          carregando={salvando}
        />
      </View>

    </ScrollView>
    {/* Modal novo cliente inline */}
    <Modal visible={modalNovoCliente} animationType="slide" presentationStyle="formSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={estilos.modal}>
          <View style={estilos.modalHandle} />
          <View style={estilos.modalHeader}>
            <View>
              <Text style={estilos.modalTitulo}>Novo cliente</Text>
              <Text style={estilos.modalSub}>Cadastre rapidamente e continue a venda</Text>
            </View>
            <TouchableOpacity
              style={estilos.fecharBtn}
              onPress={() => setModalNovoCliente(false)}
              accessibilityRole="button"
              accessibilityLabel="Fechar"
            >
              <Ionicons name="close" size={20} color={C.text2} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={estilos.btnAgenda}
            onPress={buscarNaAgenda}
            accessibilityRole="button"
            accessibilityLabel="Importar contato da agenda"
          >
            <Ionicons name="person-add-outline" size={16} color={C.green} />
            <Text style={estilos.btnAgendaTexto}>Importar da agenda</Text>
          </TouchableOpacity>
          <Campo label="Nome *" value={nomeNovoCliente} onChangeText={setNomeNovoCliente} placeholder="Nome do cliente" autoCapitalize="words" />
          <Campo label="Telefone / WhatsApp" value={telNovoCliente} onChangeText={setTelNovoCliente} placeholder="(00) 00000-0000" keyboardType="phone-pad" />
          {erroNovoCliente ? (
            <View style={estilos.erroBox}>
              <Ionicons name="alert-circle" size={15} color={C.red} />
              <Text style={estilos.erroTexto}>{erroNovoCliente}</Text>
            </View>
          ) : null}
          <Botao titulo="Salvar e selecionar cliente" onPress={handleAdicionarCliente} carregando={salvandoCliente} />
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {sucesso && (
        <Animated.View style={[estilos.toast, { opacity: toastOpacity, transform: [{ translateY: toastTranslate }] }]}>
          <View style={estilos.toastRow}>
            <Text style={estilos.toastIcon}>{primeiraVenda ? '🎊' : '✅'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={estilos.toastTitulo}>
                {salvouOffline
                  ? 'Salvo offline ☁'
                  : tipoPagamento === 'parcelado'
                    ? `${numParcelas} parcelas registradas!`
                    : primeiraVenda ? 'Primeira venda!' : 'Venda registrada!'}
              </Text>
              {salvouOffline
                ? <Text style={estilos.toastSub}>Será sincronizado ao reconectar</Text>
                : clienteSucesso && <Text style={estilos.toastSub}>{clienteSucesso.nome}</Text>
              }
            </View>
            {!salvouOffline && clienteSucesso?.telefone && (
              <TouchableOpacity onPress={handleCobrarWhatsApp} style={estilos.toastWaBtn}>
                <Ionicons name="logo-whatsapp" size={15} color={C.white} />
                <Text style={estilos.toastWaTexto}>Cobrar</Text>
              </TouchableOpacity>
            )}
          </View>
          {ultimaVendaId && !salvouOffline && (
            <TouchableOpacity onPress={handleDesfazer} disabled={desfazendo} style={{ marginTop: 6 }}>
              <Text style={estilos.toastDesfazer}>{desfazendo ? 'Desfazendo...' : '↩ Desfazer'}</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}
    </View>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { paddingTop: 8, paddingBottom: 110 },
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFF8E1', borderWidth: 1, borderColor: '#FFE082',
    borderRadius: 12, padding: 12, marginHorizontal: 16, marginBottom: 8,
  },
  offlineBannerTexto: { color: '#7a5c00', fontSize: 13, fontWeight: '500', flex: 1 },
  erroGeralBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.redLight, borderWidth: 1, borderColor: C.redBorder,
    borderRadius: 12, padding: 14, marginHorizontal: 16, marginBottom: 8,
  },
  erroGeralTexto: { color: C.red, fontSize: 14, fontWeight: '600', flex: 1 },
  secaoBox: {
    backgroundColor: C.card, marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  secaoLabel: { fontSize: 12, fontWeight: '700', color: C.text2, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  erroInline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  erroInlineTexto: { fontSize: 12, color: C.red, fontWeight: '500' },

  buscaClienteRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  buscaClienteInput: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.border,
    borderRadius: 12, paddingHorizontal: 12, height: 44,
  },
  buscaClienteTexto: { flex: 1, fontSize: 14, color: C.text },
  btnNovoCliente: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: C.greenLight, borderWidth: 1, borderColor: C.greenMid,
    alignItems: 'center', justifyContent: 'center',
  },
  btnAgenda: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.greenLight, borderWidth: 1, borderColor: C.greenMid,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10,
    marginBottom: 12, alignSelf: 'flex-start',
  },
  btnAgendaTexto: { fontSize: 13, color: C.green, fontWeight: '600' },

  clienteSelecionadoBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.greenLight, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: C.greenMid,
  },
  clienteSelecionadoNome: { flex: 1, fontSize: 14, fontWeight: '700', color: C.green },

  clienteResultado: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  clienteResultadoNome: { fontSize: 14, fontWeight: '600', color: C.text },
  clienteResultadoSaldo: { fontSize: 12, color: C.red, marginTop: 1 },

  adicionarNovoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.greenLight, borderRadius: 12, padding: 12, marginTop: 6,
    borderWidth: 1, borderColor: C.greenMid,
  },
  adicionarNovoIcone: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  adicionarNovoTexto: { fontSize: 13, fontWeight: '700', color: C.greenDark },
  adicionarNovoSub: { fontSize: 11, color: C.green, marginTop: 1 },

  categorias: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.bg },
  chipAtivo: { backgroundColor: C.greenLight, borderColor: C.green },
  chipTexto: { fontSize: 13, color: C.text2, fontWeight: '500' },
  chipTextoAtivo: { color: C.green, fontWeight: '700' },
  novaCatRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  novaCatInput: {
    flex: 1, height: 40, backgroundColor: C.bg, borderWidth: 1.5,
    borderColor: C.border, borderRadius: 10, paddingHorizontal: 12,
    fontSize: 13, color: C.text,
  },
  novaCatBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  novaCatBtnDesab: { backgroundColor: C.border },

  editOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  editModal: { width: '100%', backgroundColor: C.card, borderRadius: 18, padding: 24, gap: 16 },
  editTitulo: { fontSize: 16, fontWeight: '800', color: C.text },
  editInput: {
    borderWidth: 1.5, borderColor: C.green, borderRadius: 12,
    paddingHorizontal: 14, height: 48, fontSize: 15, color: C.text,
    backgroundColor: C.greenLight,
  },
  editBtns: { flexDirection: 'row', gap: 10 },
  editBtnCancelar: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  editBtnSalvar: { flex: 1, height: 44, borderRadius: 12, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },

  fotoPreview: { position: 'relative' },
  fotoImagem: { width: '100%', height: 160, borderRadius: 12 },
  fotoRemover: { position: 'absolute', top: 8, right: 8 },
  fotoBotoes: { flexDirection: 'row', gap: 10 },
  fotoBotao: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.greenLight, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: C.greenMid,
  },
  fotoBotaoTexto: { fontSize: 14, color: C.green, fontWeight: '600' },
  rodape: { paddingHorizontal: 16, paddingBottom: 40 },
  resumoCliente: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.greenLight, borderRadius: 10, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: C.greenMid,
  },
  resumoClienteNome: { fontSize: 13, color: C.text2, fontWeight: '500' },

  btnWhatsApp: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#25D366', paddingHorizontal: 24, paddingVertical: 14,
    borderRadius: 12, width: '100%', justifyContent: 'center',
    shadowColor: '#25D366', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  btnWhatsAppTexto: { color: C.white, fontWeight: '800', fontSize: 15 },
  labelDataRapida: { fontSize: 12, fontWeight: '600', color: C.text2, marginBottom: 8, letterSpacing: 0.3 },
  datasRapidasRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  dataChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99,
    backgroundColor: C.greenLight, borderWidth: 1, borderColor: C.greenMid,
  },
  dataChipLimpar: { backgroundColor: C.bg, borderColor: C.border },
  dataChipTexto: { fontSize: 12, color: C.green, fontWeight: '700' },
  dataChipTextoLimpar: { color: C.text3 },
  dataInput: {
    height: 48, borderWidth: 1.5, borderColor: C.border, borderRadius: 12,
    backgroundColor: C.bg, paddingHorizontal: 14, fontSize: 15, color: C.text,
  },
  sucessoContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: C.bg, gap: 12 },
  sucessoIconeBox: { width: 90, height: 90, borderRadius: 28, backgroundColor: C.greenLight, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  sucessoTitulo: { fontSize: 24, fontWeight: '800', color: C.text },
  sucessoTexto: { fontSize: 15, color: C.text2 },
  primeiraVendaBox: {
    backgroundColor: C.greenLight, borderRadius: 16, padding: 16, marginHorizontal: 8,
    borderWidth: 1, borderColor: C.greenMid,
  },
  primeiraVendaTexto: { fontSize: 15, color: C.greenDark, fontWeight: '500', lineHeight: 22, textAlign: 'center' },
  btnDesfazer: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8,
  },
  btnDesfazerTexto: { color: C.red, fontWeight: '500', fontSize: 13 },
  btnNova: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.green, paddingHorizontal: 24, paddingVertical: 16, borderRadius: 14, alignSelf: 'stretch', justifyContent: 'center' },
  btnNovaTexto: { color: C.white, fontWeight: '700', fontSize: 16 },
  btnVer: { paddingVertical: 8 },
  btnVerTexto: { color: C.green, fontSize: 14, fontWeight: '600' },
  toast: { position: 'absolute', bottom: 24, left: 16, right: 16, backgroundColor: C.green, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  toastRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toastIcon: { fontSize: 22 },
  toastTitulo: { fontSize: 15, fontWeight: '700', color: '#fff' },
  toastSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  toastWaBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  toastWaTexto: { fontSize: 13, fontWeight: '600', color: '#fff' },
  toastDesfazer: { fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },

  tipoPagRow: { flexDirection: 'row', gap: 10 },
  tipoPagBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 12,
    borderWidth: 1.5, borderColor: C.border, backgroundColor: C.bg,
  },
  tipoPagBtnAtivo: { backgroundColor: C.green, borderColor: C.green },
  tipoPagTexto: { fontSize: 13, fontWeight: '700', color: C.text2 },
  tipoPagTextoAtivo: { color: C.white },

  parcelasLabel: { fontSize: 12, fontWeight: '600', color: C.text2, marginBottom: 10, letterSpacing: 0.3 },
  parcelasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  parcelaChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 99,
    borderWidth: 1.5, borderColor: C.border, backgroundColor: C.bg,
  },
  parcelaChipAtivo: { backgroundColor: C.greenLight, borderColor: C.green },
  parcelaChipTexto: { fontSize: 14, fontWeight: '700', color: C.text2 },
  parcelaChipTextoAtivo: { color: C.green },
  parcelaResumoBox: {
    marginTop: 12, backgroundColor: C.greenLight, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: C.greenMid,
  },
  parcelaResumoTexto: { fontSize: 15, color: C.text, fontWeight: '500' },
  parcelaResumoSub: { fontSize: 12, color: C.text2, marginTop: 3 },

  modal: { flex: 1, padding: 24, paddingTop: 12, backgroundColor: C.bg },
  modalHandle: { width: 40, height: 4, borderRadius: 99, backgroundColor: C.border, alignSelf: 'center', marginBottom: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  modalTitulo: { fontSize: 20, fontWeight: '800', color: C.text },
  modalSub: { fontSize: 13, color: C.text2, marginTop: 2 },
  fecharBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
  erroBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.redLight, borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: C.redBorder },
  erroTexto: { color: C.red, fontSize: 13, fontWeight: '500', flex: 1 },
})


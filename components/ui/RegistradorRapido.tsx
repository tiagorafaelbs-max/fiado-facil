import { useState, useEffect } from 'react'
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  TextInput, FlatList, ActivityIndicator, Platform,
  KeyboardAvoidingView, Keyboard,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useVendas } from '../../hooks/useVendas'
import { useClientes } from '../../hooks/useClientes'
import { useAuth } from '../../hooks/useAuth'
import { Avatar } from './Avatar'
import { sanitizarTexto, formatarMoeda, validarDataBR } from '../../lib/validacao'
import { C } from '../../constants/colors'
import type { Cliente } from '../../types'

interface Props {
  visivel: boolean
  onFechar: () => void
  clientePreSelecionado?: Cliente
}

export function RegistradorRapido({ visivel, onFechar, clientePreSelecionado }: Props) {
  const { usuario } = useAuth()
  const { criar } = useVendas()
  const { clientes, buscar } = useClientes()

  const [etapa, setEtapa] = useState<'cliente' | 'valor'>('cliente')
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null)
  const [busca, setBusca] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (visivel) {
      buscar()
      if (clientePreSelecionado) {
        setClienteSelecionado(clientePreSelecionado)
        setEtapa('valor')
      } else {
        setEtapa('cliente')
        setClienteSelecionado(null)
      }
      setBusca(''); setDescricao(''); setValor(''); setVencimento('')
      setSucesso(false); setErro('')
    }
  }, [visivel])

  function fechar() {
    onFechar()
    setTimeout(() => {
      setEtapa('cliente'); setClienteSelecionado(null)
      setBusca(''); setDescricao(''); setValor(''); setVencimento('')
      setSucesso(false); setErro('')
    }, 300)
  }

  const clientesFiltrados = busca.trim().length > 0
    ? clientes.filter(c => c.nome.toLowerCase().includes(busca.toLowerCase()))
    : clientes.slice(0, 8)

  function selecionarCliente(c: Cliente) {
    setClienteSelecionado(c)
    setEtapa('valor')
    setBusca('')
    Keyboard.dismiss()
  }

  function formatarData(t: string) {
    const nums = t.replace(/\D/g, '').slice(0, 8)
    let fmt = nums
    if (nums.length > 2) fmt = nums.slice(0, 2) + '/' + nums.slice(2)
    if (nums.length > 4) fmt = nums.slice(0, 2) + '/' + nums.slice(2, 4) + '/' + nums.slice(4)
    return fmt
  }

  async function salvar() {
    if (!clienteSelecionado) return
    const v = parseFloat(valor.replace(',', '.'))
    if (isNaN(v) || v <= 0) { setErro('Informe um valor válido.'); return }
    const cVenc = validarDataBR(vencimento)
    if (!cVenc.valida) { setErro(cVenc.mensagem!); return }

    setSalvando(true); setErro('')
    try {
      let vencimentoISO: string | undefined
      if (vencimento.length === 10) {
        const [dd, mm, aaaa] = vencimento.split('/')
        if (dd && mm && aaaa) vencimentoISO = `${aaaa}-${mm}-${dd}`
      }

      await criar({
        cliente_id: clienteSelecionado.id,
        descricao: sanitizarTexto(descricao) || 'Venda fiado',
        valor: v,
        data_vencimento: vencimentoISO,
        categoria: 'Mercadoria',
      })

      setSucesso(true)
    } catch (e: any) {
      setErro(e.message ?? 'Erro ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  function novamente() {
    setSucesso(false); setValor(''); setDescricao(''); setVencimento(''); setErro('')
    if (!clientePreSelecionado) {
      setEtapa('cliente'); setClienteSelecionado(null)
    }
  }

  return (
    <Modal visible={visivel} animationType="slide" presentationStyle="pageSheet" onRequestClose={fechar}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={estilos.container}>

          {/* Handle + Header */}
          <View style={estilos.handleArea}>
            <View style={estilos.handle} />
          </View>

          <View style={estilos.header}>
            <View style={estilos.headerEsq}>
              <View style={estilos.headerIcone}>
                <Text style={{ fontSize: 22 }}>🧾</Text>
              </View>
              <View>
                <Text style={estilos.headerTitulo}>Registro Rápido</Text>
                <Text style={estilos.headerSub}>
                  {etapa === 'cliente' ? 'Selecione o cliente' : clienteSelecionado?.nome}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={estilos.fecharBtn} onPress={fechar}>
              <Ionicons name="close" size={20} color={C.text2} />
            </TouchableOpacity>
          </View>

          {/* Etapas indicadoras */}
          <View style={estilos.etapas}>
            <View style={[estilos.etapaItem, etapa === 'cliente' || clienteSelecionado ? estilos.etapaAtiva : {}]}>
              <View style={[estilos.etapaBolinha, clienteSelecionado ? estilos.etapaBolinhaOk : etapa === 'cliente' ? estilos.etapaBolinhaAtiva : {}]}>
                {clienteSelecionado
                  ? <Ionicons name="checkmark" size={12} color={C.white} />
                  : <Text style={estilos.etapaNum}>1</Text>
                }
              </View>
              <Text style={estilos.etapaLabel}>Cliente</Text>
            </View>
            <View style={estilos.etapaLinha} />
            <View style={[estilos.etapaItem, etapa === 'valor' ? estilos.etapaAtiva : {}]}>
              <View style={[estilos.etapaBolinha, etapa === 'valor' ? estilos.etapaBolinhaAtiva : {}]}>
                <Text style={estilos.etapaNum}>2</Text>
              </View>
              <Text style={estilos.etapaLabel}>Valor</Text>
            </View>
          </View>

          {/* ETAPA 1: Selecionar cliente */}
          {etapa === 'cliente' && (
            <View style={{ flex: 1 }}>
              <View style={estilos.buscaBox}>
                <Ionicons name="search-outline" size={16} color={C.text3} />
                <TextInput
                  style={estilos.buscaInput}
                  value={busca}
                  onChangeText={setBusca}
                  placeholder="Buscar cliente..."
                  placeholderTextColor={C.text3}
                  autoFocus
                />
                {busca.length > 0 && (
                  <TouchableOpacity onPress={() => setBusca('')}>
                    <Ionicons name="close-circle" size={16} color={C.text3} />
                  </TouchableOpacity>
                )}
              </View>

              <FlatList
                data={clientesFiltrados}
                keyExtractor={i => i.id}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
                renderItem={({ item }) => (
                  <TouchableOpacity style={estilos.clienteRow} onPress={() => selecionarCliente(item)}>
                    <Avatar nome={item.nome} tamanho={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={estilos.clienteNome}>{item.nome}</Text>
                      {(item.saldo_devedor ?? 0) > 0 && (
                        <Text style={estilos.clienteSaldo}>Deve: {formatarMoeda(item.saldo_devedor!)}</Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={C.text3} />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={estilos.vazio}>
                    <Text style={estilos.vazioTexto}>Nenhum cliente encontrado</Text>
                  </View>
                }
              />
            </View>
          )}

          {/* ETAPA 2: Valor e detalhes */}
          {etapa === 'valor' && (
            <View style={estilos.valorContainer}>

              {sucesso ? (
                <View style={estilos.sucessoBox}>
                  <Text style={{ fontSize: 52, marginBottom: 12 }}>✅</Text>
                  <Text style={estilos.sucessoTitulo}>Registrado!</Text>
                  <Text style={estilos.sucessoSub}>
                    {formatarMoeda(parseFloat(valor.replace(',', '.') || '0'))} para {clienteSelecionado?.nome}
                  </Text>
                  <View style={estilos.sucessoBotoes}>
                    <TouchableOpacity style={estilos.btnNovamente} onPress={novamente}>
                      <Ionicons name="add" size={18} color={C.green} />
                      <Text style={estilos.btnNovamenteTexto}>Novo lançamento</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={estilos.btnFecharSucesso} onPress={fechar}>
                      <Text style={estilos.btnFecharSucessoTexto}>Fechar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  {/* Display tipo caixa registradora */}
                  <View style={estilos.display}>
                    <Text style={estilos.displayLabel}>VALOR A LANÇAR</Text>
                    <View style={estilos.displayValorRow}>
                      <Text style={estilos.displayMoeda}>R$</Text>
                      <TextInput
                        style={estilos.displayValor}
                        value={valor}
                        onChangeText={setValor}
                        keyboardType="decimal-pad"
                        placeholder="0,00"
                        placeholderTextColor="rgba(255,255,255,0.3)"
                        autoFocus={etapa === 'valor'}
                        selectionColor={C.green}
                      />
                    </View>
                    <View style={estilos.displayDivider} />
                    <TouchableOpacity
                      style={estilos.displayCliente}
                      onPress={() => { if (!clientePreSelecionado) setEtapa('cliente') }}
                    >
                      <Avatar nome={clienteSelecionado?.nome ?? ''} tamanho={24} />
                      <Text style={estilos.displayClienteNome}>{clienteSelecionado?.nome}</Text>
                      {!clientePreSelecionado && <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.5)" />}
                    </TouchableOpacity>
                  </View>

                  {/* Campos extras */}
                  <View style={estilos.extras}>
                    <View style={estilos.extraCampo}>
                      <Text style={estilos.extraLabel}>Descrição</Text>
                      <TextInput
                        style={estilos.extraInput}
                        value={descricao}
                        onChangeText={setDescricao}
                        placeholder="Ex: Arroz, Serviço..."
                        placeholderTextColor={C.text3}
                      />
                    </View>
                    <View style={[estilos.extraCampo, { borderLeftWidth: 1, borderLeftColor: C.border, paddingLeft: 12 }]}>
                      <Text style={estilos.extraLabel}>Vencimento</Text>
                      <TextInput
                        style={estilos.extraInput}
                        value={vencimento}
                        onChangeText={t => setVencimento(formatarData(t))}
                        placeholder="DD/MM/AAAA"
                        placeholderTextColor={C.text3}
                        keyboardType="numeric"
                        maxLength={10}
                      />
                    </View>
                  </View>

                  {erro ? (
                    <View style={estilos.erroBox}>
                      <Ionicons name="alert-circle" size={14} color={C.red} />
                      <Text style={estilos.erroTexto}>{erro}</Text>
                    </View>
                  ) : null}

                  {/* Botão registrar */}
                  <TouchableOpacity
                    style={[estilos.btnRegistrar, salvando && { opacity: 0.6 }]}
                    onPress={salvar}
                    disabled={salvando}
                  >
                    {salvando
                      ? <ActivityIndicator color={C.white} />
                      : <>
                          <Text style={{ fontSize: 20 }}>🧾</Text>
                          <Text style={estilos.btnRegistrarTexto}>Registrar lançamento</Text>
                        </>
                    }
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  handleArea: { paddingTop: 12, paddingBottom: 4, alignItems: 'center' },
  handle: { width: 40, height: 4, borderRadius: 99, backgroundColor: C.border },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerEsq: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcone: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: C.greenLight, borderWidth: 1, borderColor: C.greenMid,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitulo: { fontSize: 16, fontWeight: '800', color: C.text },
  headerSub: { fontSize: 12, color: C.text2, marginTop: 1 },
  fecharBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },

  etapas: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14 },
  etapaItem: { alignItems: 'center', gap: 4 },
  etapaAtiva: {},
  etapaBolinha: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  etapaBolinhaAtiva: { backgroundColor: C.green },
  etapaBolinhaOk: { backgroundColor: C.greenDark },
  etapaNum: { fontSize: 12, fontWeight: '700', color: C.white },
  etapaLabel: { fontSize: 10, fontWeight: '600', color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5 },
  etapaLinha: { flex: 1, height: 2, backgroundColor: C.border, marginHorizontal: 8, marginBottom: 14 },

  buscaBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.card, marginHorizontal: 16, marginBottom: 10,
    borderRadius: 14, paddingHorizontal: 14, height: 48,
    borderWidth: 1.5, borderColor: C.border,
  },
  buscaInput: { flex: 1, fontSize: 15, color: C.text },
  clienteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: C.border,
  },
  clienteNome: { fontSize: 15, fontWeight: '600', color: C.text },
  clienteSaldo: { fontSize: 12, color: C.red, marginTop: 2 },
  vazio: { alignItems: 'center', paddingTop: 32 },
  vazioTexto: { fontSize: 14, color: C.text2 },

  valorContainer: { flex: 1, paddingHorizontal: 16 },

  display: {
    backgroundColor: '#1A2332', borderRadius: 20, padding: 20, marginVertical: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 6,
  },
  displayLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  displayValorRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  displayMoeda: { fontSize: 22, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
  displayValor: { flex: 1, fontSize: 42, fontWeight: '900', color: C.white, letterSpacing: -1 },
  displayDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 14 },
  displayCliente: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  displayClienteNome: { flex: 1, fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },

  extras: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  extraCampo: { flex: 1 },
  extraLabel: { fontSize: 10, fontWeight: '700', color: C.text3, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  extraInput: { fontSize: 14, color: C.text, height: 32 },

  erroBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.redLight, borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: C.redBorder },
  erroTexto: { color: C.red, fontSize: 13, fontWeight: '500', flex: 1 },

  btnRegistrar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: C.green, borderRadius: 16, paddingVertical: 18,
    shadowColor: C.green, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  btnRegistrarTexto: { color: C.white, fontWeight: '800', fontSize: 17 },

  sucessoBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  sucessoTitulo: { fontSize: 26, fontWeight: '900', color: C.text },
  sucessoSub: { fontSize: 15, color: C.text2, textAlign: 'center' },
  sucessoBotoes: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btnNovamente: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.greenLight, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12,
    borderWidth: 1, borderColor: C.greenMid,
  },
  btnNovamenteTexto: { color: C.green, fontWeight: '700', fontSize: 14 },
  btnFecharSucesso: { backgroundColor: C.green, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  btnFecharSucessoTexto: { color: C.white, fontWeight: '700', fontSize: 14 },
})

import { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useClientes } from '../hooks/useClientes'
import { useBeep } from '../hooks/useBeep'
import { agendarNotificacoesVencimento } from '../hooks/useNotificacoes'
import { Avatar } from '../components/ui/Avatar'
import { Campo } from '../components/ui/Campo'
import { Botao } from '../components/ui/Botao'
import { formatarMoeda, formatarInputMoeda } from '../lib/validacao'
import { KeyboardToolbar } from '../components/ui/KeyboardToolbar'
import { C } from '../constants/colors'
import type { Cliente } from '../types'

export default function NovoPagamentoScreen() {
  const router = useRouter()
  const { usuario } = useAuth()
  const { clientes, buscar } = useClientes()
  const { tocar } = useBeep()

  const [busca, setBusca] = useState('')
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null)
  const [saldo, setSaldo] = useState(0)
  const [valor, setValor] = useState('')
  const [observacao, setObservacao] = useState('')
  const [dataPagamento, setDataPagamento] = useState('')
  const [formaPagamento, setFormaPagamento] = useState<'dinheiro' | 'cartao' | 'pix' | 'outros'>('dinheiro')
  const [erroValor, setErroValor] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [sucesso, setSucesso] = useState(false)

  useFocusEffect(useCallback(() => {
    buscar()
    // Reset ao entrar na tela
    setBusca('')
    setClienteSelecionado(null)
    setSaldo(0)
    setValor('')
    setObservacao('')
    setErroValor('')
    setSucesso(false)
  }, [buscar]))

  const clientesFiltrados = clientes.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase()) &&
    (c.saldo_devedor ?? 0) > 0
  )

  async function selecionarCliente(cliente: Cliente) {
    setClienteSelecionado(cliente)
    setBusca('')
    // Busca saldo atualizado
    const { data } = await supabase
      .from('clientes_com_saldo')
      .select('saldo_devedor')
      .eq('id', cliente.id)
      .single()
    setSaldo(data?.saldo_devedor ?? cliente.saldo_devedor ?? 0)
    setValor(String(data?.saldo_devedor ?? cliente.saldo_devedor ?? '').replace('.', ','))
  }

  async function handleSalvar() {
    if (!clienteSelecionado || !usuario?.id) return
    const valorNum = parseFloat(valor.replace(',', '.'))
    setErroValor('')

    if (isNaN(valorNum) || valorNum <= 0) {
      setErroValor('Informe um valor válido.')
      return
    }
    if (valorNum > saldo) {
      setErroValor(`Valor maior que o saldo devedor (${formatarMoeda(saldo)}).`)
      return
    }

    setSalvando(true)
    try {
      let dataPagISO = new Date().toISOString().split('T')[0]
      if (dataPagamento.length === 10) {
        const [dd, mm, aaaa] = dataPagamento.split('/')
        if (dd && mm && aaaa) dataPagISO = `${aaaa}-${mm}-${dd}`
      }

      const { error } = await supabase.from('pagamentos').insert({
        cliente_id: clienteSelecionado.id,
        usuario_id: usuario.id,
        valor: valorNum,
        data_pagamento: dataPagISO,
        observacao: observacao.trim() || null,
        forma_pagamento: formaPagamento,
      })
      if (error) throw error

      await tocar()
      agendarNotificacoesVencimento() // reagenda notificações refletindo o novo estado de dívidas
      setSucesso(true)
      setValor('')
      setObservacao('')
      setTimeout(() => router.replace('/(tabs)'), 2000)
    } catch (e: any) {
      Alert.alert('Erro', e.message ?? 'Não foi possível registrar o pagamento.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <KeyboardToolbar />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={s.container}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={s.header}>
            <TouchableOpacity style={s.voltarBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={20} color={C.text2} />
            </TouchableOpacity>
            <Text style={s.titulo}>Registrar Pagamento</Text>
            <View style={{ width: 36 }} />
          </View>

          {/* Sucesso */}
          {sucesso && (
            <View style={s.sucessoBox}>
              <Ionicons name="checkmark-circle" size={22} color={C.green} />
              <Text style={s.sucessoTexto}>Pagamento registrado com sucesso!</Text>
            </View>
          )}

          {/* Buscar cliente */}
          {!clienteSelecionado ? (
            <View style={s.card}>
              <Text style={s.cardLabel}>Selecione o cliente</Text>
              <View style={s.buscaRow}>
                <Ionicons name="search-outline" size={16} color={C.text3} />
                <TextInput
                  style={s.buscaInput}
                  placeholder="Buscar cliente com saldo..."
                  placeholderTextColor={C.text3}
                  value={busca}
                  onChangeText={setBusca}
                  autoFocus
                />
                {busca.length > 0 && (
                  <TouchableOpacity onPress={() => setBusca('')}>
                    <Ionicons name="close-circle" size={16} color={C.text3} />
                  </TouchableOpacity>
                )}
              </View>

              {busca.length > 0 && clientesFiltrados.length === 0 && (
                <Text style={s.vazio}>Nenhum cliente com saldo em aberto encontrado.</Text>
              )}

              {clientesFiltrados.slice(0, 8).map(cliente => (
                <TouchableOpacity
                  key={cliente.id}
                  style={s.clienteRow}
                  onPress={() => selecionarCliente(cliente)}
                >
                  <Avatar nome={cliente.nome} tamanho={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.clienteNome}>{cliente.nome}</Text>
                    <Text style={s.clienteSaldo}>{formatarMoeda(cliente.saldo_devedor ?? 0)} em aberto</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={C.text3} />
                </TouchableOpacity>
              ))}

              {busca.length === 0 && (
                <Text style={s.dica}>
                  {clientes.filter(c => (c.saldo_devedor ?? 0) > 0).length === 0
                    ? 'Nenhum cliente com saldo em aberto.'
                    : 'Digite o nome do cliente para buscar.'}
                </Text>
              )}
            </View>
          ) : (
            <>
              {/* Cliente selecionado */}
              <View style={s.card}>
                <View style={s.clienteCard}>
                  <Avatar nome={clienteSelecionado.nome} tamanho={48} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.clienteNomeSel}>{clienteSelecionado.nome}</Text>
                    <Text style={s.saldoLabel}>Saldo devedor</Text>
                    <Text style={s.saldoValor}>{formatarMoeda(saldo)}</Text>
                  </View>
                  <TouchableOpacity
                    style={s.trocarBtn}
                    onPress={() => { setClienteSelecionado(null); setSaldo(0); setValor('') }}
                  >
                    <Text style={s.trocarTexto}>Trocar</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Valor */}
              <View style={s.card}>
                <Text style={s.cardLabel}>Valor recebido</Text>
                <Campo
                  label="Valor (R$)"
                  value={valor}
                  onChangeText={v => { setValor(formatarInputMoeda(v)); setErroValor('') }}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  erro={erroValor}
                />

                {/* Atalhos rápidos */}
                <View style={s.atalhos}>
                  <TouchableOpacity style={s.atalho} onPress={() => setValor(String(saldo).replace('.', ','))}>
                    <Text style={s.atalhoTexto}>Total ({formatarMoeda(saldo)})</Text>
                  </TouchableOpacity>
                  {saldo >= 20 && (
                    <TouchableOpacity style={s.atalho} onPress={() => setValor(String((saldo / 2).toFixed(2)).replace('.', ','))}>
                      <Text style={s.atalhoTexto}>Metade</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Forma de pagamento */}
                <Text style={s.cardLabel}>Forma de pagamento</Text>
                <View style={s.formaRow}>
                  {([
                    { key: 'dinheiro', label: 'Dinheiro', icon: 'cash-outline' },
                    { key: 'cartao',   label: 'Cartão',   icon: 'card-outline' },
                    { key: 'pix',      label: 'Pix',      icon: 'qr-code-outline' },
                    { key: 'outros',   label: 'Outros',   icon: 'ellipsis-horizontal-outline' },
                  ] as const).map(op => (
                    <TouchableOpacity
                      key={op.key}
                      style={[s.formaChip, formaPagamento === op.key && s.formaChipAtivo]}
                      onPress={() => setFormaPagamento(op.key)}
                    >
                      <Ionicons
                        name={op.icon}
                        size={16}
                        color={formaPagamento === op.key ? C.green : C.text3}
                      />
                      <Text style={[s.formaChipTexto, formaPagamento === op.key && s.formaChipTextoAtivo]}>
                        {op.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Data do pagamento */}
                <Text style={[s.cardLabel, { marginTop: 4 }]}>Data do pagamento</Text>
                <View style={s.dataRow}>
                  {[
                    { label: 'Hoje', dias: 0 },
                    { label: 'Ontem', dias: -1 },
                  ].map(({ label, dias }) => {
                    const d = new Date()
                    d.setDate(d.getDate() + dias)
                    const fmt = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
                    const ativo = dataPagamento === fmt
                    return (
                      <TouchableOpacity
                        key={label}
                        style={[s.dataChip, ativo && s.dataChipAtivo]}
                        onPress={() => setDataPagamento(fmt)}
                      >
                        <Text style={[s.dataChipTexto, ativo && s.dataChipTextoAtivo]}>{label}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
                <TextInput
                  style={s.dataInput}
                  value={dataPagamento}
                  onChangeText={(t) => {
                    const nums = t.replace(/\D/g, '').slice(0, 8)
                    let fmt = nums
                    if (nums.length > 2) fmt = nums.slice(0, 2) + '/' + nums.slice(2)
                    if (nums.length > 4) fmt = nums.slice(0, 2) + '/' + nums.slice(2, 4) + '/' + nums.slice(4)
                    setDataPagamento(fmt)
                  }}
                  placeholder="DD/MM/AAAA (padrão: hoje)"
                  placeholderTextColor="#999"
                  keyboardType="numeric"
                  returnKeyType="done"
                />

                <Campo
                  label="Observação (opcional)"
                  value={observacao}
                  onChangeText={setObservacao}
                  placeholder="Ex: pagou via Pix"
                  multiline
                />
              </View>

              <Botao
                titulo={salvando ? 'Registrando...' : 'Confirmar pagamento'}
                onPress={handleSalvar}
                carregando={salvando}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 60 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16,
  },
  voltarBtn: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  titulo: { fontSize: 17, fontWeight: '800', color: C.text },
  card: {
    backgroundColor: C.card, borderRadius: 18, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  cardLabel: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 12 },
  buscaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.bg, borderRadius: 12, borderWidth: 1.5, borderColor: C.border,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
  },
  buscaInput: { flex: 1, fontSize: 14, color: C.text },
  clienteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  clienteNome: { fontSize: 14, fontWeight: '600', color: C.text },
  clienteSaldo: { fontSize: 12, color: C.red, fontWeight: '500', marginTop: 2 },
  vazio: { fontSize: 13, color: C.text3, textAlign: 'center', paddingVertical: 16 },
  dica: { fontSize: 13, color: C.text3, textAlign: 'center', paddingVertical: 12 },
  clienteCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  clienteNomeSel: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 2 },
  saldoLabel: { fontSize: 11, color: C.text3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  saldoValor: { fontSize: 18, fontWeight: '800', color: C.red },
  trocarBtn: {
    backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  trocarTexto: { fontSize: 12, color: C.text2, fontWeight: '600' },
  atalhos: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  atalho: {
    backgroundColor: C.greenLight, borderRadius: 8, borderWidth: 1, borderColor: C.greenMid,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  atalhoTexto: { fontSize: 12, color: C.green, fontWeight: '600' },
  sucessoBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.greenLight, borderRadius: 14, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: C.greenMid,
  },
  sucessoTexto: { fontSize: 14, color: C.green, fontWeight: '600' },
  formaRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  formaChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12,
    backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.border,
  },
  formaChipAtivo: {
    backgroundColor: C.greenLight, borderColor: C.green,
  },
  formaChipTexto: { fontSize: 13, color: C.text3, fontWeight: '600' },
  formaChipTextoAtivo: { color: C.green },
  dataRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  dataChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99,
    backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.border,
  },
  dataChipAtivo: { backgroundColor: C.greenLight, borderColor: C.green },
  dataChipTexto: { fontSize: 13, color: C.text2, fontWeight: '600' },
  dataChipTextoAtivo: { color: C.green, fontWeight: '700' },
  dataInput: {
    height: 46, borderWidth: 1.5, borderColor: C.border, borderRadius: 12,
    backgroundColor: C.bg, paddingHorizontal: 14, fontSize: 15, color: C.text,
    marginBottom: 14,
  },
})

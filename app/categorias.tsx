import { useCallback, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet, Alert, TextInput, ActivityIndicator, Platform, KeyboardAvoidingView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTenant } from '../hooks/useTenant'
import { useCategorias, CATS_BASE, CATEGORIA_FIXA } from '../hooks/useCategorias'
import { Botao } from '../components/ui/Botao'
import { sanitizarTexto } from '../lib/validacao'
import { C } from '../constants/colors'

function plural(n: number, um: string, varios: string) { return `${n} ${n === 1 ? um : varios}` }

// "Minhas categorias": cria, renomeia, exclui e oculta. Renomear/excluir mudam as vendas e os itens daquela categoria
// (feito no servidor, tudo ou nada). Excluir manda tudo para "Outro", sempre depois de mostrar quantos registros mexem.
export default function MinhasCategoriasScreen() {
  const insets = useSafeAreaInsets()
  const { tenantId, souFuncionario, papelConfirmado } = useTenant()
  const { extras, ocultas, todas, carregar, adicionar, contar, renomear, remover, mostrar } = useCategorias(tenantId || undefined)
  const [carregando, setCarregando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [nova, setNova] = useState('')
  const [erroNova, setErroNova] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [nomeEdicao, setNomeEdicao] = useState('')
  const [erroEdicao, setErroEdicao] = useState('')
  const [aviso, setAviso] = useState('')

  useFocusEffect(useCallback(() => { carregar().finally(() => setCarregando(false)) }, [carregar]))

  async function criar() {
    const nome = sanitizarTexto(nova)
    if (nome.length < 2) { setErroNova('Digite pelo menos 2 letras.'); return }
    setOcupado(true); setErroNova('')
    try {
      const ok = await adicionar(nome)
      if (!ok) setErroNova('Você já tem uma categoria com esse nome.')
      else { setNova(''); setAviso(`Categoria "${nome}" criada.`) }
    } catch (e: any) {
      setErroNova(e.message ?? 'Não foi possível criar agora.')
    } finally {
      setOcupado(false)
    }
  }

  function abrirRenomear(cat: string) { setEditando(cat); setNomeEdicao(cat); setErroEdicao('') }

  async function confirmarRenomear() {
    if (!editando) return
    const novo = sanitizarTexto(nomeEdicao)
    if (novo.length < 2) { setErroEdicao('Digite pelo menos 2 letras.'); return }
    if (novo === editando) { setEditando(null); return }
    setOcupado(true); setErroEdicao('')
    try {
      const r = await renomear(editando, novo)
      setEditando(null)
      const partes = [r.vendas > 0 ? plural(r.vendas, 'venda', 'vendas') : '', r.itens > 0 ? plural(r.itens, 'item', 'itens') : ''].filter(Boolean)
      setAviso(`"${editando}" agora é "${novo}"` + (partes.length ? `: ${partes.join(' e ')} atualizados.` : '.'))
    } catch (e: any) {
      setErroEdicao(e.message ?? 'Não foi possível renomear.')
    } finally {
      setOcupado(false)
    }
  }

  async function pedirExclusao(cat: string) {
    setOcupado(true)
    let uso = { vendas: 0, itens: 0 }
    try {
      uso = await contar(cat)
    } catch (e: any) {
      setOcupado(false)
      Alert.alert('Não foi possível continuar', e.message ?? 'Tente novamente.')
      return
    }
    setOcupado(false)
    const padrao = CATS_BASE.includes(cat)
    const afetados = [uso.vendas > 0 ? plural(uso.vendas, 'venda', 'vendas') : '', uso.itens > 0 ? plural(uso.itens, 'item', 'itens') : ''].filter(Boolean)
    const corpo = afetados.length > 0
      ? `${afetados.join(' e ')} desta categoria ${uso.vendas + uso.itens === 1 ? 'passa' : 'passam'} para "${CATEGORIA_FIXA}".`
      : 'Nenhuma venda nem item usa esta categoria.'
    Alert.alert(
      padrao ? `Ocultar "${cat}"?` : `Excluir "${cat}"?`,
      corpo + (padrao ? '\n\nVocê pode mostrar a categoria de novo quando quiser.' : '\n\nIsso não apaga nenhuma venda.'),
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: padrao ? 'Ocultar' : 'Excluir',
          style: 'destructive',
          onPress: async () => {
            setOcupado(true)
            try {
              const r = await remover(cat)
              setAviso(padrao ? `"${cat}" ocultada.` : `"${cat}" excluída.` + (r.vendas + r.itens > 0 ? ` ${afetados.join(' e ')} agora em "${CATEGORIA_FIXA}".` : ''))
            } catch (e: any) {
              Alert.alert('Não foi possível continuar', e.message ?? 'Tente novamente.')
            } finally {
              setOcupado(false)
            }
          },
        },
      ],
    )
  }

  async function mostrarDeNovo(cat: string) {
    setOcupado(true)
    try { await mostrar(cat); setAviso(`"${cat}" voltou para a lista.`) } catch (e: any) { Alert.alert('Erro', e.message) } finally { setOcupado(false) }
  }

  if (souFuncionario || (!papelConfirmado && !carregando && !tenantId)) {
    return (
      <View style={estilos.centro}>
        <Ionicons name="lock-closed-outline" size={36} color={C.text3} />
        <Text style={estilos.centroTexto}>Só o dono do negócio gerencia as categorias. Você usa as categorias na Nova venda.</Text>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={[estilos.content, { paddingBottom: 32 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <Text style={estilos.intro}>
          Mudar o nome de uma categoria atualiza também as vendas e os itens que já usam ela. Excluir move tudo para "{CATEGORIA_FIXA}"; nenhuma venda é apagada.
        </Text>
        {aviso ? <Text style={estilos.aviso}>{aviso}</Text> : null}
        {carregando && todas.length === 0 && <ActivityIndicator color={C.green} style={{ marginVertical: 24 }} />}

        {todas.map(cat => {
          const padrao = CATS_BASE.includes(cat)
          const fixa = cat === CATEGORIA_FIXA
          return (
            <View key={cat} style={estilos.linha}>
              <View style={estilos.linhaTopo}>
                <Ionicons name={padrao ? 'pricetag' : 'pricetag-outline'} size={18} color={padrao ? C.text3 : C.green} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={estilos.nome}>{cat}</Text>
                  <Text style={estilos.sub}>{fixa ? 'padrão · recebe o que for excluído' : padrao ? 'padrão' : 'criada por você'}</Text>
                </View>
              </View>
              {!fixa && (
                <View style={estilos.acoes}>
                  <TouchableOpacity style={estilos.btn} disabled={ocupado} onPress={() => abrirRenomear(cat)} accessibilityRole="button" accessibilityLabel={`Editar categoria ${cat}`}>
                    <Ionicons name="pencil-outline" size={18} color={C.green} />
                    <Text style={estilos.btnTexto}>Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[estilos.btn, estilos.btnPerigo]} disabled={ocupado} onPress={() => pedirExclusao(cat)} accessibilityRole="button" accessibilityLabel={padrao ? `Ocultar categoria ${cat}` : `Excluir categoria ${cat}`}>
                    <Ionicons name={padrao ? 'eye-off-outline' : 'trash-outline'} size={18} color={C.red} />
                    <Text style={[estilos.btnTexto, { color: C.red }]}>{padrao ? 'Ocultar' : 'Excluir'}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )
        })}

        {ocultas.length > 0 && (
          <>
            <Text style={estilos.titulo}>Ocultas</Text>
            {ocultas.map(cat => (
              <View key={cat} style={[estilos.linha, { opacity: 0.85 }]}>
                <View style={estilos.linhaTopo}>
                  <Ionicons name="pricetag" size={18} color={C.text3} />
                  <Text style={[estilos.nome, { flex: 1 }]}>{cat}</Text>
                </View>
                <View style={estilos.acoes}>
                  <TouchableOpacity style={estilos.btn} disabled={ocupado} onPress={() => mostrarDeNovo(cat)} accessibilityRole="button" accessibilityLabel={`Mostrar categoria ${cat}`}>
                    <Ionicons name="eye-outline" size={18} color={C.green} />
                    <Text style={estilos.btnTexto}>Mostrar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        <Text style={estilos.titulo}>Nova categoria</Text>
        <View style={estilos.novaRow}>
          <TextInput
            style={estilos.novaInput}
            value={nova}
            onChangeText={t => { setNova(t); setErroNova('') }}
            placeholder="Ex: Roupas"
            placeholderTextColor={C.text3}
            maxLength={30}
            returnKeyType="done"
            onSubmitEditing={criar}
          />
          <TouchableOpacity style={[estilos.novaBtn, (ocupado || nova.trim().length < 2) && { backgroundColor: C.border }]} disabled={ocupado || nova.trim().length < 2} onPress={criar} accessibilityLabel="Criar categoria">
            <Ionicons name="add" size={22} color={nova.trim().length >= 2 && !ocupado ? C.white : C.text3} />
          </TouchableOpacity>
        </View>
        {erroNova ? <Text style={estilos.erro}>{erroNova}</Text> : null}
      </ScrollView>

      <Modal visible={!!editando} transparent animationType="fade" onRequestClose={() => setEditando(null)}>
        <KeyboardAvoidingView style={estilos.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={estilos.modal}>
            <Text style={estilos.modalTitulo}>Renomear categoria</Text>
            <TextInput
              style={estilos.novaInput}
              value={nomeEdicao}
              onChangeText={t => { setNomeEdicao(t); setErroEdicao('') }}
              autoFocus
              maxLength={30}
              returnKeyType="done"
              onSubmitEditing={confirmarRenomear}
            />
            {erroEdicao ? <Text style={estilos.erro}>{erroEdicao}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <View style={{ flex: 1 }}><Botao titulo="Cancelar" variante="secundario" onPress={() => setEditando(null)} /></View>
              <View style={{ flex: 1 }}><Botao titulo="Salvar" onPress={confirmarRenomear} carregando={ocupado} /></View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const estilos = StyleSheet.create({
  content: { padding: 16 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12, backgroundColor: C.bg },
  centroTexto: { fontSize: 14, color: C.text2, textAlign: 'center' },
  intro: { fontSize: 13, color: C.text2, lineHeight: 19, marginBottom: 12 },
  aviso: { fontSize: 13, color: C.greenDark, fontWeight: '600', backgroundColor: C.greenLight, borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: C.greenMid },
  titulo: { fontSize: 13, fontWeight: '800', color: C.text2, marginTop: 20, marginBottom: 8 },
  linha: { gap: 10, backgroundColor: C.card, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  linhaTopo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  acoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nome: { fontSize: 15, fontWeight: '700', color: C.text },
  sub: { fontSize: 12, color: C.text3, marginTop: 2 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, minWidth: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: C.greenMid, backgroundColor: C.greenLight },
  btnTexto: { fontSize: 14, fontWeight: '700', color: C.green },
  btnPerigo: { borderColor: C.redBorder, backgroundColor: C.redLight },
  link: { fontSize: 13, color: C.green, fontWeight: '700' },
  novaRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  novaInput: { flex: 1, borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text, backgroundColor: C.card },
  novaBtn: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.green },
  erro: { fontSize: 12, color: C.red, marginTop: 6 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { width: '100%', maxWidth: 420, backgroundColor: C.bg, borderRadius: 16, padding: 20 },
  modalTitulo: { fontSize: 17, fontWeight: '800', color: C.text, marginBottom: 12 },
})

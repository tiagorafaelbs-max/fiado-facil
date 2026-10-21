import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet, Alert, ActivityIndicator, TextInput, Platform, KeyboardAvoidingView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTenant } from '../hooks/useTenant'
import { useItens } from '../hooks/useItens'
import { useCategorias } from '../hooks/useCategorias'
import { Campo } from '../components/ui/Campo'
import { Botao } from '../components/ui/Botao'
import { supabase } from '../lib/supabase'
import { evento } from '../lib/instalacao'
import { formatarMoeda, formatarInputMoeda, parseMoeda, sanitizarTexto } from '../lib/validacao'
import { LIMITE_ITENS_GRATUITO, type ItemCadastrado } from '../lib/itensVenda'
import { C } from '../constants/colors'

// "Meus itens": lista, cria, edita, desativa/reativa e reordena os itens que viram atalhos na Nova venda. Só o dono altera.
// Plano gratuito: até 10 itens ATIVOS (o servidor também confere); Pro ilimitado.
export default function MeusItensScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()   // a barra de navegação do Android não pode cobrir o botão fixo
  const { tenantId, souFuncionario, papelConfirmado } = useTenant()
  const { todas: todasCategorias, adicionar: adicionarCategoria } = useCategorias(tenantId || undefined)
  const { todos, ativos, disponivel, carregando, carregar, criar, editar, mover } = useItens(tenantId || undefined)
  const [plano, setPlano] = useState<'gratuito' | 'pro' | null>(null)
  const [modal, setModal] = useState<{ item: ItemCadastrado | null } | null>(null)
  const [nome, setNome] = useState('')
  const [preco, setPreco] = useState('')
  const [categoria, setCategoria] = useState('Mercadoria')
  const [novaCategoria, setNovaCategoria] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [verDesativados, setVerDesativados] = useState(false)

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))
  useEffect(() => {
    if (!tenantId) return
    supabase.from('perfis').select('plano').eq('id', tenantId).single().then(({ data }) => { if (data?.plano) setPlano(data.plano) })
  }, [tenantId])

  const desativados = todos.filter(i => !i.ativo)
  const noLimite = plano === 'gratuito' && ativos.length >= LIMITE_ITENS_GRATUITO

  function avisarLimite() {
    evento('limite', 'itens')
    Alert.alert(
      'Limite de itens',
      `O plano gratuito permite até ${LIMITE_ITENS_GRATUITO} itens ativos.\n\nFaça upgrade para o Pro e cadastre quantos quiser.`,
      [{ text: 'Fechar', style: 'cancel' }, { text: 'Ver planos', onPress: () => router.push('/planos') }],
    )
  }

  function abrir(item: ItemCadastrado | null) {
    if (!item && noLimite) { avisarLimite(); return }
    setModal({ item })
    setNome(item?.nome ?? '')
    setPreco(item?.preco != null ? item.preco.toFixed(2).replace('.', ',') : '')
    setCategoria(item?.categoria ?? (todasCategorias.includes('Mercadoria') ? 'Mercadoria' : (todasCategorias[0] ?? 'Outro')))
    setNovaCategoria('')
    setErro('')
  }

  async function salvar() {
    const nomeLimpo = sanitizarTexto(nome)
    if (nomeLimpo.length < 1) { setErro('Informe o nome do item.'); return }
    const valor = preco.trim() ? parseMoeda(preco) : null
    if (preco.trim() && (!valor || valor <= 0)) { setErro('Preço inválido. Deixe em branco se o item não tem preço fixo.'); return }
    let cat = categoria
    const nova = sanitizarTexto(novaCategoria)
    if (nova.length >= 2) {
      const existente = todasCategorias.find(c => c.toLowerCase() === nova.toLowerCase())
      if (existente) cat = existente
      else { await adicionarCategoria(nova); cat = nova }
    }
    setSalvando(true); setErro('')
    try {
      if (modal?.item) await editar(modal.item.id, { nome: nomeLimpo, preco: valor, categoria: cat })
      else {
        await criar({ nome: nomeLimpo, preco: valor, categoria: cat })
        evento('itens_cadastrou')   // funil anônimo
      }
      setModal(null)
    } catch (e: any) {
      setErro(e.message ?? 'Não foi possível salvar agora.')
    } finally {
      setSalvando(false)
    }
  }

  async function mudarAtivo(item: ItemCadastrado, ativo: boolean) {
    if (ativo && noLimite) { avisarLimite(); return }
    try { await editar(item.id, { ativo }) } catch (e: any) { Alert.alert('Erro', e.message) }
  }

  async function mexer(id: string, dir: -1 | 1) {
    try { await mover(id, dir) } catch (e: any) { Alert.alert('Erro', e.message) }
  }

  if (souFuncionario || (!papelConfirmado && !carregando && !tenantId)) {
    return (
      <View style={estilos.centro}>
        <Ionicons name="lock-closed-outline" size={36} color={C.text3} />
        <Text style={estilos.centroTexto}>Só o dono do negócio cadastra os itens. Você usa os itens na Nova venda.</Text>
      </View>
    )
  }
  if (!disponivel) {
    return (
      <View style={estilos.centro}>
        <Ionicons name="construct-outline" size={36} color={C.text3} />
        <Text style={estilos.centroTexto}>O cadastro de itens ainda não está disponível. Volte em breve.</Text>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={[estilos.content, { paddingBottom: 100 + insets.bottom }]}>
        <Text style={estilos.intro}>
          Cadastre o que você mais vende. Na Nova venda, é só tocar no item para lançar: a descrição e o valor saem sozinhos.
        </Text>
        <View style={estilos.limite}>
          <Text style={estilos.limiteTexto}>
            {plano === 'gratuito' ? `${ativos.length} de ${LIMITE_ITENS_GRATUITO} itens ativos (plano gratuito)` : `${ativos.length} ${ativos.length === 1 ? 'item ativo' : 'itens ativos'} · ilimitados no Pro`}
          </Text>
          {plano === 'gratuito' && (
            <TouchableOpacity onPress={() => router.push('/planos')} accessibilityRole="button" accessibilityLabel="Ver o plano Pro com itens ilimitados" style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={estilos.limiteLink}>Pro: ilimitados →</Text>
            </TouchableOpacity>
          )}
        </View>

        {carregando && ativos.length === 0 && <ActivityIndicator color={C.green} style={{ marginVertical: 24 }} />}
        {!carregando && ativos.length === 0 && (
          <Text style={estilos.vazio}>Nenhum item ainda. Toque em "Novo item" para cadastrar o primeiro.</Text>
        )}

        {[...ativos].sort((a, b) => a.ordem - b.ordem).map((item, i, lista) => (
          <View key={item.id} style={estilos.linha}>
            <TouchableOpacity onPress={() => abrir(item)} accessibilityRole="button" accessibilityLabel={`Editar item ${item.nome}`}>
              <Text style={estilos.nome}>{item.nome}</Text>
              <Text style={estilos.sub}>{item.preco != null ? formatarMoeda(item.preco) : 'sem preço fixo'} · {item.categoria}</Text>
            </TouchableOpacity>
            <View style={estilos.acoes}>
              <TouchableOpacity style={[estilos.btnSeta, i === 0 && { opacity: 0.35 }]} disabled={i === 0} onPress={() => mexer(item.id, -1)} accessibilityRole="button" accessibilityLabel={`Subir ${item.nome}`}>
                <Ionicons name="chevron-up" size={22} color={C.text2} />
              </TouchableOpacity>
              <TouchableOpacity style={[estilos.btnSeta, i === lista.length - 1 && { opacity: 0.35 }]} disabled={i === lista.length - 1} onPress={() => mexer(item.id, 1)} accessibilityRole="button" accessibilityLabel={`Descer ${item.nome}`}>
                <Ionicons name="chevron-down" size={22} color={C.text2} />
              </TouchableOpacity>
              <TouchableOpacity style={estilos.btn} onPress={() => abrir(item)} accessibilityRole="button" accessibilityLabel={`Editar item ${item.nome}`}>
                <Ionicons name="pencil-outline" size={18} color={C.green} />
                <Text style={estilos.btnTexto}>Editar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[estilos.btn, estilos.btnCinza]} onPress={() => mudarAtivo(item, false)} accessibilityRole="button" accessibilityLabel={`Desativar item ${item.nome}`}>
                <Ionicons name="eye-off-outline" size={18} color={C.text2} />
                <Text style={[estilos.btnTexto, { color: C.text2 }]}>Desativar</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {desativados.length > 0 && (
          <TouchableOpacity onPress={() => setVerDesativados(v => !v)} style={{ marginTop: 16, minHeight: 44, justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={verDesativados ? 'Esconder itens desativados' : 'Ver itens desativados'}>
            <Text style={estilos.limiteLink}>{verDesativados ? 'Esconder' : 'Ver'} desativados ({desativados.length})</Text>
          </TouchableOpacity>
        )}
        {verDesativados && desativados.map(item => (
          <View key={item.id} style={[estilos.linha, { opacity: 0.85 }]}>
            <View>
              <Text style={estilos.nome}>{item.nome}</Text>
              <Text style={estilos.sub}>{item.preco != null ? formatarMoeda(item.preco) : 'sem preço fixo'} · {item.categoria}</Text>
            </View>
            <View style={estilos.acoes}>
              <TouchableOpacity style={estilos.btn} onPress={() => mudarAtivo(item, true)} accessibilityRole="button" accessibilityLabel={`Reativar item ${item.nome}`}>
                <Ionicons name="eye-outline" size={18} color={C.green} />
                <Text style={estilos.btnTexto}>Reativar</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={[estilos.rodape, { paddingBottom: 16 + insets.bottom }]}>
        <Botao titulo="＋ Novo item" onPress={() => abrir(null)} />
      </View>

      <Modal visible={!!modal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModal(null)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={estilos.modalContent} keyboardShouldPersistTaps="handled">
            <View style={estilos.modalTopo}>
              <Text style={estilos.modalTitulo}>{modal?.item ? 'Editar item' : 'Novo item'}</Text>
              <TouchableOpacity onPress={() => setModal(null)} accessibilityRole="button" accessibilityLabel="Fechar" style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={22} color={C.text2} />
              </TouchableOpacity>
            </View>
            <Campo label="Nome *" value={nome} onChangeText={setNome} placeholder="Ex: Arroz 5 kg" autoCapitalize="words" />
            <Campo label="Preço (R$) — opcional" value={preco} onChangeText={v => setPreco(formatarInputMoeda(v))} keyboardType="decimal-pad" placeholder="Deixe em branco se não tem preço fixo" />
            <Text style={estilos.rotulo}>Categoria</Text>
            <View style={estilos.chips}>
              {todasCategorias.map(cat => (
                <TouchableOpacity key={cat} onPress={() => { setCategoria(cat); setNovaCategoria('') }} style={[estilos.chip, categoria === cat && !novaCategoria && estilos.chipAtivo]}>
                  <Text style={[estilos.chipTexto, categoria === cat && !novaCategoria && estilos.chipTextoAtivo]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={estilos.novaCat}
              value={novaCategoria}
              onChangeText={setNovaCategoria}
              placeholder="Ou digite uma categoria nova"
              placeholderTextColor={C.text3}
              maxLength={30}
            />
            {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
            <Botao titulo="Salvar item" onPress={salvar} carregando={salvando} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const estilos = StyleSheet.create({
  content: { padding: 16, paddingBottom: 100 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12, backgroundColor: C.bg },
  centroTexto: { fontSize: 14, color: C.text2, textAlign: 'center' },
  intro: { fontSize: 13, color: C.text2, lineHeight: 19, marginBottom: 12 },
  limite: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.greenLight, borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: C.greenMid },
  limiteTexto: { fontSize: 12, color: C.greenDark, fontWeight: '600', flexShrink: 1 },
  limiteLink: { fontSize: 13, color: C.green, fontWeight: '700' },
  vazio: { fontSize: 13, color: C.text3, textAlign: 'center', marginVertical: 24 },
  linha: { gap: 10, backgroundColor: C.card, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  acoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, minWidth: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: C.greenMid, backgroundColor: C.greenLight },
  btnCinza: { borderColor: C.border, backgroundColor: C.bg },
  btnTexto: { fontSize: 14, fontWeight: '700', color: C.green },
  btnSeta: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border, backgroundColor: C.bg },
  nome: { fontSize: 15, fontWeight: '700', color: C.text },
  sub: { fontSize: 12, color: C.text2, marginTop: 2 },
  rodape: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border },
  modalContent: { padding: 20, gap: 8 },
  modalTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitulo: { fontSize: 18, fontWeight: '800', color: C.text },
  rotulo: { fontSize: 13, fontWeight: '600', color: C.text2, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card },
  chipAtivo: { backgroundColor: C.greenLight, borderColor: C.green },
  chipTexto: { fontSize: 13, color: C.text2 },
  chipTextoAtivo: { color: C.green, fontWeight: '700' },
  novaCat: { height: 42, borderWidth: 1.5, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, color: C.text, backgroundColor: C.card, marginBottom: 8 },
  erro: { color: C.red, fontSize: 13, marginBottom: 8 },
})

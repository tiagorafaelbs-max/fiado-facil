import { useEffect, useMemo, useState } from 'react'
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, Platform,
  ActivityIndicator, KeyboardAvoidingView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useTenant } from '../hooks/useTenant'
import { usePerfilCobranca, atualizarCachePerfilCobranca } from '../hooks/usePerfilCobranca'
import { KeyboardToolbar, KEYBOARD_TOOLBAR_ID } from '../components/ui/KeyboardToolbar'
import {
  LIMITE_MODELO_COBRANCA, MODELO_PADRAO_COBRANCA, VARIAVEIS_COBRANCA, modeloEfetivo,
  modeloTemValor, renderizarModelo, variaveisDesconhecidas, type VariavelCobranca,
} from '../lib/whatsapp'
import { formatarMoeda } from '../lib/validacao'
import { C } from '../constants/colors'

const DICAS: Record<VariavelCobranca, string> = {
  nome: 'Nome do cliente',
  valor: 'Quanto ele deve',
  negocio: 'Nome da sua loja',
  pix: 'Sua chave Pix',
  vencimento: 'Vencimento mais antigo',
}

function perguntar(titulo: string, mensagem: string, ok: string, cancelar: string): Promise<boolean> {
  return new Promise(resolve => {
    if (Platform.OS === 'web') { resolve(window.confirm(`${titulo}\n\n${mensagem}`)); return }
    Alert.alert(
      titulo, mensagem,
      [
        { text: cancelar, style: 'cancel', onPress: () => resolve(false) },
        { text: ok, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    )
  })
}

export default function MensagemCobrancaScreen() {
  const router = useRouter()
  const { tenantId, souFuncionario, papelConfirmado } = useTenant()
  const perfil = usePerfilCobranca()
  // Editar é só do dono (o banco também só deixa o dono gravar em perfis).
  const podeEditar = papelConfirmado && !souFuncionario
  const ehPro = perfil?.plano === 'pro'

  const [texto, setTexto] = useState('')
  const [base, setBase] = useState<string | null>(null)       // texto salvo/carregado, para saber se mudou
  const [temModeloSalvo, setTemModeloSalvo] = useState(false)
  const [selecao, setSelecao] = useState({ start: 0, end: 0 })
  const [selecaoForcada, setSelecaoForcada] = useState<{ start: number; end: number } | undefined>()
  const [salvando, setSalvando] = useState(false)
  const [semConexao, setSemConexao] = useState(false)

  // Carrega o modelo quando o perfil chega (e de novo se chegar uma versão mais nova e o dono não mexeu).
  useEffect(() => {
    if (!perfil) return
    const salvo = perfil.mensagem_cobranca_modelo?.trim() || null
    // Funcionário vê o que de fato vale nas cobranças (modelo só conta no Pro); o dono vê o que salvou.
    const carregado = (podeEditar ? salvo : modeloEfetivo(perfil)) ?? MODELO_PADRAO_COBRANCA
    setTemModeloSalvo(!!salvo)
    if (base === null || texto === base) {
      setTexto(carregado)
      setSelecao({ start: carregado.length, end: carregado.length })
    }
    setBase(carregado)
  }, [perfil, podeEditar])

  useEffect(() => {
    if (perfil) return
    const t = setTimeout(() => setSemConexao(true), 8000)
    return () => clearTimeout(t)
  }, [perfil])

  const previa = useMemo(() => renderizarModelo(texto, {
    nome: 'Maria Souza',
    valor: formatarMoeda(150),
    negocio: perfil?.nome_negocio?.trim() || 'Minha Loja',
    pix: perfil?.chave_pix?.trim() || '(sua chave Pix)',
    vencimento: format(new Date(), 'dd/MM/yyyy'),
  }), [texto, perfil])

  const desconhecidas = useMemo(() => variaveisDesconhecidas(texto), [texto])
  const semValor = texto.trim().length > 0 && !modeloTemValor(texto)
  const usaPixSemChave = /\{pix\}/i.test(texto) && !perfil?.chave_pix?.trim()
  const alterado = base !== null && texto !== base

  function inserirVariavel(v: VariavelCobranca) {
    const token = `{${v}}`
    const ini = Math.min(selecao.start, texto.length)
    const fim = Math.min(selecao.end, texto.length)
    const novo = texto.slice(0, ini) + token + texto.slice(fim)
    if (novo.length > LIMITE_MODELO_COBRANCA) return
    const pos = ini + token.length
    setTexto(novo)
    setSelecao({ start: pos, end: pos })
    setSelecaoForcada({ start: pos, end: pos })
  }

  async function gravar(valor: string | null) {
    if (!tenantId) return false
    const { error } = await supabase.from('perfis').update({ mensagem_cobranca_modelo: valor }).eq('id', tenantId)
    if (error) {
      Alert.alert('Não foi possível salvar', 'Verifique sua conexão e tente de novo.')
      return false
    }
    if (perfil) await atualizarCachePerfilCobranca(tenantId, { ...perfil, mensagem_cobranca_modelo: valor })
    return true
  }

  async function salvar() {
    if (!podeEditar || salvando) return
    const modelo = texto.replace(/\r\n/g, '\n').trim()
    if (!modelo) {
      Alert.alert('Mensagem vazia', 'Escreva a mensagem ou toque em "Voltar ao padrão".')
      return
    }
    if (modelo.length > LIMITE_MODELO_COBRANCA) {
      Alert.alert('Mensagem muito longa', `O limite é de ${LIMITE_MODELO_COBRANCA} caracteres.`)
      return
    }
    if (!modeloTemValor(modelo)) {
      const manter = await perguntar(
        'Sem o valor da dívida',
        'Sua mensagem não mostra o valor da dívida. Quer manter assim?',
        'Manter assim', 'Voltar e editar',
      )
      if (!manter) return
    }
    const estranhas = variaveisDesconhecidas(modelo)
    if (estranhas.length > 0) {
      const manter = await perguntar(
        'Variável não reconhecida',
        `${estranhas.join(', ')} não ${estranhas.length === 1 ? 'existe' : 'existem'} e ${estranhas.length === 1 ? 'vai aparecer' : 'vão aparecer'} do jeito que está escrito na mensagem do cliente. Quer manter assim?`,
        'Manter assim', 'Voltar e editar',
      )
      if (!manter) return
    }
    // Texto igual ao padrão = sem modelo (assim melhorias futuras do texto padrão valem para quem não personalizou).
    const valor = modelo === MODELO_PADRAO_COBRANCA ? null : modelo
    setSalvando(true)
    try {
      if (!(await gravar(valor))) return
      setBase(modelo)
      setTexto(modelo)
      setTemModeloSalvo(valor !== null)
      Alert.alert('Mensagem salva', 'As próximas cobranças pelo WhatsApp já usam este texto.')
    } finally {
      setSalvando(false)
    }
  }

  async function voltarAoPadrao() {
    if (!podeEditar || salvando) return
    if (temModeloSalvo) {
      const ok = await perguntar(
        'Voltar ao padrão?',
        'Sua mensagem personalizada será apagada e as cobranças voltam a usar o texto padrão do app.',
        'Voltar ao padrão', 'Cancelar',
      )
      if (!ok) return
      setSalvando(true)
      try {
        if (!(await gravar(null))) return
      } finally {
        setSalvando(false)
      }
      setTemModeloSalvo(false)
    }
    setTexto(MODELO_PADRAO_COBRANCA)
    setBase(MODELO_PADRAO_COBRANCA)
    setSelecao({ start: MODELO_PADRAO_COBRANCA.length, end: MODELO_PADRAO_COBRANCA.length })
  }

  if (!perfil) {
    return (
      <View style={estilos.centro}>
        {semConexao ? (
          <Text style={estilos.textoCentro}>Não foi possível carregar. Verifique sua conexão e abra a tela de novo.</Text>
        ) : (
          <ActivityIndicator color={C.green} />
        )}
      </View>
    )
  }

  const textoEditavel = podeEditar
  const contador = texto.length

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <KeyboardToolbar />
      <ScrollView style={estilos.container} contentContainerStyle={estilos.content} keyboardShouldPersistTaps="handled">

        {!podeEditar && (
          <View style={estilos.aviso}>
            <Ionicons name="lock-closed-outline" size={16} color={C.text2} />
            <Text style={estilos.avisoTexto}>Esta é a mensagem do dono do negócio. Só ele pode alterar.</Text>
          </View>
        )}

        {podeEditar && !ehPro && (
          <View style={estilos.cardPro}>
            <View style={estilos.proBadge}><Text style={estilos.proBadgeTexto}>PRO</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={estilos.proTitulo}>Mensagem personalizada é do plano Pro</Text>
              <Text style={estilos.proSub}>
                Teste à vontade e veja a prévia. Para usar nas suas cobranças, ative o Pro. No plano grátis vale o texto padrão.
              </Text>
            </View>
          </View>
        )}

        <Text style={estilos.titulo}>Texto da cobrança</Text>
        <Text style={estilos.sub}>
          É a mensagem que abre no WhatsApp quando você cobra um cliente. Vale para todas as cobranças, inclusive as vencidas.
        </Text>

        <TextInput
          style={[estilos.editor, !textoEditavel && estilos.editorTravado]}
          value={texto}
          onChangeText={setTexto}
          multiline
          maxLength={LIMITE_MODELO_COBRANCA}
          editable={textoEditavel}
          textAlignVertical="top"
          placeholder="Escreva sua mensagem de cobrança"
          placeholderTextColor={C.text3}
          selection={selecaoForcada}
          onSelectionChange={e => { setSelecao(e.nativeEvent.selection); setSelecaoForcada(undefined) }}
          inputAccessoryViewID={Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_ID : undefined}
          accessibilityLabel="Texto da mensagem de cobrança"
        />
        <Text style={[estilos.contador, contador >= LIMITE_MODELO_COBRANCA - 100 && { color: C.yellow }]}>
          {contador}/{LIMITE_MODELO_COBRANCA}
        </Text>

        {podeEditar && (
          <>
            <Text style={estilos.rotulo}>Toque para inserir no texto</Text>
            <View style={estilos.chips}>
              {VARIAVEIS_COBRANCA.map(v => (
                <TouchableOpacity
                  key={v}
                  style={estilos.chip}
                  onPress={() => inserirVariavel(v)}
                  accessibilityRole="button"
                  accessibilityLabel={`Inserir ${DICAS[v]}`}
                >
                  <Text style={estilos.chipTexto}>{`{${v}}`}</Text>
                  <Text style={estilos.chipDica}>{DICAS[v]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {semValor && <Text style={estilos.alerta}>Esta mensagem não mostra o valor da dívida.</Text>}
        {desconhecidas.length > 0 && (
          <Text style={estilos.alerta}>
            {desconhecidas.join(', ')} não {desconhecidas.length === 1 ? 'é uma variável' : 'são variáveis'} do app e {desconhecidas.length === 1 ? 'vai aparecer' : 'vão aparecer'} como está escrito.
          </Text>
        )}
        {usaPixSemChave && (
          <Text style={estilos.alerta}>
            Você ainda não cadastrou sua chave Pix. Enquanto isso, a linha com {'{pix}'} não aparece na mensagem (Configurações → Pix & Cobranças).
          </Text>
        )}

        <Text style={estilos.rotulo}>Prévia</Text>
        <Text style={estilos.previaInfo}>Cliente de exemplo: Maria Souza · deve {formatarMoeda(150)}</Text>
        <View style={estilos.balao}>
          <Text style={estilos.balaoTexto}>{previa || 'Digite sua mensagem para ver a prévia.'}</Text>
        </View>

        {podeEditar && (
          <View style={estilos.acoes}>
            {ehPro ? (
              <TouchableOpacity
                style={[estilos.btnPrimario, (!alterado || salvando) && { opacity: 0.5 }]}
                onPress={salvar}
                disabled={!alterado || salvando}
                accessibilityRole="button"
              >
                {salvando ? <ActivityIndicator color={C.white} /> : <Text style={estilos.btnPrimarioTexto}>Salvar mensagem</Text>}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={estilos.btnPrimario} onPress={() => router.push('/planos')} accessibilityRole="button">
                <Ionicons name="rocket" size={16} color={C.white} />
                <Text style={estilos.btnPrimarioTexto}>Desbloquear com o Pro</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[estilos.btnSecundario, (salvando || (!temModeloSalvo && texto === MODELO_PADRAO_COBRANCA)) && { opacity: 0.5 }]}
              onPress={voltarAoPadrao}
              disabled={salvando || (!temModeloSalvo && texto === MODELO_PADRAO_COBRANCA)}
              accessibilityRole="button"
            >
              <Text style={estilos.btnSecundarioTexto}>Voltar ao padrão</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 48 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: C.bg },
  textoCentro: { fontSize: 14, color: C.text2, textAlign: 'center', lineHeight: 20 },
  aviso: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 12,
    borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 14,
  },
  avisoTexto: { flex: 1, fontSize: 13, color: C.text2, lineHeight: 18 },
  cardPro: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: C.yellowLight, borderRadius: 14,
    borderWidth: 1, borderColor: C.yellowBorder, padding: 14, marginBottom: 16,
  },
  proBadge: { backgroundColor: C.green, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 2 },
  proBadgeTexto: { fontSize: 11, fontWeight: '900', color: C.white, letterSpacing: 1.5 },
  proTitulo: { fontSize: 14, fontWeight: '700', color: C.text },
  proSub: { fontSize: 12, color: C.text2, lineHeight: 17, marginTop: 3 },
  titulo: { fontSize: 16, fontWeight: '800', color: C.text },
  sub: { fontSize: 13, color: C.text2, lineHeight: 19, marginTop: 4, marginBottom: 12 },
  editor: {
    minHeight: 170, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, borderRadius: 14,
    padding: 14, fontSize: 14, lineHeight: 20, color: C.text,
  },
  editorTravado: { backgroundColor: C.bg, color: C.text2 },
  contador: { alignSelf: 'flex-end', fontSize: 11, color: C.text3, marginTop: 4 },
  rotulo: { fontSize: 12, fontWeight: '700', color: C.text2, marginTop: 14, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: C.greenLight, borderWidth: 1, borderColor: C.greenMid, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  chipTexto: { fontSize: 13, fontWeight: '800', color: C.greenDark },
  chipDica: { fontSize: 10, color: C.text2, marginTop: 1 },
  alerta: { fontSize: 12, color: C.yellow, lineHeight: 17, marginTop: 10 },
  previaInfo: { fontSize: 12, color: C.text3, marginBottom: 8 },
  balao: {
    backgroundColor: '#DCF8C6', borderRadius: 14, borderTopLeftRadius: 4, padding: 14,
    borderWidth: 1, borderColor: '#C5E8AE',
  },
  balaoTexto: { fontSize: 14, lineHeight: 20, color: '#111B21' },
  acoes: { marginTop: 20, gap: 10 },
  btnPrimario: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.green, borderRadius: 14, paddingVertical: 15,
  },
  btnPrimarioTexto: { color: C.white, fontSize: 15, fontWeight: '800' },
  btnSecundario: {
    alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 14,
    borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card,
  },
  btnSecundarioTexto: { color: C.text2, fontSize: 14, fontWeight: '700' },
})

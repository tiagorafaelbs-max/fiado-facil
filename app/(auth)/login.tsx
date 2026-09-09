import { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, KeyboardAvoidingView, Platform
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../hooks/useAuth'
import { Botao } from '../../components/ui/Botao'
import { Logo } from '../../components/ui/Logo'
import { validarEmail } from '../../lib/validacao'
import { C } from '../../constants/colors'

export default function LoginScreen() {
  const router = useRouter()
  const { entrar } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [verSenha, setVerSenha] = useState(false)
  const [erros, setErros] = useState<{ email?: string; senha?: string }>({})
  const [carregando, setCarregando] = useState(false)
  const [erroGeral, setErroGeral] = useState('')
  const [focado, setFocado] = useState<string | null>(null)

  function validar(): boolean {
    const novosErros: typeof erros = {}
    if (!validarEmail(email)) novosErros.email = 'E-mail inválido.'
    if (senha.length < 6) novosErros.senha = 'Senha muito curta.'
    setErros(novosErros)
    return Object.keys(novosErros).length === 0
  }

  async function handleEntrar() {
    if (!validar()) return
    setErroGeral(''); setCarregando(true)
    try {
      await entrar(email.trim().toLowerCase(), senha)
      router.replace('/(tabs)')
    } catch {
      setErroGeral('E-mail ou senha incorretos. Tente novamente.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={estilos.raiz}>
        {/* Fundo verde com decoração */}
        <View style={estilos.topBg}>
          <View style={estilos.circulo1} />
          <View style={estilos.circulo2} />
          <View style={estilos.circulo3} />
          <View style={estilos.logoArea}>
            <Logo width={230} showTagline variant="light" />
          </View>
        </View>

        {/* Área do formulário com curva no topo */}
        <ScrollView
          style={estilos.scroll}
          contentContainerStyle={estilos.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={estilos.formCard}>
            <Text style={estilos.titulo}>Bem-vindo de volta 👋</Text>
            <Text style={estilos.sub}>Entre com sua conta para continuar</Text>

            {/* Campo e-mail */}
            <View style={estilos.campoWrapper}>
              <Text style={estilos.label}>E-mail</Text>
              <View style={[
                estilos.inputRow,
                focado === 'email' && estilos.inputFocado,
                erros.email ? estilos.inputErro : null,
              ]}>
                <Ionicons name="mail-outline" size={18} color={focado === 'email' ? C.green : C.text3} style={{ marginRight: 8 }} />
                <TextInput
                  style={estilos.input}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="seu@email.com"
                  placeholderTextColor={C.text3}
                  onFocus={() => setFocado('email')}
                  onBlur={() => setFocado(null)}
                  onSubmitEditing={handleEntrar}
                  returnKeyType="next"
                />
              </View>
              {erros.email ? <Text style={estilos.erro}>⚠ {erros.email}</Text> : null}
            </View>

            {/* Campo senha */}
            <View style={estilos.campoWrapper}>
              <Text style={estilos.label}>Senha</Text>
              <View style={[
                estilos.inputRow,
                focado === 'senha' && estilos.inputFocado,
                erros.senha ? estilos.inputErro : null,
              ]}>
                <Ionicons name="lock-closed-outline" size={18} color={focado === 'senha' ? C.green : C.text3} style={{ marginRight: 8 }} />
                <TextInput
                  style={estilos.input}
                  value={senha}
                  onChangeText={setSenha}
                  secureTextEntry={!verSenha}
                  placeholder="••••••••"
                  placeholderTextColor={C.text3}
                  autoCapitalize="none"
                  onFocus={() => setFocado('senha')}
                  onBlur={() => setFocado(null)}
                  onSubmitEditing={handleEntrar}
                  returnKeyType="done"
                />
                <TouchableOpacity onPress={() => setVerSenha(v => !v)} style={estilos.olhinho}>
                  <Ionicons name={verSenha ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.text2} />
                </TouchableOpacity>
              </View>
              {erros.senha ? <Text style={estilos.erro}>⚠ {erros.senha}</Text> : null}
            </View>

            {/* Erro geral */}
            {erroGeral ? (
              <View style={estilos.erroBox}>
                <Ionicons name="alert-circle" size={16} color={C.red} />
                <Text style={estilos.erroBoxTexto}>{erroGeral}</Text>
              </View>
            ) : null}

            {/* Esqueci a senha */}
            <TouchableOpacity onPress={() => router.push('/(auth)/recuperar-senha')} style={estilos.esqueciLink}>
              <Text style={estilos.link}>Esqueci minha senha</Text>
            </TouchableOpacity>

            <Botao titulo="Entrar na conta" onPress={handleEntrar} carregando={carregando} />

            {/* Divider */}
            <View style={estilos.divider}>
              <View style={estilos.dividerLinha} />
              <Text style={estilos.dividerTexto}>ou</Text>
              <View style={estilos.dividerLinha} />
            </View>

            {/* Cadastro */}
            <TouchableOpacity style={estilos.btnCadastro} onPress={() => router.push('/(auth)/cadastro')}>
              <Text style={estilos.btnCadastroTexto}>Criar conta grátis</Text>
            </TouchableOpacity>
          </View>

          {/* Features resumidas */}
          <View style={estilos.featuresRow}>
            {[
              { icone: 'people-outline', texto: 'Clientes' },
              { icone: 'receipt-outline', texto: 'Vendas' },
              { icone: 'logo-whatsapp', texto: 'WhatsApp' },
              { icone: 'qr-code-outline', texto: 'Pix' },
            ].map(f => (
              <View key={f.texto} style={estilos.featureItem}>
                <Ionicons name={f.icone as any} size={18} color={C.text3} />
                <Text style={estilos.featureTexto}>{f.texto}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  )
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: C.green },

  /* Fundo verde */
  topBg: {
    backgroundColor: C.green,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 36,
    paddingHorizontal: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  circulo1: {
    position: 'absolute', top: -50, right: -50,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  circulo2: {
    position: 'absolute', top: 30, right: 30,
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  circulo3: {
    position: 'absolute', bottom: -20, left: -30,
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  logoArea: { alignItems: 'center' },

  /* Scroll branco com curva */
  scroll: {
    flex: 1,
    backgroundColor: C.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  scrollContent: { padding: 24, paddingBottom: 40 },

  formCard: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },

  titulo: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 4 },
  sub: { fontSize: 13, color: C.text2, marginBottom: 20 },

  campoWrapper: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '600', color: C.text2, marginBottom: 7, letterSpacing: 0.3 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: C.border,
    borderRadius: 12, backgroundColor: C.bg,
    paddingHorizontal: 12, height: 50,
  },
  inputFocado: { borderColor: C.green, backgroundColor: C.greenLight },
  inputErro: { borderColor: C.red, backgroundColor: C.redLight },
  input: { flex: 1, fontSize: 15, color: C.text },
  olhinho: { padding: 4 },
  erro: { fontSize: 12, color: C.red, marginTop: 5, fontWeight: '500' },

  erroBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.redLight, borderRadius: 10, padding: 12,
    marginBottom: 14, borderWidth: 1, borderColor: C.redBorder,
  },
  erroBoxTexto: { color: C.red, fontSize: 13, fontWeight: '500', flex: 1 },

  esqueciLink: { alignItems: 'flex-end', marginBottom: 18, marginTop: -4 },
  link: { color: C.green, fontWeight: '600', fontSize: 13 },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 18 },
  dividerLinha: { flex: 1, height: 1, backgroundColor: C.border },
  dividerTexto: { fontSize: 12, color: C.text3, fontWeight: '500' },

  btnCadastro: {
    borderWidth: 1.5, borderColor: C.green, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  btnCadastroTexto: { color: C.green, fontWeight: '700', fontSize: 15 },

  featuresRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 24,
    marginTop: 24, paddingBottom: 8,
  },
  featureItem: { alignItems: 'center', gap: 4 },
  featureTexto: { fontSize: 10, color: C.text3, fontWeight: '500' },
})

import { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../hooks/useAuth'
import { Campo } from '../../components/ui/Campo'
import { Botao } from '../../components/ui/Botao'
import { validarEmail, sanitizarTexto } from '../../lib/validacao'
import { C } from '../../constants/colors'

export default function CadastroScreen() {
  const router = useRouter()
  const { cadastrar } = useAuth()
  const [nomeNegocio, setNomeNegocio] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [carregando, setCarregando] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [erroGeral, setErroGeral] = useState('')

  function validar(): boolean {
    const novosErros: Record<string, string> = {}
    if (sanitizarTexto(nomeNegocio).length < 2) novosErros.nomeNegocio = 'Informe o nome do seu negócio.'
    if (!validarEmail(email)) novosErros.email = 'E-mail inválido.'
    if (senha.length < 6) novosErros.senha = 'Senha deve ter pelo menos 6 caracteres.'
    if (senha !== confirmarSenha) novosErros.confirmarSenha = 'Senhas não conferem.'
    setErros(novosErros)
    return Object.keys(novosErros).length === 0
  }

  async function handleCadastrar() {
    if (!validar()) return
    setErroGeral(''); setCarregando(true)
    try {
      await cadastrar(email.trim().toLowerCase(), senha, sanitizarTexto(nomeNegocio))
      setSucesso(true)
    } catch (e: any) {
      setErroGeral(e.message ?? 'Erro ao criar conta. Tente novamente.')
    } finally {
      setCarregando(false)
    }
  }

  if (sucesso) {
    return (
      <View style={estilos.sucessoContainer}>
        <View style={estilos.sucessoIconeBox}>
          <Text style={{ fontSize: 40 }}>🎉</Text>
        </View>
        <Text style={estilos.sucessoTitulo}>Conta criada!</Text>
        <Text style={estilos.sucessoTexto}>Bem-vindo ao FiadoApp! Sua conta foi criada com sucesso.</Text>
        <TouchableOpacity style={estilos.btnLogin} onPress={() => router.replace('/(auth)/login')}>
          <Text style={estilos.btnLoginTexto}>Entrar agora →</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={estilos.scroll} keyboardShouldPersistTaps="handled">
      <View style={estilos.container}>

        <View style={estilos.header}>
          <TouchableOpacity onPress={() => router.back()} style={estilos.voltarBtn}>
            <Ionicons name="arrow-back" size={20} color={C.green} />
          </TouchableOpacity>
          <View style={estilos.logoBox}>
            <Ionicons name="storefront" size={32} color={C.green} />
          </View>
          <Text style={estilos.titulo}>Criar conta grátis</Text>
          <Text style={estilos.subtitulo}>Até 10 clientes sem pagar nada</Text>
        </View>

        <View style={estilos.card}>
          <Campo label="Nome do seu negócio" value={nomeNegocio} onChangeText={setNomeNegocio} erro={erros.nomeNegocio} placeholder="Ex: Mercadinho do João" autoCapitalize="words" />
          <Campo label="E-mail" value={email} onChangeText={setEmail} erro={erros.email} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="seu@email.com" />
          <Campo label="Senha" value={senha} onChangeText={setSenha} erro={erros.senha} secureTextEntry placeholder="Mínimo 6 caracteres" />
          <Campo label="Confirmar senha" value={confirmarSenha} onChangeText={setConfirmarSenha} erro={erros.confirmarSenha} secureTextEntry placeholder="Repita a senha" />

          {erroGeral ? (
            <View style={estilos.erroBox}>
              <Ionicons name="alert-circle" size={16} color={C.red} />
              <Text style={estilos.erroTexto}>{erroGeral}</Text>
            </View>
          ) : null}

          <Botao titulo="Criar conta" onPress={handleCadastrar} carregando={carregando} estilo={{ marginTop: 4 }} />
        </View>

        <View style={estilos.rodape}>
          <Text style={estilos.textoNeutro}>Já tem conta? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
            <Text style={estilos.link}>Entrar</Text>
          </TouchableOpacity>
        </View>

      </View>
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  scroll: { flexGrow: 1, backgroundColor: C.bg },
  container: { flex: 1, padding: 24, paddingTop: 16 },
  header: { alignItems: 'center', marginBottom: 28, paddingTop: 8 },
  voltarBtn: { alignSelf: 'flex-start', width: 36, height: 36, borderRadius: 10, backgroundColor: C.greenLight, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  logoBox: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: C.greenLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    shadowColor: C.green, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 4,
  },
  titulo: { fontSize: 24, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  subtitulo: { fontSize: 14, color: C.text2, marginTop: 4 },
  card: {
    backgroundColor: C.card, borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 4,
  },
  erroBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.redLight, borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: C.redBorder },
  erroTexto: { color: C.red, fontSize: 13, fontWeight: '500', flex: 1 },
  rodape: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  textoNeutro: { color: C.text2, fontSize: 14 },
  link: { color: C.green, fontWeight: '600', fontSize: 14 },
  sucessoContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: C.bg, gap: 16 },
  sucessoIconeBox: { width: 90, height: 90, borderRadius: 28, backgroundColor: C.greenLight, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  sucessoTitulo: { fontSize: 24, fontWeight: '800', color: C.text },
  sucessoTexto: { fontSize: 15, color: C.text2, textAlign: 'center', lineHeight: 22 },
  btnLogin: { marginTop: 8, backgroundColor: C.green, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  btnLoginTexto: { color: C.white, fontWeight: '700', fontSize: 15 },
})

import { useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useEstadoLink, definirEstadoLink, MENSAGEM_LINK_INVALIDO } from '../../lib/linkAuth'
import { Campo } from '../../components/ui/Campo'
import { Botao } from '../../components/ui/Botao'

export default function NovaSenhaScreen() {
  const router = useRouter()
  const estadoLink = useEstadoLink()
  const veioDeConvite = estadoLink.status === 'ok' && estadoLink.tipo === 'invite'
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [esperaEsgotada, setEsperaEsgotada] = useState(false)

  // O DeepLinkHandler (app/_layout.tsx) valida o link e grava o resultado em
  // lib/linkAuth. Quando esta tela abre antes dele terminar, espera um instante;
  // se nenhum link validado aparecer, trata como link inválido (ex: alguém abrir
  // fiadofacil://nova-senha sem token).
  useEffect(() => {
    if (estadoLink.status !== 'nenhum') { setEsperaEsgotada(false); return }
    const t = setTimeout(() => setEsperaEsgotada(true), 3000)
    return () => clearTimeout(t)
  }, [estadoLink.status])

  async function destinoSeguro() {
    const { data: { session } } = await supabase.auth.getSession()
    router.replace(session ? '/(tabs)' : '/(auth)/login')
  }

  async function handleSalvar() {
    // Nunca troca senha sem um link validado: updateUser() age sobre QUALQUER sessão
    // ativa, inclusive a do dono logado no aparelho.
    if (estadoLink.status !== 'ok') return
    if (senha.length < 6) {
      setErro('Senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (senha !== confirmar) {
      setErro('As senhas não conferem.')
      return
    }
    setErro('')
    setCarregando(true)
    try {
      // A sessão atual tem que ser exatamente a do usuário do link.
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user.id !== estadoLink.userId) {
        definirEstadoLink({ status: 'erro', mensagem: MENSAGEM_LINK_INVALIDO })
        return
      }
      const { error } = await supabase.auth.updateUser({ password: senha })
      if (error) throw error
      // Link de uso único: não pode ser reutilizado para uma segunda troca.
      definirEstadoLink({ status: 'nenhum' })
      // Convite: a sessão já é válida (verifyOtp no deep link) -- entra direto no
      // app como funcionário em vez de mandar pro login de novo.
      if (veioDeConvite) {
        router.replace('/(tabs)')
        return
      }
      setSucesso(true)
    } catch (e: any) {
      const msg = e.message ?? ''
      if (msg.toLowerCase().includes('session') || msg.toLowerCase().includes('token') || msg.toLowerCase().includes('expired')) {
        setErro('Link expirado ou inválido. Solicite um novo link de redefinição de senha.')
      } else {
        setErro(msg || 'Erro ao atualizar senha.')
      }
    } finally {
      setCarregando(false)
    }
  }

  if (sucesso) {
    return (
      <View style={estilos.centro}>
        <View style={estilos.iconeBox}>
          <Text style={{ fontSize: 40 }}>🔐</Text>
        </View>
        <Text style={estilos.sucessoTitulo}>Senha alterada!</Text>
        <Text style={estilos.sucessoTexto}>Sua nova senha foi salva com sucesso.</Text>
        <TouchableOpacity style={estilos.btnLogin} onPress={() => router.replace('/(auth)/login')}>
          <Text style={estilos.btnLoginTexto}>Ir para o login →</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (estadoLink.status === 'processando' || (estadoLink.status === 'nenhum' && !esperaEsgotada)) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color="#1a56db" />
        <Text style={estilos.aguardandoTexto}>Validando o link…</Text>
      </View>
    )
  }

  if (estadoLink.status !== 'ok') {
    const mensagem =
      estadoLink.status === 'erro' ? estadoLink.mensagem
      : estadoLink.status === 'cancelado' ? 'Operação cancelada. Nenhuma conta foi alterada.'
      : MENSAGEM_LINK_INVALIDO
    return (
      <View style={estilos.centro}>
        <View style={estilos.iconeBox}>
          <Ionicons name="alert-circle-outline" size={40} color="#dc2626" />
        </View>
        <Text style={estilos.aguardandoTitulo}>
          {estadoLink.status === 'cancelado' ? 'Cancelado' : 'Não foi possível abrir o link'}
        </Text>
        <Text style={estilos.sucessoTexto}>{mensagem}</Text>
        <TouchableOpacity style={estilos.btnLogin} onPress={destinoSeguro}>
          <Text style={estilos.btnLoginTexto}>Voltar</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={estilos.scroll} keyboardShouldPersistTaps="handled">
      <View style={estilos.container}>
        <View style={estilos.header}>
          <View style={estilos.logoBox}>
            <Ionicons name="lock-closed" size={32} color="#1a56db" />
          </View>
          <Text style={estilos.titulo}>{veioDeConvite ? 'Crie sua senha para entrar no FiadoApp' : 'Nova senha'}</Text>
          <Text style={estilos.subtitulo}>
            {veioDeConvite ? 'Você foi convidado como funcionário — defina uma senha para acessar' : 'Digite sua nova senha abaixo'}
          </Text>
          {estadoLink.email ? (
            <Text style={estilos.contaDoLink}>Conta: {estadoLink.email}</Text>
          ) : null}
        </View>

        <View style={estilos.card}>
          <Campo
            label={veioDeConvite ? 'Senha' : 'Nova senha'}
            value={senha}
            onChangeText={setSenha}
            secureTextEntry
            placeholder="Mínimo 6 caracteres"
          />
          <Campo
            label={veioDeConvite ? 'Confirmar senha' : 'Confirmar nova senha'}
            value={confirmar}
            onChangeText={setConfirmar}
            secureTextEntry
            placeholder="Repita a senha"
          />

          {erro ? (
            <View style={estilos.erroBox}>
              <Ionicons name="alert-circle" size={16} color="#dc2626" />
              <Text style={estilos.erroTexto}>{erro}</Text>
            </View>
          ) : null}

          <Botao titulo={veioDeConvite ? 'Criar senha e entrar' : 'Salvar nova senha'} onPress={handleSalvar} carregando={carregando} />
        </View>
      </View>
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  scroll: { flexGrow: 1, backgroundColor: '#F8F9FB' },
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 32 },
  logoBox: {
    width: 72, height: 72, borderRadius: 22, backgroundColor: '#EEF4FF',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    shadowColor: '#1a56db', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4,
  },
  titulo: { fontSize: 24, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  subtitulo: { fontSize: 14, color: '#9CA3AF', marginTop: 4 },
  contaDoLink: { fontSize: 13, color: '#111827', fontWeight: '700', marginTop: 8 },
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: '#F0F0F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 4,
  },
  erroBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 12 },
  erroTexto: { color: '#dc2626', fontSize: 13, fontWeight: '500', flex: 1 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#F8F9FB', gap: 12 },
  iconeBox: { width: 90, height: 90, borderRadius: 28, backgroundColor: '#EEF4FF', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  aguardandoTitulo: { fontSize: 20, fontWeight: '700', color: '#111827' },
  aguardandoTexto: { fontSize: 14, color: '#9CA3AF' },
  sucessoTitulo: { fontSize: 24, fontWeight: '800', color: '#111827' },
  sucessoTexto: { fontSize: 15, color: '#6B7280', textAlign: 'center' },
  btnLogin: { marginTop: 8, backgroundColor: '#1a56db', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  btnLoginTexto: { color: '#fff', fontWeight: '700', fontSize: 15 },
})

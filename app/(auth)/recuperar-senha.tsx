import { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../hooks/useAuth'
import { Campo } from '../../components/ui/Campo'
import { Botao } from '../../components/ui/Botao'
import { validarEmail } from '../../lib/validacao'

export default function RecuperarSenhaScreen() {
  const router = useRouter()
  const { recuperarSenha } = useAuth()
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function handleRecuperar() {
    if (!validarEmail(email)) {
      setErro('E-mail inválido.')
      return
    }
    setErro('')
    setCarregando(true)
    try {
      await recuperarSenha(email.trim().toLowerCase())
      Alert.alert('E-mail enviado', 'Verifique sua caixa de entrada para redefinir a senha.', [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar o e-mail. Tente novamente.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={estilos.scroll} keyboardShouldPersistTaps="handled">
      <View style={estilos.container}>
        <TouchableOpacity onPress={() => router.back()} style={estilos.voltar}>
          <Text style={estilos.voltarTexto}>← Voltar</Text>
        </TouchableOpacity>

        <Text style={estilos.titulo}>Recuperar senha</Text>
        <Text style={estilos.subtitulo}>Enviaremos um link para redefinir sua senha.</Text>

        <Campo
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          erro={erro}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="seu@email.com"
        />
        <Botao titulo="Enviar link" onPress={handleRecuperar} carregando={carregando} />
      </View>
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  scroll: { flexGrow: 1 },
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  voltar: { marginBottom: 24, marginTop: 16 },
  voltarTexto: { color: '#185FA5', fontSize: 15 },
  titulo: { fontSize: 24, fontWeight: '700', color: '#111827', marginBottom: 6 },
  subtitulo: { fontSize: 14, color: '#6B7280', marginBottom: 28 },
})

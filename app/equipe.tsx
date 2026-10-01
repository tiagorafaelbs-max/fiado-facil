import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Switch, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, useFocusEffect } from 'expo-router'
import { C } from '../constants/colors'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Campo } from '../components/ui/Campo'
import { Botao } from '../components/ui/Botao'
import { sanitizarTexto } from '../lib/validacao'

const LIMITE_FUNCIONARIOS = 2

interface Membro {
  id: string
  nome: string
  status: 'ativo' | 'desativado'
  permissoes: { excluir_venda: boolean; editar_venda: boolean }
}

export default function EquipeScreen() {
  const router = useRouter()
  const { usuario } = useAuth()
  const [membros, setMembros] = useState<Membro[]>([])
  const [carregando, setCarregando] = useState(true)
  const [convidando, setConvidando] = useState(false)
  const [modalAberto, setModalAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState('')

  const buscar = useCallback(async () => {
    if (!usuario?.id) return
    setCarregando(true)
    const { data: perfil } = await supabase.from('perfis').select('plano').eq('id', usuario.id).single()
    if (perfil?.plano !== 'pro') { router.replace('/planos'); return }

    const { data } = await supabase
      .from('membros_equipe')
      .select('id, nome, status, permissoes')
      .eq('dono_id', usuario.id)
      .order('criado_em')
    setMembros((data ?? []) as Membro[])
    setCarregando(false)
  }, [usuario?.id])

  useFocusEffect(useCallback(() => { buscar() }, [buscar]))

  async function convidar() {
    setErro('')
    if (sanitizarTexto(nome).length < 2) { setErro('Informe o nome do funcionário.'); return }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErro('E-mail inválido.'); return }
    if (membros.filter(m => m.status === 'ativo').length >= LIMITE_FUNCIONARIOS) {
      setErro(`Limite de ${LIMITE_FUNCIONARIOS} funcionários atingido.`)
      return
    }

    setConvidando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sessão expirada.')

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
      const resp = await fetch(`${supabaseUrl}/functions/v1/convidar-funcionario`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: sanitizarTexto(nome), email: email.trim() }),
      })
      const body = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(body.error ?? 'Erro ao convidar funcionário')

      setModalAberto(false)
      setNome(''); setEmail('')
      Alert.alert(
        'Convite enviado',
        `${nome} vai receber um e-mail para criar a senha. Ele precisa abrir esse e-mail no celular com o FiadoApp instalado (e checar a caixa de spam, se não chegar).`,
      )
      await buscar()
    } catch (e: any) {
      setErro(e.message ?? 'Erro ao convidar funcionário')
    } finally {
      setConvidando(false)
    }
  }

  async function alternarPermissao(membro: Membro, chave: 'excluir_venda' | 'editar_venda', valor: boolean) {
    const novasPermissoes = { ...membro.permissoes, [chave]: valor }
    setMembros(prev => prev.map(m => m.id === membro.id ? { ...m, permissoes: novasPermissoes } : m))
    await supabase.from('membros_equipe').update({ permissoes: novasPermissoes }).eq('id', membro.id)
  }

  function removerAcesso(membro: Membro) {
    Alert.alert(
      'Remover acesso',
      `${membro.nome} não vai mais conseguir acessar os dados do seu negócio. Confirma?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover', style: 'destructive', onPress: async () => {
            await supabase.from('membros_equipe').update({ status: 'desativado' }).eq('id', membro.id)
            await buscar()
          },
        },
      ]
    )
  }

  if (carregando) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={C.green} />
      </View>
    )
  }

  const ativos = membros.filter(m => m.status === 'ativo')

  return (
    <ScrollView
      style={estilos.container}
      contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <TouchableOpacity onPress={() => router.back()} style={estilos.voltar}>
        <Ionicons name="chevron-back" size={22} color={C.text} />
        <Text style={estilos.voltarTexto}>Configurações</Text>
      </TouchableOpacity>

      <Text style={estilos.titulo}>Equipe & Funcionários</Text>
      <Text style={estilos.sub}>
        Convide funcionários com login próprio para registrar vendas e pagamentos. Todos veem os mesmos clientes e dados do seu negócio — cada venda fica marcada com quem registrou.
      </Text>

      <View style={estilos.limiteBox}>
        <Ionicons name="people-outline" size={16} color={C.green} />
        <Text style={estilos.limiteTexto}>{ativos.length} de {LIMITE_FUNCIONARIOS} funcionários usados</Text>
      </View>

      {ativos.map(membro => (
        <View key={membro.id} style={estilos.card}>
          <View style={estilos.cardHeader}>
            <View style={estilos.avatarBox}>
              <Text style={estilos.avatarLetra}>{membro.nome.charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={estilos.cardNome}>{membro.nome}</Text>
            <TouchableOpacity onPress={() => removerAcesso(membro)}>
              <Ionicons name="trash-outline" size={18} color={C.red} />
            </TouchableOpacity>
          </View>

          <View style={estilos.permissaoLinha}>
            <Text style={estilos.permissaoTexto}>Pode editar vendas</Text>
            <Switch
              value={membro.permissoes.editar_venda}
              onValueChange={(v) => alternarPermissao(membro, 'editar_venda', v)}
              trackColor={{ false: C.border, true: C.greenMid }}
              thumbColor={membro.permissoes.editar_venda ? C.green : '#fff'}
            />
          </View>
          <View style={estilos.permissaoLinha}>
            <Text style={estilos.permissaoTexto}>Pode excluir vendas</Text>
            <Switch
              value={membro.permissoes.excluir_venda}
              onValueChange={(v) => alternarPermissao(membro, 'excluir_venda', v)}
              trackColor={{ false: C.border, true: C.greenMid }}
              thumbColor={membro.permissoes.excluir_venda ? C.green : '#fff'}
            />
          </View>
        </View>
      ))}

      {ativos.length === 0 && (
        <View style={estilos.vazio}>
          <Ionicons name="people-outline" size={32} color={C.text3} />
          <Text style={estilos.vazioTexto}>Nenhum funcionário convidado ainda.</Text>
        </View>
      )}

      {!modalAberto ? (
        <Botao
          titulo={ativos.length >= LIMITE_FUNCIONARIOS ? 'Limite de funcionários atingido' : '+ Convidar funcionário'}
          onPress={() => setModalAberto(true)}
          variante="secundario"
          desabilitado={ativos.length >= LIMITE_FUNCIONARIOS}
          estilo={{ marginTop: 16 }}
        />
      ) : (
        <View style={estilos.formConvite}>
          <Campo label="Nome do funcionário" value={nome} onChangeText={setNome} placeholder="Ex: Donizetti" />
          <Campo label="E-mail" value={email} onChangeText={setEmail} placeholder="email@exemplo.com" autoCapitalize="none" keyboardType="email-address" />
          <Text style={estilos.avisoConvite}>
            O funcionário deve abrir o e-mail no celular com o FiadoApp instalado pra criar a senha. Avise ele pra checar também a caixa de spam.
          </Text>
          {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <Botao titulo="Cancelar" variante="secundario" onPress={() => { setModalAberto(false); setErro('') }} estilo={{ flex: 1 }} />
            <Botao titulo="Convidar" onPress={convidar} carregando={convidando} estilo={{ flex: 1 }} />
          </View>
        </View>
      )}
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centro: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  voltar: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  voltarTexto: { fontSize: 15, color: C.text, fontWeight: '600' },
  titulo: { fontSize: 22, fontWeight: '900', color: C.text, marginBottom: 8 },
  sub: { fontSize: 14, color: C.text2, lineHeight: 21, marginBottom: 20 },
  limiteBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.greenLight, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: C.greenMid, marginBottom: 20,
  },
  limiteTexto: { fontSize: 13, color: C.green, fontWeight: '700' },
  card: {
    backgroundColor: C.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: C.border, marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  avatarBox: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: C.greenLight,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetra: { fontSize: 15, fontWeight: '900', color: C.green },
  cardNome: { flex: 1, fontSize: 16, fontWeight: '700', color: C.text },
  permissaoLinha: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border,
  },
  permissaoTexto: { fontSize: 14, color: C.text2, fontWeight: '500' },
  vazio: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  vazioTexto: { fontSize: 14, color: C.text3 },
  formConvite: {
    marginTop: 16, backgroundColor: C.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: C.border,
  },
  erro: { fontSize: 13, color: C.red, marginTop: 4, marginBottom: 4 },
  avisoConvite: { fontSize: 12, color: C.text3, lineHeight: 17, marginTop: -4, marginBottom: 4 },
})

import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Switch, ActivityIndicator, Linking } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, useFocusEffect } from 'expo-router'
import { C } from '../constants/colors'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Campo } from '../components/ui/Campo'
import { Botao } from '../components/ui/Botao'
import { sanitizarTexto } from '../lib/validacao'
import { solicitarPermissaoNotificacoes, agendarNotificacoesVencimento } from '../hooks/useNotificacoes'
import { evento } from '../lib/instalacao'
import { montarTextoConvite, urlWhatsApp, pedirLinkConvite, reenviarConviteEmail } from '../lib/conviteEquipe'

const LIMITE_FUNCIONARIOS = 2

interface Membro {
  id: string
  membro_id: string
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
  const [resumoAtivo, setResumoAtivo] = useState(false)
  // membro_id -> já criou a senha? (desconhecido = sem a informação, não mostra status nem "Reenviar convite")
  const [temSenha, setTemSenha] = useState<Record<string, boolean>>({})
  const [enviandoConvite, setEnviandoConvite] = useState<string | null>(null)

  const buscar = useCallback(async () => {
    if (!usuario?.id) return
    setCarregando(true)
    const { data: perfil } = await supabase.from('perfis').select('plano').eq('id', usuario.id).single()
    if (perfil?.plano !== 'pro') { router.replace('/planos'); return }

    const { data } = await supabase
      .from('membros_equipe')
      .select('id, membro_id, nome, status, permissoes')
      .eq('dono_id', usuario.id)
      .order('criado_em')
    setMembros((data ?? []) as Membro[])
    // Quem já criou a senha (Ativo) x quem ainda não entrou. Se a função do banco ainda não existir, só some o status.
    const { data: status } = await supabase.rpc('equipe_status')
    const mapa: Record<string, boolean> = {}
    for (const s of (status ?? []) as { membro_id: string; tem_senha: boolean }[]) mapa[s.membro_id] = s.tem_senha === true
    setTemSenha(mapa)
    // Consulta à parte: se a coluna ainda não existir, só o resumo diário fica desligado (a tela continua abrindo).
    const { data: pref } = await supabase.from('perfis').select('notif_resumo_equipe').eq('id', usuario.id).maybeSingle()
    setResumoAtivo(pref?.notif_resumo_equipe === true)
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

      const nomeConvidado = sanitizarTexto(nome)
      setModalAberto(false)
      setNome(''); setEmail('')
      await buscar()
      const idMembro: string | null = typeof body.membro_id === 'string' ? body.membro_id : null
      Alert.alert(
        'Convite criado',
        `${nomeConvidado} recebeu um e-mail. Para ele entrar mais fácil, mande também o link pelo WhatsApp.\n\nO funcionário deve abrir o link no celular dele, com o FiadoApp instalado, e não no computador. O link vale uma vez; se o enviar pelo WhatsApp, use só esse (o do e-mail deixa de valer).`,
        [
          { text: 'Já enviei por e-mail', style: 'cancel' },
          ...(idMembro ? [{ text: 'Enviar pelo WhatsApp', onPress: () => { enviarPeloWhatsApp(idMembro, nomeConvidado, false) } }] : []),
        ],
      )
    } catch (e: any) {
      setErro(e.message ?? 'Erro ao convidar funcionário')
    } finally {
      setConvidando(false)
    }
  }

  // Gera o link no servidor e abre o WhatsApp com o texto pronto (wa.me sem número: o dono escolhe o contato).
  // O link nunca é gravado em log, no funil nem em estado.
  async function enviarPeloWhatsApp(membroId: string, nomeMembro: string, reenvio: boolean) {
    if (enviandoConvite) return
    setEnviandoConvite(membroId)
    try {
      const r = await pedirLinkConvite(membroId)
      const texto = montarTextoConvite({ nome: r.nome || nomeMembro, loja: r.loja, link: r.link })
      evento(reenvio ? 'convite_reenviado' : 'convite_whatsapp', reenvio ? 'whatsapp' : undefined)
      await Linking.openURL(urlWhatsApp(texto))
    } catch (e: any) {
      const msg = String(e?.message ?? '')
      Alert.alert(
        'Não foi possível abrir o WhatsApp',
        /whatsapp|openurl|unable|cannot/i.test(msg) ? 'Confira se o WhatsApp está instalado neste celular e tente de novo.' : (msg || 'Tente de novo em instantes.'),
      )
    } finally {
      setEnviandoConvite(null)
    }
  }

  async function reenviarPorEmail(membro: Membro) {
    if (enviandoConvite) return
    setEnviandoConvite(membro.id)
    try {
      await reenviarConviteEmail(membro.id)
      evento('convite_reenviado', 'email')
      Alert.alert('E-mail reenviado', `${membro.nome} vai receber um novo e-mail. Ele deve abrir no celular dele, com o FiadoApp instalado (e olhar o spam, se não chegar).`)
    } catch (e: any) {
      Alert.alert('Não foi possível reenviar', String(e?.message ?? '') || 'Tente de novo em instantes.')
    } finally {
      setEnviandoConvite(null)
    }
  }

  function reenviarConvite(membro: Membro) {
    Alert.alert(
      'Reenviar convite',
      `Como você quer reenviar para ${membro.nome}? O funcionário deve abrir no celular dele, com o FiadoApp instalado, e não no computador. O convite anterior deixa de valer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'E-mail', onPress: () => { reenviarPorEmail(membro) } },
        { text: 'WhatsApp', onPress: () => { enviarPeloWhatsApp(membro.id, membro.nome, true) } },
      ],
    )
  }

  async function alternarResumo(valor: boolean) {
    if (!usuario?.id) return
    if (valor && !(await solicitarPermissaoNotificacoes())) {
      Alert.alert('Notificações desligadas', 'Ative as notificações do FiadoApp nas configurações do celular para receber o resumo diário.')
      return
    }
    setResumoAtivo(valor)
    const { error } = await supabase.from('perfis').update({ notif_resumo_equipe: valor }).eq('id', usuario.id)
    if (error) {
      setResumoAtivo(!valor)
      Alert.alert('Não foi possível salvar', 'Verifique sua conexão e tente de novo.')
      return
    }
    agendarNotificacoesVencimento().catch(() => {})
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

      <View style={estilos.resumoBox}>
        <View style={{ flex: 1 }}>
          <Text style={estilos.resumoTitulo}>Resumo diário às 19h</Text>
          <Text style={estilos.resumoSub}>
            Um aviso por dia, só para você, para conferir o que a equipe lançou. Os números ficam em Relatórios → Por funcionário.
          </Text>
        </View>
        <Switch
          value={resumoAtivo}
          onValueChange={alternarResumo}
          trackColor={{ false: C.border, true: C.greenMid }}
          thumbColor={resumoAtivo ? C.green : C.text3}
          accessibilityLabel="Resumo diário da equipe às 19 horas"
        />
      </View>

      {ativos.map(membro => (
        <View key={membro.id} style={estilos.card}>
          <View style={estilos.cardHeader}>
            <View style={estilos.avatarBox}>
              <Text style={estilos.avatarLetra}>{membro.nome.charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={estilos.cardNome}>{membro.nome}</Text>
            <TouchableOpacity onPress={() => removerAcesso(membro)} accessibilityRole="button" accessibilityLabel={`Remover acesso de ${membro.nome}`} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="trash-outline" size={18} color={C.red} />
            </TouchableOpacity>
          </View>

          {temSenha[membro.membro_id] !== undefined && (
            temSenha[membro.membro_id] ? (
              <View style={estilos.statusLinha}>
                <Ionicons name="checkmark-circle" size={16} color={C.green} />
                <Text style={[estilos.statusTexto, { color: C.green }]}>Ativo</Text>
              </View>
            ) : (
              <View style={estilos.aguardando}>
                <View style={estilos.statusLinha}>
                  <Ionicons name="time-outline" size={16} color="#B45309" />
                  <Text style={[estilos.statusTexto, { color: '#B45309' }]}>Aguardando o funcionário entrar</Text>
                </View>
                <TouchableOpacity
                  style={estilos.btnReenviar}
                  onPress={() => reenviarConvite(membro)}
                  disabled={enviandoConvite !== null}
                  accessibilityRole="button"
                  accessibilityLabel={`Reenviar convite para ${membro.nome}`}
                >
                  {enviandoConvite === membro.id
                    ? <ActivityIndicator color={C.green} size="small" />
                    : <><Ionicons name="logo-whatsapp" size={18} color={C.green} /><Text style={estilos.btnReenviarTexto}>Reenviar convite</Text></>}
                </TouchableOpacity>
              </View>
            )
          )}

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
            O funcionário recebe um e-mail e, depois, você pode mandar o link também pelo WhatsApp. Ele deve abrir o link NO CELULAR dele, com o FiadoApp instalado, e não no computador. Avise para olhar o spam, se o e-mail não chegar.
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
  resumoBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 12,
  },
  resumoTitulo: { fontSize: 14, fontWeight: '700', color: C.text },
  resumoSub: { fontSize: 12, color: C.text2, lineHeight: 17, marginTop: 3 },
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
  statusLinha: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  statusTexto: { fontSize: 13, fontWeight: '700' },
  aguardando: { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, marginBottom: 4 },
  btnReenviar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1, borderColor: C.greenMid, backgroundColor: C.greenLight, alignSelf: 'flex-start',
  },
  btnReenviarTexto: { fontSize: 14, fontWeight: '700', color: C.green },
  avisoConvite: { fontSize: 12, color: C.text3, lineHeight: 17, marginTop: -4, marginBottom: 4 },
})

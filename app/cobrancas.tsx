import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl, ActivityIndicator, Alert, Linking, Platform, AppState
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useModulos } from '../hooks/useModulos'
import { useContadorWhatsApp } from '../hooks/useContadorWhatsApp'
import { Avatar } from '../components/ui/Avatar'
import { formatarMoeda } from '../lib/validacao'
import { montarUrlWhatsApp } from '../lib/whatsapp'
import { C } from '../constants/colors'
import { format, differenceInDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface ClienteVencido {
  id: string
  nome: string
  telefone?: string
  saldo_devedor: number
  data_vencimento: string
  dias_atraso: number
}

interface ClienteAberto {
  id: string
  nome: string
  telefone?: string
  saldo_devedor: number
}

type Aba = 'vencidos' | 'aberto'

export default function CobrancasScreen() {
  const router = useRouter()
  const { aba: abaParam } = useLocalSearchParams<{ aba?: string }>()
  const { usuario } = useAuth()
  const { modulos } = useModulos(usuario?.id)
  const [aba, setAba] = useState<Aba>(abaParam === 'aberto' ? 'aberto' : 'vencidos')
  const [vencidos, setVencidos] = useState<ClienteVencido[]>([])
  const [emAberto, setEmAberto] = useState<ClienteAberto[]>([])
  const [carregando, setCarregando] = useState(false)
  const [nomeNegocio, setNomeNegocio] = useState('nossa loja')
  const [chavePix, setChavePix] = useState<string | undefined>(undefined)
  const [plano, setPlano] = useState<'gratuito' | 'pro' | null>(null)
  const { usado, restante, atingiuLimite, limite, registrarUso, reverterUso } = useContadorWhatsApp(plano, usuario?.id)
  const [cobrando, setCobrando] = useState(false)
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 })

  const buscarVencidos = useCallback(async () => {
    if (!usuario?.id) return
    setCarregando(true)
    try {
      const hoje = new Date().toISOString().split('T')[0]
      const { data: vendasVencidas } = await supabase
        .from('vendas')
        .select('cliente_id, data_vencimento, clientes(id, nome, telefone)')
        .eq('usuario_id', usuario.id)
        .eq('pago', false)
        .lt('data_vencimento', hoje)
        .not('data_vencimento', 'is', null)
        .order('data_vencimento', { ascending: true })

      if (!vendasVencidas) { setVencidos([]); return }

      const clienteIds = [...new Set(vendasVencidas.map(v => v.cliente_id))]
      if (clienteIds.length === 0) { setVencidos([]); return }

      const { data: saldos } = await supabase
        .from('clientes_com_saldo')
        .select('id, nome, telefone, saldo_devedor')
        .in('id', clienteIds)
        .eq('usuario_id', usuario.id)
        .eq('ativo', true)

      const porCliente = new Map<string, ClienteVencido>()
      for (const venda of vendasVencidas) {
        const clienteInfo = saldos?.find(s => s.id === venda.cliente_id)
        if (!clienteInfo) continue
        const diasAtraso = differenceInDays(new Date(), new Date(venda.data_vencimento + 'T12:00:00'))
        if (!porCliente.has(venda.cliente_id) || diasAtraso > (porCliente.get(venda.cliente_id)!.dias_atraso)) {
          porCliente.set(venda.cliente_id, {
            id: clienteInfo.id,
            nome: clienteInfo.nome,
            telefone: clienteInfo.telefone,
            saldo_devedor: clienteInfo.saldo_devedor ?? 0,
            data_vencimento: venda.data_vencimento,
            dias_atraso: diasAtraso,
          })
        }
      }
      setVencidos(
        Array.from(porCliente.values())
          .filter(c => c.saldo_devedor > 0)
          .sort((a, b) => b.dias_atraso - a.dias_atraso)
      )
    } finally {
      setCarregando(false)
    }
  }, [usuario?.id])

  const buscarEmAberto = useCallback(async () => {
    if (!usuario?.id) return
    setCarregando(true)
    try {
      const { data } = await supabase
        .from('clientes_com_saldo')
        .select('id, nome, telefone, saldo_devedor')
        .eq('usuario_id', usuario.id)
        .eq('ativo', true)
        .gt('saldo_devedor', 0)
        .order('saldo_devedor', { ascending: false })
      setEmAberto(data ?? [])
    } finally {
      setCarregando(false)
    }
  }, [usuario?.id])

  const buscar = useCallback(async () => {
    await Promise.all([buscarVencidos(), buscarEmAberto()])
  }, [buscarVencidos, buscarEmAberto])

  useEffect(() => {
    if (!usuario?.id) return
    supabase.from('perfis').select('nome_negocio, plano, chave_pix').eq('id', usuario.id).single()
      .then(({ data }) => {
        if (data?.nome_negocio) setNomeNegocio(data.nome_negocio)
        if (data?.plano) setPlano(data.plano)
        if (data?.chave_pix) setChavePix(data.chave_pix)
      })
  }, [usuario?.id])

  useFocusEffect(useCallback(() => { buscar() }, [buscar]))

  // Sincroniza aba com parâmetro de URL (ex: vindo do banner do dashboard)
  useEffect(() => {
    if (abaParam === 'aberto') setAba('aberto')
  }, [abaParam])

  async function cobrarUm(cliente: ClienteVencido) {
    if (!cliente.telefone) {
      Alert.alert('Sem telefone', `${cliente.nome} não tem telefone cadastrado.`)
      return
    }
    const permitido = await registrarUso()
    if (!permitido) {
      Alert.alert(
        'Limite atingido',
        `Você usou ${limite} cobranças WhatsApp este mês (plano gratuito).\n\nFaça upgrade para cobranças ilimitadas.`,
        [
          { text: 'Fechar', style: 'cancel' },
          { text: 'Ver planos', onPress: () => router.push('/planos') },
        ],
      )
      return
    }
    const url = montarUrlWhatsApp(
      { id: cliente.id, nome: cliente.nome, telefone: cliente.telefone },
      cliente.saldo_devedor,
      nomeNegocio,
      true,
      cliente.dias_atraso,
      chavePix,
    )
    if (Platform.OS === 'web') {
      try { window.open(url, '_blank') } catch { await reverterUso() }
    } else {
      try {
        await Linking.openURL(url)
      } catch {
        await reverterUso()
        Alert.alert('Erro', 'Não foi possível abrir o WhatsApp. Verifique se está instalado.')
      }
    }
  }

  function verificarPro(acao: () => void) {
    if (plano !== 'pro') {
      Alert.alert(
        '🔒 Recurso Pro',
        'A cobrança em massa via WhatsApp está disponível apenas no plano Pro.',
        [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Ver planos', onPress: () => router.push('/planos') },
        ],
      )
      return
    }
    acao()
  }

  async function executarCobrarTodos(
    lista: { id: string; nome: string; telefone?: string; saldo_devedor: number; dias_atraso?: number }[],
    vencido: boolean,
    diasAtrasoDefault: number,
  ) {
    const comTelefone = lista.filter(v => v.telefone)
    if (comTelefone.length === 0) {
      Alert.alert('Nenhum cliente com telefone', 'Cadastre os telefones dos clientes para cobrar via WhatsApp.')
      return
    }
    const tipo = vencido ? 'vencidos' : 'com saldo em aberto'
    Alert.alert(
      'Cobrar todos via WhatsApp',
      `Serão abertas ${comTelefone.length} conversa(s) no WhatsApp para cobrar os clientes ${tipo}. Confirmar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cobrar todos',
          onPress: async () => {
            setCobrando(true)
            setProgresso({ atual: 0, total: comTelefone.length })
            try {
              for (let i = 0; i < comTelefone.length; i++) {
                const cliente = comTelefone[i]
                setProgresso({ atual: i + 1, total: comTelefone.length })

                const url = montarUrlWhatsApp(
                  { id: cliente.id, nome: cliente.nome, telefone: cliente.telefone },
                  cliente.saldo_devedor,
                  nomeNegocio,
                  vencido,
                  cliente.dias_atraso ?? diasAtrasoDefault,
                  chavePix,
                )

                if (Platform.OS === 'web') {
                  window.open(url, '_blank')
                  await new Promise(r => setTimeout(r, 800))
                } else {
                  let abriu = false
                  try {
                    await Linking.openURL(url)
                    abriu = true
                  } catch {
                    Alert.alert('Erro', `Não foi possível abrir WhatsApp para ${cliente.nome}.`)
                  }
                  // Aguarda o usuário voltar ao app antes de abrir o próximo WhatsApp
                  if (abriu && i < comTelefone.length - 1) {
                    await new Promise<void>(resolve => {
                      let settled = false
                      const done = (delay: number) => {
                        if (settled) return
                        settled = true
                        sub.remove()
                        clearTimeout(tid)
                        setTimeout(resolve, delay)
                      }
                      // Timeout de segurança: 3 minutos sem retornar desbloqueia o próximo
                      const tid = setTimeout(() => done(0), 3 * 60 * 1000)
                      const sub = AppState.addEventListener('change', state => {
                        if (state === 'active') done(600)
                      })
                    })
                  }
                }
              }
              Alert.alert(
                'Cobranças enviadas!',
                `${comTelefone.length} conversa(s) abertas no WhatsApp.`,
                [{ text: 'OK' }],
              )
            } finally {
              setCobrando(false)
              setProgresso({ atual: 0, total: 0 })
            }
          },
        },
      ],
    )
  }

  async function cobrarUmAberto(cliente: ClienteAberto) {
    if (!cliente.telefone) {
      Alert.alert('Sem telefone', `${cliente.nome} não tem telefone cadastrado.`)
      return
    }
    const permitido = await registrarUso()
    if (!permitido) {
      Alert.alert(
        'Limite atingido',
        `Você usou ${limite} cobranças WhatsApp este mês (plano gratuito).\n\nFaça upgrade para cobranças ilimitadas.`,
        [
          { text: 'Fechar', style: 'cancel' },
          { text: 'Ver planos', onPress: () => router.push('/planos') },
        ],
      )
      return
    }
    const url = montarUrlWhatsApp(
      { id: cliente.id, nome: cliente.nome, telefone: cliente.telefone },
      cliente.saldo_devedor,
      nomeNegocio,
      false,
      0,
      chavePix,
    )
    if (Platform.OS === 'web') {
      try { window.open(url, '_blank') } catch { await reverterUso() }
    } else {
      try {
        await Linking.openURL(url)
      } catch {
        await reverterUso()
        Alert.alert('Erro', 'Não foi possível abrir o WhatsApp. Verifique se está instalado.')
      }
    }
  }

  function cobrarTodosVencidos() {
    verificarPro(() => executarCobrarTodos(vencidos, true, 1))
  }

  const dadosAba = aba === 'vencidos' ? vencidos : emAberto
  const semTelefone = dadosAba.filter(v => !v.telefone).length
  const totalAba = dadosAba.reduce((s, v) => s + v.saldo_devedor, 0)

  function corAtraso(dias: number) {
    if (dias > 30) return C.red
    if (dias > 7) return C.yellow
    return C.text2
  }

  function renderVencido({ item }: { item: ClienteVencido }) {
    return (
      <TouchableOpacity style={estilos.row} onPress={() => router.push(`/cliente/${item.id}`)}>
        <Avatar nome={item.nome} tamanho={46} />
        <View style={estilos.info}>
          <Text style={estilos.nome}>{item.nome}</Text>
          <Text style={[estilos.atraso, { color: corAtraso(item.dias_atraso) }]}>
            ⚠ {item.dias_atraso === 1 ? '1 dia' : `${item.dias_atraso} dias`} em atraso
          </Text>
          <Text style={estilos.venceu}>
            Venceu em {format(new Date(item.data_vencimento + 'T12:00:00'), "d 'de' MMM", { locale: ptBR })}
          </Text>
        </View>
        <View style={estilos.direita}>
          <Text style={estilos.saldo}>{formatarMoeda(item.saldo_devedor)}</Text>
          {item.telefone ? (
            <TouchableOpacity
              style={estilos.btnWhats}
              onPress={(e) => { e.stopPropagation?.(); cobrarUm(item) }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
            </TouchableOpacity>
          ) : (
            <View style={estilos.semTel}>
              <Ionicons name="call-outline" size={14} color={C.text3} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  function renderAberto({ item }: { item: ClienteAberto }) {
    return (
      <TouchableOpacity style={estilos.row} onPress={() => router.push(`/cliente/${item.id}`)}>
        <Avatar nome={item.nome} tamanho={46} />
        <View style={estilos.info}>
          <Text style={estilos.nome}>{item.nome}</Text>
          <Text style={estilos.aberto}>Saldo em aberto</Text>
        </View>
        <View style={estilos.direita}>
          <Text style={estilos.saldo}>{formatarMoeda(item.saldo_devedor)}</Text>
          {item.telefone ? (
            <TouchableOpacity
              style={estilos.btnWhats}
              onPress={(e) => { e.stopPropagation?.(); cobrarUmAberto(item) }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
            </TouchableOpacity>
          ) : (
            <View style={estilos.semTel}>
              <Ionicons name="call-outline" size={14} color={C.text3} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={estilos.container}>
      {/* Tabs */}
      <View style={estilos.tabBar}>
        <TouchableOpacity
          style={[estilos.tab, aba === 'vencidos' && estilos.tabAtiva]}
          onPress={() => setAba('vencidos')}
        >
          <Ionicons name="warning-outline" size={14} color={aba === 'vencidos' ? C.red : C.text3} />
          <Text style={[estilos.tabTexto, aba === 'vencidos' && { color: C.red }]}>
            Vencidos {vencidos.length > 0 ? `(${vencidos.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[estilos.tab, aba === 'aberto' && estilos.tabAtiva]}
          onPress={() => setAba('aberto')}
        >
          <Ionicons name="time-outline" size={14} color={aba === 'aberto' ? C.green : C.text3} />
          <Text style={[estilos.tabTexto, aba === 'aberto' && { color: C.green }]}>
            Em aberto {emAberto.length > 0 ? `(${emAberto.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Resumo + botão cobrar todos */}
      {dadosAba.length > 0 && (
        <View style={estilos.resumoBox}>
          <View style={estilos.resumoEsq}>
            <Text style={estilos.resumoNum}>{dadosAba.length}</Text>
            <Text style={estilos.resumoLabel}>
              {aba === 'vencidos' ? 'clientes vencidos' : 'com saldo aberto'}
            </Text>
          </View>
          <View style={[estilos.resumoEsq, { alignItems: 'center' }]}>
            <Text style={[estilos.resumoNum, { color: aba === 'vencidos' ? C.red : C.text }]}>
              {formatarMoeda(totalAba)}
            </Text>
            <Text style={estilos.resumoLabel}>
              {aba === 'vencidos' ? 'total em atraso' : 'total em aberto'}
            </Text>
          </View>
          {aba === 'vencidos' && (
            <TouchableOpacity
              style={[
                estilos.btnCobrarTodos,
                plano !== 'pro' && estilos.btnCobrarTodosBloqueado,
                (cobrando || plano === null) && { opacity: 0.6 },
              ]}
              onPress={cobrarTodosVencidos}
              disabled={cobrando || plano === null}
            >
              {cobrando
                ? <ActivityIndicator size="small" color={C.white} />
                : <Ionicons name={plano === 'pro' ? 'logo-whatsapp' : 'lock-closed'} size={16} color={C.white} />
              }
              <Text style={estilos.btnCobrarTodosTexto}>
                {cobrando
                  ? (progresso.total > 0 ? `${progresso.atual}/${progresso.total}` : 'Enviando...')
                  : plano === 'pro' ? 'Cobrar vencidos' : 'Cobrar · Pro'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {plano === 'gratuito' && (
        <TouchableOpacity
          style={[estilos.avisoBanner, atingiuLimite && { backgroundColor: C.redLight, borderColor: C.redBorder }]}
          onPress={() => router.push('/planos')}
        >
          <Ionicons
            name={atingiuLimite ? 'lock-closed-outline' : 'logo-whatsapp'}
            size={16}
            color={atingiuLimite ? C.red : C.yellow}
          />
          <Text style={[estilos.avisoTexto, atingiuLimite && { color: C.red }]}>
            {atingiuLimite
              ? `Limite de ${limite} cobranças atingido este mês. Faça upgrade →`
              : `${usado}/${limite} cobranças WhatsApp usadas este mês. Upgrade para ilimitado →`}
          </Text>
        </TouchableOpacity>
      )}

      {semTelefone > 0 && (
        <View style={estilos.avisoBanner}>
          <Ionicons name="information-circle-outline" size={16} color={C.yellow} />
          <Text style={estilos.avisoTexto}>
            {semTelefone} cliente(s) sem telefone não receberão cobrança via WhatsApp.
          </Text>
        </View>
      )}

      {aba === 'vencidos' ? (
        <FlatList
          data={vencidos}
          keyExtractor={(i) => i.id}
          renderItem={renderVencido}
          refreshControl={<RefreshControl refreshing={carregando} onRefresh={buscar} tintColor={C.green} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          ListEmptyComponent={
            !carregando ? (
              <View style={estilos.vazio}>
                <View style={estilos.vazioIcone}>
                  <Text style={{ fontSize: 40 }}>🎉</Text>
                </View>
                <Text style={estilos.vazioTitulo}>Nenhuma cobrança vencida!</Text>
                <Text style={estilos.vazioTexto}>Todos os clientes estão em dia com os pagamentos.</Text>
              </View>
            ) : <ActivityIndicator color={C.green} style={{ marginTop: 48 }} />
          }
        />
      ) : (
        <FlatList
          data={emAberto}
          keyExtractor={(i) => i.id}
          renderItem={renderAberto}
          refreshControl={<RefreshControl refreshing={carregando} onRefresh={buscar} tintColor={C.green} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          ListEmptyComponent={
            !carregando ? (
              <View style={estilos.vazio}>
                <View style={estilos.vazioIcone}>
                  <Text style={{ fontSize: 40 }}>✅</Text>
                </View>
                <Text style={estilos.vazioTitulo}>Sem saldo em aberto!</Text>
                <Text style={estilos.vazioTexto}>Nenhum cliente possui saldo pendente no momento.</Text>
              </View>
            ) : <ActivityIndicator color={C.green} style={{ marginTop: 48 }} />
          }
        />
      )}
    </View>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabAtiva: { borderBottomColor: C.green },
  tabTexto: { fontSize: 13, fontWeight: '600', color: C.text3 },

  resumoBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.card, padding: 16, borderBottomWidth: 1, borderBottomColor: C.border,
    gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  resumoEsq: { gap: 2 },
  resumoNum: { fontSize: 17, fontWeight: '800', color: C.text },
  resumoLabel: { fontSize: 10, color: C.text2, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  btnCobrarTodos: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#25D366', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    shadowColor: '#25D366', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  btnCobrarTodosBloqueado: { backgroundColor: C.yellow, shadowColor: C.yellow },
  btnCobrarTodosTexto: { color: C.white, fontWeight: '700', fontSize: 12 },

  avisoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.yellowLight, borderBottomWidth: 1, borderBottomColor: C.yellowBorder,
    padding: 12, paddingHorizontal: 16,
  },
  avisoTexto: { flex: 1, fontSize: 12, color: C.yellow, fontWeight: '500' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.card, paddingHorizontal: 16, paddingVertical: 15,
    borderRadius: 18, marginBottom: 8,
    borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  info: { flex: 1, gap: 2 },
  nome: { fontSize: 15, fontWeight: '600', color: C.text },
  atraso: { fontSize: 12, fontWeight: '700' },
  aberto: { fontSize: 12, fontWeight: '600', color: C.text2 },
  venceu: { fontSize: 11, color: C.text3 },
  direita: { alignItems: 'flex-end', gap: 6 },
  saldo: { fontSize: 14, fontWeight: '700', color: C.red },
  btnWhats: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: '#E7FBF0', borderWidth: 1, borderColor: '#B7F0CC',
    alignItems: 'center', justifyContent: 'center',
  },
  semTel: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  vazio: { alignItems: 'center', paddingTop: 80, gap: 10 },
  vazioIcone: { width: 80, height: 80, borderRadius: 24, backgroundColor: C.greenLight, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  vazioTitulo: { fontSize: 17, fontWeight: '700', color: C.text },
  vazioTexto: { fontSize: 14, color: C.text2, textAlign: 'center', lineHeight: 20 },
})

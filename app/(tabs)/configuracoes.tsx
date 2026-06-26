import { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, Platform, Switch
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useOffline } from '../../hooks/useOffline'
import { useModulos, INFO_MODULOS, type Modulos } from '../../hooks/useModulos'
import { solicitarPermissaoNotificacoes, agendarNotificacoesVencimento } from '../../hooks/useNotificacoes'
import { Campo } from '../../components/ui/Campo'
import { Botao } from '../../components/ui/Botao'
import { Avatar } from '../../components/ui/Avatar'
import { sanitizarTexto, validarTelefone } from '../../lib/validacao'
import { C } from '../../constants/colors'

interface Perfil {
  nome_negocio: string
  telefone: string
  plano: 'gratuito' | 'pro'
  chave_pix: string
  dia_cobranca: string
  notificacoes_ativas: boolean
}

function confirmar(titulo: string, msg: string, onConfirmar: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${titulo}\n\n${msg}`)) onConfirmar()
  } else {
    Alert.alert(titulo, msg, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', style: 'destructive', onPress: onConfirmar },
    ])
  }
}

export default function ConfiguracoesScreen() {
  const router = useRouter()
  const { usuario, sair } = useAuth()
  const { online, pendentes } = useOffline()
  const { modulos, alternar } = useModulos(usuario?.id)
  const [perfil, setPerfil] = useState<Perfil>({
    nome_negocio: '', telefone: '', plano: 'gratuito',
    chave_pix: '', dia_cobranca: '', notificacoes_ativas: true,
  })
  const [editandoDados, setEditandoDados] = useState(false)
  const [editandoPix, setEditandoPix] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState('')
  const [sucesso, setSucesso] = useState(false)
  const ultimoSync = new Date().toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })

  useEffect(() => {
    if (!usuario) return
    supabase.from('perfis')
      .select('nome_negocio, telefone, plano, chave_pix, dia_cobranca, notificacoes_ativas')
      .eq('id', usuario.id).single()
      .then(({ data }) => {
        if (data) setPerfil({
          nome_negocio: data.nome_negocio ?? '',
          telefone: data.telefone ?? '',
          plano: data.plano,
          chave_pix: data.chave_pix ?? '',
          dia_cobranca: data.dia_cobranca?.toString() ?? '',
          notificacoes_ativas: data.notificacoes_ativas ?? true,
        })
      })
  }, [usuario])

  function validar(): boolean {
    const novosErros: Record<string, string> = {}
    if (sanitizarTexto(perfil.nome_negocio).length < 2) novosErros.nome_negocio = 'Nome deve ter ao menos 2 caracteres.'
    if (perfil.telefone && !validarTelefone(perfil.telefone)) novosErros.telefone = 'Telefone inválido.'
    if (perfil.dia_cobranca) {
      const dia = parseInt(perfil.dia_cobranca)
      if (isNaN(dia) || dia < 1 || dia > 28) novosErros.dia_cobranca = 'Dia deve ser entre 1 e 28.'
    }
    setErros(novosErros)
    return Object.keys(novosErros).length === 0
  }

  async function handleSalvar() {
    if (!validar()) return
    setSalvando(true); setErroGeral(''); setSucesso(false)
    try {
      const { error } = await supabase.from('perfis').update({
        nome_negocio: sanitizarTexto(perfil.nome_negocio),
        telefone: perfil.telefone || null,
        chave_pix: perfil.chave_pix || null,
        dia_cobranca: perfil.dia_cobranca ? parseInt(perfil.dia_cobranca) : null,
        notificacoes_ativas: perfil.notificacoes_ativas,
      }).eq('id', usuario!.id)
      if (error) throw error
      setSucesso(true)
      setTimeout(() => setSucesso(false), 3000)
    } catch (e: any) {
      setErroGeral(e.message)
    } finally {
      setSalvando(false)
    }
  }

  async function handleExportarCSV() {
    if (!usuario) return
    try {
      const [{ data: clientes }, { data: vendas }, { data: pagamentos }] = await Promise.all([
        supabase.from('clientes').select('nome, telefone, created_at').eq('usuario_id', usuario.id),
        supabase.from('vendas').select('descricao, valor, data_venda, categoria, clientes(nome)').eq('usuario_id', usuario.id),
        supabase.from('pagamentos').select('valor, data_pagamento, clientes(nome)').eq('usuario_id', usuario.id),
      ])

      const linhasClientes = ['Cliente,Telefone,Cadastrado em', ...(clientes ?? []).map(c =>
        `"${c.nome}","${c.telefone ?? ''}","${c.created_at?.slice(0, 10) ?? ''}"`)]

      const linhasVendas = ['Cliente,Descrição,Valor,Data,Categoria', ...(vendas ?? []).map(v =>
        `"${(v.clientes as any)?.nome ?? ''}","${v.descricao}","${v.valor}","${v.data_venda}","${v.categoria ?? ''}"`)]

      const linhasPagamentos = ['Cliente,Valor,Data', ...(pagamentos ?? []).map(p =>
        `"${(p.clientes as any)?.nome ?? ''}","${p.valor}","${p.data_pagamento}"`)]

      const csv = [
        '=== CLIENTES ===', ...linhasClientes, '',
        '=== VENDAS ===', ...linhasVendas, '',
        '=== PAGAMENTOS ===', ...linhasPagamentos,
      ].join('\n')

      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = 'fiado-facil-dados.csv'; a.click()
        URL.revokeObjectURL(url)
        return
      }

      const caminho = `${FileSystem.documentDirectory}fiado-facil-dados.csv`
      await FileSystem.writeAsStringAsync(caminho, csv, { encoding: FileSystem.EncodingType.UTF8 })
      await Sharing.shareAsync(caminho, { mimeType: 'text/csv', dialogTitle: 'Exportar dados' })
    } catch (e: any) {
      Alert.alert('Erro ao exportar', e.message)
    }
  }

  async function handleExcluirConta() {
    const pedirConfirmacao = () => new Promise<boolean>(resolve =>
      Alert.alert(
        'Excluir conta',
        'Todos os seus clientes, vendas e pagamentos serão apagados permanentemente. Esta ação não pode ser desfeita.',
        [
          { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Excluir tudo', style: 'destructive', onPress: () => resolve(true) },
        ]
      )
    )

    if (Platform.OS === 'web') {
      if (!window.confirm('Excluir conta?\n\nTodos os dados serão apagados permanentemente.')) return
    } else {
      const ok = await pedirConfirmacao()
      if (!ok) return
    }

    try {
      const uid = usuario!.id
      await supabase.from('pagamentos').delete().eq('usuario_id', uid)
      await supabase.from('vendas').delete().eq('usuario_id', uid)
      await supabase.from('clientes').delete().eq('usuario_id', uid)
      await supabase.from('perfis').delete().eq('id', uid)
      await supabase.auth.signOut()
    } catch (e: any) {
      Alert.alert('Erro', 'Não foi possível excluir a conta. Tente novamente ou contate suporte@fiadofacil.com.br')
    }
  }

  async function toggleNotificacoes(valor: boolean) {
    setPerfil(p => ({ ...p, notificacoes_ativas: valor }))
    if (valor && Platform.OS !== 'web') {
      const ok = await solicitarPermissaoNotificacoes()
      if (ok) await agendarNotificacoesVencimento()
    }
    await supabase.from('perfis').update({ notificacoes_ativas: valor }).eq('id', usuario!.id)
  }

  return (
    <ScrollView style={estilos.container} contentContainerStyle={estilos.content}>

      {/* Status online/offline */}
      <View style={[estilos.statusBar, online ? estilos.statusOnline : estilos.statusOffline]}>
        <Ionicons name={online ? 'cloud-done-outline' : 'cloud-offline-outline'} size={14} color={online ? C.green : C.red} />
        <Text style={[estilos.statusTexto, { color: online ? C.green : C.red }]}>
          {online
            ? `Dados sincronizados às ${ultimoSync}${pendentes > 0 ? ` · ${pendentes} pendente(s)` : ''}`
            : `Sem conexão · ${pendentes} operação(ões) pendentes`}
        </Text>
      </View>

      {/* Header perfil */}
      <View style={estilos.perfilCard}>
        <Avatar nome={perfil.nome_negocio || 'FF'} tamanho={64} />
        <View style={{ flex: 1 }}>
          <Text style={estilos.nomeNegocio} numberOfLines={1}>{perfil.nome_negocio || 'Meu Negócio'}</Text>
          <Text style={estilos.email} numberOfLines={1}>{usuario?.email}</Text>
          <View style={[estilos.planoBadge, perfil.plano === 'pro' && estilos.planoBadgePro]}>
            <Ionicons name={perfil.plano === 'pro' ? 'star' : 'gift-outline'} size={11} color={perfil.plano === 'pro' ? C.green : C.text2} />
            <Text style={[estilos.planoTexto, perfil.plano === 'pro' && estilos.planoTextoPro]}>
              {perfil.plano === 'pro' ? 'Pro' : 'Gratuito'}
            </Text>
          </View>
        </View>
      </View>

      {/* Banner upgrade */}
      {perfil.plano === 'gratuito' ? (
        <TouchableOpacity style={estilos.upgradeBanner} onPress={() => router.push('/planos')}>
          <View style={estilos.upgradeIconeBox}>
            <Text style={{ fontSize: 24 }}>🚀</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={estilos.upgradeTitle}>Mude para o Plano Pro</Text>
            <Text style={estilos.upgradeSub}>Desbloqueie tudo por R$ 19/mês</Text>
            <View style={estilos.upgradeItens}>
              <View style={estilos.upgradeItem}>
                <Ionicons name="logo-whatsapp" size={12} color={C.green} />
                <Text style={estilos.upgradeItemTexto}>Cobranças automáticas via WhatsApp</Text>
              </View>
              <View style={estilos.upgradeItem}>
                <Ionicons name="people" size={12} color={C.green} />
                <Text style={estilos.upgradeItemTexto}>Clientes ilimitados</Text>
              </View>
              <View style={estilos.upgradeItem}>
                <Ionicons name="bar-chart" size={12} color={C.green} />
                <Text style={estilos.upgradeItemTexto}>Relatórios avançados e ranking</Text>
              </View>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.green} />
        </TouchableOpacity>
      ) : (
        <View style={estilos.proBanner}>
          <View style={estilos.proBannerIconeBox}>
            <Text style={{ fontSize: 24 }}>⭐</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={estilos.proBannerTitle}>Você é Pro!</Text>
            <Text style={estilos.proBannerSub}>Todos os recursos estão desbloqueados</Text>
            <View style={estilos.upgradeItens}>
              <View style={estilos.upgradeItem}>
                <Ionicons name="logo-whatsapp" size={12} color={C.green} />
                <Text style={estilos.upgradeItemTexto}>Cobranças automáticas via WhatsApp ativas</Text>
              </View>
              <View style={estilos.upgradeItem}>
                <Ionicons name="checkmark-circle" size={12} color={C.green} />
                <Text style={estilos.upgradeItemTexto}>Clientes ilimitados</Text>
              </View>
              <View style={estilos.upgradeItem}>
                <Ionicons name="checkmark-circle" size={12} color={C.green} />
                <Text style={estilos.upgradeItemTexto}>Relatórios, ranking e muito mais</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Dados do negócio */}
      <View style={estilos.card}>
        <View style={estilos.cardHeader}>
          <Text style={estilos.cardTitulo}>Dados do negócio</Text>
          <TouchableOpacity
            style={[estilos.editarBtn, editandoDados && estilos.cancelarBtn]}
            onPress={() => { setEditandoDados(!editandoDados); setErros({}); setErroGeral('') }}
          >
            <Text style={[estilos.editarTexto, editandoDados && estilos.cancelarTexto]}>
              {editandoDados ? 'Cancelar' : 'Editar'}
            </Text>
          </TouchableOpacity>
        </View>

        {sucesso && (
          <View style={estilos.sucessoBox}>
            <Ionicons name="checkmark-circle" size={16} color={C.green} />
            <Text style={estilos.sucessoTexto}>Perfil atualizado com sucesso!</Text>
          </View>
        )}

        {editandoDados ? (
          <>
            <Campo label="Nome do negócio" value={perfil.nome_negocio} onChangeText={(v) => setPerfil(p => ({ ...p, nome_negocio: v }))} erro={erros.nome_negocio} autoCapitalize="words" />
            <Campo label="Telefone (WhatsApp)" value={perfil.telefone} onChangeText={(v) => setPerfil(p => ({ ...p, telefone: v }))} erro={erros.telefone} keyboardType="phone-pad" placeholder="(00) 00000-0000" />
            {erroGeral ? (
              <View style={estilos.erroBox}>
                <Ionicons name="alert-circle" size={15} color={C.red} />
                <Text style={estilos.erroTexto}>{erroGeral}</Text>
              </View>
            ) : null}
            <Botao titulo="Salvar alterações" onPress={async () => { await handleSalvar(); setEditandoDados(false) }} carregando={salvando} />
          </>
        ) : (
          <>
            <ItemInfo icone="storefront-outline" label="Negócio" valor={perfil.nome_negocio || '—'} />
            <ItemInfo icone="mail-outline" label="E-mail" valor={usuario?.email ?? '—'} />
            <ItemInfo icone="logo-whatsapp" label="WhatsApp" valor={perfil.telefone || 'Não informado'} ultimo />
          </>
        )}
      </View>

      {/* Pix & Cobrança automática */}
      <View style={estilos.card}>
        <View style={estilos.cardHeader}>
          <Text style={estilos.cardTitulo}>💳 Pix & Cobrança automática</Text>
          <TouchableOpacity
            style={[estilos.editarBtn, editandoPix && estilos.cancelarBtn]}
            onPress={() => { setEditandoPix(!editandoPix); setErros({}) }}
          >
            <Text style={[estilos.editarTexto, editandoPix && estilos.cancelarTexto]}>
              {editandoPix ? 'Cancelar' : 'Editar'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={estilos.secaoInfo}>
          Sua chave Pix aparece como QR Code na tela de pagamento do cliente.
          O dia de cobrança envia um lembrete automático todo mês.
        </Text>
        {editandoPix ? (
          <>
            <Campo
              label="Chave Pix (CPF, e-mail, telefone ou aleatória)"
              value={perfil.chave_pix}
              onChangeText={(v) => setPerfil(p => ({ ...p, chave_pix: v }))}
              placeholder="Ex: 11999999999 ou email@exemplo.com"
              autoCapitalize="none"
            />
            <Campo
              label="Dia de cobrança automática (1–28)"
              value={perfil.dia_cobranca}
              onChangeText={(v) => setPerfil(p => ({ ...p, dia_cobranca: v.replace(/\D/g, '') }))}
              keyboardType="numeric"
              placeholder="Ex: 5 (todo dia 5 do mês)"
              erro={erros.dia_cobranca}
            />
            <Botao titulo="Salvar configurações" onPress={async () => { await handleSalvar(); setEditandoPix(false) }} carregando={salvando} />
          </>
        ) : (
          <>
            <ItemInfo icone="qr-code-outline" label="Chave Pix" valor={perfil.chave_pix || 'Não configurada'} />
            <ItemInfo icone="calendar-outline" label="Dia de cobrança" valor={perfil.dia_cobranca ? `Todo dia ${perfil.dia_cobranca}` : 'Não configurado'} ultimo />
          </>
        )}
      </View>

      {/* Notificações */}
      <View style={estilos.card}>
        <Text style={[estilos.cardTitulo, { marginBottom: 12 }]}>🔔 Notificações</Text>
        <View style={estilos.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={estilos.toggleLabel}>Avisos de vencimento</Text>
            <Text style={estilos.toggleSub}>Receba aviso às 9h quando clientes vencerem</Text>
          </View>
          <Switch
            value={perfil.notificacoes_ativas}
            onValueChange={toggleNotificacoes}
            trackColor={{ false: C.border, true: C.greenMid }}
            thumbColor={perfil.notificacoes_ativas ? C.green : C.text3}
          />
        </View>
        {Platform.OS === 'web' && (
          <Text style={estilos.avisoWeb}>⚠ Notificações push funcionam apenas no app instalado.</Text>
        )}
      </View>

      {/* Módulos */}
      <View style={estilos.card}>
        <View style={{ marginBottom: 16 }}>
          <Text style={estilos.cardTitulo}>⚙️ Módulos ativos</Text>
          <Text style={estilos.secaoInfo}>Ative ou desative funcionalidades conforme o seu negócio.</Text>
        </View>
        {(Object.keys(INFO_MODULOS) as (keyof Modulos)[]).map((key, i, arr) => {
          const info = INFO_MODULOS[key]
          const ativo = modulos[key]
          const ultimo = i === arr.length - 1
          return (
            <View key={key} style={[estilos.moduloRow, ultimo && { borderBottomWidth: 0 }]}>
              <View style={[estilos.moduloIcone, ativo ? estilos.moduloIconeAtivo : estilos.moduloIconeOff]}>
                <Ionicons name={info.icone as any} size={16} color={ativo ? C.green : C.text3} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={estilos.moduloLabel}>{info.label}</Text>
                  {info.pro && (
                    <View style={estilos.proBadge}>
                      <Text style={estilos.proTexto}>PRO</Text>
                    </View>
                  )}
                </View>
                <Text style={estilos.moduloDesc}>{info.descricao}</Text>
              </View>
              <Switch
                value={ativo}
                onValueChange={(v) => alternar(key, v)}
                trackColor={{ false: C.border, true: C.greenMid }}
                thumbColor={ativo ? C.green : C.text3}
              />
            </View>
          )
        })}
      </View>

      {/* Equipe */}
      <TouchableOpacity style={estilos.card} onPress={() => router.push('/equipe')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={estilos.acaoIcone}>
            <Ionicons name="people-outline" size={20} color={C.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={estilos.acaoLabel}>Equipe & funcionários</Text>
            <Text style={estilos.acaoSub}>Convide funcionários para usar o app</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={C.text3} />
        </View>
      </TouchableOpacity>

      {/* Dados & exportação */}
      <View style={estilos.card}>
        <Text style={[estilos.cardTitulo, { marginBottom: 8 }]}>💾 Dados</Text>
        <AcaoRow icone="download-outline" label="Exportar dados (CSV)" onPress={handleExportarCSV} ultimo />
      </View>

      {/* Legal */}
      <View style={estilos.card}>
        <Text style={[estilos.cardTitulo, { marginBottom: 8 }]}>📄 Legal</Text>
        <AcaoRow icone="shield-checkmark-outline" label="Política de Privacidade" onPress={() => router.push('/privacidade')} />
        <AcaoRow icone="document-text-outline" label="Termos de Uso" onPress={() => router.push('/termos')} ultimo />
      </View>

      {/* Conta */}
      <View style={estilos.card}>
        <Text style={[estilos.cardTitulo, { marginBottom: 8 }]}>Conta</Text>
        <AcaoRow icone="log-out-outline" label="Sair da conta"
          onPress={() => confirmar('Sair', 'Tem certeza que deseja sair da sua conta?', sair)} />
        <AcaoRow icone="trash-outline" label="Excluir conta" cor={C.red}
          onPress={handleExcluirConta}
          ultimo />
      </View>

      <Text style={estilos.versao}>FiadoApp v1.0.0</Text>
    </ScrollView>
  )
}

function ItemInfo({ icone, label, valor, ultimo }: { icone: any; label: string; valor: string; ultimo?: boolean }) {
  return (
    <View style={[estilos.itemInfo, ultimo && { borderBottomWidth: 0 }]}>
      <View style={estilos.itemIconeBox}><Ionicons name={icone} size={16} color={C.text2} /></View>
      <View style={{ flex: 1 }}>
        <Text style={estilos.itemLabel}>{label}</Text>
        <Text style={estilos.itemValor} numberOfLines={1}>{valor}</Text>
      </View>
    </View>
  )
}

function AcaoRow({ icone, label, onPress, cor = C.text, ultimo }: { icone: any; label: string; onPress: () => void; cor?: string; ultimo?: boolean }) {
  return (
    <TouchableOpacity style={[estilos.acaoRow, ultimo && { borderBottomWidth: 0 }]} onPress={onPress}>
      <Ionicons name={icone} size={20} color={cor} />
      <Text style={[estilos.acaoTexto, { color: cor }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={C.border} />
    </TouchableOpacity>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 110 },
  statusBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, padding: 10, marginBottom: 12,
    borderWidth: 1,
  },
  statusOnline: { backgroundColor: C.greenLight, borderColor: C.greenMid },
  statusOffline: { backgroundColor: C.redLight, borderColor: C.redBorder },
  statusTexto: { fontSize: 12, fontWeight: '500', flex: 1 },
  perfilCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.card, borderRadius: 18, padding: 18, marginBottom: 12,
    borderWidth: 1, borderColor: C.border,
  },
  nomeNegocio: { fontSize: 16, fontWeight: '700', color: C.text },
  email: { fontSize: 12, color: C.text2, marginBottom: 6 },
  planoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: C.bg, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: C.border },
  planoBadgePro: { backgroundColor: C.greenLight, borderColor: C.greenMid },
  planoTexto: { fontSize: 11, fontWeight: '600', color: C.text2 },
  planoTextoPro: { color: C.green },
  upgradeBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: C.greenLight, borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: C.greenMid,
  },
  upgradeIconeBox: { width: 50, height: 50, borderRadius: 14, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  upgradeTitle: { fontSize: 15, fontWeight: '800', color: C.greenDark },
  upgradeSub: { fontSize: 12, color: C.green, marginTop: 2, marginBottom: 8 },
  upgradeItens: { gap: 5 },
  upgradeItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  upgradeItemTexto: { fontSize: 12, color: C.greenDark, fontWeight: '500', flex: 1 },
  proBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#1A2332', borderRadius: 14, padding: 16, marginBottom: 12,
  },
  proBannerIconeBox: { width: 50, height: 50, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  proBannerTitle: { fontSize: 15, fontWeight: '800', color: C.white },
  proBannerSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2, marginBottom: 8 },
  card: {
    backgroundColor: C.card, borderRadius: 16, padding: 18, marginBottom: 12,
    borderWidth: 1, borderColor: C.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  cardTitulo: { fontSize: 14, fontWeight: '700', color: C.text },
  secaoInfo: { fontSize: 12, color: C.text2, marginBottom: 14, lineHeight: 18 },
  editarBtn: { backgroundColor: C.greenLight, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  cancelarBtn: { backgroundColor: C.bg },
  editarTexto: { fontSize: 13, color: C.green, fontWeight: '600' },
  cancelarTexto: { color: C.text2 },
  sucessoBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.greenLight, borderRadius: 10, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: C.greenMid },
  sucessoTexto: { fontSize: 13, color: C.green, fontWeight: '500' },
  erroBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.redLight, borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: C.redBorder },
  erroTexto: { color: C.red, fontSize: 13, fontWeight: '500', flex: 1 },
  itemInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  itemIconeBox: { width: 32, height: 32, borderRadius: 9, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  itemLabel: { fontSize: 11, color: C.text2, fontWeight: '500' },
  itemValor: { fontSize: 14, color: C.text, marginTop: 1, fontWeight: '500' },
  acaoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.border },
  acaoTexto: { flex: 1, fontSize: 14, fontWeight: '500' },
  acaoIcone: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.greenLight, alignItems: 'center', justifyContent: 'center' },
  acaoLabel: { fontSize: 14, fontWeight: '600', color: C.text },
  acaoSub: { fontSize: 12, color: C.text2, marginTop: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: C.text },
  toggleSub: { fontSize: 12, color: C.text2, marginTop: 2 },
  avisoWeb: { fontSize: 12, color: C.yellow, marginTop: 10, fontWeight: '500' },
  moduloRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  moduloIcone: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  moduloIconeAtivo: { backgroundColor: C.greenLight },
  moduloIconeOff: { backgroundColor: C.bg },
  moduloLabel: { fontSize: 14, fontWeight: '600', color: C.text },
  moduloDesc: { fontSize: 12, color: C.text2, marginTop: 1 },
  proBadge: { backgroundColor: C.green, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  proTexto: { fontSize: 9, fontWeight: '800', color: C.white, letterSpacing: 0.5 },
  versao: { textAlign: 'center', fontSize: 12, color: C.text3, marginTop: 4 },
})

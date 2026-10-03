import { useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useVencimentoAntigas } from '../../hooks/useVencimentoAntigas'
import { estaOnlineRapido } from '../../hooks/useOffline'
import { agendarNotificacoesVencimento } from '../../hooks/useNotificacoes'
import { C } from '../../constants/colors'

interface Props {
  // Quantos clientes aparecem como vencidos hoje (para o lojista comparar com o "depois").
  vencidosAtuais?: number
  // Chamado depois de definir/desfazer, para a tela recarregar seus números.
  aoMudar?: () => void
  // Margem acima do aviso (só quando ele aparece) — evita um vazio quando o componente não renderiza nada.
  margemTopo?: number
}

// Aviso das vendas antigas sem data de vencimento. Só aparece para o DONO (o hook só carrega
// com papel de dono confirmado e as RPCs recusam funcionário). Mostra os NÚMEROS DA LOJA antes
// de qualquer alteração e nada muda sem o toque de confirmação. Sem valores em R$.
export function AvisoVencimentoAntigas({ vencidosAtuais, aoMudar, margemTopo = 0 }: Props) {
  const { impacto, escondido, processando, agoraNao, definir, desfazer } = useVencimentoAntigas()
  const [modal, setModal] = useState(false)
  const emAndamento = useRef(false)   // trava de duplo toque (processando só liga depois do await de rede)

  if (!impacto) return null

  async function confirmar() {
    if (emAndamento.current) return
    emAndamento.current = true
    try {
      if (!(await estaOnlineRapido())) {
        Alert.alert('Sem internet', 'Conecte-se à internet para definir os vencimentos.')
        return
      }
      try {
        const n = await definir()
        setModal(false)
        agendarNotificacoesVencimento().catch(() => {})
        aoMudar?.()
        // Depois que o modal terminar de fechar (no iOS o Alert some se abrir junto com o pageSheet).
        setTimeout(() => Alert.alert('Pronto', `${n} ${n === 1 ? 'venda recebeu' : 'vendas receberam'} data de vencimento. Se mudar de ideia, você pode desfazer por 7 dias.`), 450)
      } catch {
        Alert.alert('Não foi possível agora', 'Confira em instantes se os vencimentos foram definidos; se não, tente de novo.')
      }
    } finally {
      emAndamento.current = false
    }
  }

  function pedirDesfazer() {
    Alert.alert(
      'Desfazer vencimentos?',
      `${impacto!.desfazivel === 1 ? 'A venda que ganhou' : `As ${impacto!.desfazivel} vendas que ganharam`} data de vencimento ${impacto!.desfazivel === 1 ? 'volta' : 'voltam'} a ficar sem data (só as que você não editou depois).`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desfazer',
          style: 'destructive',
          onPress: async () => {
            if (!(await estaOnlineRapido())) {
              Alert.alert('Sem internet', 'Conecte-se à internet para desfazer.')
              return
            }
            try {
              await desfazer()
              agendarNotificacoesVencimento().catch(() => {})
              aoMudar?.()
            } catch {
              Alert.alert('Não foi possível agora', 'Confira em instantes se os vencimentos foram desfeitos; se não, tente de novo.')
            }
          },
        },
      ],
    )
  }

  // Desfazer acessível por 7 dias depois de confirmar.
  if (impacto.desfazivel > 0) {
    const dia = impacto.ultimaExecucao ? new Date(impacto.ultimaExecucao).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''
    return (
      <View style={[estilos.banner, estilos.bannerOk, { marginTop: margemTopo }]}>
        <Ionicons name="checkmark-circle-outline" size={18} color={C.green} />
        <View style={{ flex: 1 }}>
          <Text style={estilos.titulo}>Vencimentos definidos{dia ? ` em ${dia}` : ''}</Text>
          <Text style={estilos.sub}>{impacto.desfazivel} {impacto.desfazivel === 1 ? 'venda ganhou' : 'vendas ganharam'} data de vencimento. Dá para desfazer por 7 dias.</Text>
        </View>
        <TouchableOpacity onPress={pedirDesfazer} disabled={processando} style={estilos.btnSecundario}>
          <Text style={estilos.btnSecundarioTexto}>Desfazer</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (impacto.total === 0 || escondido) return null

  const partesPrazo: string[] = []
  if (impacto.jaVencidas > 0) partesPrazo.push(`${impacto.jaVencidas} ${impacto.jaVencidas === 1 ? 'venda fica vencida' : 'vendas ficam vencidas'} na hora (passaram de 30 dias).`)
  if (impacto.aVencer > 0) {
    const resto = impacto.jaVencidas > 0
      ? (impacto.aVencer === 1 ? 'A outra vai' : `As outras ${impacto.aVencer} vão`)
      : (impacto.aVencer === 1 ? 'A venda vai' : `As ${impacto.aVencer} vendas vão`)
    partesPrazo.push(`${resto} entrar em Cobranças ao longo dos próximos 30 dias, conforme completarem 30 dias.`)
  }
  const textoPrazo = partesPrazo.join(' ')

  const desfezEm = impacto.ultimoDesfazer
    ? new Date(impacto.ultimoDesfazer).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : null

  const clientesTxt = impacto.novosVencidos === 0
    ? 'nenhum cliente novo vai aparecer como vencido'
    : impacto.novosVencidos === 1 ? '1 cliente vai aparecer como vencido' : `${impacto.novosVencidos} clientes vão aparecer como vencidos`

  return (
    <>
      <View style={[estilos.banner, estilos.bannerAviso, { marginTop: margemTopo }]}>
        <Ionicons name="calendar-outline" size={18} color="#7a5c00" />
        <View style={{ flex: 1 }}>
          <Text style={estilos.titulo}>{impacto.total} {impacto.total === 1 ? 'venda antiga sem data' : 'vendas antigas sem data'} de vencimento</Text>
          <Text style={estilos.sub}>{impacto.total === 1 ? 'Ela nunca aparece' : 'Elas nunca aparecem'} em Cobranças · {clientesTxt}. Toque em Revisar para ver o impacto.</Text>
          {desfezEm && <Text style={estilos.nota}>Você desfez em {desfezEm}.</Text>}
          <View style={estilos.linhaBotoes}>
            <TouchableOpacity onPress={() => setModal(true)} style={estilos.btnPrimario}>
              <Text style={estilos.btnPrimarioTexto}>Revisar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={agoraNao} style={estilos.btnSecundario}>
              <Text style={estilos.btnSecundarioTexto}>Agora não</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal visible={modal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModal(false)}>
        <View style={estilos.modalContainer}>
          <ScrollView contentContainerStyle={estilos.modalConteudo}>
            <Text style={estilos.modalTitulo}>Definir vencimento das vendas antigas?</Text>
            <Text style={estilos.modalSub}>Confira o que vai acontecer na sua loja antes de confirmar.</Text>

            <View style={estilos.caixa}>
              <Text style={estilos.item}>• <Text style={estilos.negrito}>{impacto.total} {impacto.total === 1 ? 'venda antiga' : 'vendas antigas'}</Text> em aberto {impacto.total === 1 ? 'está' : 'estão'} sem data de vencimento ({impacto.clientesAfetados} {impacto.clientesAfetados === 1 ? 'cliente' : 'clientes'}). Vendas feitas depois da novidade do vencimento padrão não entram.</Text>
              <Text style={estilos.item}>• Cada uma passa a vencer <Text style={estilos.negrito}>30 dias depois da data da venda</Text>.</Text>
              <Text style={estilos.item}>• {textoPrazo}</Text>
              <Text style={estilos.item}>• <Text style={estilos.negrito}>{impacto.novosVencidos === 1 ? '1 cliente vai aparecer como vencido' : `${impacto.novosVencidos} clientes vão aparecer como vencidos`}</Text> em Cobranças e nos lembretes{typeof vencidosAtuais === 'number' ? ` (hoje você tem ${vencidosAtuais})` : ''}. Isso não é erro: são dívidas antigas que já passaram do prazo.</Text>
              <Text style={estilos.item}>• Nada muda no saldo de ninguém, nem nos pagamentos.</Text>
              <Text style={estilos.item}>• Você pode <Text style={estilos.negrito}>desfazer por 7 dias</Text>.</Text>
            </View>

            <TouchableOpacity onPress={confirmar} disabled={processando} style={[estilos.btnConfirmar, processando && { opacity: 0.6 }]}>
              {processando
                ? <ActivityIndicator color={C.white} />
                : <Text style={estilos.btnConfirmarTexto}>Confirmar e definir vencimentos</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModal(false)} disabled={processando} style={estilos.btnCancelar}>
              <Text style={estilos.btnCancelarTexto}>Cancelar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </>
  )
}

const estilos = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1,
  },
  bannerAviso: { backgroundColor: '#FFF8E1', borderColor: '#FFE082' },
  bannerOk: { backgroundColor: C.greenLight, borderColor: C.greenMid },
  titulo: { fontSize: 14, fontWeight: '800', color: C.text },
  sub: { fontSize: 12, color: C.text2, marginTop: 3, lineHeight: 17 },
  nota: { fontSize: 11, color: C.text3, marginTop: 4 },
  linhaBotoes: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnPrimario: { backgroundColor: C.green, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  btnPrimarioTexto: { color: C.white, fontSize: 12, fontWeight: '800' },
  btnSecundario: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  btnSecundarioTexto: { color: C.text2, fontSize: 12, fontWeight: '700' },
  modalContainer: { flex: 1, backgroundColor: C.bg },
  modalConteudo: { padding: 24, paddingBottom: 48 },
  modalTitulo: { fontSize: 20, fontWeight: '800', color: C.text },
  modalSub: { fontSize: 13, color: C.text2, marginTop: 4, marginBottom: 16 },
  caixa: { backgroundColor: C.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, gap: 10, marginBottom: 20 },
  item: { fontSize: 14, color: C.text, lineHeight: 20 },
  negrito: { fontWeight: '800' },
  btnConfirmar: { backgroundColor: C.green, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  btnConfirmarTexto: { color: C.white, fontSize: 15, fontWeight: '800' },
  btnCancelar: { paddingVertical: 14, alignItems: 'center' },
  btnCancelarTexto: { color: C.text2, fontSize: 14, fontWeight: '700' },
})

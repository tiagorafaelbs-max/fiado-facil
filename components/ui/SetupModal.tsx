import { useState } from 'react'
import { View, Text, Modal, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Campo } from './Campo'
import { Botao } from './Botao'
import { C } from '../../constants/colors'

interface Props {
  usuarioId: string
  visivel: boolean
  onConcluir: () => void
}

export function SetupModal({ usuarioId, visivel, onConcluir }: Props) {
  const [passo, setPasso] = useState(0)
  const [chavePix, setChavePix] = useState('')
  const [diaCobranca, setDiaCobranca] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvarEConcluir() {
    setSalvando(true)
    try {
      await supabase.from('perfis').update({
        chave_pix: chavePix.trim() || null,
        dia_cobranca: diaCobranca ? parseInt(diaCobranca) : null,
      }).eq('id', usuarioId)
    } catch {
      // silencioso — configuração opcional
    } finally {
      setSalvando(false)
      onConcluir()
    }
  }

  const passos = [
    {
      icone: 'qr-code-outline' as const,
      titulo: 'Configure sua chave Pix',
      sub: 'Seus clientes poderão pagar via QR Code diretamente pelo app.',
      campo: (
        <Campo
          label="Chave Pix (CPF, e-mail, telefone ou aleatória)"
          value={chavePix}
          onChangeText={setChavePix}
          placeholder="Ex: 11999999999"
          autoCapitalize="none"
        />
      ),
    },
    {
      icone: 'calendar-outline' as const,
      titulo: 'Dia mensal para lembrete',
      sub: 'Todo mês nesse dia, você recebe um lembrete para cobrar os clientes vencidos.',
      campo: (
        <Campo
          label="Dia do mês (1 a 28)"
          value={diaCobranca}
          onChangeText={(v) => setDiaCobranca(v.replace(/\D/g, '').slice(0, 2))}
          placeholder="Ex: 5"
          keyboardType="numeric"
        />
      ),
    },
  ]

  const atual = passos[passo]
  const ultimo = passo === passos.length - 1

  return (
    <Modal visible={visivel} animationType="slide" presentationStyle="formSheet" transparent={false}>
      <View style={estilos.container}>
        <View style={estilos.handle} />

        <View style={estilos.iconeBox}>
          <Ionicons name={atual.icone} size={36} color={C.green} />
        </View>

        <Text style={estilos.titulo}>{atual.titulo}</Text>
        <Text style={estilos.sub}>{atual.sub}</Text>

        <View style={estilos.campoBox}>{atual.campo}</View>

        <View style={estilos.dots}>
          {passos.map((_, i) => (
            <View key={i} style={[estilos.dot, i === passo && estilos.dotAtivo]} />
          ))}
        </View>

        <Botao
          titulo={ultimo ? 'Começar a usar' : 'Próximo'}
          onPress={ultimo ? salvarEConcluir : () => setPasso(p => p + 1)}
          carregando={salvando}
        />

        <TouchableOpacity style={estilos.pularBtn} onPress={ultimo ? salvarEConcluir : () => setPasso(p => p + 1)}>
          <Text style={estilos.pularTexto}>{ultimo ? 'Pular configuração' : 'Pular esta etapa'}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: C.bg,
    padding: 28, paddingTop: Platform.OS === 'ios' ? 20 : 28,
    alignItems: 'center',
  },
  handle: {
    width: 40, height: 4, borderRadius: 99,
    backgroundColor: C.border, marginBottom: 32,
  },
  iconeBox: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: C.greenLight, borderWidth: 1, borderColor: C.greenMid,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  titulo: { fontSize: 22, fontWeight: '900', color: C.text, textAlign: 'center', marginBottom: 8 },
  sub: { fontSize: 15, color: C.text2, textAlign: 'center', lineHeight: 22, marginBottom: 28, maxWidth: 300 },
  campoBox: { width: '100%', marginBottom: 12 },
  dots: { flexDirection: 'row', gap: 8, marginBottom: 28 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
  dotAtivo: { width: 24, borderRadius: 4, backgroundColor: C.green },
  pularBtn: { marginTop: 14, paddingVertical: 8 },
  pularTexto: { fontSize: 13, color: C.text3, fontWeight: '500' },
})

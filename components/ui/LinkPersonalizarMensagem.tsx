import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { C } from '../../constants/colors'

interface Props {
  plano: 'gratuito' | 'pro' | null   // null = ainda carregando: sem selo
}

// Atalho "✏️ Personalizar mensagem" para quem cobra pelo WhatsApp. A tela de personalização só existia em
// Ajustes > Pix & Cobranças e o lojista Pro não a achava (pedido de cliente, 10/10).
// Pro: abre a tela e edita. Grátis: o selo "Pro" avisa que é recurso pago; a mesma tela mostra a prévia e explica o Pro.
export function LinkPersonalizarMensagem({ plano }: Props) {
  const router = useRouter()
  return (
    <TouchableOpacity
      style={estilos.caixa}
      onPress={() => router.push('/mensagem-cobranca')}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Personalizar mensagem de cobrança"
    >
      <Text style={estilos.texto}>✏️ Personalizar mensagem</Text>
      {plano === 'gratuito' && (
        <View style={estilos.selo}><Text style={estilos.seloTexto}>Pro</Text></View>
      )}
    </TouchableOpacity>
  )
}

const estilos = StyleSheet.create({
  caixa: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 11, paddingHorizontal: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card,
  },
  texto: { fontSize: 14, fontWeight: '700', color: C.text2 },
  selo: { backgroundColor: C.yellowLight, borderWidth: 1, borderColor: C.yellowBorder, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  seloTexto: { fontSize: 11, fontWeight: '800', color: C.yellow },
})

import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Linking, Platform, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../constants/colors'

const RECURSOS_GRATUITO = [
  { texto: 'Até 10 clientes', ok: true },
  { texto: 'Lançamentos ilimitados', ok: true },
  { texto: 'Cobrança via WhatsApp', ok: true },
  { texto: 'Histórico de pagamentos', ok: true },
  { texto: 'Relatórios por categoria', ok: false },
  { texto: 'Exportação de dados CSV', ok: false },
  { texto: 'Score do cliente', ok: false },
]

const RECURSOS_PRO = [
  { texto: 'Clientes ilimitados', destaque: true },
  { texto: 'Lançamentos ilimitados', destaque: false },
  { texto: 'Cobrança via WhatsApp', destaque: false },
  { texto: 'Histórico completo', destaque: false },
  { texto: 'Relatórios por categoria', destaque: true },
  { texto: 'Exportação de dados CSV', destaque: true },
  { texto: 'Score de pagador', destaque: true },
  { texto: 'Suporte prioritário', destaque: false },
]

export default function PlanosScreen() {
  const router = useRouter()
  const [loading, setLoading] = useState<'monthly' | 'annual' | null>(null)

  async function handleAssinar(plan_type: 'monthly' | 'annual' = 'monthly') {
    setLoading(plan_type)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        Alert.alert('Erro', 'Faça login para assinar.')
        return
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
      const resp = await fetch(`${supabaseUrl}/functions/v1/subscribe`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan_type }),
      })

      const data = await resp.json()
      if (!resp.ok || !data.init_point) {
        throw new Error(data.error ?? 'Erro ao gerar link')
      }

      if (Platform.OS === 'web') {
        window.open(data.init_point, '_blank')
      } else {
        Alert.alert(
          'Assinar FiadoApp Pro',
          'Você será redirecionado para o pagamento seguro no Mercado Pago.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Continuar', onPress: () => Linking.openURL(data.init_point) },
          ],
        )
      }
    } catch (err: any) {
      Alert.alert('Erro', err.message ?? 'Não foi possível iniciar a assinatura.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <ScrollView style={estilos.container} contentContainerStyle={estilos.content} showsVerticalScrollIndicator={false}>

      {/* Header */}
      <View style={estilos.header}>
        <View style={estilos.badgeNovo}>
          <Text style={estilos.badgeNovoTexto}>✨ Desbloqueie tudo</Text>
        </View>
        <Text style={estilos.titulo}>Escolha seu plano</Text>
        <Text style={estilos.sub}>Comece grátis, faça upgrade quando precisar</Text>
      </View>

      {/* Card Gratuito */}
      <View style={estilos.cardGratuito}>
        <View style={estilos.cardHeaderRow}>
          <View>
            <Text style={estilos.planoLabel}>GRATUITO</Text>
            <Text style={estilos.planoNome}>Começar</Text>
          </View>
          <View style={estilos.precoBox}>
            <Text style={estilos.preco}>R$ 0</Text>
            <Text style={estilos.precoPeriodo}>/ mês</Text>
          </View>
        </View>

        <View style={estilos.separador} />

        {RECURSOS_GRATUITO.map((r) => (
          <View key={r.texto} style={estilos.recursoRow}>
            <Ionicons
              name={r.ok ? 'checkmark-circle' : 'close-circle-outline'}
              size={18}
              color={r.ok ? C.green : C.text3}
            />
            <Text style={[estilos.recursoTexto, !r.ok && estilos.recursoDesab]}>{r.texto}</Text>
          </View>
        ))}

        <TouchableOpacity style={estilos.btnGratuito} onPress={() => router.back()}>
          <Text style={estilos.btnGratuitoTexto}>Continuar grátis</Text>
        </TouchableOpacity>
      </View>

      {/* Card Pro — destaque */}
      <View style={estilos.cardPro}>
        {/* Fita "Mais popular" */}
        <View style={estilos.fitaPopular}>
          <Ionicons name="star" size={11} color={C.yellow} />
          <Text style={estilos.fitaTexto}>MAIS POPULAR</Text>
        </View>

        {/* Decoração */}
        <View style={estilos.proCirculo1} />
        <View style={estilos.proCirculo2} />

        <View style={estilos.cardHeaderRow}>
          <View>
            <Text style={[estilos.planoLabel, { color: 'rgba(255,255,255,0.65)' }]}>PRO</Text>
            <Text style={[estilos.planoNome, { color: C.white }]}>Crescer</Text>
          </View>
          <View style={estilos.precoBox}>
            <Text style={[estilos.preco, { color: C.white }]}>R$ 19</Text>
            <Text style={[estilos.precoPeriodo, { color: 'rgba(255,255,255,0.65)' }]}>/ mês</Text>
          </View>
        </View>

        <View style={[estilos.separador, { borderColor: 'rgba(255,255,255,0.2)' }]} />

        {RECURSOS_PRO.map((r) => (
          <View key={r.texto} style={estilos.recursoRow}>
            <Ionicons name="checkmark-circle" size={18} color={r.destaque ? C.yellow : 'rgba(255,255,255,0.5)'} />
            <Text style={[estilos.recursoTexto, { color: r.destaque ? C.white : 'rgba(255,255,255,0.75)' }, r.destaque && { fontWeight: '600' }]}>
              {r.texto}
            </Text>
          </View>
        ))}

        <TouchableOpacity style={estilos.btnPro} onPress={() => handleAssinar('monthly')} disabled={loading !== null}>
          {loading === 'monthly'
            ? <ActivityIndicator color={C.green} />
            : <>
                <Ionicons name="rocket-outline" size={18} color={C.green} />
                <Text style={estilos.btnProTexto}>Assinar por R$ 19/mês</Text>
              </>
          }
        </TouchableOpacity>

        <Text style={estilos.proGarantia}>✓ Cancele a qualquer momento · Sem fidelidade</Text>
      </View>

      {/* Plano anual */}
      <TouchableOpacity style={estilos.anualBox} onPress={() => handleAssinar('annual')} disabled={loading !== null}>
        <View style={estilos.anualEsquerda}>
          <Text style={estilos.anualTitulo}>💰 Plano Anual</Text>
          <Text style={estilos.anualSub}>R$ 149/ano — economize R$ 79</Text>
        </View>
        <View style={estilos.anualBadge}>
          <Text style={estilos.anualBadgeTexto}>-35%</Text>
        </View>
      </TouchableOpacity>

      {/* Garantia */}
      <View style={estilos.garantiaBox}>
        <Ionicons name="shield-checkmark-outline" size={22} color={C.green} />
        <View style={{ flex: 1 }}>
          <Text style={estilos.garantiaTitulo}>Garantia de 7 dias</Text>
          <Text style={estilos.garantiaSub}>Não gostou? Devolvemos o valor integral sem perguntas.</Text>
        </View>
      </View>

    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 48 },

  header: { alignItems: 'center', marginBottom: 24, paddingTop: 8 },
  badgeNovo: {
    backgroundColor: C.greenLight, borderRadius: 99,
    paddingHorizontal: 14, paddingVertical: 5,
    borderWidth: 1, borderColor: C.greenMid, marginBottom: 12,
  },
  badgeNovoTexto: { fontSize: 12, color: C.green, fontWeight: '700' },
  titulo: { fontSize: 26, fontWeight: '900', color: C.text, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: C.text2, marginTop: 4 },

  /* Card gratuito */
  cardGratuito: {
    backgroundColor: C.white, borderRadius: 20, padding: 20,
    marginBottom: 16, borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },

  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 },
  planoLabel: { fontSize: 10, fontWeight: '800', color: C.text3, letterSpacing: 1.5, marginBottom: 2 },
  planoNome: { fontSize: 22, fontWeight: '800', color: C.text },
  precoBox: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  preco: { fontSize: 32, fontWeight: '900', color: C.text, lineHeight: 36 },
  precoPeriodo: { fontSize: 13, color: C.text2, marginBottom: 2 },

  separador: { borderTopWidth: 1, borderColor: C.border, marginBottom: 14 },

  recursoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  recursoTexto: { fontSize: 14, color: C.text },
  recursoDesab: { color: C.text3 },

  btnGratuito: {
    borderWidth: 1.5, borderColor: C.border, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center', marginTop: 8,
  },
  btnGratuitoTexto: { color: C.text2, fontWeight: '600', fontSize: 14 },

  /* Card Pro */
  cardPro: {
    backgroundColor: C.green, borderRadius: 20, padding: 20,
    marginBottom: 16, overflow: 'hidden',
    shadowColor: C.green, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 8,
  },
  fitaPopular: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 99, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 16,
  },
  fitaTexto: { fontSize: 10, fontWeight: '800', color: C.white, letterSpacing: 1 },
  proCirculo1: {
    position: 'absolute', top: -40, right: -40,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  proCirculo2: {
    position: 'absolute', bottom: -30, left: -30,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(0,0,0,0.07)',
  },

  btnPro: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.white, borderRadius: 12,
    paddingVertical: 14, marginTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2,
  },
  btnProTexto: { color: C.green, fontWeight: '800', fontSize: 15 },
  proGarantia: { fontSize: 11, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 10 },

  /* Anual */
  anualBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.greenLight, borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: C.greenMid,
  },
  anualEsquerda: { gap: 2 },
  anualTitulo: { fontSize: 15, fontWeight: '700', color: C.greenDark },
  anualSub: { fontSize: 13, color: C.green },
  anualBadge: {
    backgroundColor: C.green, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  anualBadgeTexto: { fontSize: 13, fontWeight: '800', color: C.white },

  /* Garantia */
  garantiaBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: C.white, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: C.border,
  },
  garantiaTitulo: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 2 },
  garantiaSub: { fontSize: 13, color: C.text2, lineHeight: 18 },
})

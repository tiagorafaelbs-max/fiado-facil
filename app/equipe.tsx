import { useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { C } from '../constants/colors'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

export default function EquipeScreen() {
  const router = useRouter()
  const { usuario } = useAuth()

  useEffect(() => {
    if (!usuario?.id) return
    supabase.from('perfis').select('plano').eq('id', usuario.id).single()
      .then(({ data }) => { if (data?.plano !== 'pro') router.replace('/planos') })
  }, [usuario?.id])

  return (
    <View style={estilos.container}>
      <View style={estilos.iconeBox}>
        <Ionicons name="people-outline" size={40} color={C.green} />
      </View>

      <Text style={estilos.titulo}>Equipe & Funcionários</Text>
      <Text style={estilos.sub}>
        Em breve você poderá convidar funcionários para registrar vendas e pagamentos direto no app — cada um com seu próprio acesso.
      </Text>

      <View style={estilos.listaBeneficios}>
        {[
          'Funcionário registra vendas no próprio celular',
          'Dados centralizados na sua conta',
          'Você controla quem tem acesso',
          'Sem custo extra no plano Pro',
        ].map((item, i) => (
          <View key={i} style={estilos.itemBeneficio}>
            <Ionicons name="checkmark-circle-outline" size={18} color={C.green} />
            <Text style={estilos.itemTexto}>{item}</Text>
          </View>
        ))}
      </View>

      <View style={estilos.badgeEmBreve}>
        <Ionicons name="time-outline" size={14} color={C.green} />
        <Text style={estilos.badgeTexto}>Disponível em breve</Text>
      </View>

      <TouchableOpacity
        style={estilos.btnVoltar}
        onPress={() => router.back()}
        activeOpacity={0.8}
      >
        <Text style={estilos.btnVoltarTexto}>Voltar</Text>
      </TouchableOpacity>
    </View>
  )
}

const estilos = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: C.bg,
    alignItems: 'center', justifyContent: 'center',
    padding: 32,
  },
  iconeBox: {
    width: 88, height: 88, borderRadius: 28,
    backgroundColor: C.greenLight, borderWidth: 1, borderColor: C.greenMid,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  titulo: { fontSize: 22, fontWeight: '900', color: C.text, textAlign: 'center', marginBottom: 12 },
  sub: {
    fontSize: 15, color: C.text2, textAlign: 'center', lineHeight: 23,
    marginBottom: 28, maxWidth: 320,
  },
  listaBeneficios: { width: '100%', gap: 12, marginBottom: 28 },
  itemBeneficio: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemTexto: { fontSize: 14, color: C.text, fontWeight: '500', flex: 1 },
  badgeEmBreve: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.greenLight, borderRadius: 99, paddingHorizontal: 16, paddingVertical: 8,
    borderWidth: 1, borderColor: C.greenMid, marginBottom: 32,
  },
  badgeTexto: { fontSize: 13, color: C.green, fontWeight: '700' },
  btnVoltar: {
    paddingVertical: 12, paddingHorizontal: 32,
    borderRadius: 12, borderWidth: 1.5, borderColor: C.border,
  },
  btnVoltarTexto: { fontSize: 14, color: C.text2, fontWeight: '600' },
})

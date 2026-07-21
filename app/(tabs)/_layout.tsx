import { Tabs, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { C } from '../../constants/colors'

function BotaoCasa() {
  const router = useRouter()
  return (
    <TouchableOpacity style={estilos.casaBtn} onPress={() => router.replace('/(tabs)')}>
      <Ionicons name="home" size={18} color={C.green} />
    </TouchableOpacity>
  )
}

function BotaoAjuda() {
  const router = useRouter()
  return (
    <TouchableOpacity style={estilos.ajudaBtn} onPress={() => router.push('/ajuda')}>
      <Ionicons name="help-circle-outline" size={22} color={C.text2} />
    </TouchableOpacity>
  )
}

function useVencidosCount() {
  const { usuario } = useAuth()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!usuario?.id) return
    async function buscar() {
      const hoje = new Date().toISOString().split('T')[0]
      const { data } = await supabase
        .from('vendas')
        .select('cliente_id')
        .eq('usuario_id', usuario!.id)
        .eq('pago', false)
        .lt('data_vencimento', hoje)
        .not('data_vencimento', 'is', null)
      const unicos = new Set((data ?? []).map((v: any) => v.cliente_id))
      setCount(unicos.size)
    }
    buscar()
    const interval = setInterval(buscar, 60000)
    return () => clearInterval(interval)
  }, [usuario?.id])

  return count
}

export default function TabsLayout() {
  const vencidosCount = useVencidosCount()
  const insets = useSafeAreaInsets()

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: C.green,
        tabBarInactiveTintColor: C.text3,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: C.border,
          backgroundColor: C.white,
          height: 68 + insets.bottom,
          paddingBottom: insets.bottom + 8,
          paddingTop: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.1,
          shadowRadius: 20,
          elevation: 20,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2, marginTop: 2 },
        headerStyle: { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border },
        headerTitleStyle: { fontWeight: '800', fontSize: 17, color: C.text, letterSpacing: -0.3 },
        headerShadowVisible: false,
        headerTintColor: C.text,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="clientes"
        options={{
          title: 'Clientes',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={size} color={color} />
          ),
          headerLeft: () => <BotaoCasa />,
          headerRight: () => <BotaoAjuda />,
        }}
      />
      <Tabs.Screen
        name="nova-venda"
        options={{
          title: 'Nova Venda',
          tabBarIcon: ({ focused }) => (
            <View style={[estilos.fabIcon, focused && estilos.fabIconActive]}>
              <Ionicons name="add" size={22} color={C.white} />
            </View>
          ),
          tabBarLabel: () => null,
          headerLeft: () => <BotaoCasa />,
          headerRight: () => <BotaoAjuda />,
        }}
      />
      <Tabs.Screen
        name="relatorios"
        options={{
          title: 'Relatórios',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'bar-chart' : 'bar-chart-outline'} size={size} color={color} />
          ),
          headerLeft: () => <BotaoCasa />,
          headerRight: () => <BotaoAjuda />,
        }}
      />
      <Tabs.Screen
        name="configuracoes"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size, focused }) => (
            <View>
              <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={size} color={color} />
              {vencidosCount > 0 && (
                <View style={estilos.badge}>
                  <Text style={estilos.badgeTexto}>{vencidosCount > 9 ? '9+' : vencidosCount}</Text>
                </View>
              )}
            </View>
          ),
          headerLeft: () => <BotaoCasa />,
          headerRight: () => <BotaoAjuda />,
        }}
      />
    </Tabs>
  )
}

const estilos = StyleSheet.create({
  casaBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: C.greenLight,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 16,
  },
  ajudaBtn: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 16,
  },
  fabIcon: {
    width: 52, height: 52, borderRadius: 18,
    backgroundColor: C.green,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
    shadowColor: C.green,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
  },
  fabIconActive: { backgroundColor: C.greenDark },
  badge: {
    position: 'absolute', top: -4, right: -6,
    backgroundColor: C.red, borderRadius: 99,
    minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeTexto: { color: C.white, fontSize: 9, fontWeight: '800' },
})

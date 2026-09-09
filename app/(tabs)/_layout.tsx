import { Tabs, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useEffect, useState, useCallback, useRef } from 'react'
import * as Notifications from 'expo-notifications'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { C } from '../../constants/colors'

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
  const [novos, setNovos] = useState(0)
  // IDs que o usuário já visualizou na aba Clientes
  const vistoIds = useRef<Set<string>>(new Set())
  // IDs vencidos atualmente (atualizado a cada poll)
  const currentIds = useRef<string[]>([])

  useEffect(() => {
    if (!usuario?.id) return
    async function buscar() {
      const { data } = await supabase
        .from('clientes_com_saldo')
        .select('id')
        .eq('usuario_id', usuario!.id)
        .eq('status_pagamento', 'vencido')
        .eq('ativo', true)
      const ids = (data ?? []).map(r => String(r.id))
      currentIds.current = ids
      // Badge = apenas IDs que o usuário ainda não viu
      setNovos(ids.filter(id => !vistoIds.current.has(id)).length)
    }
    buscar()
    const interval = setInterval(buscar, 60000)
    return () => clearInterval(interval)
  }, [usuario?.id])

  const marcarVisto = useCallback(() => {
    // Marca todos os vencidos atuais como vistos e zera o badge
    currentIds.current.forEach(id => vistoIds.current.add(id))
    setNovos(0)
  }, [])

  return { count: novos, marcarVisto }
}

function useDeepLinkNotificacoes() {
  const router = useRouter()
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const tela = response.notification.request.content.data?.tela as string | undefined
      if (tela === 'clientes') router.push('/(tabs)/clientes')
      else if (tela === 'relatorios') router.push('/(tabs)/relatorios')
    })
    return () => sub.remove()
  }, [])
}

function ModalAcoes({ visivel, onFechar }: { visivel: boolean; onFechar: () => void }) {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  function navegar(rota: string) {
    onFechar()
    setTimeout(() => router.push(rota as any), 150)
  }

  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={onFechar} statusBarTranslucent>
      <Pressable style={estilos.modalOverlay} onPress={onFechar}>
        <Pressable style={[estilos.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={estilos.modalHandle} />
          <Text style={estilos.modalTitulo}>O que deseja registrar?</Text>

          <TouchableOpacity style={estilos.modalOpcao} onPress={() => navegar('/(tabs)/nova-venda')}>
            <View style={[estilos.modalIcone, { backgroundColor: C.greenLight }]}>
              <Ionicons name="receipt-outline" size={24} color={C.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={estilos.modalOpcaoTitulo}>Nova venda</Text>
              <Text style={estilos.modalOpcaoSub}>Registrar compra fiada de um cliente</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.text3} />
          </TouchableOpacity>

          <TouchableOpacity style={estilos.modalOpcao} onPress={() => navegar('/novo-pagamento')}>
            <View style={[estilos.modalIcone, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="cash-outline" size={24} color="#2E7D32" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={estilos.modalOpcaoTitulo}>Registrar pagamento</Text>
              <Text style={estilos.modalOpcaoSub}>Cliente quitou uma dívida</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.text3} />
          </TouchableOpacity>

          <TouchableOpacity style={estilos.modalCancelar} onPress={onFechar}>
            <Text style={estilos.modalCancelarTexto}>Cancelar</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

export default function TabsLayout() {
  const { count: vencidosCount, marcarVisto } = useVencidosCount()
  const insets = useSafeAreaInsets()
  const [modalVisivel, setModalVisivel] = useState(false)
  useDeepLinkNotificacoes()

  return (
    <>
    <ModalAcoes visivel={modalVisivel} onFechar={() => setModalVisivel(false)} />
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
        listeners={{ focus: () => marcarVisto() }}
        options={{
          title: 'Clientes',
          tabBarIcon: ({ color, size, focused }) => (
            <View>
              <Ionicons name={focused ? 'people' : 'people-outline'} size={size} color={color} />
              {vencidosCount > 0 && (
                <View style={estilos.badge}>
                  <Text style={estilos.badgeTexto}>{vencidosCount > 9 ? '9+' : vencidosCount}</Text>
                </View>
              )}
            </View>
          ),
          headerRight: () => <BotaoAjuda />,
        }}
      />
      <Tabs.Screen
        name="nova-venda"
        options={{
          title: 'Nova Venda',
          tabBarIcon: () => (
            <View style={estilos.fabIcon}>
              <Ionicons name="add" size={22} color={C.white} />
            </View>
          ),
          tabBarLabel: () => null,
          headerRight: () => <BotaoAjuda />,
          tabBarButton: (props) => (
            <TouchableOpacity
              {...(props as any)}
              onPress={() => setModalVisivel(true)}
              style={props.style}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="relatorios"
        options={{
          title: 'Relatórios',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'bar-chart' : 'bar-chart-outline'} size={size} color={color} />
          ),
          headerRight: () => <BotaoAjuda />,
        }}
      />
      <Tabs.Screen
        name="configuracoes"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={size} color={color} />
          ),
          headerRight: () => <BotaoAjuda />,
        }}
      />
    </Tabs>
    </>
  )
}

const estilos = StyleSheet.create({
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: C.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 20,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitulo: {
    fontSize: 13,
    fontWeight: '700',
    color: C.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  modalOpcao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalIcone: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  modalOpcaoTitulo: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 },
  modalOpcaoSub: { fontSize: 12, color: C.text2 },
  modalCancelar: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  modalCancelarTexto: { fontSize: 15, color: C.text2, fontWeight: '600' },
  badge: {
    position: 'absolute', top: -4, right: -6,
    backgroundColor: C.red, borderRadius: 99,
    minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeTexto: { color: C.white, fontSize: 9, fontWeight: '800' },
})

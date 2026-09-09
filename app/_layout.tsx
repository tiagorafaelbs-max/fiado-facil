import { Stack, useRouter } from 'expo-router'
import { Platform, View, Text, ScrollView, Linking } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { Component, ReactNode, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// RevenueCat: só disponível em builds nativos (não no Expo Go)
let Purchases: any = null
let LOG_LEVEL: any = null
try {
  const rc = require('react-native-purchases')
  Purchases = rc.default
  LOG_LEVEL = rc.LOG_LEVEL
} catch { /* Expo Go ou web */ }

async function initRevenueCat(userId?: string) {
  if (!Purchases) return
  try {
    const iosKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? ''
    const androidKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? ''
    const apiKey = Platform.OS === 'ios' ? iosKey : androidKey
    if (!apiKey) return

    if (__DEV__ && LOG_LEVEL) Purchases.setLogLevel(LOG_LEVEL.VERBOSE)
    await Purchases.configure({ apiKey, appUserID: userId ?? null })
  } catch (e) {
    console.warn('RevenueCat init error:', e)
  }
}

class ErrorBoundary extends Component<{ children: ReactNode }, { erro: string | null; stack: string | null }> {
  constructor(props: any) {
    super(props)
    this.state = { erro: null, stack: null }
  }
  static getDerivedStateFromError(e: Error) {
    return { erro: e.message ?? 'Erro desconhecido', stack: e.stack ?? null }
  }
  componentDidCatch(e: Error, info: any) {
    this.setState({ erro: e.message ?? 'Erro desconhecido', stack: (e.stack ?? '') + '\n\nComponent:\n' + (info?.componentStack ?? '') })
  }
  render() {
    if (this.state.erro) {
      return (
        <ScrollView style={{ flex: 1, backgroundColor: '#F2F5F9', padding: 24 }}>
          <Text style={{ color: '#EF4444', fontSize: 18, fontWeight: '700', marginTop: 60, marginBottom: 12 }}>⚠ Erro ao carregar</Text>
          <Text style={{ color: '#1A2332', fontSize: 13, fontFamily: 'monospace' }}>{this.state.erro}</Text>
          {this.state.stack ? <Text style={{ color: '#666', fontSize: 10, fontFamily: 'monospace', marginTop: 16 }}>{this.state.stack}</Text> : null}
        </ScrollView>
      )
    }
    return this.props.children
  }
}

function SafeGestureWrapper({ children }: { children: ReactNode }) {
  if (Platform.OS === 'web') {
    return <View style={{ flex: 1 }}>{children}</View>
  }
  const { GestureHandlerRootView } = require('react-native-gesture-handler')
  return <GestureHandlerRootView style={{ flex: 1 }}>{children}</GestureHandlerRootView>
}

function AuthListener() {
  const router = useRouter()

  useEffect(() => {
    // Inicializar RevenueCat com o usuário atual (se já logado)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) initRevenueCat(session.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // Vincular usuário Supabase ao RevenueCat
        Purchases?.logIn?.(session.user.id).catch(() => {})
      }
      if (event === 'SIGNED_OUT') {
        Purchases?.logOut?.().catch(() => {})
        router.replace('/(auth)/login')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  return null
}

function DeepLinkHandler() {
  const router = useRouter()

  useEffect(() => {
    async function handleUrl(url: string) {
      if (!url.includes('nova-senha') && !url.includes('access_token') && !url.includes('code=')) return

      // PKCE flow: ?code=XXX na query string
      const queryString = url.split('?')[1]?.split('#')[0]
      if (queryString) {
        const queryParams = new URLSearchParams(queryString)
        const code = queryParams.get('code')
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (!error) {
            router.replace('/(auth)/nova-senha')
          }
          return
        }
      }

      // Implicit flow: #access_token=XXX no fragmento
      const fragment = url.split('#')[1]
      if (!fragment) return
      const params = new URLSearchParams(fragment)
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')
      const type = params.get('type')
      if (accessToken && type === 'recovery') {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken ?? '' })
        router.replace('/(auth)/nova-senha')
      }
    }

    Linking.getInitialURL().then((url) => { if (url) handleUrl(url) })
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url))
    return () => sub.remove()
  }, [])

  return null
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeGestureWrapper>
        <StatusBar style="dark" />
        <AuthListener />
        <DeepLinkHandler />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="planos" options={{ headerShown: true, title: 'Planos', presentation: 'modal', headerStyle: { backgroundColor: '#F2F5F9' }, headerTintColor: '#1A2332', headerShadowVisible: false }} />
          <Stack.Screen name="cobrancas" options={{ headerShown: true, title: 'Cobranças Vencidas', headerShadowVisible: false, headerStyle: { backgroundColor: '#F2F5F9' }, headerTintColor: '#1A2332', headerBackTitle: 'Voltar' }} />
          <Stack.Screen name="ajuda" options={{ headerShown: true, title: 'Central de Ajuda', headerShadowVisible: false, headerStyle: { backgroundColor: '#F2F5F9' }, headerTintColor: '#1A2332', headerBackTitle: 'Voltar' }} />
          <Stack.Screen name="ranking" options={{ headerShown: false }} />
          <Stack.Screen name="equipe" options={{ headerShown: true, title: 'Equipe & Funcionários', headerShadowVisible: false, headerStyle: { backgroundColor: '#F2F5F9' }, headerTintColor: '#1A2332', headerBackTitle: 'Voltar' }} />
          <Stack.Screen name="privacidade" options={{ headerShown: true, title: 'Política de Privacidade', headerShadowVisible: false, headerStyle: { backgroundColor: '#F2F5F9' }, headerTintColor: '#1A2332', headerBackTitle: 'Voltar' }} />
          <Stack.Screen name="termos" options={{ headerShown: true, title: 'Termos de Uso', headerShadowVisible: false, headerStyle: { backgroundColor: '#F2F5F9' }, headerTintColor: '#1A2332', headerBackTitle: 'Voltar' }} />
          <Stack.Screen name="busca" options={{ headerShown: true, title: 'Busca', headerShadowVisible: false, headerStyle: { backgroundColor: '#F2F5F9' }, headerTintColor: '#1A2332', headerBackTitle: 'Voltar' }} />
          <Stack.Screen
            name="cliente/[id]"
            options={{
              headerShown: true,
              title: '',
              headerBackTitle: 'Voltar',
              headerShadowVisible: false,
              headerStyle: { backgroundColor: '#F2F5F9' },
              headerTintColor: '#1A2332',
            }}
          />
        </Stack>
      </SafeGestureWrapper>
    </ErrorBoundary>
  )
}

import { Stack, useRouter } from 'expo-router'
import { AppState, Platform, View, Text, ScrollView, Linking } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { Component, ReactNode, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { verificarComprasApplePendentes } from '../lib/appleIAP'
import { ehLinkDeAuth, processarLinkAuth } from '../lib/linkAuth'

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        router.replace('/(auth)/login')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  return null
}

// iOS-only: reconcilia assinatura Apple em segundo plano ao abrir o app (item 1a/2
// do pedido do Tiago em 29/09) -- pega tanto assinantes antigos sem
// apple_original_transaction_id vinculado quanto compras que o purchaseUpdatedListener
// da tela de planos perdeu. Nunca mostra alerta; falha em silêncio.
function AppleBackfillListener() {
  const appStateRef = useRef(AppState.currentState)

  useEffect(() => {
    if (Platform.OS !== 'ios') return
    verificarComprasApplePendentes()

    const sub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        verificarComprasApplePendentes()
      }
      appStateRef.current = nextState
    })
    return () => sub.remove()
  }, [])

  return null
}

function DeepLinkHandler() {
  const router = useRouter()

  useEffect(() => {
    async function handleUrl(url: string) {
      if (!ehLinkDeAuth(url)) return
      // Valida o link (token_hash / code / access_token), confirma troca de conta se
      // já houver alguém logado e guarda o resultado em lib/linkAuth. A tela
      // nova-senha lê esse resultado e SÓ troca a senha se o link foi validado --
      // antes, um link que falhava em silêncio deixava a tela trocar a senha de
      // quem estivesse logado (dono teve a senha trocada em 02/10).
      const tipo = await processarLinkAuth(url)
      router.replace({ pathname: '/(auth)/nova-senha', params: { tipo } })
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
        <AppleBackfillListener />
        <DeepLinkHandler />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="planos" options={{ headerShown: true, title: 'Planos', presentation: 'modal', headerStyle: { backgroundColor: '#F2F5F9' }, headerTintColor: '#1A2332', headerShadowVisible: false }} />
          <Stack.Screen name="cobrancas" options={{ headerShown: true, title: 'Cobranças Vencidas', headerShadowVisible: false, headerStyle: { backgroundColor: '#F2F5F9' }, headerTintColor: '#1A2332', headerBackTitle: 'Voltar' }} />
          <Stack.Screen name="mensagem-cobranca" options={{ headerShown: true, title: 'Mensagem de cobrança', headerShadowVisible: false, headerStyle: { backgroundColor: '#F2F5F9' }, headerTintColor: '#1A2332', headerBackTitle: 'Voltar' }} />
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

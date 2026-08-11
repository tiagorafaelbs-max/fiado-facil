import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Linking, Platform, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  purchaseUpdatedListener,
  purchaseErrorListener,
  finishTransaction,
  getAvailablePurchases,
  restorePurchases,
  ErrorCode,
  type Purchase,
  type PurchaseError,
} from 'react-native-iap'
import { supabase } from '../lib/supabase'
import { C } from '../constants/colors'

const isIOS = Platform.OS === 'ios'

const SKU_MENSAL = 'com.fiadofacil.app.pro.monthly'
const SKU_ANUAL = 'com.fiadofacil.app.pro.annual'
const SKUS = [SKU_MENSAL, SKU_ANUAL]

const RECURSOS_GRATUITO = [
  { texto: 'Até 10 clientes', ok: true },
  { texto: 'Lançamentos ilimitados', ok: true },
  { texto: '10 cobranças WhatsApp/mês', ok: true },
  { texto: 'Histórico dos últimos 30 dias', ok: true },
  { texto: 'Cobranças WhatsApp ilimitadas', ok: false },
  { texto: 'Relatórios por categoria', ok: false },
  { texto: 'Exportação de dados CSV', ok: false },
  { texto: 'Score do cliente', ok: false },
]

const RECURSOS_PRO = [
  { texto: 'Clientes ilimitados', destaque: true },
  { texto: 'Lançamentos ilimitados', destaque: false },
  { texto: 'Cobranças WhatsApp ilimitadas', destaque: true },
  { texto: 'Histórico completo (sem limite)', destaque: true },
  { texto: 'Relatórios por categoria', destaque: true },
  { texto: 'Exportação de dados CSV', destaque: true },
  { texto: 'Score de pagador', destaque: true },
  { texto: 'Suporte prioritário', destaque: false },
]

export default function PlanosScreen() {
  const router = useRouter()
  const [loading, setLoading] = useState<'monthly' | 'annual' | 'restore' | null>(null)
  const [precoMensal, setPrecoMensal] = useState('R$ 19,00')
  const [precoAnual, setPrecoAnual] = useState('R$ 149,00')
  const iapPronto = useRef(false)

  // Inicializa IAP no iOS e busca preços reais da App Store
  useEffect(() => {
    if (!isIOS) return
    let purchaseUpdateSub: ReturnType<typeof purchaseUpdatedListener>
    let purchaseErrorSub: ReturnType<typeof purchaseErrorListener>

    async function setupIAP() {
      try {
        await initConnection()
        iapPronto.current = true

        purchaseUpdateSub = purchaseUpdatedListener(async (purchase: Purchase) => {
          if ((purchase as any).transactionReceipt) {
            await handleApplePurchaseSuccess(purchase)
          }
        })

        purchaseErrorSub = purchaseErrorListener((error: PurchaseError) => {
          if (error.code !== ErrorCode.UserCancelled) {
            Alert.alert('Erro na compra', error.message ?? 'Tente novamente.')
          }
          setLoading(null)
        })

        const subs = await fetchProducts({ skus: SKUS }) ?? []
        for (const sub of subs) {
          const s = sub as any
          const localizedPrice = s.localizedPrice ?? ''
          if (s.productId === SKU_MENSAL && localizedPrice) setPrecoMensal(localizedPrice)
          if (s.productId === SKU_ANUAL && localizedPrice) setPrecoAnual(localizedPrice)
        }
      } catch (e: any) {
        // IAP pode falhar em simulador — em produção isso não deve ocorrer
        console.warn('[IAP] setupIAP falhou:', e?.message ?? e)
      }
    }

    setupIAP()

    return () => {
      purchaseUpdateSub?.remove()
      purchaseErrorSub?.remove()
      endConnection()
    }
  }, [])

  async function handleApplePurchaseSuccess(purchase: Purchase) {
    try {
      // Finaliza a transação Apple primeiro — obrigatório independente do backend
      await finishTransaction({ purchase, isConsumable: false })

      // Tenta validar no backend (best-effort — não bloqueia o fluxo)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
          await fetch(`${supabaseUrl}/functions/v1/apple-iap-verify`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              receipt: (purchase as any).transactionReceipt,
              productId: purchase.productId,
              transactionId: purchase.transactionId,
            }),
          })
        }
      } catch {
        // backend indisponível — transação já foi finalizada acima
      }

      Alert.alert(
        'Assinatura ativa!',
        'Bem-vindo ao FiadoApp Pro! Seus benefícios já estão disponíveis.',
        [{ text: 'Continuar', onPress: () => router.back() }],
      )
    } catch {
      // Garante que a transação seja sempre finalizada
      try { await finishTransaction({ purchase, isConsumable: false }) } catch { /* já finalizada */ }
      Alert.alert('Assinatura processada', 'Sua compra foi concluída. Reinicie o app se os benefícios não aparecerem.')
    } finally {
      setLoading(null)
    }
  }

  async function handleAssinarIOS(sku: string, planType: 'monthly' | 'annual') {
    if (!iapPronto.current) {
      // Tenta reconectar antes de desistir
      try {
        await initConnection()
        iapPronto.current = true
      } catch (e: any) {
        Alert.alert('Loja indisponível', 'Não foi possível conectar à App Store. Verifique sua conexão e tente novamente.')
        return
      }
    }
    setLoading(planType)
    try {
      await (requestPurchase as any)({ request: { sku } })
      // O resultado chega via purchaseUpdatedListener
    } catch (err: any) {
      if (err?.code !== ErrorCode.UserCancelled) {
        const codigo = err?.code ?? err?.name ?? 'desconhecido'
        const mensagem = err?.message ?? 'Sem detalhes'
        Alert.alert(
          'Erro na compra',
          `Não foi possível iniciar a compra.\n\nCódigo: ${codigo}\n${mensagem}`,
        )
      }
      setLoading(null)
    }
  }

  async function handleAssinarAndroid(plan_type: 'monthly' | 'annual') {
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
      if (!resp.ok || !data.init_point) throw new Error(data.error ?? 'Erro ao gerar link')

      Alert.alert(
        'Assinar FiadoApp Pro',
        'Você será redirecionado para o pagamento seguro no Mercado Pago.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Continuar', onPress: () => Linking.openURL(data.init_point) },
        ],
      )
    } catch {
      Alert.alert(
        'Assinatura em breve',
        'Os planos estão sendo configurados e estarão disponíveis em breve.\n\nEntre em contato pelo WhatsApp para assinar antecipadamente com desconto especial.',
        [
          { text: 'Fechar', style: 'cancel' },
          { text: 'WhatsApp', onPress: () => Linking.openURL('https://wa.me/5531995515045') },
        ],
      )
    } finally {
      setLoading(null)
    }
  }

  async function handleRestaurar() {
    if (!isIOS) return
    setLoading('restore')
    try {
      await restorePurchases()
      const purchases = await getAvailablePurchases()
      const ativa = (purchases as Purchase[])?.some(p => p.productId === SKU_MENSAL || p.productId === SKU_ANUAL)
      if (ativa) {
        Alert.alert('Compra restaurada', 'Sua assinatura Pro foi restaurada com sucesso.', [
          { text: 'OK', onPress: () => router.back() },
        ])
      } else {
        Alert.alert('Sem compras anteriores', 'Não encontramos uma assinatura ativa associada a este Apple ID.')
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível restaurar a compra. Tente novamente.')
    } finally {
      setLoading(null)
    }
  }

  function handleAssinar(plan_type: 'monthly' | 'annual') {
    if (isIOS) {
      const sku = plan_type === 'monthly' ? SKU_MENSAL : SKU_ANUAL
      handleAssinarIOS(sku, plan_type)
    } else {
      handleAssinarAndroid(plan_type)
    }
  }

  const labelMensal = isIOS ? `${precoMensal}/mês` : 'R$ 19,00/mês'
  const labelAnual = isIOS ? `${precoAnual}/ano` : 'R$ 149,00/ano'

  return (
    <ScrollView style={estilos.container} contentContainerStyle={estilos.content} showsVerticalScrollIndicator={false}>

      {/* Botão fechar */}
      <TouchableOpacity style={estilos.btnFechar} onPress={() => router.back()}>
        <Ionicons name="close" size={20} color={C.text2} />
      </TouchableOpacity>

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

      {/* Card Pro */}
      <View style={estilos.cardPro}>
        <View style={estilos.fitaPopular}>
          <Ionicons name="star" size={11} color={C.yellow} />
          <Text style={estilos.fitaTexto}>MAIS POPULAR</Text>
        </View>

        <View style={estilos.proCirculo1} />
        <View style={estilos.proCirculo2} />

        <View style={estilos.cardHeaderRow}>
          <View>
            <Text style={[estilos.planoLabel, { color: 'rgba(255,255,255,0.65)' }]}>PRO</Text>
            <Text style={[estilos.planoNome, { color: C.white }]}>Crescer</Text>
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

        <TouchableOpacity
          style={estilos.btnPro}
          onPress={() => handleAssinar('monthly')}
          disabled={loading !== null}
        >
          {loading === 'monthly'
            ? <ActivityIndicator color={C.green} />
            : <>
                <Ionicons name="rocket-outline" size={18} color={C.green} />
                <Text style={estilos.btnProTexto}>Assinar por {labelMensal}</Text>
              </>
          }
        </TouchableOpacity>

        <Text style={estilos.proGarantia}>✓ Cancele a qualquer momento · Sem fidelidade</Text>
      </View>

      {/* Plano Anual */}
      <TouchableOpacity
        style={estilos.anualBox}
        onPress={() => handleAssinar('annual')}
        disabled={loading !== null}
      >
        <View style={estilos.anualEsquerda}>
          <Text style={estilos.anualTitulo}>💰 Plano Anual</Text>
          <Text style={estilos.anualSub}>{labelAnual} — economize 33%</Text>
        </View>
        {loading === 'annual'
          ? <ActivityIndicator color={C.green} size="small" />
          : <View style={estilos.anualBadge}>
              <Text style={estilos.anualBadgeTexto}>-33%</Text>
            </View>
        }
      </TouchableOpacity>

      {/* Nota legal da Apple (obrigatória para IAP) */}
      {isIOS && (
        <>
          <Text style={estilos.appleNota}>
            O pagamento será cobrado na sua conta Apple ID ao confirmar a compra. A assinatura é renovada
            automaticamente, a menos que seja cancelada pelo menos 24 horas antes do fim do período vigente.
            Gerencie ou cancele em Ajustes {'>'} [seu nome] {'>'} Assinaturas.
          </Text>
          <TouchableOpacity
            style={estilos.btnRestaurar}
            onPress={handleRestaurar}
            disabled={loading !== null}
          >
            {loading === 'restore'
              ? <ActivityIndicator color={C.text3} size="small" />
              : <Text style={estilos.btnRestaurarTexto}>Restaurar compras anteriores</Text>
            }
          </TouchableOpacity>
        </>
      )}

      {/* Prova social */}
      <View style={estilos.depoimentosBox}>
        <Text style={estilos.depoimentosTitulo}>O que dizem nossos clientes</Text>
        {[
          {
            nome: 'Fátima S.',
            negocio: 'Mercearia · Belo Horizonte',
            texto: 'Usava caderninho e sempre esquecia de cobrar. Agora não perco mais nada. Em 1 mês já recuperei mais de R$ 600.',
          },
          {
            nome: 'Marcos R.',
            negocio: 'Padaria · São Paulo',
            texto: 'O WhatsApp automático é incrível. O cliente paga na hora quando vê o extrato direitinho com o valor certo.',
          },
          {
            nome: 'Cláudia M.',
            negocio: 'Salão de beleza · Recife',
            texto: 'Simples de usar e minha filha não precisa mais me ajudar a anotar. Recomendo muito!',
          },
        ].map((d, i) => (
          <View key={i} style={estilos.depoimentoCard}>
            <View style={estilos.depoimentoEstrelas}>
              {Array.from({ length: 5 }).map((_, j) => (
                <Ionicons key={j} name="star" size={12} color={C.yellow} />
              ))}
            </View>
            <Text style={estilos.depoimentoTexto}>"{d.texto}"</Text>
            <Text style={estilos.depoimentoAutor}>{d.nome} · {d.negocio}</Text>
          </View>
        ))}
      </View>

      {/* Garantia */}
      <View style={estilos.garantiaBox}>
        <Ionicons name="shield-checkmark-outline" size={22} color={C.green} />
        <View style={{ flex: 1 }}>
          <Text style={estilos.garantiaTitulo}>Garantia de 7 dias</Text>
          <Text style={estilos.garantiaSub}>Cancele a qualquer momento nas configurações da sua conta Apple ID.</Text>
        </View>
      </View>

      {/* Links legais */}
      <View style={estilos.legalBox}>
        <TouchableOpacity onPress={() => Linking.openURL('https://fiadoapp.com.br/privacidade')}>
          <Text style={estilos.legalLink}>Política de Privacidade</Text>
        </TouchableOpacity>
        <Text style={estilos.legalSep}> · </Text>
        <TouchableOpacity onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}>
          <Text style={estilos.legalLink}>Termos de Uso (EULA)</Text>
        </TouchableOpacity>
      </View>

    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 48 },

  btnFechar: { alignSelf: 'flex-end', width: 36, height: 36, borderRadius: 18, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  header: { alignItems: 'center', marginBottom: 24, paddingTop: 8 },
  badgeNovo: {
    backgroundColor: C.greenLight, borderRadius: 99,
    paddingHorizontal: 14, paddingVertical: 5,
    borderWidth: 1, borderColor: C.greenMid, marginBottom: 12,
  },
  badgeNovoTexto: { fontSize: 12, color: C.green, fontWeight: '700' },
  titulo: { fontSize: 26, fontWeight: '900', color: C.text, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: C.text2, marginTop: 4 },

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

  appleNota: {
    fontSize: 11, color: C.text3, lineHeight: 16,
    textAlign: 'center', marginBottom: 16, paddingHorizontal: 4,
  },

  garantiaBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: C.white, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: C.border,
  },
  garantiaTitulo: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 2 },
  garantiaSub: { fontSize: 13, color: C.text2, lineHeight: 18 },

  depoimentosBox: { marginBottom: 16, gap: 10 },
  depoimentosTitulo: { fontSize: 13, fontWeight: '700', color: C.text2, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  depoimentoCard: {
    backgroundColor: C.white, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  depoimentoEstrelas: { flexDirection: 'row', gap: 2, marginBottom: 8 },
  depoimentoTexto: { fontSize: 13, color: C.text, lineHeight: 20, fontStyle: 'italic', marginBottom: 8 },
  depoimentoAutor: { fontSize: 11, color: C.text3, fontWeight: '600' },

  btnRestaurar: { alignItems: 'center', paddingVertical: 10, marginBottom: 12 },
  btnRestaurarTexto: { fontSize: 13, color: C.text3, textDecorationLine: 'underline' },
  legalBox: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 12, marginBottom: 4 },
  legalLink: { fontSize: 12, color: C.text3, textDecorationLine: 'underline' },
  legalSep: { fontSize: 12, color: C.text3 },
})

import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Linking, Platform, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, useFocusEffect } from 'expo-router'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
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
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { C } from '../constants/colors'
import { useTenant } from '../hooks/useTenant'
import { evento } from '../lib/instalacao'
import { escolherPreco, equivalenteMensal } from '../lib/precoPlano'
import {
  SKU_MENSAL, SKU_ANUAL, SKUS, MODULOS_CACHE_KEY,
  garantirConexaoIAP, enviarParaVerificacaoApple, verificarComprasApplePendentes,
} from '../lib/appleIAP'
import {
  comprarAssinaturaGoogle, enviarParaVerificacaoGoogle, concluirCompraGoogle,
  compraDoPlano, verificarComprasGooglePendentes, compraPendenteGoogle,
} from '../lib/googleIAP'

const isIOS = Platform.OS === 'ios'

const RECURSOS_GRATUITO = [
  { texto: 'Até 10 clientes', ok: true },
  { texto: 'Lançamentos ilimitados', ok: true },
  { texto: '10 cobranças WhatsApp/mês', ok: true },
  { texto: 'Cobranças WhatsApp ilimitadas', ok: false },
  { texto: 'Relatórios por categoria', ok: false },
  { texto: 'Exportação de dados CSV', ok: false },
  { texto: 'Score do cliente', ok: false },
]

const RECURSOS_PRO = [
  { texto: 'Clientes ilimitados', destaque: true },
  { texto: 'Cobre todos os vencidos num toque', destaque: true },
  { texto: 'Lançamentos ilimitados', destaque: false },
  { texto: 'Cobranças WhatsApp ilimitadas', destaque: true },
  { texto: 'Relatórios por categoria', destaque: true },
  { texto: 'Exportação de dados CSV', destaque: true },
  { texto: 'Score de pagador', destaque: true },
  { texto: 'Suporte prioritário', destaque: false },
]

export default function PlanosScreen() {
  const router = useRouter()
  const { souFuncionario, papelConfirmado } = useTenant()
  const [loading, setLoading] = useState<'monthly' | 'annual' | 'restore' | null>(null)
  const [precoMensal, setPrecoMensal] = useState('R$ 19,90')
  const [precoAnual, setPrecoAnual]   = useState('R$ 149,90')
  const [ativando, setAtivando] = useState(false)
  // Cartão Pro: o ANUAL vem pré-selecionado; o mensal fica a um toque. O botão acompanha a seleção.
  const [planoSel, setPlanoSel] = useState<'annual' | 'monthly'>('annual')
  // Falha ao carregar a loja/planos: mostra o aviso com "Tentar de novo" (muda a tentativa e refaz a inicialização).
  const [erroProdutos, setErroProdutos] = useState(false)
  const [tentativaLoja, setTentativaLoja] = useState(0)

  // Funil de compra (anônimo, 1x por dia): abriu a tela Planos. Só o dono (funcionário vê a tela de bloqueio).
  useEffect(() => {
    if (papelConfirmado && !souFuncionario) evento('planos')
  }, [papelConfirmado, souFuncionario])

  // Texto único de "pagamento em confirmação" (Pix e outras formas lentas do Google Play).
  const TITULO_PENDENTE = 'Seu pagamento está sendo confirmado'
  const TEXTO_PENDENTE = 'Se você pagou com Pix, o Google Play pode levar alguns minutos para confirmar. Assim que confirmar, o plano Pro é ativado sozinho. Se não ativar, feche e abra o app de novo ou toque em Restaurar compras.'

  // Android: quando a tela de compra do Google fecha (inclusive "cancelada" porque a pessoa saiu para pagar o Pix no
  // app do banco), confere uma vez: já foi pago e confirmado? Ativa. Está pendente? Avisa que está em confirmação.
  const conferindoFimDeCompra = useRef(false)
  async function aposFimDeCompraAndroid() {
    if (isIOS || conferindoFimDeCompra.current) return
    conferindoFimDeCompra.current = true
    try {
      await new Promise<void>(resolve => setTimeout(resolve, 2500))   // dá um tempo para o Google registrar
      if (await verificarComprasGooglePendentes()) {
        evento('compra_ok')
        Alert.alert(
          '🎉 Assinatura ativa!',
          'Seu plano Pro foi ativado. Aproveite todos os recursos!',
          [{ text: 'Continuar', onPress: () => router.back() }],
        )
        return
      }
      if (await compraPendenteGoogle()) {
        evento('compra_pendente')
        Alert.alert(TITULO_PENDENTE, TEXTO_PENDENTE)
      }
    } catch {
      // silencioso: nunca atrapalha o usuário
    } finally {
      conferindoFimDeCompra.current = false
    }
  }

  // Erro de compra: cancelar é uma etapa própria; o resto leva só o CÓDIGO do erro (nunca texto livre).
  // Funil anônimo: qual plano (anual/mensal) em compra e compra_ok.
  const detalhePlano = (productId?: string | null) =>
    productId === SKU_ANUAL ? 'anual' : productId === SKU_MENSAL ? 'mensal' : undefined

  function registrarFalhaCompra(err: any) {
    if (err?.code === ErrorCode.UserCancelled) { evento('compra_cancelou'); return }
    const interno = ['loja_indisponivel', 'oferta_indisponivel', 'sem_sessao'].includes(err?.message) ? err.message : null
    evento('compra_erro', err?.code ?? interno ?? 'desconhecido')
  }

  // Inicializa IAP (iOS: App Store; Android: Google Play) -- a conexão é compartilhada com o AppleBackfillListener
  // global (app/_layout.tsx), então esta tela nunca fecha a conexão sozinha (endConnection
  // derrubaria a verificação em segundo plano do app inteiro).
  useEffect(() => {
    let purchaseUpdateSub: ReturnType<typeof purchaseUpdatedListener>
    let purchaseErrorSub: ReturnType<typeof purchaseErrorListener>

    let ativo = true
    const esperar = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
    // Funil anônimo: código + começo da mensagem do erro técnico da loja (nunca dado do usuário), no formato aceito pelo banco.
    const detalheExcecao = (e: any) =>
      'excecao_produtos:' + String(e?.code ?? 'sem_codigo') + ':' + String(e?.message ?? '').replace(/\s+/g, '_')

    async function setupIAP() {
      if (ativo) setErroProdutos(false)
      try {
        let conectado = await garantirConexaoIAP()
        if (!conectado) { await esperar(1500); conectado = await garantirConexaoIAP() }   // 1 nova tentativa
        if (!conectado) { evento('loja_erro', 'sem_conexao_loja'); if (ativo) setErroProdutos(true); return }

        if (!ativo) return   // saiu da tela (ou tocou em Tentar de novo) enquanto conectava: não registra listeners órfãos
        purchaseUpdateSub = purchaseUpdatedListener(async (purchase: Purchase) => {
          // IAP v15 / Nitro: receipt está em purchaseToken (JWS) ou transactionReceipt
          const receipt = (purchase as any).purchaseToken ?? (purchase as any).transactionReceipt
          // Aceita purchaseState 'purchased' (string) ou undefined (iOS subscriptions às vezes omite)
          // Nunca aceita 'pending' ou 'failed'
          // Os tipos do IAP v15 não listam 'failed', mas o valor pode chegar em runtime.
          const estado = String(purchase.purchaseState)
          const stateOk = estado !== 'pending' && estado !== 'failed'
          if (!isIOS && estado === 'pending') {
            // Google Play: pagamento ainda não confirmado (ex.: Pix). Não ativa nada agora.
            evento('compra_pendente')
            Alert.alert(TITULO_PENDENTE, TEXTO_PENDENTE)
            setLoading(null)
            return
          }
          if (receipt && stateOk) {
            if (isIOS) await handleApplePurchaseSuccess(purchase)
            else await handleGooglePurchaseSuccess(purchase)
          }
        })

        purchaseErrorSub = purchaseErrorListener((error: PurchaseError) => {
          registrarFalhaCompra(error)
          if (!isIOS) aposFimDeCompraAndroid()
          if (error.code !== ErrorCode.UserCancelled) {
            Alert.alert('Erro na compra', error.message ?? 'Tente novamente.')
          }
          setLoading(null)
        })

        let subs
        try {
          subs = await fetchProducts({ skus: SKUS, type: 'subs' }) ?? []
        } catch {
          await esperar(1500)   // 1 nova tentativa antes de avisar o usuário
          subs = await fetchProducts({ skus: SKUS, type: 'subs' }) ?? []
        }
        if (subs.length === 0) { evento('loja_erro', 'produtos_vazio'); if (ativo) setErroProdutos(true) }
        for (const sub of subs) {
          const pid = (sub as any).id ?? (sub as any).productId ?? ''
          // Só mostra o preço da loja se a moeda for BRL (conta de teste/loja de outro país devolve "$2.99" enquanto a
          // cobrança real é em reais): senão fica o texto fixo (R$ 19,90/mês e R$ 149,90/ano).
          const escolha = escolherPreco(sub as any)
          if (escolha.tipo === 'loja') {
            if (pid === SKU_MENSAL) setPrecoMensal(escolha.preco)
            if (pid === SKU_ANUAL) setPrecoAnual(escolha.preco)
          } else if (escolha.moeda) {
            evento('loja_erro', 'moeda_' + escolha.moeda)
          }
        }
      } catch (e: any) {
        evento('loja_erro', detalheExcecao(e))
        if (ativo) setErroProdutos(true)
        console.warn('[IAP] setupIAP falhou:', e?.message ?? e)
      }
    }

    setupIAP()
    return () => {
      ativo = false
      purchaseUpdateSub?.remove()
      purchaseErrorSub?.remove()
    }
  }, [tentativaLoja])

  // Verifica compras Apple pendentes ao voltar a esta tela (ex: usuário fechou o app
  // no meio da compra e reabriu direto nos planos) -- reaproveita o mesmo mecanismo
  // do AppleBackfillListener global.
  useFocusEffect(useCallback(() => {
    if (isIOS) verificarComprasApplePendentes()
    else verificarComprasGooglePendentes()
  }, []))

  async function handleApplePurchaseSuccess(purchase: Purchase) {
    setAtivando(true)
    try {
      // Finaliza transação Apple — obrigatório independente do backend
      await finishTransaction({ purchase, isConsumable: false })

      // Chama backend para ativar plano, com retentativa automática (item 2: uma compra
      // confirmada pela Apple já ficou 1h16 sem ativar por uma falha transitória aqui).
      const ok = await enviarParaVerificacaoApple(purchase)
      if (ok) {
        evento('compra_ok', detalhePlano(purchase.productId))
        Alert.alert(
          '🎉 Assinatura ativa!',
          'Bem-vindo ao FiadoApp Pro! Seus benefícios já estão disponíveis.',
          [{ text: 'Continuar', onPress: () => router.back() }],
        )
      } else {
        Alert.alert(
          'Compra registrada',
          'Sua compra foi processada pela Apple, mas houve um erro ao ativar os benefícios. Use "Restaurar compras" para tentar novamente.',
        )
      }
    } catch (err) {
      // Garante que a transação seja sempre finalizada mesmo em erro
      try { await finishTransaction({ purchase, isConsumable: false }) } catch { /* já finalizada */ }
      Alert.alert(
        'Assinatura processada',
        'Sua compra foi concluída. Se os benefícios não aparecerem, use "Restaurar compras".',
      )
    } finally {
      setAtivando(false)
      setLoading(null)
    }
  }

  async function handleAssinarIOS(sku: string, planType: 'monthly' | 'annual') {
    const conectado = await garantirConexaoIAP()
    if (!conectado) {
      Alert.alert('Loja indisponível', 'Não foi possível conectar à App Store. Verifique sua conexão e tente novamente.')
      return
    }
    setLoading(planType)
    try {
      // appAccountToken = id do usuário Supabase -- permite a apple-server-notifications
      // casar o webhook da Apple com o perfil certo quando ainda não há
      // apple_original_transaction_id vinculado (item 1b).
      const { data: { session } } = await supabase.auth.getSession()
      await requestPurchase({
        request: { apple: { sku, appAccountToken: session?.user.id } },
        type: 'subs',
      })
      // Resultado chega via purchaseUpdatedListener
    } catch (err: any) {
      registrarFalhaCompra(err)
      if (err?.code !== ErrorCode.UserCancelled) {
        Alert.alert('Erro na compra', `Código: ${err?.code ?? 'desconhecido'}\n${err?.message ?? ''}`)
      }
      setLoading(null)
    }
  }

  async function handleGooglePurchaseSuccess(purchase: Purchase) {
    setAtivando(true)
    try {
      // O servidor consulta o Google, confere que a compra é desta conta e ativa o Pro.
      const r = await enviarParaVerificacaoGoogle(purchase)
      if (r === 'ok') {
        evento('compra_ok', detalhePlano(purchase.productId))
        await concluirCompraGoogle(purchase)
        Alert.alert(
          '🎉 Assinatura ativa!',
          'Seu plano Pro foi ativado. Aproveite todos os recursos!',
          [{ text: 'Continuar', onPress: () => router.back() }],
        )
      } else if (r === 'pendente') {
        evento('compra_pendente')
        Alert.alert(TITULO_PENDENTE, TEXTO_PENDENTE)
      } else if (r === 'recusada') {
        Alert.alert('Não foi possível ativar', 'Esta compra não pertence a esta conta do FiadoApp ou não é válida. Se você acabou de assinar, fale com o suporte.')
      } else {
        Alert.alert(
          'Compra recebida',
          'Seu pagamento foi feito no Google Play. Estamos ativando o Pro — isso pode levar alguns minutos. Se não ativar sozinho, toque em Restaurar compras.',
        )
      }
    } finally {
      setAtivando(false)
      setLoading(null)
    }
  }

  async function handleAssinarAndroid(sku: string, planType: 'monthly' | 'annual') {
    setLoading(planType)
    try {
      // Quem já é Pro (inclusive pelo Mercado Pago, que segue valendo até o fim do período) não
      // assina de novo: evitaria cobrança dupla.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        Alert.alert('Erro', 'Faça login para assinar.')
        setLoading(null)
        return
      }
      const { data: perfil } = await supabase.from('perfis').select('plano').eq('id', session.user.id).maybeSingle()
      if (perfil?.plano === 'pro') {
        Alert.alert('Você já é Pro', 'Seu plano Pro já está ativo. Para trocar de plano, aguarde o fim do período atual.')
        setLoading(null)
        return
      }
      await comprarAssinaturaGoogle(sku)
      // Resultado chega via purchaseUpdatedListener
    } catch (err: any) {
      registrarFalhaCompra(err)
      if (err?.code !== ErrorCode.UserCancelled) {
        const msg = err?.message === 'loja_indisponivel'
          ? 'Não foi possível conectar ao Google Play. Verifique sua conexão e tente novamente.'
          : err?.message === 'oferta_indisponivel'
            ? 'Este plano não está disponível no momento. Tente novamente mais tarde.'
            : 'Não foi possível iniciar a compra. Verifique sua conexão e tente novamente.'
        Alert.alert('Erro na compra', msg)
      }
      setLoading(null)
    }
  }

  async function handleRestaurarGoogle() {
    setLoading('restore')
    try {
      const conectado = await garantirConexaoIAP()
      if (!conectado) {
        Alert.alert('Loja indisponível', 'Não foi possível conectar ao Google Play. Verifique sua conexão e tente novamente.')
        setLoading(null)
        return
      }
      const compra = compraDoPlano((await getAvailablePurchases()) as Purchase[])
      if (!compra) {
        Alert.alert('Sem compras anteriores', 'Não encontramos uma assinatura ativa nesta conta do Google Play.')
        setLoading(null)
        return
      }
      await handleGooglePurchaseSuccess(compra)
    } catch {
      Alert.alert('Erro', 'Não foi possível restaurar a compra. Tente novamente.')
      setLoading(null)
    }
  }

  async function handleRestaurar() {
    if (!isIOS) return handleRestaurarGoogle()
    setLoading('restore')
    try {
      await restorePurchases()
      await new Promise(resolve => setTimeout(resolve, 800))
      const purchases = await getAvailablePurchases()
      const ativa = (purchases as Purchase[])?.find(
        p => p.productId === SKU_MENSAL || p.productId === SKU_ANUAL,
      )
      if (ativa) {
        // Chama backend para garantir que plano está ativo no DB
        await handleApplePurchaseSuccess(ativa)
      } else {
        Alert.alert('Sem compras anteriores', 'Não encontramos uma assinatura ativa associada a este Apple ID.')
        setLoading(null)
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível restaurar a compra. Tente novamente.')
      setLoading(null)
    }
  }

  function handleAssinar(plan_type: 'monthly' | 'annual') {
    evento('compra', plan_type === 'annual' ? 'anual' : 'mensal')   // funil de compra: tocou em Assinar (e em qual plano)
    if (isIOS) {
      handleAssinarIOS(plan_type === 'monthly' ? SKU_MENSAL : SKU_ANUAL, plan_type)
    } else {
      handleAssinarAndroid(plan_type === 'monthly' ? SKU_MENSAL : SKU_ANUAL, plan_type)
    }
  }

  const labelMensal = `${precoMensal}/mês`
  const labelAnual  = `${precoAnual}/ano`
  // Equivalente mensal e economia, calculados dos MESMOS preços exibidos (loja em BRL ou padrão): texto secundário.
  const equiv = equivalenteMensal(precoAnual, precoMensal)

  // Assinatura é decisão e responsabilidade só do dono do negócio -- centraliza aqui
  // em vez de esconder cada botão/alerta espalhado pelo app que levaria pra esta tela.
  if (souFuncionario) {
    return (
      <ScrollView style={estilos.container} contentContainerStyle={estilos.content}>
        <TouchableOpacity style={estilos.btnFechar} onPress={() => router.back()}>
          <Ionicons name="close" size={20} color={C.text2} />
        </TouchableOpacity>
        <View style={[estilos.header, { marginTop: 40 }]}>
          <Ionicons name="lock-closed-outline" size={40} color={C.text3} />
          <Text style={[estilos.titulo, { marginTop: 16, textAlign: 'center' }]}>Assinatura gerenciada pelo dono</Text>
          <Text style={[estilos.sub, { textAlign: 'center' }]}>Fale com o dono do negócio para mudar o plano.</Text>
        </View>
      </ScrollView>
    )
  }

  return (
    <ScrollView style={estilos.container} contentContainerStyle={estilos.content} showsVerticalScrollIndicator={false}>

      <TouchableOpacity style={estilos.btnFechar} onPress={() => router.back()}>
        <Ionicons name="close" size={20} color={C.text2} />
      </TouchableOpacity>

      {ativando && (
        <View style={estilos.ativandoBanner}>
          <ActivityIndicator color={C.white} size="small" />
          <Text style={estilos.ativandoTexto}>Pagamento confirmado, ativando seu Pro…</Text>
        </View>
      )}

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
            <Ionicons name={r.ok ? 'checkmark-circle' : 'close-circle-outline'} size={18} color={r.ok ? C.green : C.text3} />
            <Text style={[estilos.recursoTexto, !r.ok && estilos.recursoDesab]}>{r.texto}</Text>
          </View>
        ))}
        <TouchableOpacity style={estilos.btnGratuito} onPress={() => router.back()}>
          <Text style={estilos.btnGratuitoTexto}>Continuar grátis</Text>
        </TouchableOpacity>
      </View>

      {erroProdutos && (
        <View style={estilos.erroLoja} accessibilityRole="alert">
          <Text style={estilos.erroLojaTexto}>
            Não foi possível carregar os planos. Verifique se {isIOS ? 'a App Store' : 'a Play Store'} está atualizada e tente de novo.
          </Text>
          <TouchableOpacity style={estilos.erroLojaBtn} onPress={() => setTentativaLoja(n => n + 1)} accessibilityRole="button">
            <Text style={estilos.erroLojaBtnTexto}>Tentar de novo</Text>
          </TouchableOpacity>
        </View>
      )}

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
        {/* Escolha do plano: anual (pré-selecionado) ou mensal, a um toque */}
        <View style={estilos.seletor} accessibilityRole="radiogroup">
          {(['annual', 'monthly'] as const).map(p => {
            const ativo = planoSel === p
            return (
              <TouchableOpacity
                key={p}
                style={[estilos.seletorOpcao, ativo && estilos.seletorOpcaoAtiva]}
                onPress={() => setPlanoSel(p)}
                disabled={loading !== null}
                accessibilityRole="radio"
                accessibilityState={{ selected: ativo }}
              >
                <Text style={[estilos.seletorTexto, ativo && estilos.seletorTextoAtivo]}>{p === 'annual' ? 'Anual' : 'Mensal'}</Text>
                {p === 'annual' && equiv && (
                  <Text style={[estilos.seletorTag, ativo && estilos.seletorTagAtiva]}>economize {equiv.economiaPct}%</Text>
                )}
              </TouchableOpacity>
            )
          })}
        </View>
        {/* Preço COBRADO em destaque; o equivalente mensal é sempre texto menor (Apple 3.1.2 / Google) */}
        <View style={estilos.precoCobrado}>
          <Text style={estilos.precoCobradoValor}>{planoSel === 'annual' ? precoAnual : precoMensal}</Text>
          <Text style={estilos.precoCobradoPeriodo}>{planoSel === 'annual' ? '/ano' : '/mês'}</Text>
        </View>
        {planoSel === 'annual' && equiv && (
          <Text style={estilos.precoEquivalente}>equivale a {equiv.porMes}/mês · economize {equiv.economiaPct}%</Text>
        )}
        <TouchableOpacity style={estilos.btnPro} onPress={() => handleAssinar(planoSel)} disabled={loading !== null}>
          {loading === planoSel
            ? <ActivityIndicator color={C.green} />
            : <><Ionicons name="rocket-outline" size={18} color={C.green} /><Text style={estilos.btnProTexto}>{planoSel === 'annual' ? `Assinar anual por ${precoAnual}` : `Assinar por ${labelMensal}`}</Text></>
          }
        </TouchableOpacity>
        {/* Só Android (a Apple não tem Pix). Frase sempre verdadeira: o Pix depende da conta/região no Google Play. */}
        {!isIOS && <Text style={estilos.proPagamento}>💳 Pague com cartão, saldo Google Play ou outras formas disponíveis na sua conta (como Pix)</Text>}
        <Text style={estilos.proGarantia}>✓ Cancele a qualquer momento · Sem fidelidade</Text>
      </View>

      {/* Nota legal + restaurar (cada loja com o seu texto) */}
      {(
        <>
          <Text style={estilos.appleNota}>
            {isIOS
              ? <>O pagamento será cobrado na sua conta Apple ID ao confirmar a compra. A assinatura é renovada
                automaticamente, a menos que seja cancelada pelo menos 24 horas antes do fim do período vigente.
                Gerencie ou cancele em Ajustes {'>'} [seu nome] {'>'} Assinaturas.</>
              : <>O pagamento será cobrado na sua conta do Google Play ao confirmar a compra. A assinatura é renovada
                automaticamente, a menos que seja cancelada antes do fim do período vigente. Gerencie ou cancele na
                Play Store {'>'} Pagamentos e assinaturas {'>'} Assinaturas.</>}
          </Text>
          <TouchableOpacity style={estilos.btnRestaurar} onPress={handleRestaurar} disabled={loading !== null}>
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
          { nome: 'Loja Gonçalos', texto: 'Melhor app de gerenciamento de contas que baixei até agora. Já tive que assinar o Pro pq estou usando na minha loja.' },
          { nome: 'Analu enxovais', texto: 'App muito bom. Gostei bastante.' },
        ].map((d, i) => (
          <View key={i} style={estilos.depoimentoCard}>
            <Text style={estilos.depoimentoTexto}>"{d.texto}"</Text>
            <Text style={estilos.depoimentoAutor}>{d.nome}{isIOS ? ' · Avaliação publicada na App Store' : ''}</Text>
          </View>
        ))}
      </View>

      {/* Garantia */}
      <View style={estilos.garantiaBox}>
        <Ionicons name="shield-checkmark-outline" size={22} color={C.green} />
        <View style={{ flex: 1 }}>
          <Text style={estilos.garantiaTitulo}>Cancele quando quiser</Text>
          <Text style={estilos.garantiaSub}>Sem fidelidade e sem multa. Cancele a qualquer momento nas configurações da sua conta {isIOS ? 'Apple ID' : 'do Google Play'}.</Text>
        </View>
      </View>

      {/* Links legais */}
      <View style={estilos.legalBox}>
        <TouchableOpacity onPress={() => Linking.openURL('https://fiadoapp.app.br/privacidade')}>
          <Text style={estilos.legalLink}>Política de Privacidade</Text>
        </TouchableOpacity>
        <Text style={estilos.legalSep}> · </Text>
        <TouchableOpacity onPress={() => (isIOS
          ? Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')
          : router.push('/termos'))}>
          <Text style={estilos.legalLink}>{isIOS ? 'Termos de Uso (EULA)' : 'Termos de Uso'}</Text>
        </TouchableOpacity>
      </View>

    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 48 },
  btnFechar: { alignSelf: 'flex-end', width: 36, height: 36, borderRadius: 18, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  ativandoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.green, borderRadius: 14, padding: 14, marginBottom: 16,
  },
  ativandoTexto: { flex: 1, color: C.white, fontWeight: '700', fontSize: 13 },
  header: { alignItems: 'center', marginBottom: 24, paddingTop: 8 },
  badgeNovo: { backgroundColor: C.greenLight, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1, borderColor: C.greenMid, marginBottom: 12 },
  badgeNovoTexto: { fontSize: 12, color: C.green, fontWeight: '700' },
  titulo: { fontSize: 26, fontWeight: '900', color: C.text, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: C.text2, marginTop: 4 },
  cardGratuito: { backgroundColor: C.white, borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 },
  planoLabel: { fontSize: 10, fontWeight: '800', color: C.text3, letterSpacing: 1.5, marginBottom: 2 },
  planoNome: { fontSize: 22, fontWeight: '800', color: C.text },
  precoBox: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  preco: { fontSize: 32, fontWeight: '900', color: C.text, lineHeight: 36 },
  precoPeriodo: { fontSize: 13, color: C.text2, marginBottom: 2 },
  separador: { borderTopWidth: 1, borderColor: C.border, marginBottom: 14 },
  recursoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  recursoTexto: { fontSize: 14, color: C.text, flex: 1 },   // flex:1 faz o texto quebrar linha em vez de passar da borda do cartão
  recursoDesab: { color: C.text3 },
  btnGratuito: { borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  btnGratuitoTexto: { color: C.text2, fontWeight: '600', fontSize: 14 },
  cardPro: { backgroundColor: C.green, borderRadius: 20, padding: 20, marginBottom: 16, overflow: 'hidden', shadowColor: C.green, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 8 },
  fitaPopular: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 16 },
  fitaTexto: { fontSize: 10, fontWeight: '800', color: C.white, letterSpacing: 1 },
  proCirculo1: { position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.07)' },
  proCirculo2: { position: 'absolute', bottom: -30, left: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(0,0,0,0.07)' },
  btnPro: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.white, borderRadius: 12, paddingVertical: 14, marginTop: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 },
  btnProTexto: { color: C.green, fontWeight: '800', fontSize: 15 },
  proPagamento: { fontSize: 11, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: 10 },
  proGarantia: { fontSize: 11, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 10 },
  seletor: { flexDirection: 'row', gap: 8, marginTop: 4 },
  seletorOpcao: { flex: 1, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)', borderRadius: 12, paddingVertical: 10, alignItems: 'center', gap: 2 },
  seletorOpcaoAtiva: { backgroundColor: C.white, borderColor: C.white },
  seletorTexto: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  seletorTextoAtivo: { color: C.green },
  seletorTag: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  seletorTagAtiva: { color: C.greenDark },
  precoCobrado: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 4, marginTop: 16 },
  precoCobradoValor: { fontSize: 32, fontWeight: '900', color: C.white, lineHeight: 36 },
  precoCobradoPeriodo: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.85)', marginBottom: 3 },
  precoEquivalente: { fontSize: 12, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: 4 },
  anualBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.greenLight, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.greenMid },
  anualEsquerda: { flex: 1, gap: 2 },
  anualTitulo: { fontSize: 15, fontWeight: '700', color: C.greenDark },
  anualSub: { fontSize: 13, color: C.green },
  anualBadge: { backgroundColor: C.green, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  anualBadgeTexto: { fontSize: 13, fontWeight: '800', color: C.white },
  appleNota: { fontSize: 11, color: C.text3, lineHeight: 16, textAlign: 'center', marginBottom: 16, paddingHorizontal: 4 },
  garantiaBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: C.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border },
  garantiaTitulo: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 2 },
  garantiaSub: { fontSize: 13, color: C.text2, lineHeight: 18 },
  depoimentosBox: { marginBottom: 16, gap: 10 },
  depoimentosTitulo: { fontSize: 13, fontWeight: '700', color: C.text2, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  depoimentoCard: { backgroundColor: C.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  depoimentoTexto: { fontSize: 13, color: C.text, lineHeight: 20, fontStyle: 'italic', marginBottom: 8 },
  depoimentoAutor: { fontSize: 11, color: C.text3, fontWeight: '600' },
  erroLoja: {
    backgroundColor: C.yellowLight, borderRadius: 12, borderWidth: 1, borderColor: C.yellowBorder,
    padding: 12, marginBottom: 12, gap: 10,
  },
  erroLojaTexto: { fontSize: 13, color: C.text2, lineHeight: 18 },
  erroLojaBtn: { alignSelf: 'flex-start', backgroundColor: C.green, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  erroLojaBtnTexto: { color: C.white, fontSize: 13, fontWeight: '700' },
  btnRestaurar: { alignItems: 'center', paddingVertical: 10, marginBottom: 12 },
  btnRestaurarTexto: { fontSize: 13, color: C.text3, textDecorationLine: 'underline' },
  legalBox: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 12, marginBottom: 4 },
  legalLink: { fontSize: 12, color: C.text3, textDecorationLine: 'underline' },
  legalSep: { fontSize: 12, color: C.text3 },
})

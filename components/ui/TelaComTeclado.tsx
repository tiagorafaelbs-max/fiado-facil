import { createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { Keyboard, Platform, ScrollView, TextInput, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps } from 'react-native'
import { useNavigation } from 'expo-router'
import { paddingExtraDoTeclado, rolagemAposFecharTeclado } from '../../lib/teclado'

// Rola até o campo que está com o foco (no-op fora de uma TelaComTeclado).
const RolarContexto = createContext<() => void>(() => {})
export const useRolarParaFocado = () => useContext(RolarContexto)

const MARGEM_ACIMA_DO_CAMPO = 120

// ScrollView de formulário que funciona com o teclado aberto no Android:
// - soma ao fim do conteúdo a altura do teclado (se o sistema não redimensionou a janela), então SEMPRE há como
//   rolar até o botão principal;
// - rola até o campo focado quando o teclado abre e quando se troca de campo (Campo e inputs do login chamam
//   useRolarParaFocado no onFocus);
// - ao FECHAR o teclado e quando a tela ganha foco: tira o espaço extra e, se o conteúdo cabe, volta ao topo;
// - só reage ao teclado quando a SUA tela está em foco: numa pilha de navegação a tela de baixo (ex.: login
//   por baixo do cadastro) continua montada e recebia os eventos do teclado da tela de cima, ficando rolada
//   errado quando o usuário voltava;
// - toques nos botões com o teclado aberto funcionam (keyboardShouldPersistTaps="handled").
// No iOS só há a rolagem até o campo focado e a normalização (o espaço extra e o listener são só do Android).
export const TelaComTeclado = forwardRef<ScrollView, ScrollViewProps & { children?: ReactNode; rolarRef?: MutableRefObject<() => void> }>(function TelaComTeclado(
  { children, contentContainerStyle, onLayout, onScroll, onContentSizeChange, rolarRef, ...resto }, refExterna,
) {
  const navigation = useNavigation()
  const ref = useRef<ScrollView | null>(null)
  const [tecladoAltura, setTecladoAltura] = useState(0)
  const [alturaAtual, setAlturaAtual] = useState(0)
  const alturaSemTeclado = useRef(0)
  const alturaArea = useRef(0)
  const alturaConteudo = useRef(0)
  const deslocamento = useRef(0)

  const rolarParaFocado = useCallback(() => {
    const rolar = () => {
      const sv = ref.current
      if (!sv || !navigation.isFocused()) return
      const campo: any = (TextInput as any).State?.currentlyFocusedInput?.()
      const conteudo: any = (sv as any).getInnerViewRef?.() ?? (sv as any).getInnerViewNode?.()
      if (campo?.measureLayout && conteudo) {
        try {
          campo.measureLayout(conteudo, (_x: number, y: number) => sv.scrollTo({ y: Math.max(0, y - MARGEM_ACIMA_DO_CAMPO), animated: true }),
            () => sv.scrollToEnd({ animated: true }))
          return
        } catch { /* cai no scrollToEnd */ }
      }
      sv.scrollToEnd({ animated: true })
    }
    // Espera o teclado e o espaço extra serem aplicados antes de medir.
    setTimeout(rolar, 250)
  }, [navigation])

  // Teclado fechado (ou tela voltando ao foco): volta ao topo se o conteúdo cabe; senão, ao fim real.
  const normalizarRolagem = useCallback(() => {
    setTimeout(() => {
      const sv = ref.current
      if (!sv || Keyboard.isVisible()) return
      const y = rolagemAposFecharTeclado({
        alturaConteudo: alturaConteudo.current, alturaArea: alturaArea.current, deslocamento: deslocamento.current,
      })
      if (y !== null) sv.scrollTo({ y, animated: false })
    }, 150)
  }, [])

  // Telas que usam TextInput próprio (sem o Campo) chamam rolarRef.current() no onFocus.
  if (rolarRef) rolarRef.current = rolarParaFocado

  useEffect(() => {
    const desfazer: (() => void)[] = []
    if (Platform.OS === 'android') {
      const mostrar = Keyboard.addListener('keyboardDidShow', (e) => {
        if (!navigation.isFocused()) return          // tela de baixo na pilha: ignora o teclado da tela de cima
        setTecladoAltura(e.endCoordinates?.height ?? 0)
        rolarParaFocado()
      })
      const esconder = Keyboard.addListener('keyboardDidHide', () => { setTecladoAltura(0); normalizarRolagem() })
      desfazer.push(() => mostrar.remove(), () => esconder.remove())
    }
    // Ao ganhar foco (ex.: voltar do cadastro para o login): estado do teclado atual e rolagem normalizada.
    const aoFocar = navigation.addListener('focus', () => {
      if (Platform.OS === 'android') setTecladoAltura(Keyboard.isVisible() ? Keyboard.metrics()?.height ?? 0 : 0)
      normalizarRolagem()
    })
    desfazer.push(aoFocar)
    return () => desfazer.forEach(f => f())
  }, [navigation, rolarParaFocado, normalizarRolagem])

  function aoMedir(e: LayoutChangeEvent) {
    const h = e.nativeEvent.layout.height
    setAlturaAtual(h)
    alturaArea.current = h
    // Só mede a área "sem teclado" com o teclado realmente fechado (Keyboard.isVisible, não o estado React):
    // evita guardar uma altura já encolhida se o onLayout chegar antes do keyboardDidShow.
    if (!Keyboard.isVisible()) alturaSemTeclado.current = h
    onLayout?.(e)
  }

  const extra = paddingExtraDoTeclado({
    android: Platform.OS === 'android', tecladoAltura, alturaSemTeclado: alturaSemTeclado.current, alturaAtual,
  })

  return (
    <RolarContexto.Provider value={rolarParaFocado}>
      <ScrollView
        {...resto}
        ref={(no) => {
          ref.current = no
          if (typeof refExterna === 'function') refExterna(no)
          else if (refExterna) (refExterna as any).current = no
        }}
        onLayout={aoMedir}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => { deslocamento.current = e.nativeEvent.contentOffset.y; onScroll?.(e) }}
        scrollEventThrottle={resto.scrollEventThrottle ?? 32}
        onContentSizeChange={(w, h) => {
          alturaConteudo.current = h
          onContentSizeChange?.(w, h)
          if (!Keyboard.isVisible()) normalizarRolagem()     // o espaço extra saiu: reajusta a posição
        }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[contentContainerStyle, extra > 0 && { paddingBottom: extra + 24 }]}
      >
        {children}
      </ScrollView>
    </RolarContexto.Provider>
  )
})

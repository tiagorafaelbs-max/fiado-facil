import { createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { Keyboard, Platform, ScrollView, TextInput, type LayoutChangeEvent, type ScrollViewProps } from 'react-native'
import { paddingExtraDoTeclado } from '../../lib/teclado'

// Rola até o campo que está com o foco (no-op fora de uma TelaComTeclado).
const RolarContexto = createContext<() => void>(() => {})
export const useRolarParaFocado = () => useContext(RolarContexto)

const MARGEM_ACIMA_DO_CAMPO = 120

// ScrollView de formulário que funciona com o teclado aberto no Android:
// - soma ao fim do conteúdo a altura do teclado (se o sistema não redimensionou a janela), então SEMPRE há como
//   rolar até o botão principal;
// - rola até o campo focado quando o teclado abre e quando se troca de campo (Campo e inputs do login chamam
//   useRolarParaFocado no onFocus);
// - toques nos botões com o teclado aberto funcionam (keyboardShouldPersistTaps="handled").
// No iOS não muda nada (lá o KeyboardAvoidingView/ScrollView já se viram).
export const TelaComTeclado = forwardRef<ScrollView, ScrollViewProps & { children?: ReactNode; rolarRef?: MutableRefObject<() => void> }>(function TelaComTeclado(
  { children, contentContainerStyle, onLayout, rolarRef, ...resto }, refExterna,
) {
  const ref = useRef<ScrollView | null>(null)
  const [tecladoAltura, setTecladoAltura] = useState(0)
  const [alturaAtual, setAlturaAtual] = useState(0)
  const alturaSemTeclado = useRef(0)

  const rolarParaFocado = useCallback(() => {
    const rolar = () => {
      const sv = ref.current
      if (!sv) return
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
  }, [])

  // Telas que usam TextInput próprio (sem o Campo) chamam rolarRef.current() no onFocus.
  if (rolarRef) rolarRef.current = rolarParaFocado

  useEffect(() => {
    if (Platform.OS !== 'android') return
    const mostrar = Keyboard.addListener('keyboardDidShow', (e) => { setTecladoAltura(e.endCoordinates?.height ?? 0); rolarParaFocado() })
    const esconder = Keyboard.addListener('keyboardDidHide', () => setTecladoAltura(0))
    return () => { mostrar.remove(); esconder.remove() }
  }, [rolarParaFocado])

  function aoMedir(e: LayoutChangeEvent) {
    const h = e.nativeEvent.layout.height
    setAlturaAtual(h)
    if (tecladoAltura === 0) alturaSemTeclado.current = h
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
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[contentContainerStyle, extra > 0 && { paddingBottom: extra + 24 }]}
      >
        {children}
      </ScrollView>
    </RolarContexto.Provider>
  )
})

// Regras (puras, testáveis em Node) do espaço extra que as telas de formulário precisam no Android quando o
// teclado abre. No Android moderno (tela inteira / edge-to-edge) o sistema às vezes NÃO redimensiona a janela:
// o teclado cobre o formulário e, como o conteúdo cabia na tela, nada rola. Quando o sistema JÁ redimensionou
// (a área visível encolheu), não se soma nada para não duplicar o espaço.

export interface EntradaTeclado {
  android: boolean
  tecladoAltura: number     // altura do teclado aberto (0 = fechado)
  alturaSemTeclado: number  // altura da área rolável medida com o teclado fechado (0 = ainda não medida)
  alturaAtual: number       // altura da área rolável agora
}

export function janelaRedimensionou(e: EntradaTeclado): boolean {
  if (e.tecladoAltura <= 0 || e.alturaSemTeclado <= 0) return false
  // A área encolheu pelo menos metade do que o teclado ocupa: o sistema redimensionou.
  return e.alturaAtual < e.alturaSemTeclado - e.tecladoAltura * 0.5
}

export function paddingExtraDoTeclado(e: EntradaTeclado): number {
  if (!e.android || e.tecladoAltura <= 0) return 0
  return janelaRedimensionou(e) ? 0 : Math.round(e.tecladoAltura)
}

export interface EntradaRolagem {
  alturaConteudo: number   // altura do conteúdo rolável (já sem o espaço extra do teclado)
  alturaArea: number       // altura da área visível do ScrollView
  deslocamento: number     // posição atual da rolagem (y)
}

// Depois de fechar o teclado (ou ao voltar para a tela): para onde rolar, ou null se está tudo certo.
// Se o conteúdo cabe na área visível, volta ao topo; se não cabe mas a rolagem passou do fim, volta ao fim real.
export function rolagemAposFecharTeclado(e: EntradaRolagem): number | null {
  if (e.alturaArea <= 0 || e.alturaConteudo <= 0) return null
  if (e.alturaConteudo <= e.alturaArea + 1) return e.deslocamento > 0 ? 0 : null
  const maximo = e.alturaConteudo - e.alturaArea
  return e.deslocamento > maximo + 1 ? Math.max(0, Math.round(maximo)) : null
}

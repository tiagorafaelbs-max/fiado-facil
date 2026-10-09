import AsyncStorage from '@react-native-async-storage/async-storage'

// Marca que ESTE aparelho já teve uma conta (entrou ou criou). É o que decide entre a tela de boas-vindas
// ("Começar grátis") e o login quando não há sessão: aparelho novo vê as boas-vindas, nunca o login.
const CHAVE = '@fiado_ja_entrou'
// Aparelhos que já usavam o app antes desta chave existir: o tour só aparece depois do 1º login.
const CHAVE_TOUR_LEGADO = '@fiado_tour_ok'

export async function marcarAparelhoComConta(): Promise<void> {
  try { await AsyncStorage.setItem(CHAVE, '1') } catch { /* silencioso */ }
}

export async function aparelhoJaTeveConta(): Promise<boolean> {
  try {
    const [a, b] = await Promise.all([AsyncStorage.getItem(CHAVE), AsyncStorage.getItem(CHAVE_TOUR_LEGADO)])
    return a === '1' || b === '1'
  } catch {
    return false
  }
}

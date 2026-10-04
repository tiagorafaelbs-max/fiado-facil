import { Linking, Platform } from 'react-native'

const APP_STORE_ID = '6783416254'
const ANDROID_PACKAGE = 'com.fiadofacil.app'

// Abre a página do FiadoApp na loja certa (App Store no iOS, Google Play no Android).
// Tenta o esquema nativo da loja e, se o aparelho não abrir, cai para o endereço web.
export async function abrirPaginaDaLoja(): Promise<void> {
  const [nativo, web] = Platform.OS === 'ios'
    ? [`itms-apps://apps.apple.com/app/id${APP_STORE_ID}`, `https://apps.apple.com/app/id${APP_STORE_ID}`]
    : [`market://details?id=${ANDROID_PACKAGE}`, `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`]
  try {
    await Linking.openURL(nativo)
  } catch {
    await Linking.openURL(web).catch(() => {})
  }
}

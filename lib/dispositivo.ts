import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Application from 'expo-application'
import * as Updates from 'expo-updates'
import Constants from 'expo-constants'
import { supabase } from './supabase'

// Dados técnicos do app em uso, só para suporte e métricas (iOS × Android, quem está em versão antiga).
// De propósito NÃO inclui nada que identifique o aparelho (sem IMEI, ID de publicidade, modelo ou sistema).
export interface InfoApp {
  plataforma: 'ios' | 'android'
  versao_app: string | null        // versão do app instalado (a da loja), ex.: 1.0.12
  build: string | null             // número do build instalado (CFBundleVersion / versionCode)
  runtime_version: string | null   // identifica o binário nativo; é o que o update OTA precisa casar
  update_id: string | null         // ID do update OTA em uso (ou do embutido no build)
  canal: string | null             // canal do EAS Update (production)
}

export function lerInfoApp(): InfoApp | null {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null
  return {
    plataforma: Platform.OS,
    versao_app: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null,
    build: Application.nativeBuildVersion ?? null,
    runtime_version: Updates.runtimeVersion ?? null,
    update_id: Updates.updateId ?? null,
    canal: Updates.channel ?? null,
  }
}

const CHAVE_REGISTRO = '@fiado_dispositivo_registrado'
const INTERVALO_OK_MS = 3 * 60 * 60 * 1000    // mesmo estado: reaproveita por 3 h (também é a precisão do "último acesso")
const INTERVALO_ERRO_MS = 60 * 60 * 1000      // falhou (sem rede, tabela ainda não existe): tenta de novo em 1 h

// Grava (upsert) o registro do usuário logado — dono ou funcionário, cada um o seu. Silencioso: nunca
// atrapalha o app. Só escreve se mudou algo (versão, update OTA, usuário) ou se passaram 3 h.
export async function registrarDispositivo(): Promise<void> {
  try {
    const info = lerInfoApp()
    if (!info) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return

    const assinatura = [session.user.id, info.plataforma, info.versao_app, info.build, info.runtime_version, info.update_id].join('|')
    const bruto = await AsyncStorage.getItem(CHAVE_REGISTRO).catch(() => null)
    if (bruto) {
      const anterior = JSON.parse(bruto) as { assinatura: string; em: number; erro?: boolean }
      const limite = anterior.erro ? INTERVALO_ERRO_MS : INTERVALO_OK_MS
      if (anterior.assinatura === assinatura && Date.now() - anterior.em < limite) return
    }

    const { error } = await supabase
      .from('dispositivos_app')
      .upsert({ usuario_id: session.user.id, ...info }, { onConflict: 'usuario_id,plataforma' })
    await AsyncStorage.setItem(CHAVE_REGISTRO, JSON.stringify({ assinatura, em: Date.now(), erro: !!error })).catch(() => {})
  } catch {
    // suporte/métrica é opcional: falha em silêncio
  }
}

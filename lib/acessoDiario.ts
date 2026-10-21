import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'
import { diaDeSaoPaulo } from './instalacao'

// Acesso diário: 1 linha por conta por dia (dia de São Paulo, definido pelo SERVIDOR) em public.acessos_diarios, gravada ao
// abrir o app. Base de D1/D7/D30 reais e dias ativos por loja. Dono e funcionário gravam o PRÓPRIO acesso. Sem dado
// pessoal além do id da conta. Silencioso: nunca atrapalha o app. O banco recusa a linha repetida do mesmo dia (23505 =
// já gravado = sucesso); a marca local evita pedir de novo no mesmo dia.
const CHAVE = '@fiado_acesso_diario'
const REPETIR_ERRO_MS = 60 * 60 * 1000   // falhou (sem rede, tabela ainda não existe): tenta de novo em 1 h

interface Marca { marca: string; erroEm?: number }

export async function registrarAcessoDiario(usuarioId: string, plataforma: 'ios' | 'android'): Promise<void> {
  try {
    const marca = `${usuarioId}:${diaDeSaoPaulo()}`
    const bruto = await AsyncStorage.getItem(CHAVE).catch(() => null)
    if (bruto) {
      const anterior = JSON.parse(bruto) as Marca
      if (anterior.marca === marca && (!anterior.erroEm || Date.now() - anterior.erroEm < REPETIR_ERRO_MS)) return
    }
    const { error } = await supabase.from('acessos_diarios').insert({ usuario_id: usuarioId, plataforma })
    const ok = !error || error.code === '23505'
    const nova: Marca = ok ? { marca } : { marca, erroEm: Date.now() }
    await AsyncStorage.setItem(CHAVE, JSON.stringify(nova)).catch(() => {})
  } catch {
    // medição é opcional: falha em silêncio
  }
}

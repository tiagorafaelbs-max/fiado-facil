import { useCallback, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import type { PerfilCobranca } from '../lib/whatsapp'
import { useTenant } from './useTenant'

const COLUNAS = 'nome_negocio, chave_pix, plano, mensagem_cobranca_modelo'
// Se a coluna nova ainda não existir (OTA antes da migration), o select acima falha por inteiro.
const COLUNAS_SEM_MODELO = 'nome_negocio, chave_pix, plano'

const chaveCache = (tenantId: string) => `@fiado_perfil_cobranca:${tenantId}`

// Dados do negócio usados para montar a mensagem de cobrança (nome, Pix, plano e o modelo do dono).
// Funcionário recebe os do dono (RLS perfis_leitura_equipe). Guarda cópia local: sem internet a
// cobrança continua saindo com o modelo do lojista em vez de voltar ao texto padrão.
export function usePerfilCobranca(): PerfilCobranca | null {
  const { tenantId } = useTenant()
  const [perfil, setPerfil] = useState<PerfilCobranca | null>(null)
  const sequencia = useRef(0)

  // Recarrega ao voltar para a tela: o dono pode ter editado o modelo em Configurações.
  useFocusEffect(useCallback(() => {
    if (!tenantId) return
    const minha = ++sequencia.current
    ;(async () => {
      try {
        const bruto = await AsyncStorage.getItem(chaveCache(tenantId))
        if (bruto && minha === sequencia.current) setPerfil(JSON.parse(bruto) as PerfilCobranca)
      } catch { /* cache ilegível: ignora */ }

      let { data, error } = await supabase.from('perfis').select(COLUNAS).eq('id', tenantId).single()
      if (error) ({ data, error } = await supabase.from('perfis').select(COLUNAS_SEM_MODELO).eq('id', tenantId).single())
      if (error || !data || minha !== sequencia.current) return
      const novo = data as PerfilCobranca
      setPerfil(novo)
      AsyncStorage.setItem(chaveCache(tenantId), JSON.stringify(novo)).catch(() => {})
    })()
  }, [tenantId]))

  return perfil
}

// Atualiza a cópia local depois que o dono salva o modelo (a tela de edição chama isto).
export async function atualizarCachePerfilCobranca(tenantId: string, perfil: PerfilCobranca): Promise<void> {
  try { await AsyncStorage.setItem(chaveCache(tenantId), JSON.stringify(perfil)) } catch { /* ignora */ }
}

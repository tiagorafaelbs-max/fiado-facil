import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { CATEGORIAS } from '../constants'

const CACHE_KEY = '@fiado_categorias_custom'

export const CATS_BASE = [...CATEGORIAS] as string[]

export function useCategorias(usuarioId?: string) {
  const [extras, setExtras] = useState<string[]>([])

  const chave = usuarioId ? `${CACHE_KEY}_${usuarioId}` : CACHE_KEY

  useEffect(() => {
    // Carrega cache local imediatamente para resposta instantânea
    AsyncStorage.getItem(chave).then(raw => {
      if (raw) setExtras(JSON.parse(raw))
    })

    if (!usuarioId) return

    supabase
      .from('perfis')
      .select('categorias_extra')
      .eq('id', usuarioId)
      .single()
      .then(async ({ data }) => {
        const remoto: string[] = Array.isArray(data?.categorias_extra) ? data.categorias_extra : []
        const raw = await AsyncStorage.getItem(chave)
        const local: string[] = raw ? JSON.parse(raw) : []

        if (remoto.length > 0) {
          // Merge: une remoto + itens locais que não estão no remoto
          // (protege categorias criadas offline no dispositivo atual)
          const extras = local.filter(c => !remoto.includes(c))
          const merged = extras.length > 0 ? [...remoto, ...extras] : remoto
          setExtras(merged)
          await AsyncStorage.setItem(chave, JSON.stringify(merged))
          if (extras.length > 0) {
            try {
              await supabase.from('perfis').update({ categorias_extra: merged }).eq('id', usuarioId)
            } catch {
              // Falha de rede: merge local já salvo, tentará subir na próxima sessão
            }
          }
        } else if (local.length > 0) {
          // Supabase vazio (1ª vez após migration) — sobe dados locais
          try {
            await supabase.from('perfis').update({ categorias_extra: local }).eq('id', usuarioId)
          } catch {
            // Falha de rede: dado já está no AsyncStorage, tentará de novo na próxima sessão
          }
        }
      })
  }, [chave, usuarioId])

  async function salvar(lista: string[]) {
    setExtras(lista)
    await AsyncStorage.setItem(chave, JSON.stringify(lista))
    if (usuarioId) {
      try {
        await supabase.from('perfis').update({ categorias_extra: lista }).eq('id', usuarioId)
      } catch {
        // Falha de rede: dado salvo localmente, sincroniza na próxima abertura do app
      }
    }
  }

  const adicionar = useCallback(async (nome: string) => {
    const nova = nome.trim()
    if (nova.length < 2) return false
    const todas = [...CATS_BASE, ...extras]
    if (todas.some(c => c.toLowerCase() === nova.toLowerCase())) return false
    await salvar([...extras, nova])
    return true
  }, [extras, chave, usuarioId])

  const remover = useCallback(async (nome: string) => {
    await salvar(extras.filter(c => c !== nome))
  }, [extras, chave, usuarioId])

  const renomear = useCallback(async (antigo: string, novo: string) => {
    const novoNome = novo.trim()
    if (novoNome.length < 2) return false
    const todas = [...CATS_BASE, ...extras]
    if (todas.some(c => c.toLowerCase() === novoNome.toLowerCase() && c !== antigo)) return false
    await salvar(extras.map(c => c === antigo ? novoNome : c))
    return true
  }, [extras, chave, usuarioId])

  return {
    extras,
    todas: [...CATS_BASE, ...extras],
    adicionar,
    remover,
    renomear,
  }
}

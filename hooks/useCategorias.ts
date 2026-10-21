import { useState, useEffect, useCallback, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { CATEGORIAS } from '../constants'

const CACHE_KEY = '@fiado_categorias_custom'
const OCULTAS_KEY = '@fiado_categorias_ocultas'
const PENDENTES_KEY = '@fiado_categorias_pendentes'   // criadas sem conexão, ainda não enviadas
const SYNC_KEY = '@fiado_categorias_sync'              // depois da 1ª conciliação o servidor é a verdade (renomear/excluir valem em todos os aparelhos)

export const CATS_BASE = [...CATEGORIAS] as string[]
export const CATEGORIA_FIXA = 'Outro'   // destino das vendas/itens de categorias excluídas; não renomeia nem exclui

export interface UsoCategoria { vendas: number; itens: number }

async function lerLista(chave: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(chave)
    const v = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function comoLista(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function traduzirErro(msg: string | undefined): string {
  const m = msg ?? ''
  if (/network|fetch|timeout|abort|offline/i.test(m)) return 'Sem internet. Tente de novo quando estiver conectado.'
  if (/could not find the function|does not exist|PGRST202/i.test(m)) return 'Este recurso ainda não está disponível. Tente novamente em instantes.'
  return m || 'Não foi possível concluir. Tente novamente.'
}

export function useCategorias(usuarioId?: string) {
  const [extras, setExtras] = useState<string[]>([])
  const [ocultas, setOcultas] = useState<string[]>([])

  const sufixo = usuarioId ? `_${usuarioId}` : ''
  const kExtras = CACHE_KEY + sufixo
  const kOcultas = OCULTAS_KEY + sufixo
  const kPend = PENDENTES_KEY + sufixo
  const kSync = SYNC_KEY + sufixo

  const sequencia = useRef(0)   // resposta de um carregar() antigo não pode sobrescrever a de um mais novo
  const carregar = useCallback(async () => {
    const minha = ++sequencia.current
    // cache local primeiro: resposta instantânea (e o único dado sem internet)
    const [localExtras, localOcultas] = await Promise.all([lerLista(kExtras), lerLista(kOcultas)])
    setExtras(localExtras)
    setOcultas(localOcultas)
    if (!usuarioId) return
    try {
      let data: any
      const q1 = await supabase.from('perfis').select('categorias_extra, categorias_ocultas').eq('id', usuarioId).single()
      if (q1.error) {
        // banco ainda sem a coluna nova: segue só com as categorias do lojista
        const q2 = await supabase.from('perfis').select('categorias_extra').eq('id', usuarioId).single()
        if (q2.error) return
        data = q2.data
      } else {
        data = q1.data
      }
      if (!data || minha !== sequencia.current) return
      const remoto = comoLista(data.categorias_extra)
      const remotoOcultas = comoLista(data.categorias_ocultas)
      const sincronizado = (await AsyncStorage.getItem(kSync)) === '1'
      const pendentes = await lerLista(kPend)
      // 1ª vez: sobe o que só existe neste aparelho. Depois: o servidor manda; só sobem as criadas sem conexão.
      const aSubir = (sincronizado ? pendentes : localExtras).filter(c => !remoto.includes(c))
      const finais = aSubir.length > 0 ? [...remoto, ...aSubir] : remoto
      setExtras(finais)
      setOcultas(remotoOcultas)
      await AsyncStorage.setItem(kExtras, JSON.stringify(finais))
      await AsyncStorage.setItem(kOcultas, JSON.stringify(remotoOcultas))
      if (aSubir.length > 0) {
        let enviou = false
        try {
          const { error } = await supabase.from('perfis').update({ categorias_extra: finais }).eq('id', usuarioId)
          enviou = !error
        } catch {
          // sem rede: continua pendente
        }
        if (enviou) await AsyncStorage.removeItem(kPend)
        else await AsyncStorage.setItem(kPend, JSON.stringify(aSubir))
      }
      await AsyncStorage.setItem(kSync, '1')
    } catch {
      // sem rede: fica com o cache
    }
  }, [kExtras, kOcultas, kPend, kSync, usuarioId])

  useEffect(() => { carregar() }, [carregar])

  async function salvarExtras(lista: string[]): Promise<boolean> {
    setExtras(lista)
    await AsyncStorage.setItem(kExtras, JSON.stringify(lista))
    if (!usuarioId) return true
    try {
      const { error } = await supabase.from('perfis').update({ categorias_extra: lista }).eq('id', usuarioId)
      if (error) { console.warn('[useCategorias] Falha ao salvar:', error.message); return false }
      return true
    } catch {
      return false   // sem rede: fica salvo no aparelho e sobe na próxima abertura
    }
  }

  const visiveisBase = CATS_BASE.filter(c => !ocultas.includes(c))
  const todas = [...visiveisBase, ...extras]

  // chamada de função do servidor (renomear/excluir mexem em vendas, itens e perfil de uma vez só)
  async function chamar(nome: string, args: Record<string, unknown>): Promise<any> {
    try {
      const { data, error } = await supabase.rpc(nome, args)
      if (error) throw new Error(traduzirErro(error.message))
      return data
    } catch (e: any) {
      throw new Error(traduzirErro(e?.message))
    }
  }

  const adicionar = useCallback(async (nome: string) => {
    const nova = nome.trim()
    if (nova.length < 2 || nova.length > 30) return false
    const baseOculta = CATS_BASE.find(c => c.toLowerCase() === nova.toLowerCase() && ocultas.includes(c))
    if (baseOculta) {   // era uma padrão escondida: só volta a aparecer
      await chamar('mostrar_categoria', { p_nome: baseOculta })
      await carregar()
      return true
    }
    if ([...visiveisBase, ...extras].some(c => c.toLowerCase() === nova.toLowerCase())) return false
    const ok = await salvarExtras([...extras, nova])
    if (!ok) await AsyncStorage.setItem(kPend, JSON.stringify([...(await lerLista(kPend)), nova]))
    return true
  }, [extras, ocultas, kExtras, kPend, usuarioId, carregar])

  /** Quantas vendas e itens usam a categoria (para a confirmação antes de excluir). */
  const contar = useCallback(async (nome: string): Promise<UsoCategoria> => {
    const d = await chamar('contar_categoria', { p_nome: nome })
    return { vendas: Number(d?.vendas ?? 0), itens: Number(d?.itens ?? 0) }
  }, [])

  /** Renomeia no servidor: vendas e itens da categoria passam para o nome novo. Lança erro em português se não der. */
  const renomear = useCallback(async (antigo: string, novo: string): Promise<UsoCategoria> => {
    const d = await chamar('renomear_categoria', { p_antigo: antigo, p_novo: novo.trim() })
    await carregar()
    return { vendas: Number(d?.vendas ?? 0), itens: Number(d?.itens ?? 0) }
  }, [carregar])

  /** Exclui no servidor: vendas e itens vão para "Outro". Padrão excluída = fica oculta. */
  const remover = useCallback(async (nome: string): Promise<UsoCategoria> => {
    const d = await chamar('excluir_categoria', { p_nome: nome })
    await carregar()
    return { vendas: Number(d?.vendas ?? 0), itens: Number(d?.itens ?? 0) }
  }, [carregar])

  const mostrar = useCallback(async (nome: string) => {
    await chamar('mostrar_categoria', { p_nome: nome })
    await carregar()
  }, [carregar])

  return {
    extras,
    ocultas: CATS_BASE.filter(c => ocultas.includes(c)),
    todas,
    carregar,
    adicionar,
    contar,
    renomear,
    remover,
    mostrar,
  }
}

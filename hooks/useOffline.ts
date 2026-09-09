import { useState, useEffect, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { supabase } from '../lib/supabase'

const FILA_KEY = '@fiado_fila_offline'

interface OperacaoOffline {
  id: string
  tabela: string
  operacao: 'insert' | 'update' | 'delete'
  dados: Record<string, any>
  criado_em: string
}

export async function enfileirarOperacao(op: Omit<OperacaoOffline, 'id' | 'criado_em'>) {
  const fila = await carregarFila()
  const nova: OperacaoOffline = {
    ...op,
    id: Math.random().toString(36).slice(2),
    criado_em: new Date().toISOString(),
  }
  await AsyncStorage.setItem(FILA_KEY, JSON.stringify([...fila, nova]))
}

async function carregarFila(): Promise<OperacaoOffline[]> {
  try {
    const raw = await AsyncStorage.getItem(FILA_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

async function sincronizarFila(): Promise<number> {
  const fila = await carregarFila()
  if (fila.length === 0) return 0

  let sincronizados = 0
  const restantes: OperacaoOffline[] = []

  for (const op of fila) {
    try {
      if (op.operacao === 'insert') {
        // Remove o id local (não é UUID válido) — Supabase gera o UUID real ao inserir
        const { id: localId, ...dadosSemId } = op.dados
        const payload = typeof localId === 'string' && localId.startsWith('local_') ? dadosSemId : op.dados
        const { error } = await supabase.from(op.tabela).insert(payload)
        if (error) throw error
      } else if (op.operacao === 'update') {
        const { id, ...dados } = op.dados
        const { error } = await supabase.from(op.tabela).update(dados).eq('id', id)
        if (error) throw error
      } else if (op.operacao === 'delete') {
        const { error } = await supabase.from(op.tabela).delete().eq('id', op.dados.id)
        if (error) throw error
      }
      sincronizados++
    } catch {
      restantes.push(op)
    }
  }

  await AsyncStorage.setItem(FILA_KEY, JSON.stringify(restantes))
  return sincronizados
}

export async function verificarConectividade(): Promise<boolean> {
  try {
    // Usa AbortController manual — compatível com Hermes/Android
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    await fetch('https://www.google.com', { method: 'HEAD', signal: controller.signal })
    clearTimeout(timer)
    return true
  } catch {
    return false
  }
}

export function useOffline() {
  const [online, setOnline] = useState(true)
  const [pendentes, setPendentes] = useState(0)
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Atualiza contagem de pendentes
  const atualizarPendentes = async () => {
    const fila = await carregarFila()
    setPendentes(fila.length)
    return fila.length
  }

  useEffect(() => {
    if (Platform.OS === 'web') {
      const atualizar = () => setOnline(navigator.onLine)
      window.addEventListener('online', atualizar)
      window.addEventListener('offline', atualizar)
      setOnline(navigator.onLine)
      atualizarPendentes()
      return () => {
        window.removeEventListener('online', atualizar)
        window.removeEventListener('offline', atualizar)
      }
    }

    // Nativo: checar imediatamente + poll a cada 10s
    const verificar = async () => {
      const conectado = await verificarConectividade()
      setOnline(conectado)
    }

    verificar() // check imediato — sem esperar 10s para saber se está offline
    intervaloRef.current = setInterval(verificar, 10000)
    atualizarPendentes()

    return () => { if (intervaloRef.current) clearInterval(intervaloRef.current) }
  }, [])

  // Ao voltar online: sempre tenta sincronizar fila
  useEffect(() => {
    if (!online) return
    const tentar = async () => {
      const qtd = await atualizarPendentes()
      if (qtd > 0) {
        await sincronizarFila()
        await atualizarPendentes()
      }
    }
    tentar()
  }, [online])

  return { online, pendentes }
}

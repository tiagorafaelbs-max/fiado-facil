import { useCallback, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { ordenarPorUso, type ItemCadastrado } from '../lib/itensVenda'

// Itens do comerciante (tabela public.itens). Todos da loja leem (dono e funcionários); só o dono cria/edita (RLS).
// Offline: usa a última cópia deste aparelho. Se a tabela ainda não existe no servidor (migration não aplicada), `disponivel`
// fica false e a tela Nova venda segue exatamente como antes (categorias).
const CHAVE_LISTA = '@fiado_itens_'
const CHAVE_USO = '@fiado_itens_uso_'

function tabelaAusente(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false
  return e.code === 'PGRST205' || e.code === '42P01' || /relation .*itens.* does not exist|Could not find the table/i.test(e.message ?? '')
}

export function useItens(tenantId?: string) {
  const [todos, setTodos] = useState<ItemCadastrado[]>([])
  const [uso, setUso] = useState<Record<string, number>>({})
  const [disponivel, setDisponivel] = useState(true)
  const [carregando, setCarregando] = useState(false)

  const carregar = useCallback(async () => {
    if (!tenantId) return
    setCarregando(true)
    try {
      const bruto = await AsyncStorage.getItem(CHAVE_LISTA + tenantId).catch(() => null)
      if (bruto) setTodos(JSON.parse(bruto))
      const u = await AsyncStorage.getItem(CHAVE_USO + tenantId).catch(() => null)
      if (u) setUso(JSON.parse(u))

      const { data, error } = await supabase
        .from('itens').select('id, nome, preco, categoria, ativo, ordem')
        .eq('usuario_id', tenantId).order('ordem', { ascending: true }).order('criado_em', { ascending: true })
      if (error) {
        if (tabelaAusente(error)) { setDisponivel(false); setTodos([]) }
        return   // outro erro (rede): fica com a cópia local
      }
      setDisponivel(true)
      const lista: ItemCadastrado[] = (data ?? []).map(i => ({
        id: i.id, nome: i.nome, preco: i.preco === null || i.preco === undefined ? null : Number(i.preco),
        categoria: i.categoria, ativo: i.ativo, ordem: i.ordem,
      }))
      setTodos(lista)
      AsyncStorage.setItem(CHAVE_LISTA + tenantId, JSON.stringify(lista)).catch(() => {})
    } catch {
      // sem rede: cópia local
    } finally {
      setCarregando(false)
    }
  }, [tenantId])

  useEffect(() => { carregar() }, [carregar])

  const ativos = useMemo(() => todos.filter(i => i.ativo), [todos])
  const ativosPorUso = useMemo(() => ordenarPorUso(ativos, uso), [ativos, uso])

  // "Mais usados primeiro": conta local (por aparelho) de quantas vendas usaram cada item.
  const registrarUso = useCallback(async (ids: string[]) => {
    if (!tenantId || ids.length === 0) return
    const novo = { ...uso }
    for (const id of ids) novo[id] = (novo[id] ?? 0) + 1
    setUso(novo)
    AsyncStorage.setItem(CHAVE_USO + tenantId, JSON.stringify(novo)).catch(() => {})
  }, [tenantId, uso])

  // --- só o dono (a RLS recusa o resto) ---
  const criar = useCallback(async (dados: { nome: string; preco: number | null; categoria: string }) => {
    if (!tenantId) throw new Error('Sessão expirada. Faça login novamente.')
    const ordem = todos.reduce((m, i) => Math.max(m, i.ordem), 0) + 1
    const { error } = await supabase.from('itens').insert({ usuario_id: tenantId, nome: dados.nome, preco: dados.preco, categoria: dados.categoria, ordem })
    if (error) throw new Error(traduzir(error))
    await carregar()
  }, [tenantId, todos, carregar])

  const editar = useCallback(async (id: string, dados: Partial<{ nome: string; preco: number | null; categoria: string; ativo: boolean }>) => {
    const { error } = await supabase.from('itens').update(dados).eq('id', id)
    if (error) throw new Error(traduzir(error))
    await carregar()
  }, [carregar])

  // Troca de lugar com o vizinho (para cima/para baixo) entre os ATIVOS.
  const mover = useCallback(async (id: string, direcao: -1 | 1) => {
    const lista = [...ativos].sort((a, b) => a.ordem - b.ordem)
    const i = lista.findIndex(x => x.id === id)
    const j = i + direcao
    if (i < 0 || j < 0 || j >= lista.length) return
    const a = lista[i], b = lista[j]
    // ordens iguais (itens antigos sem ordem): reatribui 1..n para garantir a troca
    const base = lista.map((x, k) => ({ id: x.id, ordem: k + 1 }))
    const oa = base[i].ordem, ob = base[j].ordem
    const resultados = await Promise.all([
      supabase.from('itens').update({ ordem: ob }).eq('id', a.id),
      supabase.from('itens').update({ ordem: oa }).eq('id', b.id),
    ])
    const erro = resultados.find(r => r.error)?.error
    if (erro) throw new Error(traduzir(erro))
    await carregar()
  }, [ativos, carregar])

  return { todos, ativos, ativosPorUso, disponivel, carregando, carregar, registrarUso, criar, editar, mover }
}

function traduzir(e: { code?: string; message?: string }): string {
  if (e.code === '23505') return 'Você já tem um item ativo com esse nome.'
  if (/Limite de 10 itens/i.test(e.message ?? '')) return 'Você atingiu o limite de 10 itens do plano gratuito. Faça upgrade para o Pro e tenha itens ilimitados.'
  if (e.code === '42501') return 'Só o dono do negócio pode alterar os itens.'
  if (tabelaAusente(e)) return 'O cadastro de itens ainda não está disponível. Tente de novo mais tarde.'
  return 'Não foi possível salvar agora. Verifique a conexão e tente de novo.'
}

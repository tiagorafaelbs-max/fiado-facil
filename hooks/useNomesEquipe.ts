import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTenant } from './useTenant'

// id do funcionário -> nome, para o selo "registrado por". Inclui funcionários já desativados: o
// lançamento antigo dele continua mostrando de quem foi. O dono lê todos (policy membros_equipe_dono);
// o funcionário só lê o próprio registro (membros_equipe_proprio), então vê só o próprio nome.
export function useEquipe(): { nomes: Record<string, string>; desativados: ReadonlySet<string> } {
  const { tenantId } = useTenant()
  const [nomes, setNomes] = useState<Record<string, string>>({})
  const [desativados, setDesativados] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    if (!tenantId) return
    let ativo = true
    supabase.from('membros_equipe').select('membro_id, nome, status').eq('dono_id', tenantId)
      .then(({ data }) => {
        if (!ativo || !data) return
        setNomes(Object.fromEntries(data.map(m => [m.membro_id, m.nome])))
        setDesativados(new Set(data.filter(m => m.status !== 'ativo').map(m => m.membro_id)))
      })
    return () => { ativo = false }
  }, [tenantId])

  return { nomes, desativados }
}

export function useNomesEquipe(): Record<string, string> {
  return useEquipe().nomes
}

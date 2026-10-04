import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTenant } from './useTenant'

// id do funcionário -> nome, para o selo "registrado por". Inclui funcionários já desativados: o
// lançamento antigo dele continua mostrando de quem foi. O dono lê todos (policy membros_equipe_dono);
// o funcionário só lê o próprio registro (membros_equipe_proprio), então vê só o próprio nome.
export function useNomesEquipe(): Record<string, string> {
  const { tenantId } = useTenant()
  const [nomes, setNomes] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!tenantId) return
    let ativo = true
    supabase.from('membros_equipe').select('membro_id, nome').eq('dono_id', tenantId)
      .then(({ data }) => {
        if (ativo && data) setNomes(Object.fromEntries(data.map(m => [m.membro_id, m.nome])))
      })
    return () => { ativo = false }
  }, [tenantId])

  return nomes
}

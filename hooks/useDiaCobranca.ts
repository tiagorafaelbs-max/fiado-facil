import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTenant } from './useTenant'

// dia_cobranca do perfil do negócio (usado pelo vencimento padrão das vendas). Se não
// carregar (offline, perfil sem o campo), fica null e o padrão cai para hoje + 30 dias.
export function useDiaCobranca(): number | null {
  const { tenantId } = useTenant()
  const [dia, setDia] = useState<number | null>(null)

  useEffect(() => {
    if (!tenantId) return
    let ativo = true
    supabase.from('perfis').select('dia_cobranca').eq('id', tenantId).single()
      .then(({ data }) => { if (ativo && typeof data?.dia_cobranca === 'number') setDia(data.dia_cobranca) })
    return () => { ativo = false }
  }, [tenantId])

  return dia
}

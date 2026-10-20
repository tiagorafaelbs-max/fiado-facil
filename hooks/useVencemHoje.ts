import { useCallback, useRef, useState } from 'react'
import { buscarVencemHoje, type VencimentoDoDia } from '../lib/vencemHoje'

// Quadro "Vencem hoje" da tela Início. Só o dono vê valores por cliente (mesma regra dos totais). Recarrega quando a tela ganha
// foco. Falha/offline mantém o que já estava (ou lista vazia) e nunca atrapalha a tela.
export function useVencemHoje(tenantId: string, podeVer: boolean) {
  const [lista, setLista] = useState<VencimentoDoDia[]>([])
  const sequencia = useRef(0)

  const recarregar = useCallback(async () => {
    if (!podeVer || !tenantId) { setLista([]); return }
    const minha = ++sequencia.current
    try {
      const nova = await buscarVencemHoje(tenantId)
      if (minha === sequencia.current) setLista(nova)
    } catch {
      // mantém a lista anterior
    }
  }, [tenantId, podeVer])

  return { lista, recarregar }
}

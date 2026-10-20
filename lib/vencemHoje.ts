import { supabase } from './supabase'
import { montarItensExtrato } from './extrato'
import { dataParaISO } from './vencimento'

// Quem tem parcela/venda com vencimento NO DIA (hoje, ou os próximos dias para as notificações das 8h) e quanto vence
// em cada dia: o que ainda FALTA de cada venda depois dos pagamentos (mesma alocação do banco, lib/alocacao.ts via
// montarItensExtrato), NÃO o saldo total do cliente. Só vale vencimento REAL (data_vencimento); venda "sem vencimento"
// nunca entra (mesma regra de "vencida": não repete o bug do vencido fantasma). A ordem/quitação FIFO usa o vencimento
// efetivo de lib/vencimento.ts dentro de alocarPagamentos.
export interface VencimentoDoDia {
  clienteId: string
  nome: string
  telefone?: string
  valor: number          // o que vence NESTE dia (não o saldo total)
  saldoDevedor: number   // saldo total do cliente (só para a mensagem de cobrança)
}

const LIMITE = 1000
const BLOCO = 20
const cent = (n: number) => Math.round(n * 100)

export async function buscarVencimentosDoPeriodo(
  tenantId: string,
  deISO: string,
  ateISO: string,
): Promise<Record<string, VencimentoDoDia[]>> {
  const porDia: Record<string, VencimentoDoDia[]> = {}
  const hojeISO = dataParaISO(new Date())
  const trabalho = async () => {
    const { data: ven, error } = await supabase
      .from('vendas').select('cliente_id')
      .eq('usuario_id', tenantId).gte('data_vencimento', deISO).lte('data_vencimento', ateISO).limit(LIMITE)
    if (error || !ven?.length) return
    const ids = [...new Set(ven.map(v => v.cliente_id as string))].slice(0, 200)

    const clientes = new Map<string, { nome: string; telefone?: string; saldo: number }>()
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await supabase
        .from('clientes_com_saldo').select('id, nome, telefone, saldo_devedor')
        .eq('usuario_id', tenantId).eq('ativo', true).gt('saldo_devedor', 0).in('id', ids.slice(i, i + 100))
      for (const c of data ?? []) clientes.set(c.id, { nome: c.nome, telefone: c.telefone ?? undefined, saldo: c.saldo_devedor ?? 0 })
    }
    const comSaldo = [...clientes.keys()]
    for (let i = 0; i < comSaldo.length; i += BLOCO) {
      const bloco = comSaldo.slice(i, i + BLOCO)
      const [rv, rp] = await Promise.all([
        supabase.from('vendas').select('id, cliente_id, descricao, valor, data_venda, data_vencimento').eq('usuario_id', tenantId).in('cliente_id', bloco).limit(LIMITE),
        supabase.from('pagamentos').select('cliente_id, valor, venda_id').eq('usuario_id', tenantId).in('cliente_id', bloco).limit(LIMITE),
      ])
      // sem os dados completos não dá para alocar com segurança: esse bloco fica de fora (nunca mostra valor errado)
      if (rv.error || rp.error || (rv.data?.length ?? 0) >= LIMITE || (rp.data?.length ?? 0) >= LIMITE) continue
      for (const id of bloco) {
        const resumo = montarItensExtrato(
          (rv.data ?? []).filter(v => v.cliente_id === id),
          (rp.data ?? []).filter(p => p.cliente_id === id),
          hojeISO,
        )
        const somaPorDia = new Map<string, number>()
        for (const item of resumo.itens) {
          if (!item.vencimento || item.vencimento < deISO || item.vencimento > ateISO) continue
          somaPorDia.set(item.vencimento, (somaPorDia.get(item.vencimento) ?? 0) + cent(item.falta))
        }
        const c = clientes.get(id)!
        for (const [dia, c100] of somaPorDia) {
          if (c100 <= 0) continue
          ;(porDia[dia] ??= []).push({ clienteId: id, nome: c.nome, telefone: c.telefone, valor: c100 / 100, saldoDevedor: c.saldo })
        }
      }
    }
    for (const dia of Object.keys(porDia)) porDia[dia].sort((a, b) => b.valor - a.valor)
  }
  try {
    // rede lenta não pode travar a tela: espera no máximo 6 s e usa o que já veio
    await Promise.race([trabalho(), new Promise<void>(resolve => setTimeout(resolve, 6000))])
  } catch {
    // sem rede: lista vazia
  }
  return porDia
}

export async function buscarVencemHoje(tenantId: string): Promise<VencimentoDoDia[]> {
  const hoje = dataParaISO(new Date())
  const porDia = await buscarVencimentosDoPeriodo(tenantId, hoje, hoje)
  return porDia[hoje] ?? []
}

import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { formatarMoeda } from './validacao'
import type { Cliente, Venda } from '../types'

interface Pagamento {
  id: string; valor: number; data_pagamento: string; observacao?: string
}

export async function gerarExtratoCliente(
  cliente: Cliente,
  vendas: Venda[],
  pagamentos: Pagamento[],
  nomeNegocio: string,
) {
  const hoje = new Date().toLocaleDateString('pt-BR')

  const linhasVendas = vendas.map(v => `
    <tr>
      <td>${new Date(v.data_venda).toLocaleDateString('pt-BR')}</td>
      <td>${v.descricao}</td>
      <td>${v.categoria ?? ''}</td>
      <td style="color:#EF4444;font-weight:700">- ${formatarMoeda(v.valor)}</td>
    </tr>`).join('')

  const linhasPagamentos = pagamentos.map(p => `
    <tr>
      <td>${new Date(p.data_pagamento).toLocaleDateString('pt-BR')}</td>
      <td>Pagamento recebido${p.observacao ? ` — ${p.observacao}` : ''}</td>
      <td>—</td>
      <td style="color:#00A651;font-weight:700">+ ${formatarMoeda(p.valor)}</td>
    </tr>`).join('')

  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  body{font-family:Arial,sans-serif;padding:32px;color:#1A2332;font-size:14px}
  h1{color:#00A651;font-size:22px;margin-bottom:4px}
  .sub{color:#6B7280;font-size:13px;margin-bottom:24px}
  table{width:100%;border-collapse:collapse;margin-top:16px}
  th{background:#F2F5F9;padding:10px;text-align:left;font-size:12px;color:#6B7280;text-transform:uppercase}
  td{padding:10px;border-bottom:1px solid #E8ECF2;font-size:13px}
  .saldo{font-size:20px;font-weight:700;padding:16px;border-radius:10px;margin:20px 0}
  .devendo{background:#FEF2F2;color:#EF4444}
  .ok{background:#E8F5EE;color:#00A651}
  .rodape{margin-top:32px;font-size:11px;color:#9CA3AF;text-align:center}
</style></head><body>
<h1>${nomeNegocio}</h1>
<div class="sub">Extrato gerado em ${hoje}</div>
<h2 style="font-size:16px">${cliente.nome}</h2>
${cliente.telefone ? `<p style="color:#6B7280">📱 ${cliente.telefone}</p>` : ''}
<div class="saldo ${(cliente.saldo_devedor ?? 0) > 0 ? 'devendo' : 'ok'}">
  Saldo devedor: ${formatarMoeda(cliente.saldo_devedor ?? 0)}
</div>
<table>
  <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th></tr></thead>
  <tbody>${linhasVendas}${linhasPagamentos}</tbody>
</table>
<div class="rodape">FiadoApp — Controle de vendas no fiado</div>
</body></html>`

  const { uri } = await Print.printToFileAsync({ html })
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Extrato ${cliente.nome}` })
}

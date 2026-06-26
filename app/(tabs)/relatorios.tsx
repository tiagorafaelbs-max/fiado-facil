import { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, RefreshControl, ActivityIndicator, Platform, Alert
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useModulos } from '../../hooks/useModulos'
import { Avatar } from '../../components/ui/Avatar'
import { formatarMoeda } from '../../lib/validacao'
import { C } from '../../constants/colors'
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subYears, parse, isValid, getMonth, getYear } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'

type Periodo = 'hoje' | 'mes_atual' | 'mes_anterior' | 'ano_atual' | 'ano_anterior' | 'total' | 'personalizado'

interface TransacaoDetalhada {
  tipo: 'venda' | 'pagamento'
  data: string
  clienteNome: string
  descricao?: string
  categoria?: string
  valor: number
}

interface MesResumo {
  mes: number
  label: string
  vendido: number
  recebido: number
}

interface ResumoRelatorio {
  totalVendido: number
  totalRecebido: number
  totalEmAberto: number
  quantidadeVendas: number
  maioresDevedores: { nome: string; saldo: number; telefone?: string }[]
  melhoresClientes: { nome: string; total: number }[]
  porCategoria: { categoria: string; total: number; clientes: { nome: string; total: number }[] }[]
  evolucaoMensal?: MesResumo[]
}

function medalha(i: number) {
  if (i === 0) return '🥇'
  if (i === 1) return '🥈'
  if (i === 2) return '🥉'
  return `${i + 1}º`
}

function mascaraData(val: string): string {
  const nums = val.replace(/\D/g, '').slice(0, 8)
  if (nums.length <= 2) return nums
  if (nums.length <= 4) return `${nums.slice(0, 2)}/${nums.slice(2)}`
  return `${nums.slice(0, 2)}/${nums.slice(2, 4)}/${nums.slice(4)}`
}

function parseDDMMYYYY(val: string): string | null {
  if (val.length !== 10) return null
  const d = parse(val, 'dd/MM/yyyy', new Date())
  if (!isValid(d)) return null
  return format(d, 'yyyy-MM-dd')
}

export default function RelatoriosScreen() {
  const { usuario } = useAuth()
  const { modulos } = useModulos(usuario?.id)
  const [periodo, setPeriodo] = useState<Periodo>('hoje')
  const [dataCustom, setDataCustom] = useState('')
  const [resumo, setResumo] = useState<ResumoRelatorio | null>(null)
  const [transacoes, setTransacoes] = useState<TransacaoDetalhada[]>([])
  const [carregando, setCarregando] = useState(false)

  async function buscar() {
    setCarregando(true)
    try {
      let dataInicio: string | undefined
      let dataFim: string | undefined
      const hoje = new Date()

      if (periodo === 'hoje') {
        dataInicio = format(hoje, 'yyyy-MM-dd')
        dataFim = format(hoje, 'yyyy-MM-dd')
      } else if (periodo === 'mes_atual') {
        dataInicio = format(startOfMonth(hoje), 'yyyy-MM-dd')
        dataFim = format(endOfMonth(hoje), 'yyyy-MM-dd')
      } else if (periodo === 'mes_anterior') {
        const mes = subMonths(hoje, 1)
        dataInicio = format(startOfMonth(mes), 'yyyy-MM-dd')
        dataFim = format(endOfMonth(mes), 'yyyy-MM-dd')
      } else if (periodo === 'ano_atual') {
        dataInicio = format(startOfYear(hoje), 'yyyy-MM-dd')
        dataFim = format(endOfYear(hoje), 'yyyy-MM-dd')
      } else if (periodo === 'ano_anterior') {
        const anoAnterior = subYears(hoje, 1)
        dataInicio = format(startOfYear(anoAnterior), 'yyyy-MM-dd')
        dataFim = format(endOfYear(anoAnterior), 'yyyy-MM-dd')
      } else if (periodo === 'personalizado') {
        const dia = parseDDMMYYYY(dataCustom)
        if (!dia) { setCarregando(false); return }
        dataInicio = dia
        dataFim = dia
      }

      let qVendas = supabase.from('vendas').select('id, valor, cliente_id, categoria, descricao, data_venda, clientes(nome)')
      let qPagamentos = supabase.from('pagamentos').select('id, valor, cliente_id, data_pagamento, clientes(nome)')

      if (dataInicio && dataFim) {
        qVendas = qVendas.gte('data_venda', dataInicio).lte('data_venda', dataFim)
        qPagamentos = qPagamentos.gte('data_pagamento', dataInicio).lte('data_pagamento', dataFim)
      }

      const [{ data: vendas }, { data: pagamentos }, { data: devedores }] = await Promise.all([
        qVendas.order('data_venda', { ascending: false }),
        qPagamentos.order('data_pagamento', { ascending: false }),
        supabase
          .from('clientes_com_saldo')
          .select('nome, saldo_devedor, telefone')
          .gt('saldo_devedor', 0)
          .order('saldo_devedor', { ascending: false })
          .limit(5),
      ])

      const totalVendido = (vendas ?? []).reduce((acc, v) => acc + v.valor, 0)
      const totalRecebido = (pagamentos ?? []).reduce((acc, p) => acc + p.valor, 0)

      const totaisPorCliente: Record<string, { nome: string; total: number }> = {}
      for (const v of (vendas ?? [])) {
        const id = v.cliente_id
        const nome = (v.clientes as any)?.nome ?? 'Desconhecido'
        if (!totaisPorCliente[id]) totaisPorCliente[id] = { nome, total: 0 }
        totaisPorCliente[id].total += v.valor
      }
      const melhoresClientes = Object.values(totaisPorCliente)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)

      // Ranking por categoria
      const catMap: Record<string, { total: number; clientes: Record<string, { nome: string; total: number }> }> = {}
      for (const v of (vendas ?? [])) {
        const cat = v.categoria ?? 'Outro'
        const id = v.cliente_id
        const nome = (v.clientes as any)?.nome ?? 'Desconhecido'
        if (!catMap[cat]) catMap[cat] = { total: 0, clientes: {} }
        catMap[cat].total += v.valor
        if (!catMap[cat].clientes[id]) catMap[cat].clientes[id] = { nome, total: 0 }
        catMap[cat].clientes[id].total += v.valor
      }
      const porCategoria = Object.entries(catMap)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([categoria, { total, clientes }]) => ({
          categoria,
          total,
          clientes: Object.values(clientes).sort((a, b) => b.total - a.total).slice(0, 3),
        }))

      // Evolução mensal (só para períodos anuais)
      let evolucaoMensal: MesResumo[] | undefined
      if (periodo === 'ano_atual' || periodo === 'ano_anterior') {
        const ano = periodo === 'ano_atual' ? getYear(hoje) : getYear(subYears(hoje, 1))
        const mesAtual = periodo === 'ano_atual' ? getMonth(hoje) : 11
        const mesesMap: Record<number, MesResumo> = {}
        for (let m = 0; m <= mesAtual; m++) {
          mesesMap[m] = {
            mes: m,
            label: format(new Date(ano, m, 1), 'MMM', { locale: ptBR }),
            vendido: 0,
            recebido: 0,
          }
        }
        for (const v of (vendas ?? [])) {
          const d = new Date(v.data_venda + 'T12:00:00')
          if (getYear(d) === ano) {
            const m = getMonth(d)
            if (mesesMap[m]) mesesMap[m].vendido += v.valor
          }
        }
        for (const p of (pagamentos ?? [])) {
          const d = new Date(p.data_pagamento + 'T12:00:00')
          if (getYear(d) === ano) {
            const m = getMonth(d)
            if (mesesMap[m]) mesesMap[m].recebido += p.valor
          }
        }
        evolucaoMensal = Object.values(mesesMap)
      }

      setResumo({
        totalVendido,
        totalRecebido,
        totalEmAberto: totalVendido - totalRecebido,
        quantidadeVendas: (vendas ?? []).length,
        maioresDevedores: (devedores ?? []).map((c) => ({ nome: c.nome, saldo: c.saldo_devedor ?? 0, telefone: c.telefone })),
        melhoresClientes,
        porCategoria,
        evolucaoMensal,
      })

      const listaTransacoes: TransacaoDetalhada[] = [
        ...(vendas ?? []).map((v) => ({
          tipo: 'venda' as const,
          data: v.data_venda,
          clienteNome: (v.clientes as any)?.nome ?? 'Desconhecido',
          descricao: v.descricao,
          categoria: v.categoria,
          valor: v.valor,
        })),
        ...(pagamentos ?? []).map((p) => ({
          tipo: 'pagamento' as const,
          data: p.data_pagamento,
          clienteNome: (p.clientes as any)?.nome ?? 'Desconhecido',
          valor: p.valor,
        })),
      ].sort((a, b) => b.data.localeCompare(a.data))
      setTransacoes(listaTransacoes)
    } finally {
      setCarregando(false)
    }
  }

  useFocusEffect(useCallback(() => {
    if (periodo !== 'personalizado') buscar()
  }, [periodo]))

  const PERIODOS: { key: Periodo; label: string }[] = [
    { key: 'hoje', label: 'Hoje' },
    { key: 'mes_atual', label: 'Este mês' },
    { key: 'mes_anterior', label: 'Mês anterior' },
    { key: 'ano_atual', label: `Ano ${new Date().getFullYear()}` },
    { key: 'ano_anterior', label: `Ano ${new Date().getFullYear() - 1}` },
    { key: 'total', label: 'Total geral' },
    { key: 'personalizado', label: '📅 Data específica' },
  ]

  const taxaRecebimento = resumo && resumo.totalVendido > 0
    ? Math.round((resumo.totalRecebido / resumo.totalVendido) * 100)
    : null

  async function exportarPDF() {
    if (!resumo) return
    const periodoLabel = PERIODOS.find(p => p.key === periodo)?.label ?? periodo
    const dataGeracao = format(new Date(), "dd/MM/yyyy 'às' HH:mm")

    const linhasTransacoes = transacoes.slice(0, 50).map((t) => {
      const isVenda = t.tipo === 'venda'
      let dataFmt = t.data
      try { dataFmt = format(new Date(t.data + 'T12:00:00'), 'dd/MM/yyyy') } catch {}
      return `
        <tr>
          <td>${dataFmt}</td>
          <td>${isVenda ? 'Venda' : 'Pagamento'}</td>
          <td>${t.clienteNome}</td>
          <td>${t.descricao ?? '—'}</td>
          <td style="color:${isVenda ? '#E53E3E' : '#1D9E75'}; font-weight:600; text-align:right">
            ${isVenda ? '-' : '+'}${formatarMoeda(t.valor)}
          </td>
        </tr>`
    }).join('')

    const linhasMensal = resumo.evolucaoMensal?.filter(m => m.vendido > 0 || m.recebido > 0).map((m) => {
      const saldo = m.recebido - m.vendido
      return `
        <tr>
          <td style="text-transform:capitalize">${m.label}</td>
          <td style="color:#E53E3E; text-align:right">${formatarMoeda(m.vendido)}</td>
          <td style="color:#1D9E75; text-align:right">${formatarMoeda(m.recebido)}</td>
          <td style="color:${saldo >= 0 ? '#1D9E75' : '#E53E3E'}; font-weight:600; text-align:right">${saldo >= 0 ? '+' : ''}${formatarMoeda(saldo)}</td>
        </tr>`
    }).join('') ?? ''

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #1A2332; padding: 32px; }
  h1 { font-size: 22px; font-weight: 800; color: #1D9E75; margin-bottom: 4px; }
  .sub { font-size: 12px; color: #666; margin-bottom: 24px; }
  .metrics { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
  .metric { flex: 1; min-width: 120px; background: #F5FAF7; border-radius: 10px; padding: 14px; border: 1px solid #D1EAD9; }
  .metric-val { font-size: 18px; font-weight: 800; color: #1D9E75; }
  .metric-val.red { color: #E53E3E; }
  .metric-val.blue { color: #3182CE; }
  .metric-label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
  h2 { font-size: 14px; font-weight: 700; color: #1A2332; margin: 20px 0 10px; border-bottom: 1px solid #E2E8F0; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #1D9E75; color: white; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 600; }
  td { padding: 8px 10px; border-bottom: 1px solid #F0F4F8; vertical-align: middle; }
  tr:nth-child(even) td { background: #FAFAFA; }
  .footer { margin-top: 32px; font-size: 10px; color: #AAA; border-top: 1px solid #E2E8F0; padding-top: 12px; }
  .taxa { background: #F5FAF7; border: 1px solid #D1EAD9; border-radius: 10px; padding: 14px 20px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; }
  .taxa-label { font-size: 13px; font-weight: 600; }
  .taxa-val { font-size: 24px; font-weight: 800; color: ${(taxaRecebimento ?? 0) >= 70 ? '#1D9E75' : (taxaRecebimento ?? 0) >= 40 ? '#D69E2E' : '#E53E3E'}; }
</style>
</head>
<body>
  <h1>FiadoApp — Relatório</h1>
  <p class="sub">Período: ${periodoLabel} &nbsp;|&nbsp; Gerado em ${dataGeracao}</p>

  <div class="metrics">
    <div class="metric">
      <div class="metric-val">${formatarMoeda(resumo.totalVendido)}</div>
      <div class="metric-label">Total vendido</div>
    </div>
    <div class="metric">
      <div class="metric-val">${formatarMoeda(resumo.totalRecebido)}</div>
      <div class="metric-label">Total recebido</div>
    </div>
    <div class="metric">
      <div class="metric-val red">${formatarMoeda(Math.max(0, resumo.totalEmAberto))}</div>
      <div class="metric-label">Saldo em aberto</div>
    </div>
    <div class="metric">
      <div class="metric-val blue">${resumo.quantidadeVendas}</div>
      <div class="metric-label">Vendas realizadas</div>
    </div>
  </div>

  ${taxaRecebimento !== null ? `
  <div class="taxa">
    <span class="taxa-label">Taxa de recebimento</span>
    <span class="taxa-val">${taxaRecebimento}%</span>
  </div>` : ''}

  ${resumo.maioresDevedores.length > 0 ? `
  <h2>Maiores Devedores</h2>
  <table>
    <tr><th>#</th><th>Cliente</th><th style="text-align:right">Saldo Devedor</th></tr>
    ${resumo.maioresDevedores.map((c, i) => `<tr><td>${i + 1}º</td><td>${c.nome}</td><td style="color:#E53E3E; font-weight:600; text-align:right">${formatarMoeda(c.saldo)}</td></tr>`).join('')}
  </table>` : ''}

  ${resumo.melhoresClientes.length > 0 ? `
  <h2>Melhores Clientes</h2>
  <table>
    <tr><th>#</th><th>Cliente</th><th style="text-align:right">Total Comprado</th></tr>
    ${resumo.melhoresClientes.map((c, i) => `<tr><td>${i + 1}º</td><td>${c.nome}</td><td style="color:#1D9E75; font-weight:600; text-align:right">${formatarMoeda(c.total)}</td></tr>`).join('')}
  </table>` : ''}

  ${linhasMensal ? `
  <h2>Evolução Mensal</h2>
  <table>
    <tr><th>Mês</th><th style="text-align:right">Vendido</th><th style="text-align:right">Recebido</th><th style="text-align:right">Saldo</th></tr>
    ${linhasMensal}
    <tr style="font-weight:700; background:#F5FAF7">
      <td>TOTAL</td>
      <td style="color:#E53E3E; text-align:right">${formatarMoeda(resumo.totalVendido)}</td>
      <td style="color:#1D9E75; text-align:right">${formatarMoeda(resumo.totalRecebido)}</td>
      <td style="color:${resumo.totalRecebido >= resumo.totalVendido ? '#1D9E75' : '#E53E3E'}; text-align:right">${resumo.totalRecebido - resumo.totalVendido >= 0 ? '+' : ''}${formatarMoeda(resumo.totalRecebido - resumo.totalVendido)}</td>
    </tr>
  </table>` : ''}

  ${transacoes.length > 0 ? `
  <h2>Transações${transacoes.length > 50 ? ' (últimas 50)' : ''}</h2>
  <table>
    <tr><th>Data</th><th>Tipo</th><th>Cliente</th><th>Descrição</th><th style="text-align:right">Valor</th></tr>
    ${linhasTransacoes}
  </table>` : ''}

  <div class="footer">Relatório gerado pelo FiadoApp &nbsp;·&nbsp; ${dataGeracao}</div>
</body>
</html>`

    try {
      const { uri } = await Print.printToFileAsync({ html, base64: false })
      const nomeArquivo = `relatorio_${periodoLabel.toLowerCase().replace(/\s+/g, '_')}_${format(new Date(), 'ddMMyyyy')}.pdf`
      if (Platform.OS === 'web') {
        const link = document.createElement('a')
        link.href = uri
        link.download = nomeArquivo
        link.click()
      } else {
        const podeCompartilhar = await Sharing.isAvailableAsync()
        if (podeCompartilhar) {
          await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Exportar relatório', UTI: 'com.adobe.pdf' })
        } else {
          Alert.alert('PDF gerado', `Arquivo salvo em:\n${uri}`)
        }
      }
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível gerar o PDF. Tente novamente.')
    }
  }

  function cobrarWhatsApp(c: { nome: string; saldo: number; telefone?: string }) {
    if (!c.telefone) return
    const tel = c.telefone.replace(/\D/g, '')
    const msg = encodeURIComponent(
      `Olá, ${c.nome}! 👋\n\nPassando para lembrar que você possui um saldo de *${formatarMoeda(c.saldo)}* em aberto.\n\nQuando puder, entre em contato. Obrigado! 😊`
    )
    const url = `https://wa.me/55${tel}?text=${msg}`
    if (Platform.OS === 'web') {
      window.open(url, '_blank')
    } else {
      require('react-native').Linking.openURL(url)
    }
  }

  return (
    <ScrollView
      style={estilos.container}
      contentContainerStyle={estilos.content}
      refreshControl={<RefreshControl refreshing={carregando} onRefresh={buscar} tintColor={C.green} />}
    >
      {/* Seletor período */}
      <View style={estilos.periodoContainer}>
        {PERIODOS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[estilos.periodoBotao, periodo === p.key && estilos.periodoAtivo]}
            onPress={() => setPeriodo(p.key)}
          >
            <Text style={[estilos.periodoTexto, periodo === p.key && estilos.periodoTextoAtivo]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Seleção de datas personalizadas */}
      {periodo === 'personalizado' && (
        <View style={estilos.customBox}>
          <Text style={estilos.customLabel}>Selecione o dia</Text>
          <View style={estilos.customRow}>
            <TextInput
              style={[estilos.customInput, { flex: 1 }]}
              value={dataCustom}
              onChangeText={(v) => setDataCustom(mascaraData(v))}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={C.text3}
              keyboardType="numeric"
              maxLength={10}
            />
            <TouchableOpacity
              style={[estilos.customBtnBuscar, !parseDDMMYYYY(dataCustom) && { opacity: 0.4 }]}
              onPress={buscar}
              disabled={!parseDDMMYYYY(dataCustom)}
            >
              <Ionicons name="search" size={14} color={C.white} />
              <Text style={estilos.customBtnTexto}>Buscar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {carregando || !resumo ? (
        <ActivityIndicator color={C.green} style={{ marginTop: 48 }} />
      ) : (
        <>
          {/* Cards métricas */}
          <View style={estilos.grade}>
            <View style={[estilos.cardMetrica, { backgroundColor: '#EBF9F3' }]}>
              <Text style={estilos.metricaIcone}>🛒</Text>
              <Text style={[estilos.metricaValor, { color: C.green }]}>{formatarMoeda(resumo.totalVendido)}</Text>
              <Text style={estilos.metricaLabel}>Vendido</Text>
            </View>
            <View style={[estilos.cardMetrica, { backgroundColor: '#EBF9F3' }]}>
              <Text style={estilos.metricaIcone}>✅</Text>
              <Text style={[estilos.metricaValor, { color: C.greenDark }]}>{formatarMoeda(resumo.totalRecebido)}</Text>
              <Text style={estilos.metricaLabel}>Recebido</Text>
            </View>
          </View>
          <View style={[estilos.grade, { marginTop: 10 }]}>
            <View style={[estilos.cardMetrica, { backgroundColor: resumo.totalEmAberto > 0 ? C.redLight : '#EBF9F3' }]}>
              <Text style={estilos.metricaIcone}>⏳</Text>
              <Text style={[estilos.metricaValor, { color: resumo.totalEmAberto > 0 ? C.red : C.green }]}>{formatarMoeda(Math.max(0, resumo.totalEmAberto))}</Text>
              <Text style={estilos.metricaLabel}>Saldo período</Text>
            </View>
            <View style={[estilos.cardMetrica, { backgroundColor: C.yellowLight }]}>
              <Text style={estilos.metricaIcone}>🧾</Text>
              <Text style={[estilos.metricaValor, { color: C.yellow }]}>{resumo.quantidadeVendas}</Text>
              <Text style={estilos.metricaLabel}>Vendas</Text>
            </View>
          </View>

          {/* Botão exportar PDF */}
          <TouchableOpacity style={estilos.btnExportar} onPress={exportarPDF} activeOpacity={0.8}>
            <Ionicons name="download-outline" size={16} color={C.green} />
            <Text style={estilos.btnExportarTexto}>Exportar PDF</Text>
          </TouchableOpacity>

          {/* Taxa de recebimento */}
          <View style={estilos.taxaBox}>
            <View style={{ flex: 1 }}>
              <Text style={estilos.taxaLabel}>Taxa de recebimento</Text>
              <Text style={estilos.taxaSubLabel}>Quanto foi recebido do total vendido</Text>
            </View>
            <Text style={[estilos.taxaValor, {
              color: taxaRecebimento === null ? C.text3
                : taxaRecebimento >= 70 ? C.green
                : taxaRecebimento >= 40 ? C.yellow
                : C.red
            }]}>
              {taxaRecebimento !== null ? `${taxaRecebimento}%` : '—'}
            </Text>
          </View>

          {/* Evolução mensal anual */}
          {resumo.evolucaoMensal && resumo.evolucaoMensal.length > 0 && (() => {
            const maxVal = Math.max(...resumo.evolucaoMensal!.map(m => Math.max(m.vendido, m.recebido)), 1)
            return (
              <View style={[estilos.rankingCard, { marginTop: 10 }]}>
                <Text style={estilos.rankingTitulo}>
                  📅 Evolução mensal — {periodo === 'ano_atual' ? new Date().getFullYear() : new Date().getFullYear() - 1}
                </Text>
                <Text style={estilos.rankingSubTitulo}>Vendido vs recebido por mês</Text>

                {/* Legenda */}
                <View style={{ flexDirection: 'row', gap: 16, marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: C.red }} />
                    <Text style={{ fontSize: 11, color: C.text2, fontWeight: '600' }}>Vendido</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: C.green }} />
                    <Text style={{ fontSize: 11, color: C.text2, fontWeight: '600' }}>Recebido</Text>
                  </View>
                </View>

                {/* Barras */}
                <View style={estilos.graficoContainer}>
                  {resumo.evolucaoMensal!.map((m) => (
                    <View key={m.mes} style={estilos.graficoColuna}>
                      <View style={estilos.graficoBarra}>
                        {/* Barra vendido */}
                        <View style={[
                          estilos.graficoBarraFill,
                          { height: `${Math.round((m.vendido / maxVal) * 100)}%`, backgroundColor: C.red + 'CC' },
                        ]} />
                      </View>
                      <View style={[estilos.graficoBarra, { marginTop: 3 }]}>
                        {/* Barra recebido */}
                        <View style={[
                          estilos.graficoBarraFill,
                          { height: `${Math.round((m.recebido / maxVal) * 100)}%`, backgroundColor: C.green },
                        ]} />
                      </View>
                      <Text style={estilos.graficoLabel}>{m.label}</Text>
                    </View>
                  ))}
                </View>

                {/* Tabela resumo mensal */}
                <View style={{ marginTop: 16 }}>
                  {resumo.evolucaoMensal!.map((m, i) => {
                    if (m.vendido === 0 && m.recebido === 0) return null
                    const saldo = m.recebido - m.vendido
                    return (
                      <View key={m.mes} style={[estilos.mesRow, i === resumo.evolucaoMensal!.length - 1 && { borderBottomWidth: 0 }]}>
                        <Text style={estilos.mesLabel}>{m.label.charAt(0).toUpperCase() + m.label.slice(1)}</Text>
                        <View style={estilos.mesDados}>
                          <Text style={estilos.mesVendido}>{formatarMoeda(m.vendido)}</Text>
                          <Text style={estilos.mesRecebido}>{formatarMoeda(m.recebido)}</Text>
                          <Text style={[estilos.mesSaldo, { color: saldo >= 0 ? C.green : C.red }]}>
                            {saldo >= 0 ? '+' : ''}{formatarMoeda(saldo)}
                          </Text>
                        </View>
                      </View>
                    )
                  })}
                  <View style={estilos.mesTotaisRow}>
                    <Text style={estilos.mesTotaisLabel}>TOTAL {periodo === 'ano_atual' ? new Date().getFullYear() : new Date().getFullYear() - 1}</Text>
                    <View style={estilos.mesDados}>
                      <Text style={[estilos.mesVendido, { fontWeight: '800' }]}>{formatarMoeda(resumo.totalVendido)}</Text>
                      <Text style={[estilos.mesRecebido, { fontWeight: '800' }]}>{formatarMoeda(resumo.totalRecebido)}</Text>
                      <Text style={[estilos.mesSaldo, { fontWeight: '800', color: resumo.totalRecebido >= resumo.totalVendido ? C.green : C.red }]}>
                        {resumo.totalRecebido - resumo.totalVendido >= 0 ? '+' : ''}{formatarMoeda(resumo.totalRecebido - resumo.totalVendido)}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            )
          })()}

          {/* Maiores devedores */}
          {resumo.maioresDevedores.length > 0 && (
            <View style={estilos.rankingCard}>
              <Text style={estilos.rankingTitulo}>🔴 Maiores devedores</Text>
              {resumo.maioresDevedores.map((c, i) => (
                <View key={i} style={[estilos.rankRow, i === resumo.maioresDevedores.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={estilos.posicao}>{medalha(i)}</Text>
                  <Avatar nome={c.nome} tamanho={34} />
                  <Text style={estilos.rankNome} numberOfLines={1}>{c.nome}</Text>
                  <View style={estilos.rankDireita}>
                    <Text style={estilos.rankValorDevendo}>{formatarMoeda(c.saldo)}</Text>
                    {c.telefone && (
                      <TouchableOpacity style={estilos.rankWhats} onPress={() => cobrarWhatsApp(c)}>
                        <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Melhores clientes */}
          {resumo.melhoresClientes.length > 0 && (
            <View style={[estilos.rankingCard, { marginTop: 10 }]}>
              <Text style={estilos.rankingTitulo}>🟢 Melhores clientes</Text>
              <Text style={estilos.rankingSubTitulo}>Quem mais comprou no período</Text>
              {resumo.melhoresClientes.map((c, i) => (
                <View key={i} style={[estilos.rankRow, i === resumo.melhoresClientes.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={estilos.posicao}>{medalha(i)}</Text>
                  <Avatar nome={c.nome} tamanho={34} />
                  <Text style={estilos.rankNome} numberOfLines={1}>{c.nome}</Text>
                  <Text style={estilos.rankValorBom}>{formatarMoeda(c.total)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Ranking por categoria */}
          {modulos.relatorio_categoria && resumo.porCategoria.length > 0 && (
            <View style={[estilos.rankingCard, { marginTop: 10 }]}>
              <Text style={estilos.rankingTitulo}>🏷 Melhores clientes por categoria</Text>
              <Text style={[estilos.rankingSubTitulo, { marginBottom: 14 }]}>Top 3 por categoria no período</Text>
              {resumo.porCategoria.map((cat, ci) => (
                <View key={cat.categoria} style={[estilos.catBloco, ci === resumo.porCategoria.length - 1 && { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>
                  <View style={estilos.catHeader}>
                    <Text style={estilos.catNome}>{cat.categoria}</Text>
                    <Text style={estilos.catTotal}>{formatarMoeda(cat.total)}</Text>
                  </View>
                  {cat.clientes.map((c, i) => (
                    <View key={i} style={estilos.catRow}>
                      <Text style={estilos.posicao}>{medalha(i)}</Text>
                      <Avatar nome={c.nome} tamanho={28} />
                      <Text style={estilos.rankNome} numberOfLines={1}>{c.nome}</Text>
                      <Text style={estilos.rankValorBom}>{formatarMoeda(c.total)}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}

          {/* Transações detalhadas */}
          {transacoes.length > 0 && (
            <View style={[estilos.rankingCard, { marginTop: 10 }]}>
              <Text style={estilos.rankingTitulo}>📋 Transações detalhadas</Text>
              <Text style={[estilos.rankingSubTitulo, { marginBottom: 10 }]}>Todas as movimentações do período</Text>
              {transacoes.map((t, i) => {
                const isVenda = t.tipo === 'venda'
                const dataFormatada = (() => {
                  try { return format(new Date(t.data + 'T12:00:00'), 'dd/MM/yyyy') } catch { return t.data }
                })()
                return (
                  <View key={i} style={[estilos.transacaoRow, i === transacoes.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={[estilos.transacaoIcone, { backgroundColor: isVenda ? C.redLight : C.greenLight }]}>
                      <Ionicons name={isVenda ? 'cart-outline' : 'cash-outline'} size={16} color={isVenda ? C.red : C.green} />
                    </View>
                    <View style={estilos.transacaoInfo}>
                      <Text style={estilos.transacaoCliente} numberOfLines={1}>{t.clienteNome}</Text>
                      <View style={estilos.transacaoMeta}>
                        <Text style={estilos.transacaoData}>{dataFormatada}</Text>
                        {t.descricao ? <Text style={estilos.transacaoDesc} numberOfLines={1}> · {t.descricao}</Text> : null}
                        {t.categoria ? <Text style={estilos.transacaoCateg}> · {t.categoria}</Text> : null}
                      </View>
                    </View>
                    <Text style={[estilos.transacaoValor, { color: isVenda ? C.red : C.green }]}>
                      {isVenda ? '-' : '+'}{formatarMoeda(t.valor)}
                    </Text>
                  </View>
                )
              })}
            </View>
          )}

          {resumo.totalVendido === 0 && transacoes.length === 0 && (
            <View style={estilos.vazio}>
              <Text style={{ fontSize: 36 }}>📈</Text>
              <Text style={estilos.vazioTitulo}>Sem dados ainda</Text>
              <Text style={estilos.vazioTexto}>Registre vendas para ver o relatório.</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 100 },
  periodoContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  periodoBotao: {
    flexGrow: 1, flexBasis: '40%', alignItems: 'center', paddingVertical: 10, borderRadius: 12,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  periodoAtivo: { backgroundColor: C.green, borderColor: C.green },
  periodoTexto: { fontSize: 12, color: C.text2, fontWeight: '600', textAlign: 'center' },
  periodoTextoAtivo: { color: C.white },
  grade: { flexDirection: 'row', gap: 10 },
  cardMetrica: { flex: 1, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border },
  metricaIcone: { fontSize: 20, marginBottom: 6 },
  metricaValor: { fontSize: 18, fontWeight: '800', marginBottom: 2 },
  metricaLabel: { fontSize: 11, color: C.text2, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  btnExportar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.card, borderRadius: 12, paddingVertical: 11, marginTop: 10,
    borderWidth: 1, borderColor: C.green,
  },
  btnExportarTexto: { fontSize: 14, fontWeight: '700', color: C.green },
  taxaBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.card, borderRadius: 16, padding: 18, marginTop: 10,
    borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  taxaLabel: { fontSize: 14, fontWeight: '700', color: C.text },
  taxaSubLabel: { fontSize: 12, color: C.text2, marginTop: 2 },
  taxaValor: { fontSize: 32, fontWeight: '800' },
  rankingCard: {
    backgroundColor: C.card, borderRadius: 16, padding: 18, marginTop: 10,
    borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  rankingTitulo: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 4 },
  rankingSubTitulo: { fontSize: 12, color: C.text2, marginBottom: 10 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  posicao: { width: 24, fontSize: 16, textAlign: 'center' },
  rankNome: { flex: 1, fontSize: 14, fontWeight: '500', color: C.text },
  rankDireita: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankValorDevendo: { fontSize: 14, fontWeight: '700', color: C.red },
  rankValorBom: { fontSize: 14, fontWeight: '700', color: C.green },
  rankWhats: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: '#E7FBF0',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#B7F0CC',
  },
  catBloco: { borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 14, paddingBottom: 14 },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  catNome: { fontSize: 13, fontWeight: '700', color: C.text, backgroundColor: C.greenLight, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99 },
  catTotal: { fontSize: 13, fontWeight: '700', color: C.green },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  vazio: { alignItems: 'center', paddingTop: 48, gap: 10 },
  vazioTitulo: { fontSize: 17, fontWeight: '700', color: C.text },
  vazioTexto: { fontSize: 14, color: C.text2 },
  customBox: {
    backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: C.border,
  },
  customRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 8 },
  customLabel: { fontSize: 11, fontWeight: '700', color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5 },
  customInput: {
    borderWidth: 1, borderColor: C.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: C.text, backgroundColor: C.bg,
  },
  customBtnBuscar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: C.green, borderRadius: 10, paddingVertical: 11,
  },
  customBtnTexto: { color: C.white, fontSize: 14, fontWeight: '700' },
  transacaoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  transacaoIcone: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  transacaoInfo: { flex: 1, minWidth: 0 },
  transacaoCliente: { fontSize: 14, fontWeight: '600', color: C.text },
  transacaoMeta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  transacaoData: { fontSize: 11, color: C.text3 },
  transacaoDesc: { fontSize: 11, color: C.text2, flexShrink: 1 },
  transacaoCateg: { fontSize: 11, color: C.green, fontWeight: '600' },
  transacaoValor: { fontSize: 14, fontWeight: '700' },

  // Gráfico anual
  graficoContainer: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 100 },
  graficoColuna: { flex: 1, alignItems: 'center', gap: 0 },
  graficoBarra: { width: '100%', height: 44, justifyContent: 'flex-end', backgroundColor: C.bg, borderRadius: 4, overflow: 'hidden' },
  graficoBarraFill: { width: '100%', borderRadius: 4, minHeight: 2 },
  graficoLabel: { fontSize: 9, color: C.text3, fontWeight: '600', marginTop: 4, textTransform: 'uppercase' },

  // Tabela mensal
  mesRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  mesLabel: { width: 36, fontSize: 12, color: C.text2, fontWeight: '600', textTransform: 'capitalize' },
  mesDados: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 4 },
  mesVendido: { width: 80, fontSize: 12, fontWeight: '600', color: C.red, textAlign: 'right' },
  mesRecebido: { width: 80, fontSize: 12, fontWeight: '600', color: C.green, textAlign: 'right' },
  mesSaldo: { width: 80, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  mesTotaisRow: {
    flexDirection: 'row', alignItems: 'center', paddingTop: 10, marginTop: 4,
    borderTopWidth: 1.5, borderTopColor: C.border,
  },
  mesTotaisLabel: { width: 36, fontSize: 10, color: C.text3, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
})

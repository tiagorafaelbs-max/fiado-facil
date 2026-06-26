import { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { C } from '../constants/colors'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

interface Item { pergunta: string; resposta: string }
interface Secao { id: string; icone: keyof typeof Ionicons.glyphMap; titulo: string; itens: Item[] }

const SECOES: Secao[] = [
  {
    id: 'lancamentos',
    icone: 'receipt-outline',
    titulo: 'Lançamentos',
    itens: [
      {
        pergunta: 'Como registrar uma venda no fiado?',
        resposta: 'Toque no botão "+" (Nova Venda) na barra inferior. Escolha o cliente, informe o valor, a descrição e a data de vencimento (opcional). Toque em "Registrar Venda" para salvar.',
      },
      {
        pergunta: 'Como marcar um pagamento recebido?',
        resposta: 'Acesse a tela do cliente tocando no nome dele na lista. Na seção "Vendas em aberto", toque no botão verde de pagamento ao lado da venda. Você pode marcar como pago ou registrar um pagamento parcial.',
      },
      {
        pergunta: 'Como usar o botão de caixa registradora (🧾)?',
        resposta: 'No celular, um botão flutuante 🧾 aparece na tela Início. Ele abre o Registrador Rápido — um atalho de 2 passos para lançar vendas sem sair da tela principal: primeiro escolha o cliente, depois informe o valor.',
      },
      {
        pergunta: 'Como adicionar descrição e vencimento numa venda?',
        resposta: 'Na tela de Nova Venda, após escolher o cliente e o valor, role para baixo. Você verá os campos "Descrição" (ex: "Pão, leite") e "Data de Vencimento" no formato DD/MM/AAAA. Ambos são opcionais.',
      },
    ],
  },
  {
    id: 'clientes',
    icone: 'people-outline',
    titulo: 'Clientes',
    itens: [
      {
        pergunta: 'Como cadastrar um novo cliente?',
        resposta: 'Na aba "Clientes", toque no botão "+" no canto superior direito. Preencha o nome (obrigatório), telefone, CPF, empresa e endereço (todos opcionais). Toque em "Salvar" para concluir.',
      },
      {
        pergunta: 'Como editar os dados de um cliente?',
        resposta: 'Toque no nome do cliente para abrir a tela dele. No canto superior direito, toque no ícone de lápis (✏️). Faça as alterações e toque em "Salvar".',
      },
      {
        pergunta: 'Como excluir um cliente?',
        resposta: 'Abra a tela do cliente. No cabeçalho, toque no ícone de lixeira (🗑️) vermelho. Um aviso de confirmação aparecerá — confirme para excluir. Atenção: todas as vendas e pagamentos do cliente serão excluídos também.',
      },
      {
        pergunta: 'Como buscar um cliente pelo nome?',
        resposta: 'Na aba "Clientes", use o campo de busca no topo da lista. Digite qualquer parte do nome ou empresa e a lista filtra automaticamente em tempo real.',
      },
      {
        pergunta: 'Como agrupar clientes por empresa?',
        resposta: 'Na aba "Clientes", toque em "Por empresa" nas abas superiores. Os clientes serão agrupados pelo campo Empresa do cadastro. Clientes sem empresa ficam na seção "— Sem empresa" no final.',
      },
    ],
  },
  {
    id: 'relatorios',
    icone: 'bar-chart-outline',
    titulo: 'Relatórios',
    itens: [
      {
        pergunta: 'Como ver o relatório mensal?',
        resposta: 'Acesse a aba "Relatórios" e toque em "Este mês" ou "Mês anterior" nos botões de período. O relatório mostrará total vendido, recebido, saldo em aberto, maiores devedores e melhores clientes do período.',
      },
      {
        pergunta: 'Como exportar o relatório em PDF?',
        resposta: 'Na tela de Relatórios, após carregar os dados de qualquer período, toque no botão "Exportar PDF" (abaixo dos cards de métricas). O PDF será gerado e você poderá salvar ou compartilhar pelo WhatsApp, e-mail ou Google Drive.',
      },
      {
        pergunta: 'O que é a taxa de recebimento?',
        resposta: 'É a porcentagem do total vendido que já foi efetivamente recebido. Por exemplo: vendeu R$1.000 e recebeu R$700 → taxa de 70%. Verde (≥70%) significa boa saúde financeira. Amarelo (40–69%) pede atenção. Vermelho (<40%) indica risco.',
      },
    ],
  },
  {
    id: 'cobrancas',
    icone: 'logo-whatsapp',
    titulo: 'Cobranças',
    itens: [
      {
        pergunta: 'Como cobrar pelo WhatsApp?',
        resposta: 'Na tela de Relatórios, na seção "Maiores devedores", toque no ícone verde do WhatsApp ao lado do cliente. Uma mensagem de cobrança personalizada será aberta no WhatsApp com o nome e o valor devido. No plano Pro, você pode cobrar todos de uma vez na tela do cliente.',
      },
      {
        pergunta: 'O que é o Ranking de clientes?',
        resposta: 'Disponível no plano Pro, o Ranking fica na aba "Clientes" → "Ranking". Ele classifica seus clientes em 4 categorias: Melhores (quem compra e paga em dia), Consumo (quem mais compra), Devedores (maior saldo em aberto) e Lista Negra (risco alto de inadimplência).',
      },
    ],
  },
  {
    id: 'plano',
    icone: 'star-outline',
    titulo: 'Plano e Conta',
    itens: [
      {
        pergunta: 'Qual a diferença entre o plano Gratuito e o Pro?',
        resposta: 'Gratuito: até 10 clientes, relatórios mensais e anuais, exportação PDF, agrupamento por empresa.\n\nPro (R$19/mês): clientes ilimitados + tudo do gratuito + cobranças em massa pelo WhatsApp + Ranking de clientes.',
      },
      {
        pergunta: 'Como fazer upgrade para o Pro?',
        resposta: 'Acesse a aba "Perfil" e toque em "Fazer upgrade para Pro" no banner verde. Você será direcionado para a tela de planos onde poderá assinar via MercadoPago. O plano é ativado imediatamente após a confirmação do pagamento.',
      },
      {
        pergunta: 'Como alterar o nome do meu negócio?',
        resposta: 'Acesse "Perfil" → toque no ícone de lápis (✏️) ao lado do nome do negócio. Edite e salve. O nome aparece no cabeçalho do Dashboard e nos relatórios exportados.',
      },
    ],
  },
]

export default function AjudaScreen() {
  const [abertas, setAbertas] = useState<Record<string, number | null>>({})

  function alternarItem(secaoId: string, idx: number) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setAbertas((prev) => ({
      ...prev,
      [secaoId]: prev[secaoId] === idx ? null : idx,
    }))
  }

  return (
    <ScrollView style={estilos.container} contentContainerStyle={estilos.content}>
      <Text style={estilos.subtitulo}>Encontre respostas rápidas sobre o uso do app.</Text>

      {SECOES.map((secao) => (
        <View key={secao.id} style={estilos.secao}>
          <View style={estilos.secaoHeader}>
            <View style={estilos.secaoIcone}>
              <Ionicons name={secao.icone} size={18} color={C.green} />
            </View>
            <Text style={estilos.secaoTitulo}>{secao.titulo}</Text>
          </View>

          <View style={estilos.secaoCard}>
            {secao.itens.map((item, idx) => {
              const aberto = abertas[secao.id] === idx
              const ultimo = idx === secao.itens.length - 1
              return (
                <View key={idx} style={[estilos.itemWrapper, !ultimo && estilos.itemBorda]}>
                  <TouchableOpacity
                    style={estilos.itemHeader}
                    onPress={() => alternarItem(secao.id, idx)}
                    activeOpacity={0.7}
                  >
                    <Text style={[estilos.pergunta, aberto && estilos.perguntaAberta]} numberOfLines={aberto ? undefined : 2}>
                      {item.pergunta}
                    </Text>
                    <Ionicons
                      name={aberto ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={aberto ? C.green : C.text3}
                      style={estilos.chevron}
                    />
                  </TouchableOpacity>

                  {aberto && (
                    <Text style={estilos.resposta}>{item.resposta}</Text>
                  )}
                </View>
              )
            })}
          </View>
        </View>
      ))}

      <View style={estilos.rodape}>
        <Text style={estilos.rodapeTexto}>Ainda com dúvidas? Fale com a gente.</Text>
        <TouchableOpacity
          onPress={() => {
            const msg = encodeURIComponent('Olá! Tenho uma dúvida sobre o FiadoApp.')
            const url = `https://wa.me/5531995515045?text=${msg}`
            require('react-native').Linking.openURL(url).catch(() => {})
          }}
          style={estilos.rodapeBtn}
          activeOpacity={0.8}
        >
          <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
          <Text style={estilos.rodapeBtnTexto}>Suporte via WhatsApp</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 48 },
  subtitulo: { fontSize: 14, color: C.text2, marginBottom: 20 },
  secao: { marginBottom: 20 },
  secaoHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  secaoIcone: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: C.greenLight,
    alignItems: 'center', justifyContent: 'center',
  },
  secaoTitulo: { fontSize: 15, fontWeight: '700', color: C.text },
  secaoCard: {
    backgroundColor: C.card, borderRadius: 16,
    borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
  },
  itemWrapper: { paddingHorizontal: 16, paddingVertical: 14 },
  itemBorda: { borderBottomWidth: 1, borderBottomColor: C.border },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  pergunta: { flex: 1, fontSize: 14, fontWeight: '600', color: C.text, lineHeight: 20 },
  perguntaAberta: { color: C.green },
  chevron: { marginTop: 2, flexShrink: 0 },
  resposta: {
    fontSize: 13, color: C.text2, lineHeight: 20,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  rodape: {
    alignItems: 'center', gap: 12,
    paddingTop: 8, marginTop: 4,
  },
  rodapeTexto: { fontSize: 13, color: C.text3 },
  rodapeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.card, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 20,
    borderWidth: 1, borderColor: '#B7F0CC',
  },
  rodapeBtnTexto: { fontSize: 14, fontWeight: '700', color: C.text },
})

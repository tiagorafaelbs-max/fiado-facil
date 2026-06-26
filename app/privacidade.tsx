import { ScrollView, View, Text, StyleSheet } from 'react-native'
import { C } from '../constants/colors'

function Secao({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <View style={estilos.secao}>
      <Text style={estilos.secaoTitulo}>{titulo}</Text>
      <Text style={estilos.secaoTexto}>{texto}</Text>
    </View>
  )
}

export default function PrivacidadeScreen() {
  return (
    <ScrollView style={estilos.container} contentContainerStyle={estilos.content}>
      <Text style={estilos.titulo}>Política de Privacidade</Text>
      <Text style={estilos.atualizacao}>Última atualização: junho de 2025</Text>

      <Secao
        titulo="1. Quais dados coletamos"
        texto="Coletamos seu e-mail e senha para autenticação. Também armazenamos os dados que você cadastra no app: nome dos seus clientes, telefones, valores de vendas e pagamentos. Não coletamos dados de localização, contatos do celular ou qualquer informação sem o seu consentimento."
      />
      <Secao
        titulo="2. Como usamos seus dados"
        texto="Seus dados são usados exclusivamente para o funcionamento do FiadoApp. Nunca vendemos, alugamos ou compartilhamos suas informações com terceiros para fins comerciais."
      />
      <Secao
        titulo="3. Armazenamento e segurança"
        texto="Todos os dados são armazenados de forma segura no Supabase (infraestrutura AWS), com criptografia em trânsito (HTTPS/TLS) e em repouso. O acesso é protegido por autenticação e políticas de segurança em nível de linha (RLS)."
      />
      <Secao
        titulo="4. Seus direitos (LGPD)"
        texto="Conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018), você tem direito a: acessar seus dados, corrigir informações incorretas, solicitar a exclusão completa da sua conta e de todos os dados associados, e revogar consentimentos a qualquer momento."
      />
      <Secao
        titulo="5. Exclusão de dados"
        texto="Você pode excluir sua conta a qualquer momento nas Configurações do app. Todos os seus dados (clientes, vendas, pagamentos) serão permanentemente removidos em até 30 dias."
      />
      <Secao
        titulo="6. Cookies e rastreamento"
        texto="Na versão web do app utilizamos apenas cookies essenciais para manter sua sessão. Não utilizamos cookies de rastreamento, anúncios ou análise de comportamento de terceiros."
      />
      <Secao
        titulo="7. Contato"
        texto="Dúvidas sobre privacidade? Entre em contato: privacidade@fiadofacil.com.br"
      />
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 60 },
  titulo: { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 4 },
  atualizacao: { fontSize: 12, color: C.text3, marginBottom: 24 },
  secao: { marginBottom: 20 },
  secaoTitulo: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 8 },
  secaoTexto: { fontSize: 14, color: C.text2, lineHeight: 22 },
})

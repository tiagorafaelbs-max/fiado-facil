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

export default function TermosScreen() {
  return (
    <ScrollView style={estilos.container} contentContainerStyle={estilos.content}>
      <Text style={estilos.titulo}>Termos de Uso</Text>
      <Text style={estilos.atualizacao}>Última atualização: junho de 2025</Text>

      <Secao
        titulo="1. Aceitação dos termos"
        texto="Ao criar uma conta e utilizar o FiadoApp, você concorda com estes Termos de Uso. Se não concordar com qualquer parte, não utilize o app."
      />
      <Secao
        titulo="2. Descrição do serviço"
        texto="O FiadoApp é uma ferramenta de controle de vendas a crédito (fiado) para pequenos empreendedores. Oferecemos planos gratuito e Pro com diferentes limites de uso."
      />
      <Secao
        titulo="3. Uso adequado"
        texto="Você se compromete a usar o app apenas para fins lícitos. É proibido: inserir dados falsos de terceiros, usar o app para práticas de cobrança abusiva, tentar acessar dados de outros usuários ou realizar engenharia reversa do sistema."
      />
      <Secao
        titulo="4. Plano gratuito e Pro"
        texto="O plano gratuito permite até 10 clientes cadastrados. O plano Pro, mediante assinatura mensal de R$ 19,00, oferece clientes ilimitados e recursos avançados. A cobrança é recorrente e pode ser cancelada a qualquer momento, com acesso mantido até o fim do período pago."
      />
      <Secao
        titulo="5. Responsabilidade pelos dados"
        texto="Você é o único responsável pelos dados que insere no app. O FiadoApp não verifica a veracidade das informações cadastradas e não se responsabiliza por cobranças indevidas ou conflitos entre você e seus clientes."
      />
      <Secao
        titulo="6. Disponibilidade"
        texto="Nos esforçamos para manter o serviço disponível 24/7, mas não garantimos disponibilidade ininterrupta. Manutenções programadas serão comunicadas com antecedência sempre que possível."
      />
      <Secao
        titulo="7. Cancelamento e exclusão"
        texto="Você pode cancelar sua conta a qualquer momento nas Configurações. Ao cancelar, todos os seus dados serão excluídos permanentemente. Não há reembolso de períodos já pagos."
      />
      <Secao
        titulo="8. Alterações nos termos"
        texto="Podemos atualizar estes Termos a qualquer momento. Mudanças significativas serão comunicadas por e-mail ou notificação no app. O uso continuado após as alterações implica aceitação."
      />
      <Secao
        titulo="9. Contato"
        texto="Dúvidas sobre os termos? Entre em contato: suporte@fiadofacil.com.br"
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

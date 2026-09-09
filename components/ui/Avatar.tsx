import { View, Text, StyleSheet } from 'react-native'

const PALETA = [
  { fundo: '#E8F5EE', texto: '#007A3C' },
  { fundo: '#E0F0FF', texto: '#1A56DB' },
  { fundo: '#FFF3CD', texto: '#856404' },
  { fundo: '#FCE4EC', texto: '#880E4F' },
  { fundo: '#EDE7F6', texto: '#4527A0' },
  { fundo: '#E3F2FD', texto: '#0D47A1' },
  { fundo: '#FBE9E7', texto: '#BF360C' },
]

function indiceCor(nome: string): number {
  const soma = nome.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return soma % PALETA.length
}

function iniciais(nome: string): string {
  return nome.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase()
}

interface Props {
  nome: string
  tamanho?: number
}

export function Avatar({ nome, tamanho = 40 }: Props) {
  const cor = PALETA[indiceCor(nome)]
  const raio = tamanho >= 56 ? tamanho * 0.32 : tamanho / 2
  return (
    <View style={[
      estilos.container,
      {
        width: tamanho, height: tamanho,
        borderRadius: raio,
        backgroundColor: cor.fundo,
      }
    ]}>
      <Text style={[estilos.texto, { color: cor.texto, fontSize: tamanho * 0.36 }]}>{iniciais(nome)}</Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  texto: { fontWeight: '800' },
})

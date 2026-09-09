import { View, Text, Image, StyleSheet } from 'react-native'

interface LogoProps {
  width?: number
  showTagline?: boolean
  variant?: 'default' | 'light'
}

export function Logo({ width = 280, showTagline = true, variant = 'default' }: LogoProps) {
  const isLight = variant === 'light'
  const iconSize = Math.round(width * 0.22)
  const fontSize = Math.round(width * 0.115)
  const taglineSize = Math.round(width * 0.038)

  return (
    <View style={[styles.row, { gap: Math.round(width * 0.04) }]}>
      {/* Ícone do app */}
      <View style={[
        styles.iconBox,
        {
          width: iconSize,
          height: iconSize,
          borderRadius: Math.round(iconSize * 0.22),
          shadowOpacity: isLight ? 0.25 : 0.12,
        },
      ]}>
        <Image
          source={require('../../assets/icon.png')}
          style={{ width: iconSize, height: iconSize, borderRadius: Math.round(iconSize * 0.22) }}
          resizeMode="cover"
        />
      </View>

      {/* Nome e tagline */}
      <View style={styles.textGroup}>
        <Text style={[
          styles.nome,
          {
            fontSize,
            color: isLight ? '#ffffff' : '#1A2332',
            letterSpacing: fontSize * -0.03,
          },
        ]}>
          FiadoApp
        </Text>
        {showTagline && (
          <Text style={[
            styles.tagline,
            {
              fontSize: taglineSize,
              color: isLight ? 'rgba(255,255,255,0.72)' : '#6B7280',
              marginTop: Math.round(taglineSize * 0.3),
            },
          ]}>
            Para quem vende e quer receber
          </Text>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 4,
  },
  textGroup: {
    justifyContent: 'center',
  },
  nome: {
    fontWeight: '900',
    lineHeight: undefined,
  },
  tagline: {
    fontWeight: '500',
  },
})

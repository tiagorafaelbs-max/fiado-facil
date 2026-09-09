import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, TextInputProps, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { C } from '../../constants/colors'
import { KEYBOARD_TOOLBAR_ID } from './KeyboardToolbar'

const NUMERIC_KEYBOARDS = ['decimal-pad', 'numeric', 'number-pad', 'phone-pad']

interface Props extends TextInputProps {
  label: string
  erro?: string
}

export function Campo({ label, erro, secureTextEntry, ...props }: Props) {
  const [focado, setFocado] = useState(false)
  const [verSenha, setVerSenha] = useState(false)
  const ehSenha = secureTextEntry === true
  const ehNumerico = NUMERIC_KEYBOARDS.includes(props.keyboardType as string)

  return (
    <View style={estilos.container}>
      <Text style={[estilos.label, focado && estilos.labelFocado]}>{label}</Text>
      <View style={[
        estilos.inputRow,
        focado && estilos.inputFocado,
        erro ? estilos.inputErro : null,
      ]}>
        <TextInput
          style={[estilos.input, props.multiline && estilos.inputMultiline]}
          placeholderTextColor={C.text3}
          secureTextEntry={ehSenha && !verSenha}
          onFocus={(e) => { setFocado(true); props.onFocus?.(e) }}
          onBlur={(e) => { setFocado(false); props.onBlur?.(e) }}
          returnKeyType={ehNumerico ? 'done' : props.returnKeyType}
          returnKeyLabel={ehNumerico && Platform.OS === 'android' ? '✓' : undefined}
          blurOnSubmit={ehNumerico ? true : props.blurOnSubmit}
          inputAccessoryViewID={ehNumerico && Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_ID : undefined}
          {...props}
        />
        {ehSenha && (
          <TouchableOpacity onPress={() => setVerSenha(v => !v)} style={estilos.olhinho}>
            <Ionicons name={verSenha ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.text2} />
          </TouchableOpacity>
        )}
      </View>
      {erro ? <Text style={estilos.textoErro}>⚠ {erro}</Text> : null}
    </View>
  )
}

const estilos = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '600', color: C.text2, marginBottom: 7, letterSpacing: 0.3 },
  labelFocado: { color: C.green },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    backgroundColor: C.card,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  inputFocado: { borderColor: C.green, backgroundColor: C.greenLight },
  inputErro: { borderColor: C.red, backgroundColor: C.redLight },
  input: {
    flex: 1,
    fontSize: 15,
    color: C.text,
    height: 48,
  },
  inputMultiline: { height: 90, paddingTop: 12, textAlignVertical: 'top' },
  textoErro: { fontSize: 12, color: C.red, marginTop: 5, fontWeight: '500' },
  olhinho: { padding: 4, marginLeft: 4 },
})

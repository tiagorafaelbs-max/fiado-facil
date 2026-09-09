import { Platform, View, Text, TouchableOpacity, StyleSheet, Keyboard } from 'react-native'
import { InputAccessoryView } from 'react-native'
import { C } from '../../constants/colors'

export const KEYBOARD_TOOLBAR_ID = 'keyboard-toolbar-done'

export function KeyboardToolbar() {
  if (Platform.OS !== 'ios') return null
  return (
    <InputAccessoryView nativeID={KEYBOARD_TOOLBAR_ID}>
      <View style={estilos.barra}>
        <Text style={estilos.dica}>Toque em confirmar quando terminar</Text>
        <TouchableOpacity style={estilos.botao} onPress={() => Keyboard.dismiss()}>
          <Text style={estilos.texto}>Confirmar ✓</Text>
        </TouchableOpacity>
      </View>
    </InputAccessoryView>
  )
}

const estilos = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderTopWidth: 1,
    borderTopColor: '#C6C6C8',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dica: {
    fontSize: 12,
    color: '#8E8E93',
    flex: 1,
  },
  botao: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    backgroundColor: C.green,
    borderRadius: 10,
  },
  texto: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
})

// No expo-contacts 56 as funções da raiz (getContactsAsync etc.) LANÇAM erro de propósito; as que funcionam ficam em
// 'expo-contacts/legacy'. Este módulo é o único ponto de acesso à agenda (clientes.tsx e nova-venda.tsx).
import * as Contacts from 'expo-contacts/legacy'
import { evento } from './instalacao'

export type ResultadoAgenda =
  | { estado: 'ok'; contatos: Contacts.ExistingContact[] }
  | { estado: 'negado' }
  | { estado: 'erro' }

async function ler(): Promise<Contacts.ExistingContact[]> {
  const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers] })
  return data.filter(c => c.name && c.phoneNumbers?.length)
}

// Só o tipo e o começo da mensagem do erro (texto técnico do módulo nativo, sem dado de contato), no formato aceito pelo banco.
function detalheDoErro(e: unknown): string {
  const err = e as { code?: unknown; message?: unknown } | null
  const texto = `${err?.code ?? ''}:${err?.message ?? e ?? ''}`.replace(/\s+/g, '_')
  return texto
}

export async function carregarContatos(): Promise<ResultadoAgenda> {
  try {
    const perm = await Contacts.requestPermissionsAsync()
    if (perm.status !== 'granted') return { estado: 'negado' }
    let contatos = await ler()
    // iOS 18+: acesso "limitado" (só contatos escolhidos). Se nenhum foi compartilhado, abre o seletor do sistema.
    if (!contatos.length && perm.accessPrivileges === 'limited') {
      try { await Contacts.presentAccessPickerAsync() } catch { /* usuário fechou o seletor */ }
      contatos = await ler()
    }
    return { estado: 'ok', contatos }
  } catch (e) {
    evento('contatos_erro', detalheDoErro(e))
    return { estado: 'erro' }
  }
}

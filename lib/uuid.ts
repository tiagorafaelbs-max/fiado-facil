// Gera um UUID v4 sem depender de `crypto.randomUUID()`, que não é garantido
// em React Native/Hermes sem polyfill (o app não tem expo-crypto nem a lib
// `uuid` instalada). Usado como chave de idempotência client-side (não para
// fins criptográficos), então Math.random() é suficiente aqui.
export function gerarUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16)
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

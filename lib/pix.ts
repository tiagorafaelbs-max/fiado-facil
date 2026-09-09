// Gerador de payload Pix EMV (padrão BACEN)
function crc16(str: string): string {
  let crc = 0xffff
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1
    }
  }
  return ((crc & 0xffff).toString(16).toUpperCase().padStart(4, '0'))
}

function campo(id: string, valor: string): string {
  const len = valor.length.toString().padStart(2, '0')
  return `${id}${len}${valor}`
}

export function gerarPayloadPix(chave: string, nome: string, valor?: number): string {
  const merchantAccountInfo = campo('00', 'BR.GOV.BCB.PIX') + campo('01', chave)
  const payload =
    campo('00', '01') +
    campo('26', merchantAccountInfo) +
    campo('52', '0000') +
    campo('53', '986') +
    (valor ? campo('54', valor.toFixed(2)) : '') +
    campo('58', 'BR') +
    campo('59', nome.slice(0, 25).toUpperCase()) +
    campo('60', 'SAO PAULO') +
    campo('62', campo('05', '***'))

  const semCRC = payload + '6304'
  return semCRC + crc16(semCRC)
}

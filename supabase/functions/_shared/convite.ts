// Regras puras do convite de funcionário pelo WhatsApp (testadas em Node: scripts/teste-convite-equipe.js).
// Nada aqui lê banco nem rede; também não grava o link em log.

export const LIMITE_LINKS_POR_HORA = 10
export const VALIDADE_REGISTRO_DIAS = 7
export const LIMITE_ABERTURAS = 50

export type TipoLinkConvite = 'invite' | 'recovery'

// Usuário que ainda não confirmou o e-mail: link de convite (invite). Quem já abriu o convite fora do app (e-mail confirmado,
// mas sem senha) não aceita mais "invite": usa recovery, que também leva à tela de criar senha.
export function escolherTipoLink(emailConfirmado: boolean): TipoLinkConvite {
  return emailConfirmado ? 'recovery' : 'invite'
}

export function uuidValido(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

export type Acesso = 'celular' | 'computador' | 'robo' | 'head'

// Quem abriu o link do WhatsApp. Robôs (pré-visualização do WhatsApp, Telegram, Facebook, scanners) e HEAD nunca são
// redirecionados; computador recebe o aviso "abra no celular". Só celular segue para o app.
export function classificarAcesso(metodo: string, userAgent: string): Acesso {
  if (metodo.toUpperCase() === 'HEAD') return 'head'
  const ua = userAgent || ''
  if (!ua || /whatsapp|facebookexternalhit|facebot|telegrambot|twitterbot|slackbot|linkedinbot|discordbot|skypeuripreview|bot\b|crawler|spider|preview|curl|wget|python|axios|node-fetch|go-http/i.test(ua)) return 'robo'
  if (/android|iphone|ipad|ipod|mobile/i.test(ua)) return 'celular'
  return 'computador'
}

// Deep link que o app já sabe validar (lib/linkAuth.ts: ?token_hash=&type= -> verifyOtp). O token só é consumido quando
// o APP o valida: abrir o link no computador, ou um robô lê-lo, não gasta o convite.
export function urlDoAppConvite(tokenHash: string, tipo: TipoLinkConvite): string {
  return `fiadofacil://nova-senha?token_hash=${encodeURIComponent(tokenHash)}&type=${tipo}`
}

export function linkDeAbertura(supabaseUrl: string, id: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/abrir-convite?c=${id}`
}

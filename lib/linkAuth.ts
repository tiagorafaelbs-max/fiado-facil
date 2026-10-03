import { useSyncExternalStore } from 'react'
import { Alert } from 'react-native'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Estado do link de convite/recuperação de senha que o app acabou de abrir. A tela
// nova-senha só deixa trocar a senha com estado 'ok' -- achado em produção (02/10):
// o link falhou em silêncio (token já consumido), o expo-router abriu /nova-senha
// mesmo assim e o updateUser() trocou a senha do DONO, que continuava logado.
export type TipoLink = 'invite' | 'recovery'

export type EstadoLink =
  | { status: 'nenhum' }
  | { status: 'processando' }
  | { status: 'ok'; tipo: TipoLink; userId: string; email: string | null }
  | { status: 'erro'; mensagem: string }
  | { status: 'cancelado' }

let estado: EstadoLink = { status: 'nenhum' }
const ouvintes = new Set<() => void>()

export function obterEstadoLink(): EstadoLink {
  return estado
}

export function definirEstadoLink(novo: EstadoLink) {
  estado = novo
  ouvintes.forEach(ouvinte => ouvinte())
}

export function useEstadoLink(): EstadoLink {
  return useSyncExternalStore(
    ouvinte => {
      ouvintes.add(ouvinte)
      return () => { ouvintes.delete(ouvinte) }
    },
    obterEstadoLink,
    obterEstadoLink,
  )
}

export const MENSAGEM_LINK_INVALIDO =
  'Link inválido ou expirado. Peça um novo convite ou uma nova recuperação de senha.'
const MENSAGEM_LINK_USADO =
  'Este link expirou ou já foi usado. Peça um novo convite ou uma nova recuperação de senha.'
const MENSAGEM_SEM_REDE =
  'Não foi possível validar o link. Verifique sua conexão e abra o link de novo.'

// Aceita os formatos que o Supabase pode entregar: ?token_hash=&type= (verifyOtp),
// ?code= (PKCE) e #access_token=&refresh_token=&type= (implícito) -- além de
// ?error= / #error= quando o servidor recusou o link.
function lerParametros(url: string): (chave: string) => string | null {
  const posFragmento = url.indexOf('#')
  const semFragmento = posFragmento >= 0 ? url.slice(0, posFragmento) : url
  const fragmento = posFragmento >= 0 ? url.slice(posFragmento + 1) : ''
  const posQuery = semFragmento.indexOf('?')
  const query = posQuery >= 0 ? semFragmento.slice(posQuery + 1) : ''
  const daQuery = new URLSearchParams(query)
  const doFragmento = new URLSearchParams(fragmento)
  return chave => daQuery.get(chave) ?? doFragmento.get(chave)
}

export function ehLinkDeAuth(url: string): boolean {
  if (url.includes('nova-senha')) return true
  const pega = lerParametros(url)
  return !!(pega('token_hash') || pega('access_token') || pega('code'))
}

function confirmarTrocaDeConta(email: string | null | undefined, tipo: TipoLink): Promise<boolean> {
  const deQuem = email ? `de ${email}` : 'da conta atual'
  const mensagem = tipo === 'invite'
    ? `Este link é de um convite para outra conta. Para aceitar, este aparelho vai sair ${deQuem}. Se você é o dono e só quer testar, abra o link no celular do funcionário.`
    : `Este link é para redefinir a senha de outra conta. Este aparelho vai sair ${deQuem} e entrar na conta do link.`
  return new Promise(resolve => {
    Alert.alert(
      'Trocar de conta?',
      mensagem,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continuar', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    )
  })
}

// Se estourar o tempo, rejeita -- mas a chamada de rede continua viva e pode terminar
// depois (salvando a sessão do link no aparelho). aoChegarTarde deixa a tela refletir
// isso em vez de ficar em 'erro' com a sessão já trocada.
function comTimeout<T>(promessa: PromiseLike<T>, ms: number, aoChegarTarde?: (valor: T) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let estourou = false
    const timer = setTimeout(() => { estourou = true; reject(new Error('timeout')) }, ms)
    Promise.resolve(promessa).then(
      valor => {
        clearTimeout(timer)
        if (estourou) aoChegarTarde?.(valor)
        else resolve(valor)
      },
      erro => { clearTimeout(timer); if (!estourou) reject(erro) },
    )
  })
}

// O refresh_token de um #access_token já vencido é recusado pelo auth-js, que então
// remove a sessão local (SIGNED_OUT) -- deslogaria a conta que está no aparelho mesmo
// com o link falhando. Link com access_token vencido nem chega a chamar setSession.
function tokenExpirado(jwt: string): boolean {
  try {
    const parte = jwt.split('.')[1]
    if (!parte || typeof atob !== 'function') return false
    const base64 = parte.replace(/-/g, '+').replace(/_/g, '/')
    const exp = JSON.parse(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))).exp
    return typeof exp === 'number' && exp * 1000 < Date.now()
  } catch {
    return false
  }
}

function mensagemDeErro(e: any): string {
  const msg = String(e?.message ?? '').toLowerCase()
  if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch')) return MENSAGEM_SEM_REDE
  if (msg.includes('expired') || msg.includes('already') || msg.includes('used')) return MENSAGEM_LINK_USADO
  return MENSAGEM_LINK_INVALIDO
}

type RespostaDeSessao = { data: { session: Session | null }; error: unknown }

async function validarCredencial(
  pega: (chave: string) => string | null,
  tipo: TipoLink,
): Promise<Session | null> {
  const tokenHash = pega('token_hash')
  const code = pega('code')
  const accessToken = pega('access_token')

  const chamar = async <R extends RespostaDeSessao>(chamada: PromiseLike<R>): Promise<Session | null> => {
    const resposta = await comTimeout(chamada, 15000, tarde => {
      const user = tarde.data.session?.user
      if (!tarde.error && user && obterEstadoLink().status === 'erro') {
        definirEstadoLink({ status: 'ok', tipo, userId: user.id, email: user.email ?? null })
      }
    })
    if (resposta.error) throw resposta.error
    return resposta.data.session
  }

  if (tokenHash) return chamar(supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo }))
  if (code) return chamar(supabase.auth.exchangeCodeForSession(code))
  if (accessToken) {
    return chamar(supabase.auth.setSession({ access_token: accessToken, refresh_token: pega('refresh_token') ?? '' }))
  }
  return null
}

async function executar(url: string): Promise<TipoLink> {
  const pega = lerParametros(url)
  const tipoParam = pega('type')
  const tipo: TipoLink = tipoParam === 'invite' ? 'invite' : 'recovery'
  definirEstadoLink({ status: 'processando' })

  try {
    // O servidor recusou o link (ex: token já consumido por pré-visualização do
    // e-mail) -- antes isso caía num `return` silencioso.
    if (pega('error') || pega('error_code') || pega('error_description')) {
      const lembraExpirado = `${pega('error_code') ?? ''} ${pega('error_description') ?? ''}`.toLowerCase()
      definirEstadoLink({
        status: 'erro',
        mensagem: lembraExpirado.includes('expired') ? MENSAGEM_LINK_USADO : MENSAGEM_LINK_INVALIDO,
      })
      return tipo
    }

    const temCredencial = !!(pega('token_hash') || pega('code') || pega('access_token'))
    const tipoValido = tipoParam === 'invite' || tipoParam === 'recovery'
    // Credencial sem tipo conhecido só é aceita no fluxo PKCE (?code=), que
    // historicamente não trazia o tipo e sempre foi tratado como recuperação.
    if (!temCredencial || (!tipoValido && !pega('code'))) {
      definirEstadoLink({ status: 'erro', mensagem: MENSAGEM_LINK_INVALIDO })
      return tipo
    }

    const accessTokenDoLink = pega('access_token')
    if (accessTokenDoLink && tokenExpirado(accessTokenDoLink)) {
      definirEstadoLink({ status: 'erro', mensagem: MENSAGEM_LINK_USADO })
      return tipo
    }

    const { data: { session: atual } } = await supabase.auth.getSession()
    if (atual?.user) {
      const confirmou = await confirmarTrocaDeConta(atual.user.email, tipo)
      if (!confirmou) {
        definirEstadoLink({ status: 'cancelado' })
        return tipo
      }
    }

    const sessao = await validarCredencial(pega, tipo)
    if (!sessao?.user) throw new Error('invalid')
    definirEstadoLink({ status: 'ok', tipo, userId: sessao.user.id, email: sessao.user.email ?? null })
  } catch (e: any) {
    definirEstadoLink({ status: 'erro', mensagem: mensagemDeErro(e) })
  }
  return tipo
}

// O link pode chegar duas vezes (getInitialURL + evento 'url') e o token é de uso
// único: a segunda execução falharia e sobrescreveria o 'ok' com 'erro'. Chamadas
// repetidas com a mesma URL em 15s reaproveitam a mesma execução.
let ultima: { url: string; em: number; promessa: Promise<TipoLink> } | null = null

export function processarLinkAuth(url: string): Promise<TipoLink> {
  if (ultima && ultima.url === url && Date.now() - ultima.em < 15000) return ultima.promessa
  const promessa = executar(url)
  ultima = { url, em: Date.now(), promessa }
  // Quem tocou "Cancelar" sem querer pode abrir o mesmo link de novo na hora.
  promessa.then(() => {
    if (obterEstadoLink().status === 'cancelado' && ultima?.promessa === promessa) ultima = null
  })
  return promessa
}

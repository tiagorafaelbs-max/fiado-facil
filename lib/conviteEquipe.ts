import { supabase } from './supabase'

// Convite de funcionário pelo WhatsApp. O link é gerado no SERVIDOR (edge function convidar-funcionario, só para o dono Pro
// que convidou) e aqui só é montado o texto e aberto o WhatsApp. O link NUNCA vai para log, para o funil nem para o estado
// de erro: quem chama não deve registrá-lo.

export const LINK_PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.fiadofacil.app'
export const LINK_APP_STORE = 'https://apps.apple.com/app/id6783416254'

export function montarTextoConvite(dados: { nome: string; loja?: string | null; link: string }): string {
  const nome = dados.nome.trim() || 'tudo bem'
  const loja = (dados.loja ?? '').trim()
  return [
    `Oi, ${nome}! Você foi convidado para a equipe${loja ? ' da ' + loja : ''} no FiadoApp.`,
    '',
    '1) Instale o FiadoApp:',
    `Android: ${LINK_PLAY_STORE}`,
    `iPhone: ${LINK_APP_STORE}`,
    '',
    '2) Abra ESTE link NO SEU CELULAR, depois de instalar, para criar sua senha:',
    dados.link,
    '',
    'O link vale uma vez.',
  ].join('\n')
}

// wa.me SEM número: o WhatsApp abre a lista de contatos e o dono escolhe para quem mandar.
export function urlWhatsApp(texto: string): string {
  return 'https://wa.me/?text=' + encodeURIComponent(texto)
}

async function chamarFuncao(corpo: Record<string, unknown>): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sessão expirada. Entre de novo.')
  const resp = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/convidar-funcionario`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  const body = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Não foi possível concluir agora. Tente de novo.')
  return body
}

export async function pedirLinkConvite(membroId: string): Promise<{ link: string; loja: string | null; nome: string }> {
  const r = await chamarFuncao({ acao: 'link', membro_id: membroId })
  if (typeof r?.link !== 'string' || !r.link) throw new Error('Não foi possível gerar o link agora. Tente de novo.')
  return { link: r.link, loja: r.loja ?? null, nome: r.nome ?? '' }
}

export async function reenviarConviteEmail(membroId: string): Promise<void> {
  await chamarFuncao({ acao: 'reenviar_email', membro_id: membroId })
}

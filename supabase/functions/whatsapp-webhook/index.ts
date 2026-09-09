import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ============================================================
// Webhook do WhatsApp Cloud API — recebe demandas de manutenção
//
// Variáveis de ambiente necessárias (configurar com `supabase secrets set`):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   WHATSAPP_VERIFY_TOKEN     -> string escolhida por você, usada na verificação do webhook
//   WHATSAPP_TOKEN            -> access token permanente do app no Meta for Developers
//   WHATSAPP_APP_SECRET       -> App Secret (para validar a assinatura de cada requisição)
//   WHATSAPP_PROJETOS         -> JSON opcional mapeando phone_number_id -> nome do projeto
//                                ex: {"1234567890":"fiado-facil","2233445":"outro-app"}
//   OWNER_WHATSAPP_NUMBER     -> seu número (com DDI) para receber alerta de chamados urgentes
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN')!
const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN')!
const APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET')
const PROJETOS_MAP = JSON.parse(Deno.env.get('WHATSAPP_PROJETOS') ?? '{}') as Record<string, string>
const OWNER_NUMBER = Deno.env.get('OWNER_WHATSAPP_NUMBER')
const GRAPH_VERSION = 'v20.0'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ---------- Classificação por palavras-chave (heurística simples) ----------

const PALAVRAS_URGENCIA_ALTA = [
  'urgente', 'urgência', 'não funciona', 'nao funciona', 'parou', 'fora do ar',
  'caiu', 'crash', 'travando', 'trava tudo', 'perdi meus dados', 'sumiu',
]
const PALAVRAS_URGENCIA_BAIXA = [
  'sugestão', 'sugestao', 'ideia', 'quando puder', 'sem pressa', 'só uma dúvida',
]
const PALAVRAS_BUG = ['erro', 'bug', 'não funciona', 'nao funciona', 'travando', 'trava', 'quebrado', 'falha']
const PALAVRAS_DUVIDA = ['como faço', 'como faco', 'dúvida', 'duvida', 'não entendi', 'nao entendi', 'como usar']
const PALAVRAS_MELHORIA = ['sugestão', 'sugestao', 'poderia ter', 'seria bom', 'gostaria que', 'melhoria']
const PALAVRAS_FINANCEIRO = ['cobrança', 'cobranca', 'pagamento', 'assinatura', 'cancelar plano', 'plano pro', 'reembolso']

function contemAlguma(texto: string, palavras: string[]): boolean {
  return palavras.some((p) => texto.includes(p))
}

function classificarUrgencia(texto: string): 'alta' | 'media' | 'baixa' {
  if (contemAlguma(texto, PALAVRAS_URGENCIA_ALTA)) return 'alta'
  if (contemAlguma(texto, PALAVRAS_URGENCIA_BAIXA)) return 'baixa'
  return 'media'
}

function classificarCategoria(texto: string): 'bug' | 'duvida' | 'melhoria' | 'financeiro' | 'outro' {
  if (contemAlguma(texto, PALAVRAS_BUG)) return 'bug'
  if (contemAlguma(texto, PALAVRAS_FINANCEIRO)) return 'financeiro'
  if (contemAlguma(texto, PALAVRAS_MELHORIA)) return 'melhoria'
  if (contemAlguma(texto, PALAVRAS_DUVIDA)) return 'duvida'
  return 'outro'
}

// ---------- Envio de mensagem via WhatsApp Cloud API ----------

async function enviarMensagemWhatsApp(phoneNumberId: string, para: string, texto: string) {
  const resp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: para,
      type: 'text',
      text: { body: texto },
    }),
  })
  if (!resp.ok) {
    console.error('Erro ao enviar mensagem WhatsApp:', await resp.text())
  }
}

// ---------- Validação da assinatura do Meta (segurança) ----------

async function assinaturaValida(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  if (!APP_SECRET) return true // validação desabilitada se o secret não foi configurado
  if (!signatureHeader) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const hashHex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return signatureHeader === `sha256=${hashHex}`
}

serve(async (req) => {
  const url = new URL(req.url)

  // ---- Verificação inicial do webhook (Meta faz um GET na primeira configuração) ----
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return new Response(challenge ?? '', { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  // ---- Recebimento de mensagens (POST) ----
  if (req.method === 'POST') {
    const rawBody = await req.text()
    const assinatura = req.headers.get('x-hub-signature-256')

    if (!(await assinaturaValida(rawBody, assinatura))) {
      console.warn('Assinatura inválida, requisição rejeitada')
      return new Response('Forbidden', { status: 403 })
    }

    try {
      const body = JSON.parse(rawBody)
      const value = body?.entry?.[0]?.changes?.[0]?.value
      const mensagem = value?.messages?.[0]

      // Eventos de status (entregue/lido) não têm "messages" — ignora
      if (!mensagem) {
        return new Response('ok', { status: 200 })
      }

      const phoneNumberId = value.metadata?.phone_number_id as string
      const projeto = PROJETOS_MAP[phoneNumberId] ?? 'fiado-facil'
      const telefoneCliente = mensagem.from as string
      const nomeCliente = value.contacts?.[0]?.profile?.name ?? null
      const whatsappMessageId = mensagem.id as string
      const textoOriginal = mensagem.text?.body ?? '[mensagem sem texto — mídia ou anexo]'
      const textoNormalizado = textoOriginal.toLowerCase()

      const categoria = classificarCategoria(textoNormalizado)
      const urgencia = classificarUrgencia(textoNormalizado)

      const { data: chamado, error } = await supabase
        .from('manutencoes')
        .insert({
          projeto,
          telefone_cliente: telefoneCliente,
          nome_cliente: nomeCliente,
          mensagem: textoOriginal,
          categoria,
          urgencia,
          whatsapp_message_id: whatsappMessageId,
        })
        .select()
        .single()

      // Conflito de whatsapp_message_id = reentrega do Meta, já processamos antes
      if (error) {
        if (error.code === '23505') {
          console.log('Mensagem já processada, ignorando reentrega:', whatsappMessageId)
          return new Response('ok', { status: 200 })
        }
        console.error('Erro ao gravar chamado:', error)
        return new Response('ok', { status: 200 }) // responde 200 pro Meta não ficar reenviando
      }

      // ---- Resposta automática ao cliente ----
      const respostaAutomatica =
        `Olá${nomeCliente ? `, ${nomeCliente}` : ''}! Recebemos sua mensagem sobre o ${projeto} ` +
        `(chamado #${chamado.id.slice(0, 8)}).\n\n` +
        `Categoria: ${categoria} • Urgência: ${urgencia}\n\n` +
        `Vamos analisar e retornar em breve. Se for algo urgente e crítico, responda com "URGENTE" ` +
        `que priorizamos.`

      await enviarMensagemWhatsApp(phoneNumberId, telefoneCliente, respostaAutomatica)
      await supabase.from('manutencoes').update({ resposta_automatica_enviada: true }).eq('id', chamado.id)

      // ---- Notifica o dono em caso de urgência alta ----
      if (urgencia === 'alta' && OWNER_NUMBER) {
        await enviarMensagemWhatsApp(
          phoneNumberId,
          OWNER_NUMBER,
          `🔴 Chamado urgente (${projeto}) de ${nomeCliente ?? telefoneCliente}:\n"${textoOriginal}"`,
        )
      }

      return new Response('ok', { status: 200 })
    } catch (err) {
      console.error('Erro no webhook:', err)
      return new Response('ok', { status: 200 })
    }
  }

  return new Response('Method not allowed', { status: 405 })
})

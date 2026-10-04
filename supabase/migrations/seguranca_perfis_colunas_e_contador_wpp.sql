-- SEGURANÇA: o app não escreve em colunas de sistema de perfis + contador de WhatsApp preso à sessão
--
-- (a) RPCs incrementar_contador_wpp / reverter_contador_wpp: eram SECURITY DEFINER e usavam o p_usuario_id
--     que o cliente manda, sem conferir quem chama — qualquer usuário logado mexia no contador de OUTRA loja
--     (ou zerava o próprio chamando com outro id). Agora o parâmetro é IGNORADO e vale o tenant da sessão
--     (public.tenant_id_atual(): o dono, para o funcionário ativo; ele mesmo, para o dono). A assinatura não
--     muda, então builds antigos e novos continuam chamando do mesmo jeito.
--     Limite conhecido: o contador é do lado do cliente, então reverter_contador_wpp ainda pode ser chamado
--     várias vezes pelo próprio dono para segurar o próprio contador. Fechar isso exige o envio sair do servidor.
-- (b) GRANT por coluna: authenticated só pode gravar em perfis as colunas que o app edita hoje. Ficam FORA
--     (só service_role / funções SECURITY DEFINER escrevem): plano, apple_original_transaction_id, wpp_cobrado_mes,
--     wpp_mes_ref, criado_em. O trigger enforce_pro_modules continua como segunda camada para o plano.
--
-- Colunas que o app grava hoje (levantadas por busca em app/, hooks/, lib/, components/):
--   INSERT (upsert de configuracoes.tsx): id, nome_negocio, telefone, chave_pix, dia_cobranca, notificacoes_ativas,
--           cobranca_auto_tipo
--   UPDATE: as mesmas + modulos (useModulos), categorias_extra (useCategorias), checklist_dia0_completado_em e
--           checklist_dia0_dispensado (useChecklistDia0), notif_resumo_equipe (equipe.tsx), mensagem_cobranca_modelo
--           (mensagem-cobranca.tsx). SetupModal grava chave_pix e dia_cobranca. "id" entra no UPDATE porque o upsert do
--           PostgREST faz "SET id = EXCLUDED.id, ..." (a policy WITH CHECK auth.uid() = id impede mudar para outro id).
--
-- ATENÇÃO para o futuro: coluna NOVA em perfis que o app precise gravar passa a exigir GRANT explícito
-- (grant update (coluna) on public.perfis to authenticated). Sem isso a gravação falha com "permission denied".
--
-- Não altera nenhuma linha. Reversão: ver bloco no fim do arquivo.

-- (só tem efeito dentro de transação: o apply_migration do MCP já envolve; no SQL Editor, abra com begin; e feche com commit;)
set local lock_timeout = '5s';

-- ── a) contador de WhatsApp preso à sessão ──────────────────────────────────────────────
create or replace function public.incrementar_contador_wpp(p_usuario_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id       uuid := public.tenant_id_atual();   -- p_usuario_id é ignorado de propósito
  mes_atual  text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  v_mes_ref  text;
  v_contador integer;
  v_plano    text;
begin
  if v_id is null then
    return json_build_object('permitido', false, 'usado', 0);
  end if;

  select plano, wpp_mes_ref, wpp_cobrado_mes
  into   v_plano, v_mes_ref, v_contador
  from   public.perfis
  where  id = v_id
  for update;

  if not found then
    return json_build_object('permitido', false, 'usado', 0);
  end if;

  if v_plano = 'pro' then
    return json_build_object('permitido', true, 'usado', 0);
  end if;

  if v_mes_ref is distinct from mes_atual then
    update public.perfis
    set    wpp_cobrado_mes = 1, wpp_mes_ref = mes_atual
    where  id = v_id;
    return json_build_object('permitido', true, 'usado', 1);
  end if;

  if v_contador >= 10 then
    return json_build_object('permitido', false, 'usado', v_contador);
  end if;

  update public.perfis
  set    wpp_cobrado_mes = wpp_cobrado_mes + 1
  where  id = v_id;

  return json_build_object('permitido', true, 'usado', v_contador + 1);
end;
$$;

create or replace function public.reverter_contador_wpp(p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- p_usuario_id é ignorado de propósito: só o contador do tenant da própria sessão.
  update public.perfis
  set    wpp_cobrado_mes = greatest(0, wpp_cobrado_mes - 1)
  where  id = public.tenant_id_atual();
end;
$$;
-- CREATE OR REPLACE mantém os privilégios atuais (authenticated executa; anon já não).

-- ── b) UPDATE/INSERT por coluna em perfis ───────────────────────────────────────────────
revoke insert, update on public.perfis from authenticated;

grant insert (id, nome_negocio, telefone, chave_pix, dia_cobranca, notificacoes_ativas, cobranca_auto_tipo)
  on public.perfis to authenticated;

grant update (id, nome_negocio, telefone, chave_pix, dia_cobranca, notificacoes_ativas, cobranca_auto_tipo,
              modulos, categorias_extra, checklist_dia0_completado_em, checklist_dia0_dispensado,
              notif_resumo_equipe, mensagem_cobranca_modelo)
  on public.perfis to authenticated;

-- (SELECT continua no nível da tabela; DELETE já foi revogado na migration seguranca_perfis_sem_pro_gratis.)

-- ── Como conferir DEPOIS de aplicar (cada bloco termina em ROLLBACK) ───────────────────────────────
-- 1) Dono gratuito não grava colunas de sistema (esperado: permission denied for table perfis), tanto em UPDATE
--    quanto em INSERT (usuário sem perfil):
--      ... set local role authenticated; update public.perfis set wpp_cobrado_mes = 0 where id = '<uuid>';
--      ... idem para plano e apple_original_transaction_id;
--      ... insert into public.perfis (id, nome_negocio, plano) values ('<uuid sem perfil>', 'x', 'pro');  (e com wpp_cobrado_mes / apple_original_transaction_id)
-- 2) Dono grava as colunas liberadas e o upsert exato do PostgREST continua valendo:
--      insert into public.perfis (id, nome_negocio, telefone, chave_pix, dia_cobranca, notificacoes_ativas, cobranca_auto_tipo)
--        values ('<uuid>', 'x', null, null, null, true, 'vencidos')
--        on conflict (id) do update set id = excluded.id, nome_negocio = excluded.nome_negocio, telefone = excluded.telefone,
--          chave_pix = excluded.chave_pix, dia_cobranca = excluded.dia_cobranca, notificacoes_ativas = excluded.notificacoes_ativas,
--          cobranca_auto_tipo = excluded.cobranca_auto_tipo;
--      update public.perfis set modulos = modulos, categorias_extra = categorias_extra, checklist_dia0_dispensado = true,
--        checklist_dia0_completado_em = now(), notif_resumo_equipe = false, mensagem_cobranca_modelo = null where id = '<uuid>';
--      update public.perfis set chave_pix = 'x', dia_cobranca = 5 where id = '<uuid>';      -- o que o SetupModal grava
-- 3) Contador preso à sessão: usuário A (gratuito) chama incrementar_contador_wpp('<uuid de B>') e o contador de B não muda.
-- 4) Funcionário ativo chama incrementar_contador_wpp('<qualquer id>') e quem conta é o contador do dono.
-- 5) service_role continua trocando o plano (simula o webhook): set local role service_role; update public.perfis set plano = plano where id = '<uuid>';
-- 6) Usuário de outra loja chama reverter_contador_wpp('<id da vítima>') e o contador da vítima não muda.
-- 7) NO APP, com conta de teste, logo depois de aplicar: salvar Configurações (upsert) e ligar/desligar notificações; ligar um módulo e
--    criar uma categoria; "Pular" o checklist; salvar a Mensagem de cobrança (Pro); ligar o Resumo da equipe; cobrar 1 cliente pelo
--    WhatsApp no plano grátis (contador sobe) e cancelar (contador volta). Se alguma tela mostrar "permission denied", reverter (bloco abaixo).

-- ── Reversão (não faz parte da migration) ──────────────────────────────────────────────
-- grant insert, update on public.perfis to authenticated;     -- volta ao nível de tabela
-- (e recriar as 2 funções com "where id = p_usuario_id" — versão anterior em contador_wpp_verifica_plano_no_servidor.sql)

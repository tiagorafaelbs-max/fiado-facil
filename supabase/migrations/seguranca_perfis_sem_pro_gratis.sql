-- SEGURANÇA (aplicar ANTES dos outros pacotes): fecha a brecha "Pro de graça" em perfis
--
-- A brecha: a policy perfil_proprio é FOR ALL (inclui DELETE e INSERT) e o trigger enforce_pro_modules só
-- impede trocar o plano no UPDATE; no INSERT ele aceita plano = 'pro'. Logo, qualquer usuário logado podia
-- apagar o próprio perfil e inseri-lo de novo já como Pro (nenhuma tabela depende de perfis em cascata, então
-- não custa nada). Fix em 3 camadas:
--   a) policies separadas (SELECT, INSERT e UPDATE do próprio perfil) e SEM DELETE para authenticated —
--      a exclusão de conta é pela edge function delete-account (service_role), e o ON DELETE CASCADE vindo de
--      auth.users continua funcionando (roda como dono da tabela, não depende deste privilégio);
--   b) REVOKE do privilégio DELETE de authenticated (cinto e suspensório: mesmo que uma policy volte, não apaga);
--   c) trigger: INSERT feito por quem não é service_role sempre entra como 'gratuito'.
-- O que continua igual: webhooks e apple-iap-verify (service_role) viram Pro por UPDATE; o cadastro cria o
-- perfil pelo trigger handle_new_user (já insere gratuito); o upsert de configuracoes.tsx continua valendo
-- (perfil existente = caminho de UPDATE, que não toca em plano; perfil inexistente = INSERT gratuito).
--
-- Não altera nenhuma linha. Reversão: ver bloco no fim do arquivo.

-- ── a) policies ─────────────────────────────────────────────────────────────────────────
drop policy if exists perfil_proprio on public.perfis;

drop policy if exists perfis_select_proprio on public.perfis;
create policy perfis_select_proprio on public.perfis
  for select to authenticated using (auth.uid() = id);

drop policy if exists perfis_insert_proprio on public.perfis;
create policy perfis_insert_proprio on public.perfis
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists perfis_update_proprio on public.perfis;
create policy perfis_update_proprio on public.perfis
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- (perfis_leitura_equipe, que deixa o funcionário LER o perfil do dono, não muda.)

-- ── b) sem DELETE para o app ────────────────────────────────────────────────────────────
revoke delete on public.perfis from authenticated;

-- ── c) trigger: INSERT nunca nasce Pro fora do service_role ─────────────────────────────
-- Mesma função de antes (bloqueia troca de plano no UPDATE e sincroniza os módulos Pro), com o bloco novo no começo.
create or replace function public.enforce_pro_modules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and auth.role() is distinct from 'service_role' then
    new.plano := 'gratuito';
  end if;

  if tg_op = 'UPDATE' and auth.role() is distinct from 'service_role'
     and new.plano is distinct from old.plano then
    new.plano := old.plano;
  end if;

  if new.plano = 'gratuito' then
    new.modulos = new.modulos
      || '{"cobranca_automatica": false}'::jsonb
      || '{"equipe": false}'::jsonb
      || '{"score_cliente": false}'::jsonb
      || '{"relatorio_categoria": false}'::jsonb;
  elsif new.plano = 'pro' and (tg_op = 'INSERT' or old.plano = 'gratuito') then
    new.modulos = new.modulos
      || '{"cobranca_automatica": true}'::jsonb
      || '{"score_cliente": true}'::jsonb
      || '{"relatorio_categoria": true}'::jsonb;
  end if;

  return new;
end;
$$;
-- CREATE OR REPLACE mantém o trigger trg_enforce_pro_modules e os privilégios atuais da função
-- (EXECUTE já revogado de anon/authenticated na migration bloqueia_auto_promocao_pro_e_hardening).

-- ── Como conferir DEPOIS de aplicar (rodar no painel; cada bloco termina em ROLLBACK) ───────────────
-- 1) Usuário sem perfil (ex.: um funcionário) tentando se criar como Pro entra como gratuito:
--    begin;
--      select set_config('request.jwt.claims', json_build_object('sub','<uuid de usuário SEM perfil>','role','authenticated')::text, true);
--      set local role authenticated;
--      insert into public.perfis (id, nome_negocio, plano) values ('<mesmo uuid>', 'teste', 'pro');
--      select plano from public.perfis where id = '<mesmo uuid>';   -- esperado: gratuito
--    rollback;
-- 2) Apagar o próprio perfil é recusado:
--    begin;
--      select set_config('request.jwt.claims', json_build_object('sub','<uuid de um dono>','role','authenticated')::text, true);
--      set local role authenticated;
--      delete from public.perfis where id = '<mesmo uuid>';          -- esperado: permission denied for table perfis
--    rollback;
-- 3) O upsert da tela Configurações de um dono Pro continua Pro:
--    begin;
--      select set_config('request.jwt.claims', json_build_object('sub','<uuid de um dono Pro>','role','authenticated')::text, true);
--      set local role authenticated;
--      insert into public.perfis (id, nome_negocio) values ('<mesmo uuid>', 'teste')
--        on conflict (id) do update set nome_negocio = excluded.nome_negocio;
--      select plano from public.perfis where id = '<mesmo uuid>';   -- esperado: pro
--    rollback;

-- ── Reversão (não faz parte da migration) ──────────────────────────────────────────────
-- grant delete on public.perfis to authenticated;
-- drop policy if exists perfis_select_proprio on public.perfis;
-- drop policy if exists perfis_insert_proprio on public.perfis;
-- drop policy if exists perfis_update_proprio on public.perfis;
-- create policy perfil_proprio on public.perfis for all using (auth.uid() = id);
-- (e recriar enforce_pro_modules sem o bloco "tg_op = 'INSERT'" — versão anterior em bloqueia_auto_promocao_pro_e_hardening.sql)

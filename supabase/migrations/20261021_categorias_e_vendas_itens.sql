-- ITENS fase 1.1
-- 1) vendas.itens: o que foi vendido (id, nome, qtd, preco) para o relatório "Por item". Vendas antigas ficam com NULL (= "Sem item").
-- 2) Minhas categorias: renomear / excluir / ocultar mudam vendas e itens de uma vez só (função no servidor, tudo ou nada).
-- Reversão: ver bloco ROLLBACK no fim.

-- ── 1) vendas.itens ──
alter table public.vendas add column if not exists itens jsonb;
alter table public.vendas drop constraint if exists vendas_itens_check;
alter table public.vendas add constraint vendas_itens_check
  check (itens is null or (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) between 1 and 50 and pg_column_size(itens) <= 20000));
-- (vendas já tem GRANT de tabela inteira para authenticated; a coluna nova herda. Sem policy nova: a RLS da linha vale.)

-- ── 2) categorias ocultas (as 5 padrão podem ser escondidas; as do lojista ficam em categorias_extra) ──
alter table public.perfis add column if not exists categorias_ocultas jsonb not null default '[]'::jsonb;
alter table public.perfis drop constraint if exists perfis_categorias_ocultas_check;
alter table public.perfis add constraint perfis_categorias_ocultas_check
  check (jsonb_typeof(categorias_ocultas) = 'array' and jsonb_array_length(categorias_ocultas) <= 5);
-- escrita só pelas funções abaixo (SECURITY DEFINER); o cliente só lê (SELECT da tabela já é liberado ao próprio perfil e à equipe).

-- Quantas vendas e itens usam a categoria (para a confirmação antes de excluir)
create or replace function public.contar_categoria(p_nome text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'vendas', (select count(*) from public.vendas where usuario_id = auth.uid() and categoria = p_nome),
    'itens',  (select count(*) from public.itens  where usuario_id = auth.uid() and categoria = p_nome)
  )
$$;

-- Renomeia: atualiza vendas, itens e a lista do perfil. Categoria padrão renomeada = a antiga fica oculta e a nova entra como "do lojista".
create or replace function public.renomear_categoria(p_antigo text, p_novo text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  padroes constant text[] := array['Mercadoria','Alimento','Serviço','Bebida','Outro'];
  novo text := btrim(coalesce(p_novo, ''));
  antigo text := btrim(coalesce(p_antigo, ''));
  extras jsonb;
  ocultas jsonb;
  p text;
  n_vendas integer;
  n_itens integer;
begin
  if uid is null then raise exception 'Faça login para continuar.'; end if;
  if exists (select 1 from public.membros_equipe where membro_id = uid and status = 'ativo') then
    raise exception 'Só o dono do negócio altera as categorias.';
  end if;
  if antigo = 'Outro' then raise exception 'A categoria "Outro" não pode ser renomeada.'; end if;
  if char_length(novo) < 2 or char_length(novo) > 30 then raise exception 'O nome da categoria deve ter de 2 a 30 letras.'; end if;
  if lower(novo) = lower(antigo) and novo = antigo then
    return jsonb_build_object('vendas', 0, 'itens', 0);
  end if;

  select coalesce(categorias_extra, '[]'::jsonb), coalesce(categorias_ocultas, '[]'::jsonb) into extras, ocultas
    from public.perfis where id = uid for update;
  if not found then raise exception 'Perfil não encontrado.'; end if;

  -- nome novo já usado por outra categoria visível?
  foreach p in array padroes loop
    if lower(p) = lower(novo) and lower(p) <> lower(antigo) and not (ocultas ? p) then
      raise exception 'Já existe a categoria "%".', p;
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements_text(extras) e where lower(e) = lower(novo) and lower(e) <> lower(antigo)) then
    raise exception 'Já existe uma categoria com esse nome.';
  end if;

  -- se o novo nome é uma categoria padrão (oculta), volta a mostrá-la com a grafia padrão em vez de duplicar
  foreach p in array padroes loop
    if lower(p) = lower(novo) then novo := p; ocultas := ocultas - p; end if;
  end loop;

  -- antigo: padrão -> oculta; do lojista -> sai da lista
  if antigo = any(padroes) then
    if not (ocultas ? antigo) then ocultas := ocultas || to_jsonb(antigo); end if;
  else
    extras := coalesce((select jsonb_agg(e) from jsonb_array_elements_text(extras) e where e <> antigo), '[]'::jsonb);
  end if;
  -- novo: só entra em extras se não for padrão
  if not (novo = any(padroes)) and not exists (select 1 from jsonb_array_elements_text(extras) e where e = novo) then
    extras := extras || to_jsonb(novo);
  end if;

  update public.vendas set categoria = novo where usuario_id = uid and categoria = antigo;
  get diagnostics n_vendas = row_count;
  update public.itens set categoria = novo where usuario_id = uid and categoria = antigo;
  get diagnostics n_itens = row_count;
  update public.perfis set categorias_extra = extras, categorias_ocultas = ocultas where id = uid;

  return jsonb_build_object('vendas', n_vendas, 'itens', n_itens);
end;
$$;

-- Exclui: vendas e itens da categoria vão para "Outro". Categoria padrão = fica oculta (pode ser mostrada de novo).
create or replace function public.excluir_categoria(p_nome text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  padroes constant text[] := array['Mercadoria','Alimento','Serviço','Bebida','Outro'];
  v_nome text := btrim(coalesce(p_nome, ''));
  extras jsonb;
  ocultas jsonb;
  n_vendas integer;
  n_itens integer;
begin
  if uid is null then raise exception 'Faça login para continuar.'; end if;
  if exists (select 1 from public.membros_equipe where membro_id = uid and status = 'ativo') then
    raise exception 'Só o dono do negócio altera as categorias.';
  end if;
  if v_nome = 'Outro' or v_nome = '' then raise exception 'A categoria "Outro" não pode ser excluída.'; end if;

  select coalesce(categorias_extra, '[]'::jsonb), coalesce(categorias_ocultas, '[]'::jsonb) into extras, ocultas
    from public.perfis where id = uid for update;
  if not found then raise exception 'Perfil não encontrado.'; end if;

  if v_nome = any(padroes) then
    if not (ocultas ? v_nome) then ocultas := ocultas || to_jsonb(v_nome); end if;
  else
    extras := coalesce((select jsonb_agg(e) from jsonb_array_elements_text(extras) e where e <> v_nome), '[]'::jsonb);
  end if;

  update public.vendas set categoria = 'Outro' where usuario_id = uid and categoria = v_nome;
  get diagnostics n_vendas = row_count;
  update public.itens set categoria = 'Outro' where usuario_id = uid and categoria = v_nome;
  get diagnostics n_itens = row_count;
  update public.perfis set categorias_extra = extras, categorias_ocultas = ocultas where id = uid;

  return jsonb_build_object('vendas', n_vendas, 'itens', n_itens);
end;
$$;

-- Mostra de novo uma categoria padrão que estava oculta
create or replace function public.mostrar_categoria(p_nome text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Faça login para continuar.'; end if;
  if exists (select 1 from public.membros_equipe where membro_id = uid and status = 'ativo') then
    raise exception 'Só o dono do negócio altera as categorias.';
  end if;
  update public.perfis
     set categorias_ocultas = coalesce((select jsonb_agg(e) from jsonb_array_elements_text(categorias_ocultas) e where e <> btrim(coalesce(p_nome, ''))), '[]'::jsonb)
   where id = uid;
end;
$$;

revoke all on function public.contar_categoria(text), public.renomear_categoria(text, text), public.excluir_categoria(text), public.mostrar_categoria(text) from public, anon;
grant execute on function public.contar_categoria(text), public.renomear_categoria(text, text), public.excluir_categoria(text), public.mostrar_categoria(text) to authenticated;

-- ROLLBACK (só se necessário; apagar a coluna perde o detalhe dos itens vendidos):
--   drop function public.contar_categoria(text), public.renomear_categoria(text,text), public.excluir_categoria(text), public.mostrar_categoria(text);
--   alter table public.perfis drop column categorias_ocultas;
--   alter table public.vendas drop column itens;

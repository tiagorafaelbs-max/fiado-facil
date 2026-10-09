-- PARA REVISÃO — NÃO APLICADA. Só aplicar com ordem do Tiago.
-- Desenho: docs/release/DESENHO-instalacoes-app.md (v2, aprovado em 09/10/2026).
--
-- Funil anônimo da instalação (abriu → cadastro → conta → entrou). Sem dado pessoal, sem vínculo com a conta.
-- 'anon' e 'authenticated' só podem INSERIR (GRANT por coluna); nenhum SELECT/UPDATE/DELETE.
-- A data é gravada SÓ com o dia (gatilho): o horário permitiria ligar a instalação ao created_at da conta.
-- Freio: 60 inserções por minuto e 5.000 por dia (dia = dia de São Paulo), por contadores sem ligação com instalações.
-- A função do freio usa search_path vazio (tudo qualificado) e EXECUTE revogado.

create table public.instalacoes_app (
  instalacao_id   uuid  not null,
  etapa           text  not null check (etapa in ('abriu','cadastro','conta','entrou')),
  plataforma      text  not null check (plataforma in ('ios','android')),
  versao_app      text  not null check (char_length(versao_app) between 1 and 20),
  build           text  check (build is null or char_length(build) <= 20),
  runtime_version text  check (runtime_version is null or char_length(runtime_version) <= 64),
  criado_em       date  not null default ((now() at time zone 'America/Sao_Paulo')::date),
  primary key (instalacao_id, etapa)
);
comment on table public.instalacoes_app is 'Funil anônimo de instalações (só INSERT por anon). Sem dado pessoal; data só com o dia. Retenção: 12 meses.';

create table public.instalacoes_contadores (
  tipo    text        not null check (tipo in ('minuto','dia')),
  janela  timestamptz not null,
  n       integer     not null default 0,
  primary key (tipo, janela)
);
comment on table public.instalacoes_contadores is 'Contadores do freio de instalacoes_app (por minuto e por dia). Sem ligação com instalações.';

alter table public.instalacoes_app enable row level security;
alter table public.instalacoes_contadores enable row level security;

revoke all on public.instalacoes_app from public, anon, authenticated;
revoke all on public.instalacoes_contadores from public, anon, authenticated;

grant insert (instalacao_id, etapa, plataforma, versao_app, build, runtime_version)
  on public.instalacoes_app to anon, authenticated;

create policy instalacoes_insert on public.instalacoes_app
  for insert to anon, authenticated
  with check (char_length(versao_app) between 1 and 20);

create or replace function public.instalacoes_app_freio()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  n_min integer;
  n_dia integer;
begin
  -- A data é SEMPRE o dia de hoje (nunca o que vier na linha), sem horário.
  new.criado_em := (now() at time zone 'America/Sao_Paulo')::date;

  insert into public.instalacoes_contadores as c (tipo, janela, n)
    values ('minuto', date_trunc('minute', now()), 1)
    on conflict (tipo, janela) do update set n = c.n + 1
    returning c.n into n_min;

  insert into public.instalacoes_contadores as c (tipo, janela, n)
    values ('dia', (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo', 1)
    on conflict (tipo, janela) do update set n = c.n + 1
    returning c.n into n_dia;

  if n_min > 60 or n_dia > 5000 then
    -- A exceção desfaz também os incrementos acima: o contador nunca passa do teto.
    raise exception 'limite de registros atingido' using errcode = '54000';
  end if;

  -- Poda dos contadores antigos (tabela minúscula), só na primeira inserção de cada minuto.
  if n_min = 1 then
    delete from public.instalacoes_contadores where janela < now() - interval '2 days';
  end if;

  return new;
end;
$function$;

revoke execute on function public.instalacoes_app_freio() from public, anon, authenticated;

create trigger trg_instalacoes_app_freio
  before insert on public.instalacoes_app
  for each row execute function public.instalacoes_app_freio();

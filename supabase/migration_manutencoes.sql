-- Chamados de manutenção recebidos via WhatsApp
-- Execute este script no SQL Editor do Supabase
-- Tabela administrativa (não é por usuário final do app — é para o dono/mantenedor
-- acompanhar as demandas de manutenção que chegam pelo WhatsApp de qualquer projeto)

create table if not exists public.manutencoes (
  id                          uuid primary key default uuid_generate_v4(),
  projeto                     text not null default 'fiado-facil',
  telefone_cliente            text not null,
  nome_cliente                text,
  mensagem                    text not null,
  categoria                   text not null default 'outro'
                                check (categoria in ('bug', 'duvida', 'melhoria', 'financeiro', 'outro')),
  urgencia                    text not null default 'media'
                                check (urgencia in ('baixa', 'media', 'alta')),
  status                      text not null default 'novo'
                                check (status in ('novo', 'em_andamento', 'aguardando_cliente', 'resolvido')),
  resposta_automatica_enviada boolean not null default false,
  whatsapp_message_id         text unique,
  criado_em                   timestamptz not null default now(),
  atualizado_em               timestamptz not null default now()
);

create index if not exists idx_manutencoes_projeto  on public.manutencoes(projeto);
create index if not exists idx_manutencoes_status    on public.manutencoes(status);
create index if not exists idx_manutencoes_urgencia  on public.manutencoes(urgencia);
create index if not exists idx_manutencoes_telefone  on public.manutencoes(telefone_cliente);

-- Atualiza atualizado_em automaticamente
create or replace function public.tocar_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists trg_manutencoes_atualizado_em on public.manutencoes;
create trigger trg_manutencoes_atualizado_em
  before update on public.manutencoes
  for each row execute function public.tocar_atualizado_em();

-- RLS: só o service role (usado pela edge function e por um futuro painel admin
-- autenticado) acessa esta tabela. Sem policies públicas de propósito.
alter table public.manutencoes enable row level security;

-- Checklist leve do primeiro dia (item 6 aprovado 29/09): "1º cliente · 1ª venda ·
-- 2º cliente · 2ª venda". Guarda quando o usuário completou (todos os 4 passos) e se
-- dispensou o card, pra medir ativação sem precisar de uma tabela de eventos nova.
alter table public.perfis add column if not exists checklist_dia0_completado_em timestamptz;
alter table public.perfis add column if not exists checklist_dia0_dispensado boolean not null default false;

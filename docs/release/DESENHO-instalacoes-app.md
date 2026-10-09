# Desenho — funil anônimo "instalou → abriu → cadastrou" (para aprovação, 09/10/2026 · v2 após parecer do Fiscal)

**Status: DESENHO. Nada aplicado.** Nenhuma migration, nenhuma permissão de `anon` mexida, nenhum código deste item escrito. Este documento mexe com o papel `anon`; o incidente de 16/09 (a view `clientes_com_saldo` lida por `anon` devolveu 65 empresas e 473 clientes) é o motivo do rigor abaixo.

**v2:** incorpora as correções obrigatórias do Fiscal (C1: o horário permitia reidentificar; C2: o freio precisava ser implementável e limitar custo) e as recomendações R1 a R5.

## 1. O que queremos medir
O Play Console mostra 37 aparelhos com o app instalado e o banco só tem 10 contas Android. O cadastro não falha (215 cadastros em 30 dias; só 2 sem confirmar; 07/10: 3 chamadas, todas 200). A perda está **antes do formulário**, e hoje não temos nenhum dado dessa fase porque tudo só é gravado depois do login (`dispositivos_app` exige `usuario_id`).

Funil desejado, por plataforma e versão: **abriu o app** → **chegou à tela de cadastro** → **criou a conta** (e, para comparar com quem volta: **entrou** numa conta existente).

## 2. Princípios
1. **Nenhum dado pessoal.** Sem e-mail, nome, telefone, modelo do aparelho, ID de publicidade nem localização, e **sem IP gravado na tabela** (ver R2 sobre os logs do gateway).
2. **Sem vínculo com a conta.** A tabela não tem `usuario_id` nem chave que ligue a instalação a um perfil. **A data é gravada só com o DIA** (um gatilho zera hora, minuto e segundo; C1): com horário em segundos, a etapa `conta` coincidiria com o `created_at` de `auth.users` e permitiria ligar instalação e conta. Mesmo só com o dia, em dias de pouquíssimo cadastro o cruzamento dia + plataforma + versão pode estreitar a busca; por isso a classificação nas lojas é conservadora (§6).
3. **`anon` só pode INSERIR.** Nunca ler, alterar nem apagar. Quem lê é o dono do projeto (SQL/painel).
4. **Falha silenciosa e sem fila complexa:** se não conseguir enviar, o app segue normalmente e tenta na próxima abertura.

## 3. Modelo de dados proposto

Uma tabela **só de inserção (append-only)**, um evento por etapa por instalação. O "limite por id" vira uma restrição de unicidade (cada instalação grava cada etapa uma vez; no máximo 4 linhas por instalação).

```sql
create table public.instalacoes_app (
  instalacao_id   uuid  not null,                    -- gerado no app, guardado no aparelho; reinstalar = novo id
  etapa           text  not null check (etapa in ('abriu','cadastro','conta','entrou')),
  plataforma      text  not null check (plataforma in ('ios','android')),
  versao_app      text  not null check (char_length(versao_app) between 1 and 20),
  build           text  check (build is null or char_length(build) <= 20),
  runtime_version text  check (runtime_version is null or char_length(runtime_version) <= 64),
  criado_em       date  not null default current_date,   -- só o DIA; gatilho BEFORE INSERT força esse valor (C1)
  primary key (instalacao_id, etapa)
);
```

- **"abriu"**: primeira abertura do app, **antes do login** (leva plataforma/versão/build); **"cadastro"**: a tela de criar conta abre; **"conta"**: o `signUp` deu certo (mesmo sem confirmar o e-mail); **"entrou"**: primeira vez que a instalação tem sessão.
- `instalacao_id` é um UUID aleatório criado no app (`lib/uuid.ts`) e guardado em `AsyncStorage` (`@fiado_instalacao_id`).

### 3.1 Permissões (o ponto crítico)
```sql
alter table public.instalacoes_app enable row level security;
revoke all on public.instalacoes_app from public, anon, authenticated;       -- ponto de partida: ninguém
grant insert (instalacao_id, etapa, plataforma, versao_app, build, runtime_version)
  on public.instalacoes_app to anon, authenticated;                          -- só INSERT, só estas colunas (criado_em fica de fora: ninguém forja a data)
create policy instalacoes_insert on public.instalacoes_app
  for insert to anon, authenticated
  with check (char_length(versao_app) between 1 and 20);                     -- condição real (R1): evita o aviso "policy sempre verdadeira" do Security Advisor
-- Nenhuma policy de SELECT/UPDATE/DELETE e nenhum GRANT desses comandos: anon e authenticated não leem nada.
```
- **Sem `.select()` no app:** o `insert` do supabase-js só devolve linhas se pedirem; pedir a linha de volta exigiria SELECT e falharia. O app usa `insert` simples e trata `23505` (já gravou essa etapa) como sucesso.
- **Sem `upsert`** (exige UPDATE/SELECT).
- A tabela **não entra em nenhuma view** nem tem GRANT para views.

### 3.2 Gatilho de data (C1)
`BEFORE INSERT` que faz `new.criado_em := current_date` (sempre, ignorando o que vier). Como `criado_em` nem sequer está na lista de colunas permitidas ao `anon`, o valor vem do `default`; o gatilho é a segunda trava.

### 3.3 Freio contra enxurrada e custo (C2)
Qualquer pessoa com a chave pública do app poderia gerar UUIDs aleatórios e encher a tabela. Como `anon` **não pode ler**, o freio não pode contar linhas da própria tabela. Desenho implementável:

- Tabela auxiliar `instalacoes_contadores (tipo text, janela timestamptz, n int, primary key (tipo, janela))`, **sem nenhuma ligação com instalações** (guarda só contagens por minuto e por dia), com RLS ligado e **sem nenhum GRANT** a `anon`/`authenticated`.
- Gatilho `BEFORE INSERT` em `instalacoes_app` chamando uma função **`SECURITY DEFINER`, `set search_path = public`, `EXECUTE` revogado de `public`, `anon` e `authenticated`** (o gatilho a executa mesmo assim; ninguém consegue chamá-la direto). Ela incrementa os contadores do minuto e do dia (`insert … on conflict do update`) e **recusa** a inserção quando passa do teto.
- **Tetos:** 60 inserções por minuto e **5.000 por dia** (hoje o volume real é de dezenas por dia). O teto diário limita o custo de armazenamento mesmo numa enxurrada sustentada: no pior caso 5.000 linhas/dia ≈ 1,8 milhão/ano.
- A função apaga contadores com mais de 2 dias (a poda acontece junto das inserções; o número de linhas auxiliares fica minúsculo).
- **Retenção:** apagar linhas de `instalacoes_app` com mais de 12 meses (rotina manual/agendada futura).

**Riscos aceitos (registrados):**
1. **Um atacante consegue pausar a medição de propósito** (basta estourar o teto do minuto ou do dia). Como é só métrica e nada do app depende dela, é aceitável.
2. **Números podem ser poluídos/inflados** por quem queira; por isso a análise compara tendências por versão e plataforma e confere com Play Console / App Store Connect.
3. **Limitação de medição (R4):** o registro de quais etapas já foram enviadas fica no `AsyncStorage` (`@fiado_etapas_enviadas`); se o lojista limpar os dados do app, vira uma instalação nova (novo id) e conta de novo.

## 4. Mudanças no app (JS puro, vão por OTA)
- `lib/instalacao.ts`: `registrarEtapa(etapa)` — lê/cria o `instalacao_id`, lê o que já foi enviado, faz `supabase.from('instalacoes_app').insert(...)` com timeout curto, ignora falhas e `23505`; chamado no `app/_layout.tsx` (abriu), na tela `cadastro` (cadastro), no `cadastrar()` do `useAuth` (conta) e quando a sessão carrega pela 1ª vez (entrou).
- Sem bibliotecas novas, sem permissão nova no aparelho, **sem build novo**.

## 5. Testes obrigatórios antes de aplicar (no estilo do incidente de 16/09)
Em transação revertida / bloco `DO … RAISE EXCEPTION`, com contagem de perfis/clientes/vendas igual antes e depois ("0 mudam"):
1. `anon` insere 1 linha válida: OK.
2. `anon` tenta `SELECT`, `UPDATE`, `DELETE`: **permissão negada**; `authenticated` idem.
3. Mesmo `(instalacao_id, etapa)` duas vezes: `23505`.
4. `plataforma` inválida, `versao_app` vazia ou longa demais, `etapa` desconhecida (inclui 5ª etapa): `23514`.
5. Mesmo `instalacao_id` com etapas diferentes (`abriu`, `cadastro`, `conta`, `entrou`): OK; 5ª etapa diferente: recusada pelo CHECK.
6. `anon` tenta gravar a coluna `criado_em` (ex.: data falsa): negado; e o valor gravado é o **dia** de hoje, sem horário (C1).
7. Freio: a 61ª inserção no mesmo minuto é recusada; passar de 5.000 no dia é recusado; os contadores não são legíveis por `anon`.
8. **`anon` não consegue chamar a função do freio diretamente** (`EXECUTE` revogado) nem ler/alterar `instalacoes_contadores`.
9. Teste "anon lê zero linhas" em **todas** as tabelas do esquema `public` (inclui as novas) com o mesmo roteiro do incidente; `get_advisors` (segurança) antes e depois: sem ERROR novo.
10. R1: se o Security Advisor ainda acusar a policy de INSERT (`anon`), registrar como **esperado** (a tabela é só de inserção, com CHECKs) para não virar ruído.

## 6. Privacidade e lojas ("Segurança dos dados" / "App Privacy")
**Só atualizar depois de aprovado e publicado.** Classificação conservadora:
- **Google Play, Segurança dos dados:** "Identificadores de dispositivo ou outros IDs" → **coletado**, **não compartilhado**, finalidade **análise**, **não** opcional (ocorre na abertura), **criptografado em trânsito**; dados **não vinculados** à identidade (sem ligação com a conta; data só com o dia).
- **Apple, App Privacy (R3):** um ID aleatório gerado pelo app combina com "Dados de uso → Interação com o produto"; por prudência declarar **também** "Identificadores → ID do dispositivo", ambos **não vinculados à identidade**, **não usados para rastreamento**, finalidade **Análise**. Conferir a classificação ao preencher o formulário.
- **Política de privacidade (app `app/privacidade.tsx` e site):** acrescentar: "Ao abrir o app, registramos de forma anônima, sem vínculo com sua conta, um identificador aleatório da instalação, a plataforma, a versão do app e o **dia** da ação, para medir quantas pessoas abrem o app e criam conta. Esses dados não identificam você. **O serviço de hospedagem pode manter por alguns dias, nos registros técnicos de acesso, o endereço IP das conexões**; não o gravamos em nossas tabelas (R2). Guardamos esses dados por até 12 meses."
- Conta excluída: nada a apagar aqui (sem vínculo).

## 7. Alternativas consideradas
- **Tabela com `UPDATE` por `anon`** (uma linha por instalação com marcos): descartada, `anon` poderia sobrescrever linhas de outras instalações.
- **Função `SECURITY DEFINER` exposta para gravar:** descartada (superfície maior: função executável por `anon` com privilégio elevado). A única função `SECURITY DEFINER` deste desenho é a do freio, **não executável** por `anon`.
- **Ferramenta externa de analytics** (Firebase/PostHog etc.): mais recursos, mas exige SDK nativo (build novo), novas declarações de privacidade e envia dado a terceiro. Não recomendo agora.
- **Contar só pelo Play Console / App Store Connect:** já fazemos; não mostra o que acontece dentro do app (abriu, viu cadastro).

## 8. Ordem de execução (cada etapa com a sua ordem)
1. Você aprova este desenho (v2).
2. Eu escrevo a migration e as simulações; rodo os testes da §5 em transação revertida; Fiscal revisa.
3. Você autoriza aplicar a migration.
4. Código do app (OTA, junto com a branch do funil) e Fiscal.
5. Você autoriza a OTA; depois atualizamos "Segurança dos dados", "App Privacy" e a política.

Estimativa: ~1 dia de trabalho (banco + app + testes), fora a espera de aprovações.

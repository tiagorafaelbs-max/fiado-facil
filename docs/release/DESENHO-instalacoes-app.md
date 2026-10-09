# Desenho — funil anônimo "instalou → abriu → cadastrou" (para aprovação, 09/10/2026)

**Status: DESENHO. Nada aplicado.** Nenhuma migration, nenhuma permissão de `anon` mexida, nenhum código deste item escrito. Este documento mexe com o papel `anon`; o incidente de 16/09 (a view `clientes_com_saldo` lida por `anon` devolveu 65 empresas e 473 clientes) é o motivo do rigor abaixo.

## 1. O que queremos medir
O Play Console mostra 37 aparelhos com o app instalado e o banco só tem 10 contas Android. O cadastro não falha (215 cadastros em 30 dias; só 2 sem confirmar; 07/10: 3 chamadas, todas 200). A perda está **antes do formulário**, e hoje não temos nenhum dado dessa fase porque tudo só é gravado depois do login (`dispositivos_app` exige `usuario_id`).

Funil desejado, por plataforma e versão: **abriu o app** → **chegou à tela de cadastro** → **criou a conta** (e, para comparar com quem volta: **entrou** numa conta existente).

## 2. Princípios
1. **Nenhum dado pessoal.** Sem e-mail, nome, telefone, IP gravado, modelo do aparelho, ID de publicidade nem localização.
2. **Sem vínculo com a conta.** A tabela não tem `usuario_id` nem chave que ligue a instalação a um perfil. Excluir a conta não deixa rastro aqui, e o dado anônimo não identifica ninguém.
3. **`anon` só pode INSERIR.** Nunca ler, alterar nem apagar. Quem lê é o dono do projeto (SQL/painel).
4. **Falha silenciosa e sem fila complexa:** se não conseguir enviar, o app segue normalmente e tenta na próxima abertura.

## 3. Modelo de dados proposto

Uma tabela **só de inserção (append-only)**, um evento por etapa por instalação. O "limite por id" que você pediu vira uma restrição de unicidade (cada instalação só pode gravar cada etapa uma vez).

```sql
create table public.instalacoes_app (
  instalacao_id   uuid        not null,                    -- gerado no app, guardado no aparelho; reinstalar = novo id
  etapa           text        not null check (etapa in ('abriu','cadastro','conta','entrou')),
  plataforma      text        not null check (plataforma in ('ios','android')),
  versao_app      text        not null check (char_length(versao_app) between 1 and 20),
  build           text        check (build is null or char_length(build) <= 20),
  runtime_version text        check (runtime_version is null or char_length(runtime_version) <= 64),
  criado_em       timestamptz not null default now(),
  primary key (instalacao_id, etapa)                       -- limite por instalação: no máximo 4 linhas
);
```

- **"abriu"** é gravada na primeira abertura do app, **antes do login** (leva plataforma/versão/build); **"cadastro"** quando a tela de criar conta abre; **"conta"** quando o `signUp` dá certo (mesmo sem confirmar o e-mail); **"entrou"** na primeira vez que a instalação tem sessão.
- `instalacao_id` é um UUID aleatório criado no app (`lib/uuid.ts`) e guardado em `AsyncStorage` (`@fiado_instalacao_id`).

### Permissões (o ponto crítico)
```sql
alter table public.instalacoes_app enable row level security;
revoke all on public.instalacoes_app from public, anon, authenticated;       -- ponto de partida: ninguém
grant insert (instalacao_id, etapa, plataforma, versao_app, build, runtime_version)
  on public.instalacoes_app to anon, authenticated;                          -- só INSERT, só estas colunas
create policy instalacoes_insert on public.instalacoes_app
  for insert to anon, authenticated
  with check (true);                                                          -- os CHECKs da tabela validam o conteúdo
-- Nenhuma policy de SELECT/UPDATE/DELETE e nenhum GRANT desses comandos: anon e authenticated não leem nada.
```
- **Sem `.select()` no app:** o `insert` do supabase-js só devolve linhas se pedirem; se pedir "retornar a linha", o banco exige SELECT e falha. O app usa `insert` simples e trata o erro `23505` (já gravou essa etapa) como sucesso.
- **Sem `upsert`** (upsert exige UPDATE/SELECT).
- A tabela **não entra em nenhuma view** nem tem `GRANT` para views.

### Freio contra enxurrada de lixo
Qualquer pessoa com a chave pública do app (`anon`) poderia gerar UUIDs aleatórios e encher a tabela. Mitigações propostas:
1. `CHECK`s de tamanho/valores (acima): o conteúdo não é livre.
2. **Gatilho de freio global:** `BEFORE INSERT` que recusa novas linhas quando houve mais de, por exemplo, 300 inserções no último minuto (barato, indexado por `criado_em`). Efeito colateral aceito: numa enxurrada a medição pausa; nada mais do app depende desta tabela.
3. **Retenção:** apagar linhas com mais de 12 meses (rotina manual/agendada futura).
4. Monitorar o tamanho da tabela junto com os relatórios.
Risco residual que **não** elimino: números do funil podem ser inflados/poluídos por quem queira (é métrica, não segurança); por isso a análise compara tendências por versão e plataforma e confere com o Play Console.

## 4. Mudanças no app (JS puro, vão por OTA)
- `lib/instalacao.ts`: `registrarEtapa(etapa)` — lê/cria o `instalacao_id`, lê o que já foi enviado (`@fiado_etapas_enviadas`), faz `supabase.from('instalacoes_app').insert(...)` com timeout curto, ignora falhas e `23505`; chamado no `app/_layout.tsx` (abriu), na tela `cadastro` (cadastro), no `cadastrar()` do `useAuth` (conta) e quando a sessão carrega pela 1ª vez (entrou).
- Sem bibliotecas novas, sem permissão nova no aparelho, **sem build novo**.

## 5. Testes obrigatórios antes de aplicar (no estilo do incidente de 16/09)
Em transação revertida / bloco `DO … RAISE EXCEPTION`:
1. `anon` insere 1 linha válida: OK.
2. `anon` tenta `SELECT`, `UPDATE`, `DELETE`: **permissão negada**; `authenticated` idem.
3. Mesmo `(instalacao_id, etapa)` duas vezes: `23505`.
4. `plataforma` inválida, `versao_app` vazia ou longa demais, `etapa` desconhecida: `23514`.
5. `anon` tenta inserir coluna fora da lista (ex.: `criado_em`): negado.
6. Gatilho de freio: 301ª inserção no minuto é recusada.
7. Teste "anon lê zero linhas" em **todas** as tabelas do esquema `public` (inclui a nova) com o mesmo roteiro do incidente.
8. `get_advisors` (segurança) antes e depois: sem ERROR novo; contagem de perfis/clientes/vendas igual antes e depois ("0 mudam").

## 6. Privacidade e lojas ("Segurança dos dados" / "App Privacy")
**Só atualizar depois de aprovado e publicado.** Texto proposto:
- **Google Play, Segurança dos dados:** "Identificadores de dispositivo ou outros IDs" → **coletado**, **não compartilhado**, finalidade **análise**, **não** é opcional (acontece na abertura), dado **criptografado em trânsito**. Adicionar também "Interações do app / registros de atividade" só se for considerado (etapas do funil). Não vinculado à identidade do usuário.
- **Apple, App Privacy:** "Identificadores → ID do dispositivo" e "Dados de uso → Interação com o produto": **não vinculados à identidade**, **não usados para rastreamento**, finalidade **Análise**.
- **Política de privacidade (app `app/privacidade.tsx` e site):** acrescentar um parágrafo: "Ao abrir o app, registramos de forma anônima, sem vínculo com sua conta, um identificador aleatório da instalação, a plataforma e a versão do app, para medir quantas pessoas abrem o app e criam conta. Esses dados não identificam você." Retenção: 12 meses.
- Conta excluída: nada a apagar aqui (sem vínculo).

## 7. Alternativas consideradas
- **Tabela com `UPDATE` por `anon`** (uma linha por instalação com marcos): descartada, `anon` poderia sobrescrever linhas de outras instalações.
- **Função `SECURITY DEFINER` para gravar:** tecnicamente possível e centraliza regras, mas aumenta a superfície (função executável por `anon` com privilégio elevado). Só se a tabela direta se mostrar insuficiente.
- **Ferramenta externa de analytics** (Firebase/PostHog etc.): mais recursos, mas exige SDK nativo (build novo), novas declarações de privacidade e envia dado a terceiro. Não recomendo agora.
- **Contar pelo Play Console / App Store Connect:** já fazemos; não mostra o que acontece dentro do app (abriu, viu cadastro).

## 8. Ordem de execução (cada etapa com a sua ordem)
1. Você aprova este desenho.
2. Eu escrevo a migration e as simulações; rodo os testes da §5 em transação revertida; Fiscal revisa.
3. Você autoriza aplicar a migration.
4. Código do app (OTA, junto com a branch do funil) e Fiscal.
5. Você autoriza a OTA; depois atualizamos "Segurança dos dados", "App Privacy" e a política.

Estimativa: ~1 dia de trabalho (banco + app + testes), fora a espera de aprovações.

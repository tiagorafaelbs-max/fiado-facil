# Textos de privacidade do funil anônimo — para revisão do Tiago (09/10/2026)

**O que passa a ser coletado:** a partir da OTA Android de 09/10 (Update `01a12264-1bff-743c-9d55-8bb95628b1fe`) todo aparelho **novo** Android grava em `instalacoes_app`: um identificador aleatório da instalação, a etapa (`abriu`, `cadastro`, `conta`, `entrou`), a plataforma, a versão do app, o número do build, a versão de runtime e o **dia** (sem horário). Sem e-mail, nome, telefone, modelo, IP em tabela nem vínculo com a conta. Retenção: 12 meses. A política **dentro do app** já foi atualizada (seção 2 de `app/privacidade.tsx`, vai nesta OTA). O iOS só passa a coletar quando a OTA iOS sair.

**Nada abaixo foi enviado a lugar nenhum.** Os formulários das lojas e a política do site são com você.

---

## 1. Google Play Console — Segurança dos dados (fazer no mesmo dia da OTA Android)
Caminho: Play Console → app → **Conteúdo do app** → **Segurança dos dados** → Gerenciar. Mantenha o que já está declarado e **acrescente/confira**:

| Pergunta | Resposta |
|---|---|
| Categoria de dados | **IDs de dispositivo ou outros** (Device or other IDs) |
| Coletado? | **Sim** |
| Compartilhado com terceiros? | **Não** (fica no nosso banco; a hospedagem é operador, não "compartilhamento") |
| Tratamento efêmero? | **Não** (guardado por até 12 meses) |
| Obrigatório ou opcional? | **Obrigatório** (acontece ao abrir o app, sem escolha do usuário) |
| Finalidade | **Análise** (Analytics) |
| Criptografado em trânsito? | **Sim** (HTTPS) |
| Usuário pode pedir exclusão? | O dado é **anônimo e sem vínculo com a conta**: não há como localizar o dado de uma pessoa. Se o formulário exigir resposta, marque que **não** há mecanismo de exclusão para esse dado e explique que ele não identifica ninguém e é apagado após 12 meses |
| Categoria adicional (se quiser ser conservador) | **Atividade no app → Interações com o app** (etapas abriu/cadastro/conta/entrou), mesmas respostas (coletado, não compartilhado, análise, não vinculado) |

Observação: a versão do app e a plataforma **vinculadas à conta** (`dispositivos_app`, para suporte) já deviam estar declaradas desde a versão 1.0.12; se não estiverem, declare também (Informações do app e desempenho → **Diagnóstico** ou **Outros dados de desempenho**; coletado, não compartilhado, funcionalidade do app/análise).

## 2. Apple — App Privacy (fazer **quando a OTA iOS sair**; não antes)
Caminho: App Store Connect → app → **Privacidade do app** → Editar. **Acrescente** (conservador, os dois):

| Tipo de dado | Vinculado ao usuário? | Usado para rastrear? | Finalidade |
|---|---|---|---|
| **Identificadores → ID do dispositivo** (o ID aleatório da instalação) | **Não** | **Não** | **Análise** |
| **Dados de uso → Interação com o produto** (etapas do funil) | **Não** | **Não** | **Análise** |

Se a Apple achar excessivo classificar como "ID do dispositivo" (é gerado pelo app, não é o do aparelho), dá para declarar só "Interação com o produto"; a escolha acima é a mais prudente. Esta mudança de formulário **não** exige novo build.

## 3. Política de privacidade do SITE (`https://fiadoapp.app.br/privacidade`; arquivo local `site-live-mirror/privacidade.html`, seção 2)
Hoje o item "Dados técnicos básicos" diz apenas "informações de uso e de erro do aplicativo, usadas exclusivamente para manter o serviço funcionando e corrigir problemas." **Substituir** por:

```html
<li><strong>Dados técnicos básicos:</strong> informações de uso e de erro do aplicativo, usadas exclusivamente para manter o serviço funcionando e corrigir problemas, e dados técnicos do app (plataforma, versão e último acesso) usados para suporte e para avisar sobre atualizações.</li>
<li><strong>Medição anônima de uso:</strong> ao abrir o app, registramos de forma anônima, sem vínculo com a sua conta, um identificador aleatório da instalação, a plataforma, a versão do app e o dia da ação (sem horário), para medir quantas pessoas abrem o app e criam conta. Esses dados não identificam você e são guardados por até 12 meses. O serviço de hospedagem pode manter por alguns dias, nos registros técnicos de acesso, o endereço IP das conexões; nós não o gravamos em nossas tabelas.</li>
```
E na seção 5 ("Por quanto tempo guardamos seus dados") acrescentar uma linha: "Os dados de medição anônima de uso são guardados por até 12 meses." Atualizar a data de "última atualização" da página.
**Não publiquei o site** (publicar site é decisão sua; o arquivo local não foi alterado).

## 4. Política dentro do app (já na OTA) — texto exato da seção 2
"Registramos dados técnicos do app (plataforma, versão e último acesso), usados para suporte e para avisar sobre atualizações. Ao abrir o app, registramos também, de forma anônima e sem vínculo com a sua conta, um identificador aleatório da instalação, a plataforma, a versão do app e o dia da ação (sem horário), para medir quantas pessoas abrem o app e criam conta. Esses dados não identificam você e são guardados por até 12 meses. O serviço de hospedagem pode manter por alguns dias, nos registros técnicos de acesso, o endereço IP das conexões; nós não o gravamos em nossas tabelas. Não registramos IMEI, identificador de publicidade nem localização do aparelho."

## 5. Como conferir depois (leitura)
- Aparelho limpo: abrir → 1 linha `abriu`; abrir o cadastro → `cadastro`; criar conta → `conta` e `entrou`; aparelho que já usava o app → nenhuma linha; a data é só o dia.
- Consulta (só leitura, por mim): contagem por etapa × plataforma × versão.

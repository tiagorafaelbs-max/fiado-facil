# FiadoApp — Sistema Multi-Agente AAA

## Regra Principal

Leia os docs do Expo SDK 56 antes de qualquer código:
https://docs.expo.dev/versions/v56.0.0/

---

## Time de Agentes

O FiadoApp usa um sistema de agentes especializados com validação obrigatória.
**Nenhuma mudança chega ao usuário sem aprovação do Agente Fiscal.**

```
┌─────────────────────────────────────────────────────┐
│           ARQUITETO CHEFE (Claude principal)         │
│  Recebe pedido → Delega → Valida → Reporta usuário  │
└──────────────────────┬──────────────────────────────┘
                       │ delega tarefas
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐
   │  VISUAL  │  │ BACKEND  │  │PAGAMENTOS│
   │  UI/UX   │  │ Supabase │  │MercadoPag│
   └────┬─────┘  └────┬─────┘  └────┬─────┘
        │              │              │
        ▼              ▼              ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐
   │QUALIDADE │  │SEGURANÇA │  │ RELEASE  │
   │   QA     │  │  LGPD    │  │EAS/Stores│
   └────┬─────┘  └────┬─────┘  └────┬─────┘
        │              │              │
        └──────────────┼──────────────┘
                       ▼
              ┌─────────────────┐
              │  AGENTE FISCAL  │  ← PORTÃO OBRIGATÓRIO
              │  Valida e       │
              │  Aprova TUDO    │
              └────────┬────────┘
                       │ aprovado
                       ▼
              Usuário recebe resultado
```

---

## Agentes Disponíveis

| Agente | Arquivo | Responsabilidade |
|--------|---------|-----------------|
| **fiscal** | `.claude/agents/fiscal.md` | Validação e aprovação de TODO trabalho |
| **visual** | `.claude/agents/visual.md` | UI, telas, componentes, animações |
| **backend** | `.claude/agents/backend.md` | Supabase, queries, RLS, edge functions |
| **pagamentos** | `.claude/agents/pagamentos.md` | MercadoPago, IAP, assinaturas |
| **qualidade** | `.claude/agents/qualidade.md` | QA, testes, validação de fluxos |
| **performance** | `.claude/agents/performance.md` | Otimização, bundle, renders |
| **seguranca** | `.claude/agents/seguranca.md` | Auth, LGPD, RLS, vulnerabilidades |
| **release** | `.claude/agents/release.md` | EAS Build, App Store, Google Play |

---

## Fluxo de Trabalho

### Para qualquer tarefa recebida:

1. **Identificar** qual agente(s) é responsável
2. **Delegar** com contexto completo
3. **Aguardar** o agente concluir
4. **Passar para Fiscal** revisar e aprovar
5. **Só então** reportar resultado ao usuário

### Exemplo:
```
Pedido: "Adicionar filtro de data no relatório"

→ Agente Visual: UI do filtro de data
→ Agente Backend: query com filtro de data
→ Agente Qualidade: testar edge cases (data futura, período sem dados)
→ Agente Fiscal: ✅ aprovado
→ Usuário: "Filtro de data implementado, testado e aprovado."
```

---

## Stack do Projeto

```
Frontend:  React Native + Expo SDK 56 + Expo Router
Backend:   Supabase (PostgreSQL + Edge Functions Deno)
Payments:  MercadoPago (BR) + Apple IAP + Google Play Billing
Build:     EAS (Expo Application Services)
Deploy:    App Store (iOS) + Google Play (Android)
```

## Estrutura de Arquivos

```
app/
├── (auth)/          # login, cadastro, recuperar senha
├── (tabs)/          # dashboard, clientes, nova-venda, relatórios, config
├── cliente/[id].tsx # perfil do cliente
├── planos.tsx       # assinaturas
├── cobrancas.tsx    # lista de cobranças
└── ...

components/ui/       # componentes reutilizáveis
hooks/               # useClientes, useVendas, useModulos, useAuth...
lib/                 # supabase.ts, whatsapp.ts, pix.ts, pdf.ts
constants/           # colors.ts
supabase/            # migrations, edge functions
```

## Padrões de Qualidade Mínimos

- TypeScript strict sem `any` não justificado
- RLS ativo em todas as tabelas
- Loading state em toda ação assíncrona
- Mensagens de erro em português claro
- Funciona offline (graceful degradation)
- Sem console.log em produção

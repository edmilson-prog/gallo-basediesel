# PRD-119: Migração de Stubs WhatsApp (Telas Fase 1)

> ✅ **CONCLUÍDO em 2026-06-10** (v0.82.0 pós-merge). A auditoria provou que o
> Provider Pattern (PRD-005) + PRDs 104/105/114–118 já haviam migrado
> Inbox/Conversa/Distribuição — zero resíduo mock fora das fronteiras. Deltas
> entregues: **anexo de arquivo avulso real** no composer (RF-026 —
> `useAttachmentUpload`, upload PRD-026 + envio PRD-115, mock com object URL
> local) e **tela Configurações → WhatsApp fora do "EM BREVE"**
> (`WhatsAppAccountsPage`: contas via provider `whatsappAccounts`, edição
> staff-only de label/credentials_ref/provider_config; contrato `update`;
> migration `20260610145458` aperta escritas; seção #119 na suíte RLS).
> Simulação SDR confirmada sandbox local by design (RF-040..043 sem mudança de
> código). Desvios registrados em `docs/dev/onda5-migration.md` §5 (telas já
> migradas, sem componente MediaUploader dedicado, smoke manual, README criado).
> Numeração "v2.1.0-rc.9" do PRD não adotada (SemVer da casa).

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, telas Fase 1 que tocam WhatsApp_ |
| **Objetivo** | Reconciliação completa: substituir todos os usos de mocks WhatsApp embarcados nas telas Fase 1 (Inbox PRD-010, Conversa PRD-011, Distribuição PRD-013, Simulação SDR PRD-020) pelos providers reais entregues nos PRDs 111-118. Garantir que `VITE_DATA_SOURCE=supabase` produz fluxo end-to-end coerente: inbound chega via webhook, é visto no Inbox em tempo real, vendedor responde com janela 24h respeitada, status atualiza. Mocks ficam preservados em `VITE_DATA_SOURCE=mock` |
| **Tipo** | Feature |
| **Complexidade** | Média |
| **Total de Fases** | 4 |
| **Prioridade** | P0 — sem isso, Onda 5 está integrada mas não usada |
| **Épico** | Onda 5 — WhatsApp Real (v2.1.0 Bridge) |
| **PRDs Relacionados** | PRDs 010, 011, 013, 020 Fase 1 (telas a migrar); PRDs 111-118 (provedores reais); PRD-104 (Provider central); PRD-105 (Realtime); PRD-115 (envio); PRD-117 (session 24h); PRD-118 (status tracking) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Cleanup em consumidores; mocks ficam intocados; smoke tests por tela |

### Critérios de Complexidade

> **Justificativa de Média:** sem código novo significativo, mas exige varredura exaustiva (toda referência a mock WhatsApp), integração com hooks reais (`useSendMessage`, `useMessagesRealtime`, `useSessionWindow`, `MessageStatusBadge`), validação end-to-end. Erro comum: deixar referência mock esquecida em sub-componente, causando inconsistência em produção.

---

## Contexto do Problema

A Fase 1 entregou 4 telas que tocam WhatsApp **com mocks deterministicos**:

| Tela | PRD F1 | Mock atual |
|------|--------|------------|
| Inbox de Conversas | 010 | Lista hardcoded de 8 conversas com mensagens fictícias |
| Conversa Multicanal | 011 | Mensagens mockadas; botão Enviar adiciona local sem persistência |
| Distribuição Inteligente | 013 | Sugestões mock de atribuição |
| Simulação SDR | 020 | Conversa simulada com cliente fictício; sem envio real |

Os mocks são **deterministicos por design** (PRD-005) — mesmo dados em cada reload, perfeito para demo/dev. **Não os removemos** — apenas alternamos via `VITE_DATA_SOURCE`.

Este PRD garante que, quando `VITE_DATA_SOURCE=supabase`, todas essas telas falam com Supabase real + provedores WhatsApp (PRDs 111-118).

---

## Conceito da Solução

### Auditoria de Uso

Antes de tocar, mapear:
- **Imports diretos de mocks**: `import { mockConversations } from '@/mocks/whatsapp'` etc.
- **Hooks que usam mock**: `useConversations()` no provider PRD-005 — já abstraído, mas validar
- **Handlers de send mock**: `onSend = (text) => setMessages([...messages, fakeMessage])` — substituir por `useSendMessage`
- **Estado local fake**: mensagens em `useState` que deveriam vir de query + Realtime

### Padrão de Migração por Tela

**Antes (mock-only):**
```typescript
// PRD-010 Inbox (Fase 1)
function InboxPage() {
  const [conversations, setConversations] = useState(mockConversations)
  // ...
}
```

**Depois (provider-aware):**
```typescript
function InboxPage() {
  const provider = useDataProvider()  // já existe (PRD-005/PRD-104)
  const { data: conversations } = useConversations()  // hook usa provider
  useConversationsRealtime(currentSellerId)  // PRD-105 — propaga updates
  // ...
}
```

A maior parte do trabalho já foi feita no PRD-005 (interface estável). Este PRD garante que:
1. Toda tela consome via hooks/provider — sem import direto de mock
2. Hooks Realtime estão plugados (PRD-105)
3. Componentes de status (PRD-118) integrados
4. SessionBanner (PRD-117) presente onde aplicável

### Mocks Não São Removidos

`src/mocks/whatsapp.ts` continua existindo. `MockDataProvider` (PRD-005) continua retornando dados de lá. Apenas garantimos que **não há referência hard-coded fora do MockDataProvider**.

### Smoke Tests por Tela

Para cada tela migrada:
1. `VITE_DATA_SOURCE=mock` → comportamento Fase 1 preservado
2. `VITE_DATA_SOURCE=supabase` → operação real com staging:
   - Inbox: lista da DB com Realtime
   - Conversa: send real via PRD-115; status badges
   - Distribuição: leads da DB
   - Simulação SDR: pode ficar 100% mock (é sandbox didático) — documentar decisão

### Decisão Especial — Simulação SDR (PRD-020)

PRD-020 (Simulação SDR) é uma tela **didática** para vendedor treinar com cliente fictício. Não faz sentido usar Supabase real (não queremos poluir DB com simulações).

**Decisão:** Simulação SDR permanece 100% mock mesmo com `VITE_DATA_SOURCE=supabase`. Documentar. Lógica: tela detecta `isSimulation=true` e força MockProvider local independente do flag global.

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Refatorar tudo num PRD único antes da Onda 5 | Acopla muito; migrar gradualmente é mais seguro |
| Remover mocks completamente | Mocks são valor para demo/dev/treino — manter |
| Detectar uso de mock e bloquear em prod (warning) | Já garantido via `ProviderFactory` quando `VITE_DATA_SOURCE` correto |
| Migração tela-por-tela em PRDs separados | Reconciliação ao mesmo tempo é melhor — visão coerente |

---

## Escopo

### Incluído

- ✅ Auditoria documentada de **toda** referência a mock WhatsApp fora do `MockDataProvider`
- ✅ Migração da tela **Inbox de Conversas** (PRD-010):
  - Usa `useConversations()` (provider)
  - Plug em `useConversationsRealtime(sellerId)` (PRD-105)
  - Badge de status na última mensagem outbound (PRD-118)
- ✅ Migração da tela **Conversa Multicanal** (PRD-011):
  - `useMessages(conversationId)` (provider + Realtime PRD-105)
  - `useSendMessage(conversationId)` (PRD-115)
  - `useSessionWindow(conversationId)` + `SessionBanner` (PRD-117)
  - `MessageStatusBadge` por balão outbound (PRD-118)
  - `RetryFailedButton` em mensagens failed (PRD-118)
  - `TemplatePicker` invocado em `TEMPLATE_REQUIRED` (PRD-116)
  - `MediaUploader` (PRD-115 RF-080)
- ✅ Migração da tela **Distribuição Inteligente** (PRD-013):
  - Sugestões via `useDistributionSuggestions()` (provider) — já abstraído
  - Quando integrar com envio WhatsApp (ex: notificar vendedor atribuído), usa providers reais
- ✅ **Simulação SDR (PRD-020)**: ajuste mínimo — força MockProvider local, ignora `VITE_DATA_SOURCE`. Documentar.
- ✅ Smoke tests E2E por tela (Playwright ou manual roteirizado)
- ✅ Documentação `docs/dev/onda5-migration.md`: o que mudou em cada tela; checklist de validação
- ✅ Atualização do `docs/dev/whatsapp-providers.md` referenciando este PRD como reconciliação

### Excluído

- ❌ Mudanças funcionais nas telas (UX preservada)
- ❌ Remoção de mocks
- ❌ Refatoração arquitetural além do necessário
- ❌ Telas que não tocam WhatsApp (PRDs 014, 015, etc. — não-objetivo)
- ❌ Novas features WhatsApp (todas em PRDs 111-118 ou Ondas futuras)
- ❌ Auto-resposta / chatbot na Conversa (fora de escopo da Onda 5)

---

## Requisitos Funcionais

### Auditoria

- **RF-001:** Documentar em `docs/dev/onda5-migration.md` cada arquivo do frontend que importa mock WhatsApp diretamente ou tem state mock fake. Lista completa antes de migrar.
- **RF-002:** Verificar via `grep` ou tooling todas as referências a `mockConversations`, `mockMessages`, `mockWhatsAppAccounts`. Garantir que pós-migração, essas referências só vivem dentro de `MockDataProvider` (`src/providers/mock/`) e `src/mocks/`.

### Tela Inbox (PRD-010)

- **RF-010:** Substituir state local `mockConversations` por `useConversations()` (hook do PRD-104 provider).
- **RF-011:** Adicionar `useConversationsRealtime(currentSellerId)` para receber updates de novas conversas / unread count em tempo real (PRD-105).
- **RF-012:** Em cada item de conversa, exibir `<MessageStatusBadge>` da última mensagem outbound (se houver) — PRD-118.
- **RF-013:** Filtros e ordenação existentes preservados.
- **RF-014:** Loading/empty states tratados (lista vazia mostra empty state, não crasha).

### Tela Conversa (PRD-011)

- **RF-020:** Substituir state local de messages por `useMessages(conversationId)`.
- **RF-021:** Plug em `useMessagesRealtime(conversationId)` — novas mensagens aparecem em tempo real (PRD-105 + PRD-114).
- **RF-022:** Renderizar `<SessionBanner conversationId={...} />` no topo (PRD-117).
- **RF-023:** `useSendMessage(conversationId)` substitui handler mock; campo Enviar invoca real.
- **RF-024:** Em cada balão outbound: `<MessageStatusBadge>` (PRD-118).
- **RF-025:** Em mensagem `failed`: `<RetryFailedButton>` exibido inline (PRD-118).
- **RF-026:** `<MediaUploader>` (PRD-115 RF-080) substituiu mock de anexo.
- **RF-027:** Em erro `TEMPLATE_REQUIRED`: abrir `<TemplatePicker>` (PRD-116) automaticamente ou via banner action.
- **RF-028:** Em erro `CUSTOMER_INVALID_WHATSAPP` (PRD-118): modal de confirmação seguido pelo override se Owner.

### Tela Distribuição (PRD-013)

- **RF-030:** Sugestões de atribuição via provider (já abstraído no PRD-005 — validar funciona com PRD-104).
- **RF-031:** Quando ação de atribuição dispara notificação WhatsApp ao vendedor: usa provider real (PRD-115) — não mock.
- **RF-032:** Notificação ao vendedor de novo lead atribuído pode ser feature postergada — escopo desta tela é apenas garantir que dados reais aparecem.

### Tela Simulação SDR (PRD-020)

- **RF-040:** Detectar contexto via prop ou rota (`/app/simulacao-sdr` ou similar).
- **RF-041:** Forçar uso de `MockDataProvider` localmente nesta tela:
  ```typescript
  // Antes do JSX
  const provider = isSimulation ? new MockDataProvider() : useDataProvider()
  ```
- **RF-042:** Tela exibe banner claro: "Modo Simulação — dados não são salvos no sistema". Já existia em Fase 1; manter.
- **RF-043:** Documentar essa exceção em `docs/dev/onda5-migration.md` para evitar confusão futura.

### Smoke Tests por Tela

- **RF-050:** Roteiro de validação manual (ou automatizado via Playwright):
  - **Inbox em modo supabase:** seller vê apenas suas conversas (RLS), nova mensagem inbound chega em < 2s (Realtime), badge de status correto
  - **Conversa em modo supabase:** abre conversa, banner de janela 24h presente; envia texto na janela aberta → status queued→sent visível; webhook simula delivered/read → badge atualiza; tentativa fora da janela → picker abre
  - **Distribuição em modo supabase:** sugestões com dados reais; atribuição persistida
  - **Simulação SDR em qualquer modo:** comportamento mock determinístico, independente de VITE_DATA_SOURCE
  - **Inbox em modo mock:** mesma UX Fase 1 preservada
- **RF-051:** Resultados documentados em `docs/dev/onda5-migration.md` (tabela: tela × modo × resultado).

### Documentação

- **RF-060:** `docs/dev/onda5-migration.md`:
  - Auditoria de referências mock
  - Lista de mudanças por tela
  - Decisão sobre Simulação SDR
  - Roteiro de smoke tests
  - Roteiro de troubleshooting
- **RF-061:** Atualizar README do projeto com seção "Modo dev: mock vs supabase" referenciando este PRD.

---

## Requisitos Não-Funcionais

- **RNF-001 (Preservação UX):** Mudança invisível ao usuário — UX idêntica em ambos os modos (exceto que `supabase` tem dados reais e mock tem dados sintéticos).
- **RNF-002 (Drop-in):** Apenas consumidores acima da camada Provider mudam; provider continua estável (PRD-104).
- **RNF-003 (Performance):** Migração não degrada performance percebida (idealmente melhora — Realtime substitui polling).
- **RNF-004 (Zero regressão funcional):** Toda tela testada nos 2 modos; comparar comportamento.

---

## Critérios de Aceitação

### RF-001 + RF-002: Auditoria Limpa

```gherkin
DADO o projeto após este PRD
QUANDO eu faço grep "mockConversations" fora de src/providers/mock e src/mocks
ENTÃO retorna zero resultados
  E mocks ainda existem em src/mocks (preservados para MockDataProvider)
```

### RF-020 + RF-022 + RF-024: Conversa Real

```gherkin
DADO VITE_DATA_SOURCE=supabase
  E uma conversa existente no staging com 3 mensagens (2 inbound, 1 outbound)
QUANDO seller abre a tela de Conversa
ENTÃO useMessages retorna as 3 mensagens
  E SessionBanner aparece no topo com status correto (verde/amarelo/vermelho)
  E o balão outbound mostra MessageStatusBadge
  E novas mensagens (simuladas via webhook test) chegam em < 2s
```

### RF-040 + RF-041: Simulação Mock-Only

```gherkin
DADO VITE_DATA_SOURCE=supabase (production-like)
QUANDO seller abre /app/simulacao-sdr
ENTÃO a tela usa MockDataProvider internamente (não toca staging)
  E banner "Modo Simulação" visível
  E ações não criam registros no banco real
  E dados são deterministicos (mesmo cada vez)
```

### RF-050: Smoke Tests Passam

```gherkin
DADO o roteiro de smoke tests documentado
QUANDO executo manualmente cada cenário
ENTÃO todas as 5 telas funcionam em ambos os modos
  E sem warnings de console
  E sem regressão visual
  E resultados anotados em onda5-migration.md
```

---

## Fases de Implementação

### Fase 1 — Auditoria + Plano (meio dia)
- Grep + inspeção de cada tela
- Documento de plano em `docs/dev/onda5-migration.md`
- Lista exata de arquivos a tocar

### Fase 2 — Migração Inbox + Conversa (1.5 dias)
- PRD-010 Inbox: provider + realtime + badge
- PRD-011 Conversa: provider + realtime + send + session + status + retry + template + media

### Fase 3 — Distribuição + Simulação SDR (meio dia)
- PRD-013: validar provider integrado
- PRD-020: forçar MockProvider local + documentar

### Fase 4 — Smoke Tests + Docs (1 dia)
- Roteiro completo manual
- Playwright opcional
- `docs/dev/onda5-migration.md` finalizado
- Demo Edmilson + Frederico (alternando VITE_DATA_SOURCE)
- `_DONE`

---

## Dependências

- **Depende de:** PRDs 011, 013, 020 Fase 1 (telas existentes), PRD-104 (provider central), PRDs 111-118 (Onda 5 completa)
- **Bloqueia:** Onda 5 declarada como "operacionalmente pronta"; depois deste PRD a Onda 5 está integrada nas mãos do vendedor
- **Decisões Pendentes:** Simulação SDR mock-only confirmado (sugerido); Distribuição notifica via WhatsApp ou apenas in-app no MVP (sugerido in-app; WhatsApp em Onda futura)

---

## Considerações de Segurança

- Migração não introduz superfície nova — apenas conecta peças já existentes (todas com segurança própria)
- Mocks preservados em ambiente de desenvolvimento; nunca usados em produção devido a `VITE_DATA_SOURCE`
- RLS aplica naturalmente (PRD-103) — seller só vê suas conversas em modo supabase
- Simulação SDR isolada propositalmente (não polui DB)

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.1.0-rc.9; CHANGELOG; renomear `PRD-119-migracao-stubs-whatsapp_DONE.md`. Demo dupla (mock vs supabase) para Edmilson antes de fechar.

| Princípio | Descrição |
|-----------|-----------|
| **Drop-in preservado** | Provider Pattern carrega o peso; consumidores só consomem |
| **Mocks intocados** | Removeu da tela ≠ removeu do MockDataProvider |
| **Simulação isolada** | SDR sempre mock; documentar |
| **Smoke test dual** | Toda tela validada nos 2 modos |

| ❌ Evitar |
|-----------|
| Remover mocks |
| Import direto de mock fora de provider mock |
| Skipar smoke test em modo mock (regressão silenciosa) |
| Misturar lógica de modo nos componentes (provider abstrai) |
| Tocar telas que não usam WhatsApp |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ✅ CONCLUÍDO |
| **Data** | 2026-06-10 |
| **Versão** | v0.82.0 (pós-merge) |
| **Por** | Claude Code (AILA) |
| **Observações** | Reconciliação final da Onda 5; auditoria limpa (Provider Pattern segurou a migração); deltas = anexo avulso real + tela de contas WhatsApp; desvios em `docs/dev/onda5-migration.md` §5 |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 27/05/2026 | v1 | Criação inicial — Sub-lote 2c do Lote 2 (Onda 5) |

---

**AILA - Sistemas Inteligentes**

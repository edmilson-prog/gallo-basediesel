# PRD-018: Gestão de Carteira e Transferências

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                                                 |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                                                                                      |
| **Objetivo**          | Implementar o sistema completo de gestão de carteira com 4 tipos de transferência (temporária com reversão automática, permanente individual, permanente em lote), painel dedicado para Owner/Gestor, histórico auditado e integração com fluxos existentes (ficha, lista, multi-select) |
| **Tipo**              | Feature                                                                                                                                                                                                                                                                                  |
| **Complexidade**      | Alta                                                                                                                                                                                                                                                                                     |
| **Total de Fases**    | 4                                                                                                                                                                                                                                                                                        |
| **Prioridade**        | Alta                                                                                                                                                                                                                                                                                     |
| **Épico**             | Bloco 1 — Central de Atendimento e CRM                                                                                                                                                                                                                                                   |
| **PRDs Relacionados** | PRD-002 (modelo ICarteiraTransfer), PRD-006 (audit log), PRD-012 (ficha), PRD-015 (transferência em lote), PRD-013 (distribuição), PRD-047 (Comissões — Onda 2)                                                                                                                          |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                                                                       |
| **Padrão de código**  | Feature-based; código em `src/features/carteira/`; painel `/app/carteira`                                                                                                                                                                                                                |

### Critérios de Complexidade

> **Justificativa de Alta:** 4 tipos de transferência com workflows distintos, mecânica de reversão automática via timer/cron simulada, integração transversal com ficha (PRD-012), lista (PRD-015 — ações em lote), modal de criação contextual, painel administrativo com 3 abas (Ativas/Histórico/Auditoria), validações comerciais (não transferir para vendedor de outra loja sem cross-store), audit log obrigatório, impacto direto em comissões futuras (PRD-047), e necessidade de UI clara para conceito que pode gerar confusão (temporária vs permanente).

---

## Contexto do Problema

A carteira do vendedor é o coração da relação comercial. Cada cliente tem **um vendedor responsável** — relação 1:1 estrita. Mas a vida real exige flexibilidade:

- Vendedor sai de férias por 15 dias — alguém precisa cobrir a carteira temporariamente
- Vendedor é demitido / sai da empresa — clientes precisam migrar permanentemente
- Reestruturação comercial — 30 clientes da carteira do Carlos vão pra Marina (operação em lote)
- Cliente específico não está sendo bem atendido — transferência individual

Hoje sem sistema, isso vira ajuste no Excel ou Whatsapp do gestor. Resultado: comissões erradas, clientes sem atendimento durante férias, vendedor "sai" sem que a base seja atualizada.

Três problemas concretos:

**Sem reversão automática, temporária vira permanente esquecida.** Vendedor de férias por 15 dias. Gestor transfere clientes manualmente. Vendedor volta — gestor esquece de reverter. Em 3 meses, o ex-titular descobre que perdeu carteira. **Sem audit trail, comissões viram briga.** "Esse cliente fechou comigo!" — "Não, ele estava na sua carteira temporariamente, comissão é do titular original." Sem histórico imutável, debate é interminável. **Transferência em lote inviável.** Gestor que precisa migrar 30 clientes faz click 30 vezes na ficha → impraticável.

Este PRD entrega: 4 tipos de transferência com workflows próprios, reversão automática via timer (mock no MVP), painel `/app/carteira` para Owner/Gestor, integração com PRD-015 (ação em lote já consumindo este sistema), histórico auditado.

---

## Conceito da Solução

### 4 tipos de transferência

Conforme PRD-002 (`ICarteiraTransfer`):

| Tipo                   | Significado                           | Quando usar              | Reversão                |
| ---------------------- | ------------------------------------- | ------------------------ | ----------------------- |
| `temporary`            | Cobertura por período definido        | Férias, licença          | Automática na `endDate` |
| `permanent_individual` | Transferência permanente de 1 cliente | Cliente específico migra | Manual via "Reverter"   |
| `permanent_batch`      | Transferência permanente em lote      | Reestruturação comercial | Manual via "Reverter"   |

Sub-tipo de batch que pode usar segmentações: `permanent_batch` consumindo lista de `ICustomerSegment` (PRD-015) — "Transferir todos os clientes da segmentação 'Volvo > 60d' do Carlos para Marina".

### Modelo (revisão do PRD-002)

```typescript
ICarteiraTransfer {
  id: ID;
  type: 'temporary' | 'permanent_individual' | 'permanent_batch';
  fromSellerId: ID;
  toSellerId: ID;
  customerIds: ID[];     // 1 item se individual; N se batch
  reason: string;        // texto livre obrigatório
  startDate: ISO8601;
  endDate?: ISO8601;     // obrigatório só em temporary
  autoRevertAt?: ISO8601;// igual endDate em temporary
  status: 'active' | 'reverted' | 'expired';
  executedBy: ID;        // quem criou a transferência
  executedAt: ISO8601;
}
```

### Reversão automática (temporary)

Mecânica:

- Quando temporary é criada, `autoRevertAt = endDate` é gravado
- Timer no app verifica a cada N minutos transferências `temporary` com `autoRevertAt < now` e `status='active'`
- Para cada, executa reversão:
  - `customer.sellerId` volta ao `fromSellerId`
  - `transfer.status = 'expired'`
  - Audit log
- No MVP, timer no front simula isso a cada 60s para fins de demo; na Fase 2, Edge Function de Supabase com cron real

### Lógica de troca de `customer.sellerId`

| Tipo                   | Comportamento                                                        |
| ---------------------- | -------------------------------------------------------------------- |
| `temporary`            | `customer.sellerId = toSellerId` durante vigência; volta na reversão |
| `permanent_individual` | `customer.sellerId = toSellerId` definitivamente                     |
| `permanent_batch`      | mesmo — em lote                                                      |

Importante: comissões geradas durante vigência da temporária pertencem ao `toSellerId` (cobertura) — embora na Fase 2 (PRD-047) possa haver regra de split com titular. No MVP, simples: comissão é do titular vigente quando o pedido foi fechado.

### Workflow de criação por tipo

#### Temporária (cobertura)

1. Owner/Gestor clica "Nova transferência temporária"
2. Modal:
   - De: dropdown vendedor origem
   - Para: dropdown vendedor destino
   - Período: range de datas (obrigatório)
   - Motivo: dropdown (Férias / Licença médica / Treinamento / Outro) + textarea opcional
   - Cobertura inclui:
     - Todos os clientes do origem (default)
     - OU selecionar subset (multi-select autocomplete)
3. Preview: "Transferindo X clientes de Carlos para Marina entre [data início] e [data fim]. Reversão automática prevista."
4. Confirmar → cria registro + atualiza `customer.sellerId` em todos + audit log

#### Permanente individual

1. Vendedor/Gestor abre ficha do cliente (PRD-012)
2. Menu ⋮ → "Transferir carteira"
3. Modal pequeno:
   - Para: dropdown de vendedores
   - Motivo: textarea
4. Confirmar → cria registro, atualiza `customer.sellerId`, audit log

#### Permanente em lote

1. Gestor abre `/app/clientes` (PRD-015)
2. Aplica filtros / segmentação
3. Seleciona múltiplos via checkbox
4. Clica "Transferir vendedor"
5. Modal:
   - Para: dropdown
   - Motivo: textarea obrigatório
   - Confirmação: "Transferir [N] clientes para [vendedor]. Esta ação é permanente."
6. Confirmar → cria 1 `ICarteiraTransfer` tipo `permanent_batch` com array de customerIds + atualiza todos + audit log com sumário

### Painel `/app/carteira`

Rota dedicada com 3 abas:

| Aba           | Conteúdo                                                                     |
| ------------- | ---------------------------------------------------------------------------- |
| **Ativas**    | Transferências com `status='active'` (incluem temporárias em vigência)       |
| **Histórico** | Todas as transferências passadas (`status` ≠ active)                         |
| **Auditoria** | View tabela do audit log filtrado em `action='transfer*'` (link com PRD-006) |

Header da página: contadores ("12 ativas, 3 temporárias em vigência"), botão "+ Nova transferência" (dropdown com 3 tipos).

#### Aba Ativas

Lista de transferências ativas com:

- Tipo (badge)
- De → Para (avatares e nomes)
- N clientes afetados (link "ver" abre modal com lista)
- Período (apenas em temporary)
- Tempo restante até reversão (em temporary)
- Motivo
- Botão "Reverter agora" (Owner/Gestor)
- Botão "Detalhes"

#### Aba Histórico

Lista paginada de transferências encerradas:

- Tipo
- De → Para
- N clientes
- Período (se temporary)
- Status final (reverted/expired)
- Quem executou
- Data de execução

Filtros: tipo, vendedor (from/to), período, status final.

#### Aba Auditoria

Vista filtrada de audit log com `action='transfer_create'`, `transfer_revert`, `transfer_expire`. Detalhe expansível mostrando before/after.

### Modal de reversão

Quando user clica "Reverter agora":

- Confirmação: "Confirma reversão? Os [N] clientes voltarão ao vendedor original."
- Confirmar → `customer.sellerId` volta para `fromSellerId`, `transfer.status='reverted'`, audit log

### Integração com PRD-015 (ação em lote)

PRD-015 já especifica botão "Transferir vendedor" nas ações em lote. Este PRD garante que a implementação:

- Cria `ICarteiraTransfer` tipo `permanent_batch` (não múltiplas individuais)
- Audit log com sumário ("Transferência em lote: 23 clientes de Carlos para Marina")

### Integração com PRD-012 (ficha do cliente)

PRD-012 já tem botão "Transferir carteira" no menu ⋮ do header. Este PRD garante:

- Modal de transferência permanente individual
- Cria `ICarteiraTransfer` tipo `permanent_individual`
- Atualiza ficha com novo vendedor responsável
- Audit log

### Alternativas Consideradas

| Alternativa                                    | Por que foi descartada                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| Apenas transferência permanente                | Casos de férias ficam em aberto; reversão manual esquecida frequentemente |
| Sem auditoria visual                           | Comissões viram fonte de conflito; audit é proteção legal                 |
| Reversão automática como cron real no MVP      | Mock simula sem complexidade; Fase 2 vira Edge Function                   |
| Múltiplas transferências individuais para lote | Audit fica confuso; um registro batch é mais limpo                        |
| Permitir Vendedor transferir entre vendedores  | Confunde escopo; transferência é decisão gerencial                        |
| Sem motivo obrigatório                         | Histórico vira "transferência sem contexto" — inútil em audit             |
| Temporária sem data fim                        | Vira permanente esquecida — defeat the purpose                            |

**Decisão consolidada:** **4 tipos com workflows distintos, reversão automática para temporary, painel dedicado em 3 abas, motivo obrigatório, audit log central, integração com PRDs 012 e 015 já consumindo este sistema.**

---

## Escopo

### Incluído

- ✅ Rota `/app/carteira` substituindo placeholder do PRD-003 — painel com 3 abas (Ativas, Histórico, Auditoria)
- ✅ Modal `<NewTemporaryTransferModal>` com workflow específico
- ✅ Modal `<NewPermanentIndividualTransferModal>` (chamada a partir da ficha do cliente — PRD-012)
- ✅ Modal `<NewPermanentBatchTransferModal>` (chamada a partir da lista de clientes — PRD-015)
- ✅ Implementação completa dos 4 tipos com atualização correta de `customer.sellerId`
- ✅ Timer de reversão automática (no MVP, executado no front a cada 60s; documentado caminho Fase 2)
- ✅ Aba Ativas com lista, filtros, ação "Reverter agora"
- ✅ Aba Histórico com filtros e paginação
- ✅ Aba Auditoria como view filtrada do PRD-006
- ✅ Permissões: apenas Owner/Gestor cria, reverte, vê painel
- ✅ Audit log obrigatório em todas as mutations
- ✅ Integração com PRD-012 (botão "Transferir carteira" da ficha cria individual)
- ✅ Integração com PRD-015 (ação em lote cria batch)
- ✅ Validação: não permitir transferir cliente para vendedor de outra loja sem permission cross-store
- ✅ Notificação aos vendedores envolvidos (toast/badge quando recebem ou perdem clientes)
- ✅ Cards visuais distintos por tipo (temporary com badge "⏱", batch com badge "📋")
- ✅ Indicador de tempo restante até reversão automática (em temporary)

### Excluído

- ❌ Split de comissão entre titular e cobertura — Fase 2 (PRD-047)
- ❌ Aprovação de transferência em fluxo de workflow (Vendedor solicita, Gestor aprova) — fora do MVP
- ❌ Transferência cross-store (matriz → filial) — Fase 2 (PRD-007 prepara, mas não opera)
- ❌ Histórico de comissões impactadas por transferência — Fase 2
- ❌ Notificação por email/SMS — Fase 2 (apenas toast no MVP)
- ❌ Reversão programada futura (agendar reversão de uma permanent) — fora do MVP
- ❌ Sugestões automáticas de transferência baseadas em sobrecarga — Fase 2
- ❌ Editar transferência ativa (alterar endDate, etc.) — fora do MVP; reverter + criar nova

---

## Requisitos Funcionais

### Modelo

- **RF-001:** Validar que `ICarteiraTransfer` (PRD-002) está com todos os campos esperados.
- **RF-002:** Validar que mocks (PRD-004) geram ~8 transferências históricas (mix de tipos e status) para popular o painel.

### Painel `/app/carteira`

- **RF-003:** Substituir placeholder de `/app/carteira` por `CarteiraPage` em `src/features/carteira/pages/`.
- **RF-004:** Protegido por `<GuardedRoute permission={{ resource: 'transfer', action: 'view' }}>` — Owner/Gestor.
- **RF-005:** Header com:
  - Título "Gestão de Carteira"
  - Contadores: "X ativas, Y temporárias em vigência"
  - Botão "+ Nova transferência" com dropdown (Temporária / Permanente individual / Permanente em lote)
- **RF-006:** 3 abas: Ativas, Histórico, Auditoria.

### Aba Ativas

- **RF-007:** Lista transferências com `status='active'`.
- **RF-008:** Cada card mostra: tipo (badge), de → para (avatares + nomes), N clientes (clicável para modal de lista), motivo, período (em temporary), tempo restante até reversão (em temporary).
- **RF-009:** Botão "Reverter agora" abre modal de confirmação.
- **RF-010:** Filtros: tipo, vendedor origem, vendedor destino, período.

### Aba Histórico

- **RF-011:** Lista paginada (20/página) de transferências `status ≠ active`.
- **RF-012:** Colunas: tipo, de → para, N clientes, período, status final, executado por, data execução.
- **RF-013:** Filtros: tipo, vendedor (from/to), período de execução, status final.

### Aba Auditoria

- **RF-014:** Embed do componente de audit log (PRD-006) com filtro pré-aplicado `action IN ('transfer_create', 'transfer_revert', 'transfer_expire')`.
- **RF-015:** Detalhes expansíveis com before/after dos campos `customer.sellerId`.

### Modal de transferência temporária

- **RF-016:** Criar `<NewTemporaryTransferModal>` com campos:
  - **De** (dropdown obrigatório): vendedores da loja
  - **Para** (dropdown obrigatório): vendedores da loja, excluindo o "De"
  - **Período** (date range obrigatório): start ≥ hoje, end > start
  - **Motivo** (dropdown obrigatório): Férias, Licença médica, Treinamento, Outro
  - **Detalhes** (textarea opcional)
  - **Clientes incluídos** (radio: "Todos os clientes do origem" (default) / "Selecionar específicos" → multi-select autocomplete)
- **RF-017:** Preview antes de confirmar: "Transferindo [N] clientes de [Carlos] para [Marina] entre [data início] e [data fim]. Reversão automática prevista para [data fim]."
- **RF-018:** Ao confirmar:
  - Criar `ICarteiraTransfer` tipo `temporary`
  - Setar `autoRevertAt = endDate`
  - Atualizar `customer.sellerId` em cada cliente afetado para `toSellerId`
  - Audit log com sumário ("Transferência temporária criada: Carlos → Marina, 35 clientes, motivo: Férias, até 15/06/2026")
  - Notificar vendedores envolvidos (toast)

### Modal de transferência permanente individual

- **RF-019:** Criar `<NewPermanentIndividualTransferModal>` chamado a partir da ficha do cliente (PRD-012).
- **RF-020:** Campos:
  - Cliente (pré-preenchido, locked)
  - De (atual sellerId, locked)
  - Para (dropdown obrigatório, exceto o atual)
  - Motivo (textarea obrigatório)
- **RF-021:** Confirmação: "Confirma transferência permanente do cliente [Nome] de [Carlos] para [Marina]? Esta ação requer reversão manual."
- **RF-022:** Ao confirmar:
  - Criar `ICarteiraTransfer` tipo `permanent_individual` com `customerIds: [customerId]`
  - Atualizar `customer.sellerId`
  - Audit log
  - Notificar vendedores

### Modal de transferência permanente em lote

- **RF-023:** Criar `<NewPermanentBatchTransferModal>` chamado a partir da lista de clientes (PRD-015 ação em lote).
- **RF-024:** Campos:
  - Clientes selecionados (mostrar contador "23 clientes selecionados" + lista expansível)
  - Para (dropdown obrigatório)
  - Motivo (textarea obrigatório)
- **RF-025:** Confirmação destacada: "Esta ação é permanente. [23] clientes serão transferidos para [Marina]."
- **RF-026:** Ao confirmar:
  - Criar **1** `ICarteiraTransfer` tipo `permanent_batch` com array completo de customerIds
  - Atualizar `customer.sellerId` em todos
  - Audit log com sumário ("Transferência em lote: 23 clientes de Carlos para Marina, motivo: [...]")
  - 1 entry de audit por cliente afetado + 1 sumário
  - Notificar vendedores envolvidos

### Reversão manual

- **RF-027:** Botão "Reverter agora" em cada item da aba Ativas.
- **RF-028:** Modal: "Confirma reversão? Os [N] clientes voltarão ao vendedor [Carlos]."
- **RF-029:** Ao confirmar:
  - Para cada `customerId` em `transfer.customerIds`: setar `customer.sellerId = transfer.fromSellerId`
  - Atualizar `transfer.status = 'reverted'`
  - Audit log
  - Notificar vendedores

### Reversão automática

- **RF-030:** Criar hook `useAutoRevertTimer()` que roda a cada 60s no app:
  - Busca transferências `temporary` com `autoRevertAt < now` e `status='active'`
  - Para cada: executa reversão automaticamente (mesmo fluxo da manual)
  - Setar `transfer.status = 'expired'`
  - Audit log com `action='transfer_expire'`
  - Toast discreto: "Transferência temporária revertida automaticamente"
- **RF-031:** Apenas o app aberto (front) executa o timer no MVP. Documentar em `docs/multistore.md` ou `docs/carteira.md` o caminho Fase 2: Edge Function Supabase com cron real.

### Validações

- **RF-032:** Não permitir transferir para vendedor de outra loja, exceto se user atual tem permission cross-store (Owner).
- **RF-033:** Não permitir transferência com origem = destino (mesmo vendedor).
- **RF-034:** Em temporária, `endDate` deve ser > `startDate`.
- **RF-035:** Em temporária, evitar criar enquanto existe outra temporary ativa para o mesmo vendedor origem (conflito de cobertura) — mostrar alerta.

### Notificações

- **RF-036:** Quando uma transferência é criada/revertida/expirada:
  - Vendedor origem recebe toast: "Você [recebeu / perdeu] N clientes — [motivo]"
  - Vendedor destino recebe toast: "Você [recebeu / perdeu] N clientes — [motivo]"
- **RF-037:** Toast aparece quando vendedor abre o app (PRD-010 real-time + inbox); na Fase 2 vira push.

### Indicador na ficha do cliente (PRD-012)

- **RF-038:** Na ficha do cliente, se há transferência temporária ativa cobrindo este cliente, mostrar banner discreto: "Este cliente está sob cobertura temporária. Volta para [titular original] em [data]."

### Permissões

- **RF-039:** **Owner**: cria, reverte, vê painel; cross-store permitido.
- **RF-040:** **Gestor**: cria, reverte, vê painel; apenas dentro da loja.
- **RF-041:** **Vendedor**: NÃO acessa o painel; vê apenas indicador na ficha do próprio cliente; recebe notificações.

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Painel renderiza em < 400ms com 8 transferências histórias + 3 ativas.
- **RNF-002 (Reversão automática):** Verificação a cada 60s não impacta UI; cálculo lazy.
- **RNF-003 (Acessibilidade):** WCAG 2.1 AA; modais com `aria-labelledby`, foco em primeiro campo, ESC fecha.
- **RNF-004 (Tipagem):** Zero `any`; `ICarteiraTransfer` respeitado.
- **RNF-005 (Auditoria):** Cada transferência gera 2+ entries (sumário + 1 por cliente afetado em batch).

---

## Critérios de Aceitação

### Criação de transferências

```gherkin
DADO que sou Owner e clico "+ Nova transferência > Temporária"
QUANDO modal abre e preencho De=Carlos, Para=Marina, período 01-15 jun, motivo=Férias, todos os clientes
ENTÃO preview mostra "Transferindo 35 clientes de Carlos para Marina entre 01/06 e 15/06"
  E ao confirmar, transferência é criada
  E 35 clientes têm sellerId atualizado para Marina
  E audit log gerado (1 sumário + 35 individuais)
  E Carlos e Marina recebem toast

DADO uma ficha do cliente com sellerId=Carlos
QUANDO Gestor clica "Transferir carteira" no menu ⋮ e seleciona Marina + motivo
ENTÃO ICarteiraTransfer tipo permanent_individual é criada
  E customer.sellerId vira Marina imediatamente
  E ficha mostra Marina como vendedor responsável

DADO 23 clientes selecionados em /app/clientes
QUANDO Gestor clica "Transferir vendedor" e seleciona Marina + motivo
ENTÃO **1 única** ICarteiraTransfer tipo permanent_batch é criada com array de 23 customerIds
  E todos os 23 clientes mudam sellerId
  E audit log com sumário "Transferência em lote: 23 clientes..."
```

### Reversão automática

```gherkin
DADO uma transferência temporária com endDate ontem
  E status='active'
QUANDO o timer roda (60s)
ENTÃO transferência é detectada e revertida
  E clientes voltam para sellerId original
  E transfer.status = 'expired'
  E audit log com action='transfer_expire'

DADO transferência temporária válida (endDate futura)
QUANDO timer roda
ENTÃO nada acontece (transferência permanece ativa)
```

### Reversão manual

```gherkin
DADO transferência temporária ativa
QUANDO Owner clica "Reverter agora" e confirma
ENTÃO clientes voltam para origem
  E transfer.status = 'reverted'
  E aba Ativas atualiza removendo o item
  E aba Histórico mostra o item agora

DADO transferência permanente individual ativa
QUANDO Gestor clica "Reverter agora"
ENTÃO mesmo fluxo (status='reverted', sellerId volta)
  E modal de confirmação enfatiza "Esta transferência era permanente — confirma desfazer?"
```

### Validações

```gherkin
DADO modal de temporária aberto
QUANDO tento criar com De=Carlos e Para=Carlos
ENTÃO validação inline: "Vendedor destino deve ser diferente do origem"
  E botão Salvar fica desabilitado

DADO tento criar temporária para Marina (loja Erechim) sendo Carlos da matriz
QUANDO o save processa
ENTÃO erro: "Não é possível transferir entre lojas diferentes"
  (no MVP só matriz; mensagem proativa Fase 2)

DADO já existe temporária ativa cobrindo Carlos (origem)
QUANDO tento criar outra para o mesmo Carlos
ENTÃO alerta amarelo: "Já há uma transferência ativa cobrindo Carlos até 15/06. Continuar?"
  E posso cancelar ou prosseguir
```

### Painel

```gherkin
DADO que sou Vendedor
QUANDO tento acessar /app/carteira
ENTÃO sou redirecionado para /sem-permissao

DADO que sou Owner e estou em /app/carteira aba Ativas
QUANDO observo a lista
ENTÃO vejo todas as transferências ativas com tempo restante (temporárias) e botão "Reverter"
  E posso clicar em "N clientes" para ver lista completa

DADO aba Histórico
QUANDO aplico filtro "Tipo=temporary, Período=últimos 90 dias"
ENTÃO vejo lista filtrada
  E URL atualiza
```

### Indicador na ficha

```gherkin
DADO um cliente está sob cobertura temporária (titular original Carlos, cobertor Marina, até 15/06)
QUANDO abro a ficha do cliente
ENTÃO banner discreto aparece: "Este cliente está sob cobertura temporária. Volta para Carlos em 15/06."

DADO a transferência expira/reverte
QUANDO timer ou ação manual processa
ENTÃO banner some
  E vendedor responsável volta a ser Carlos
```

### Cenários de erro

```gherkin
DADO provider falha ao salvar transferência
QUANDO MockValidationError ou MockNetworkError ocorre
ENTÃO clientes NÃO devem ter sellerId alterado (operação atômica)
  E toast de erro com botão "Tentar novamente"

DADO transferência em lote falha no meio
QUANDO N clientes já foram alterados mas M não
ENTÃO mock implementa rollback ou marca transferência como "parcial" (TBD pelo agente desenvolvedor)
  E mensagem clara ao usuário
```

---

## Fases de Implementação

| Fase | Objetivo                                             | Arquivos Estimados |
| ---- | ---------------------------------------------------- | ------------------ |
| 1    | Painel base com 3 abas + lista de ativas             | 5-6                |
| 2    | Modal de temporária + lógica de reversão automática  | 4-5                |
| 3    | Modais permanente individual e batch + integrações   | 5-6                |
| 4    | Validações, notificações, indicador na ficha, polish | 3-4                |

### Detalhamento das Fases

#### Fase 1: Painel Base

**Objetivo:** visualizar transferências ativas e histórico

**Ações:**

- [ ] Criar `CarteiraPage` em `src/features/carteira/pages/`
- [ ] 3 abas via shadcn Tabs
- [ ] Aba Ativas: lista cards de `ICarteiraTransfer` com `status='active'`
- [ ] Aba Histórico: tabela paginada
- [ ] Aba Auditoria: embed do componente PRD-006 com filtro pré-aplicado
- [ ] Permissão via GuardedRoute

**Validação:** acesso restrito a Owner/Gestor; abas funcionais.

#### Fase 2: Temporária e Reversão Automática

**Objetivo:** fluxo de cobertura

**Ações:**

- [ ] `<NewTemporaryTransferModal>` com workflow completo
- [ ] Validações (período, vendedor diferente, conflito de cobertura)
- [ ] Atualização de `customer.sellerId` no save
- [ ] Audit log com sumário + individuais
- [ ] Hook `useAutoRevertTimer()` rodando a cada 60s
- [ ] Documentação em `docs/carteira.md` sobre caminho Fase 2 com Edge Function

**Validação:** criar temporária com endDate no passado → reversão automática em < 60s.

#### Fase 3: Permanente Individual e Batch

**Objetivo:** integração com ficha e lista

**Ações:**

- [ ] `<NewPermanentIndividualTransferModal>` chamado a partir do PRD-012
- [ ] `<NewPermanentBatchTransferModal>` chamado a partir do PRD-015
- [ ] Implementação cria 1 registro batch (não múltiplos individuais)
- [ ] Audit log com sumário em batch
- [ ] Confirmação destacada em batch ("permanente, [N] clientes")

**Validação:** integração com ficha funciona; ação em lote do PRD-015 chama este modal corretamente.

#### Fase 4: Validações, Notificações, Polish

**Objetivo:** experiência final

**Ações:**

- [ ] Banner na ficha do cliente quando há cobertura temporária ativa
- [ ] Notificações (toast) para vendedores envolvidos
- [ ] Validação cross-store (Owner-only)
- [ ] Alerta de conflito de cobertura
- [ ] Empty states em cada aba
- [ ] Mobile responsivo

**Validação:** vendedor recebe toast quando carteira muda; banner aparece corretamente.

---

## Dependências

### PRDs Anteriores

| PRD                                | Status      |
| ---------------------------------- | ----------- |
| PRD-002 (ICarteiraTransfer)        | 📝 Redigido |
| PRD-003 (Shell)                    | 📝 Redigido |
| PRD-005 (Provider)                 | 📝 Redigido |
| PRD-006 (audit log)                | 📝 Redigido |
| PRD-007 (multi-loja — validação)   | 📝 Redigido |
| PRD-012 (ficha — botão transferir) | 📝 Redigido |
| PRD-015 (lista — ação em lote)     | 📝 Redigido |

### Decisões Pendentes

Nenhuma.

---

## Cadeia de PRDs

| Ordem | PRD          | Status       |
| ----- | ------------ | ------------ |
| 1-8   | PRDs 010-017 | 📝           |
| **9** | **PRD-018**  | **🔄 ATUAL** |
| 10    | PRD-019      | ⏳           |

---

## Considerações de Segurança

### Audit log imutável

Cada transferência registra `actorId`, `before/after` em `customer.sellerId`, `transfer.id`. Imutável. Base para resolver disputas de comissão.

### Validação cross-store

Apenas Owner com permission cross-store pode transferir entre lojas. Gestor está limitado à própria loja. Mock e provider validam — frontend protege UX, backend (Fase 2) protege dados.

### Reversão atomicidade

Operação que altera N clientes precisa ser atômica. No MVP, mock simula via Promise.all com rollback em erro. Fase 2 com Supabase usa transaction.

---

## Fluxos de Usuário

### Fluxo Principal — Cobertura de férias

1. Carlos vai sair de férias dia 1-15 de junho
2. Marina (Gestor) acessa `/app/carteira` → "Nova transferência temporária"
3. Preenche: De=Carlos, Para=Marina, período 01-15 jun, motivo=Férias, todos os clientes
4. Confirma → 35 clientes mudam para Marina; audit log; toasts
5. Durante junho, Marina atende a carteira do Carlos
6. Dia 16 (00:00 + tolerância): timer detecta `autoRevertAt < now`
7. Reversão automática: 35 clientes voltam para Carlos
8. Carlos recebe toast ao abrir o app: "Sua carteira foi devolvida — Marina cobriu durante suas férias"

### Fluxo Alternativo — Transferência em lote

1. Marina (Gestor) decide migrar clientes Volvo da carteira de Carlos para Rafael
2. Acessa `/app/clientes`, filtra "Vendedor=Carlos, Veículo marca=Volvo"
3. 18 clientes aparecem; seleciona todos via checkbox
4. Clica "Transferir vendedor" → modal abre
5. Seleciona Rafael, escreve motivo "Especialização Volvo do Rafael"
6. Confirma → 1 ICarteiraTransfer batch criado; 18 customers atualizados; audit log
7. Carlos e Rafael recebem toast

### Fluxo de Erro — Conflito de cobertura

1. Marina (Gestor) tenta criar temporária Carlos → Marina por outro motivo
2. Já existe uma ativa Carlos → Pedro (cobrindo um treinamento)
3. Sistema alerta: "Já há cobertura ativa para Carlos até 20/06. Continuar?"
4. Marina decide reverter a do Pedro primeiro, depois criar a sua

---

## Convenções de Código

| Elemento        | Convenção            | Exemplo                                                |
| --------------- | -------------------- | ------------------------------------------------------ |
| **Página**      | PascalCase + `Page`  | `CarteiraPage`                                         |
| **Componentes** | PascalCase           | `<NewTemporaryTransferModal>`                          |
| **Hooks**       | camelCase + `use`    | `useActiveTransfers`, `useAutoRevertTimer`             |
| **Pasta**       | kebab-case           | `carteira/`                                            |
| **Git commits** | Conventional Commits | `feat(carteira): add transfer system with auto-revert` |

---

## Notas para o Agente Desenvolvedor

### Princípios

| Princípio                              | Descrição                                                          |
| -------------------------------------- | ------------------------------------------------------------------ |
| **Carteira 1:1 estrita**               | Cliente tem 1 vendedor; transferência muda quem é, não compartilha |
| **Temporária reverte automaticamente** | Defeat the purpose se não reverter — timer obrigatório             |
| **Batch é 1 registro, não N**          | Audit limpo; 1 sumário + individuais                               |
| **Motivo sempre obrigatório**          | Sem motivo, history vira lixo                                      |
| **Audit é a fonte da verdade**         | Comissões futuras (PRD-047) dependem disso                         |
| **Cross-store só Owner**               | Validação tripla: frontend, mock, Fase 2 backend                   |

### O que NÃO Fazer

| ❌ Evitar                                                           |
| ------------------------------------------------------------------- |
| Criar múltiplas transferências individuais em lote (sempre 1 batch) |
| Permitir temporária sem endDate                                     |
| Permitir Vendedor acessar painel                                    |
| Esquecer atomicidade na atualização em lote                         |
| Implementar split de comissão aqui — é PRD-047                      |
| Esquecer indicador na ficha quando há cobertura temporária          |
| Timer rodando em loop sem condição de parar (memory leak)           |
| Permitir transferência entre lojas sem permission cross-store       |

---

## Status de Implementação

| Campo      | Valor       |
| ---------- | ----------- |
| **Status** | ⏳ PENDENTE |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                                          |
| ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — 4 tipos de transferência, painel dedicado, reversão automática para temporary, audit log central, integrações com PRDs 012 e 015 |

---

**AILA - Sistemas Inteligentes**

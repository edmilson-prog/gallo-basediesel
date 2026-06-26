# WhatsApp Multi-Instância — Design Spec

> **Data:** 2026-06-15
> **Status:** Design aprovado (brainstorming). Pré-implementação — nenhum código escrito.
> **Foco da fase:** Evolution. Meta segue o mesmo caminho (só muda a API).
> **Origem:** `/superpowers:brainstorming` + revisão adversarial (workflow ultracode, 25 agentes) verificada contra o código vivo.
> **Decisão de formato:** este documento é a fonte de verdade — **não** vira PRD-214 (decisão do dono).
> **Relacionados:** PRD-211/212/213 (Gestão de Pessoas & Acesso), PRD-120 (failover Relay), `2026-06-15-whatsapp-telefone-origem-design.md` (#98), issue #99 (ferramentas de manutenção de instância).

---

## 1. Problema & objetivo

Hoje a plataforma conecta **uma** instância por provider (uma Meta + uma Evolution). O objetivo é permitir **múltiplas instâncias** — cada uma um número de WhatsApp — criadas e geridas pela própria UI, com um modelo de **acesso** que define quem enxerga e responde cada conversa.

**Caso de uso real do dono:** vincular uma loja a uma instância; um ou vários atendentes a uma instância; instâncias dedicadas só a campanhas. Sempre com a invariante: **uma conversa entra e sai pela mesma instância**.

## 2. Achado-base (estado atual verificado)

A plataforma **já é largamente multi-conta** — o gap é UI de criação/gestão + modelo de acesso + modelo de participantes:

- **Não há** `unique(store_id, provider)` em `whatsapp_accounts` — múltiplas contas por provider já cabem no schema.
- `IConversation.whatsappAccountId` **já roteia a saída** (a conversa é amarrada a uma conta).
- O webhook **já resolve a entrada** por `provider_config.instanceName` (evolution) / `phoneNumberId` (meta).
- `WhatsAppAccountsPage` já itera sobre N contas.

**O que falta (confirmado no código):**

| Lacuna | Evidência |
|---|---|
| `IWhatsAppAccountsProvider` não tem **`create`** | `src/providers/data/contracts/whatsappAccounts.ts` — só `list/get/update/getMetrics` |
| `whatsapp_accounts` não tem **`purpose`** nem regras de acesso | `IWhatsAppAccount` em `src/shared/types/conversation.ts:156-179` |
| `IConversation` não tem **participantes** (`assignedSellerId` é escalar) | `conversation.ts:22-47` |
| Resolução de instância **sem unicidade garantida** | `20260610115402_whatsapp_111_provider_config.sql` cria só um CHECK de shape, **sem índice único** |
| Helpers/tabelas de acesso **não existem** | grep: `can_access_conversation`, `conversation_participants`, `whatsapp_account_access_rules` → *No files found* |

## 3. Modelo decidido

### 3.1 Instância = 1 número
Cada instância é um número de WhatsApp. No Evolution, **mesmo servidor** (1 `baseUrl` + 1 apikey); cada número é uma instância criada via `POST /instance/create` + pareamento por QR. Meta seguirá o mesmo fluxo de UI, trocando só a API/credenciais.

### 3.2 Invariante de roteamento
A conversa **entra e sai sempre pela mesma instância** (`conversations.whatsapp_account_id`). O **failover de saída fica DESLIGADO** — a invariante prevalece sobre o failover do PRD-120 (ver §6, bloqueio #5).

### 3.3 Finalidade (`purpose`)
Cada instância declara finalidade: **Atendimento**, **Campanha** ou **Ambos**. Define onde aparece (caixa de atendimento, disparo de campanhas — futuro — ou os dois).

### 3.4 Acesso em 2 camadas

**Camada 1 — acesso à instância (quem enxerga o pool).** Resolvido por **OU** de critérios: atendentes específicos, papel, loja e (depois do PRD-211) departamento. Quem não cai em nenhum critério **não vê** as conversas daquela instância. **Owner e Gestor sempre veem tudo** e gerenciam.

**Camada 2 — atribuição da conversa.** Cada conversa tem **1 responsável** (`assigned_seller_id`) + **0..N participantes** (co-responsáveis que **também respondem** ao cliente). Participante entra por @menção em nota interna **ou** inserção manual.

### 3.5 Visibilidade (não-staff)
Um atendente não-staff vê: conversas **atribuídas a ele** + onde é **participante** + o **pool das instâncias que acessa** (Camada 1, quando `assigned_seller_id` é null). Conversa atribuída a outro, fora do seu acesso, **não aparece e não vaza** (nem a lista, nem o conteúdo — ver §7.1).

### 3.6 Entrada (inbound)
**Híbrido:** se o cliente já tem dono de carteira e esse dono **acessa** a instância, a conversa nasce atribuída a ele; senão cai no **pool da instância**. A distribuição automática usa o **rodízio do PRD-213**, com **filtro de instância** na elegibilidade (só entram no rodízio atendentes que acessam aquela instância).

### 3.7 Saída & "Nova conversa"
O atendente **escolhe a instância de origem** ao iniciar. Recurso novo **"Nova conversa"** inicia atendimento com número **inédito**. O composer é **provider-aware**:
- **Evolution (Baileys):** texto livre + **aviso anti-ban** (sem trava técnica, mas com risco de bloqueio).
- **Meta (Cloud API):** **template HSM** obrigatório fora da janela de 24h — e número inédito está sempre fora.

A conversa criada tem **responsável = quem a criou** (decisão do dono).

### 3.8 Campanha (futuro, fora desta fase)
Ao criar uma campanha (ainda não implementada), escolhe-se **um ou múltiplos** números de origem. Apenas modelado por `purpose`; nada de UI de campanha aqui.

### 3.9 Desconexão & remoção
Instância desconectada: as conversas **permanecem** (envio bloqueado até reconectar). Exclusão de instância só com **remoção explícita + dupla confirmação** do histórico. Ferramentas avançadas de manutenção (transferir histórico entre instâncias etc.) ficam **diferidas na issue #99**.

## 4. UI (5 telas desenhadas e validadas)

Todas em tokens diesel-dark; cor por instância **derivada do id** (paleta de tokens fechada, **nunca** representa estado).

1. **Hub de instâncias** (`Configurações → WhatsApp`, **Owner/Gestor-only**) — cards por instância: status×saúde num só badge, provider como texto discreto, chip de finalidade, resumo de acesso ("N pessoas" — contagem **exata**), 1 ação primária por estado, "Adicionar número" no header, kebab. Nasce 100% em tokens (não herda os hex `emerald/red/amber` da tela atual).
2. **Adicionar número** (wizard 3 etapas: Identificação → Conexão → Acesso) — apelido + finalidade; **ID técnico derivado** read-only; estado novo **"criando instância…"** (`POST /instance/create` + 1ª gravação via `create`); reusa `QrPairingStep`/`useEvolutionPairing` para o QR (estados: criando → QR pronto c/ contador → expirado/gerar-novo → conectado). Ao final oferece "Configurar acesso".
3. **Configurar acesso** (Sheet pós-conexão; também pelo kebab) — seções **OU** (atendentes / papel / loja / departamento-bloqueado-até-211); **preview reativo que explica o OU** ("11 por papel + 1 individual = 12, contagem única"); estado "0 pessoas" com dupla confirmação (instância fantasma).
4. **Nova conversa** (Dialog) — **origem primeiro** (trava o modo do passo 3) → destino (número inédito ou busca de cliente) → mensagem **provider-aware** (texto livre+anti-ban no Evolution; TemplatePicker no Meta) → responsável = quem cria.
5. **OriginChip** (read-only) — 1 componente, 3 tamanhos; aparece no **header** (fora do subtítulo do contato), **composer** ("Respondendo por ●") e **lista** (faixa de cor na borda, **só com 2+ instâncias**, zero chips novos).

O Hub é a tela-mãe; Adicionar número, Configurar acesso, Nova conversa e OriginChip são acoplados a ele.

## 5. Modelo de dados (deltas)

### 5.1 Coluna nova em `whatsapp_accounts`
```sql
alter table public.whatsapp_accounts
  add column purpose text not null default 'atendimento'
    check (purpose in ('atendimento','campanha','ambos'));
```

### 5.2 `whatsapp_account_access_rules` (Camada 1)
Regras OU de acesso à instância. `kind` enumera o critério; `target` referencia o alvo (seller id, papel-claim, store id; `department` só após o PRD-211 N:N).
```sql
create table public.whatsapp_account_access_rules (
  id uuid primary key default gen_random_uuid(),
  whatsapp_account_id uuid not null references public.whatsapp_accounts(id) on delete cascade,
  kind text not null check (kind in ('seller','role','store')),  -- 'department' adicionado pós-211
  target_value text not null,   -- seller uuid / role claim ('seller_internal'...) / store uuid
  created_at timestamptz not null default now(),
  unique (whatsapp_account_id, kind, target_value)
);
```

### 5.3 `conversation_participants` (Camada 2)
Co-responsáveis. FK do seller é **`on delete no action`** (soft-delete preserva histórico — não `cascade`).
```sql
create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  seller_id uuid not null references public.sellers(id),  -- NO ACTION on delete
  added_by uuid references public.sellers(id),
  added_at timestamptz not null default now(),
  primary key (conversation_id, seller_id)
);
```

### 5.4 Helpers RLS (`security definer`, `stable`, `set search_path = ''`)
- `current_seller_accessible_account_ids() returns setof uuid` — instâncias que o seller atual acessa (OU das regras da §5.2 + papel/loja do claim).
- `is_conversation_participant(conv uuid) returns boolean`.
- `can_access_conversation(conv uuid) returns boolean` — **ponto único** de decisão: `is_staff() OR assignee OR is_conversation_participant(conv) OR (assigned_seller_id is null AND whatsapp_account_id IN current_seller_accessible_account_ids())`. Conversa sem instância (canal não-WhatsApp) cai na regra de loja/staff (guard `whatsapp_account_id is not null`).

### 5.5 Contrato & tipos (Provider Pattern)
- `IWhatsAppAccountsProvider.create(input: IWhatsAppAccountCreate): Promise<IWhatsAppAccount>` — novo método (mock + supabase). Mock injeta `storeId`; supabase exige `storeId` explícito (RLS).
- `IWhatsAppAccount.purpose: 'atendimento'|'campanha'|'ambos'`.
- Novos: `IWhatsAppAccountAccessRule`, `IConversationParticipant`. Participantes expostos como **lista à parte** (não na linha de `IConversation`).
- `formatPhone` (`src/shared/utils/format.ts`): extensão **aditiva** p/ prefixo `55` (já pendente no #98).

## 6. Os 6 bloqueios técnicos (resolver na implementação)

| # | Bloqueio | Ação |
|---|---|---|
| **0** | ~~Vazamento RLS de `messages`~~ — **AUDITADO 2026-06-15 em prod: NÃO há vazamento.** As policies reais de `messages` são store-scoped via subselect `conversation_id IN (SELECT id FROM conversations WHERE …)`, que **sofre a RLS de `conversations`** (dono/pool). Prova empírica: vendedor não-staff vê só suas+pool (354), não as de outros (24.837). | Reescrita ainda feita por **robustez** (delegação explícita a `can_access_conversation`) + **habilitação** do pool-por-instância/participante. Exige **backfill `kind=store`** p/ instâncias existentes (senão regride o pool). ✅ Aplicado e validado (sem regressão, sem vazamento). |
| **1** | Resolução de instância **sem unicidade** — webhook resolve por 1ª match; multi-instância pode colidir silenciosamente. | **Índices únicos parciais**: `unique (… provider_config->>'instanceName') where provider='evolution'` e `… ->>'phoneNumberId' where provider='meta'`. Webhook passa a exigir **exatamente 1 match**. |
| **2** | Domínio de papel — regras por papel comparam contra **claim JWT cru** (`owner`/`seller_internal`), não rótulos de UI ("Gestor"). | `target_value` de `kind='role'` guarda o claim cru. |
| **3** | `send/core.ts:170-179` autoriza `sameStore && (isStaff || isAssignee)`; pool = "qualquer seller da loja". | Adicionar **arm de participante** e **refinar o pool** para "seller acessa a instância" (espelhar `can_access_conversation`). |
| **4** | PRD-211 **RF-014** fixa "no máximo **um** departamento (MVP)". | **Editar o PRD-211**: departamento vira **N:N** (tabela de junção `seller_team_ids()`); `ISeller.departmentId?` → relação N:N. |
| **5** | PRD-120 traz failover de **saída** (`failoverPolicy/failoverAccountId/isFailoverActive`), incompatível com a invariante §3.2. | Colunas viram **no-op deprecado documentado** (não apagar — reconciliar com o Relay). |

## 7. Segurança (RLS) — como fica

- **Estratégia:** acesso resolvido **ao vivo** por `can_access_conversation` (`security definer`), sem tabela materializada — adequado ao porte; confirmado expressável e performático contra o banco vivo.
- `conversations`, `messages` e `conversation_participants` **todas** delegam SELECT/UPDATE a `can_access_conversation` — uma única fonte de verdade fecha o vazamento do bloqueio #0.
- Handoff per-seller (UPDATE que tira a linha do próprio escopo) continua via RPC `security definer` (padrão já existente — `transfer_conversation`).
- A UI de acesso (Camada 1) controla **visibilidade do pool**; a proteção real é a RLS. Owner/Gestor (claim) sempre passam.

## 8. Reconciliação

- **#98 (telefone-origem):** OriginChip **reusa** o componente; TopBar (P1) já agrega "N linhas" — não muda; composer (P2, antes opcional) **vira** o OriginChip; tela de contas (P3) segue. Helper de cor + `formatPhone` compartilhados.
- **PRD-211:** **fundação** — multi-instância depende do departamento N:N. Editar RF-014 (1→N:N). Ordem: §9.
- **PRD-212:** fora do turno = offline = sai do pool/rodízio — compatível (entra no filtro de elegibilidade).
- **PRD-213:** rodízio por loja + **filtro de instância** na elegibilidade (ajuste sobre a decisão 7-A "uma fila por loja").
- **PRD-120:** failover de saída → no-op deprecado (§6, bloqueio #5).
- **#99:** ferramentas de manutenção de instância (transferir histórico, remoção c/ dupla confirmação) — diferidas.

## 9. Ordem de implementação
1. **Spec** (este documento). ✅
2. **PRD-211 N:N** — teams/team_members + `seller_team_ids()` (fundação de departamento).
3. **Multi-instância** — esta spec (dados → helpers → reescrita de policies na **mesma** migração → contrato `create` → UI das 6 telas → arm de participante no `send/core.ts` → índices únicos + webhook exatamente-1).
4. **PRD-212/213** — horário e rodízio com filtro de instância.

## 10. Fora de escopo (YAGNI)
UI de campanha; transferência de histórico entre instâncias (#99); failover de saída (desligado); departamento antes do PRD-211; ACL por linha individual além das 2 camadas.

## 11. Decisões registradas
- Documento = spec (não PRD-214).
- Hub = **Owner/Gestor-only**.
- Nova conversa: responsável = **quem cria**.
- Failover de saída **OFF** (invariante vence).
- Departamento **N:N** (edita PRD-211 RF-014).
- Cor por instância derivada do id; **nunca** = estado.
- Pool em canal sem instância → regra de loja/staff (guard `whatsapp_account_id is not null`).

## 12. Riscos & questões abertas
- **[RESOLVIDO 2026-06-15] Policies de `messages`** — auditado em prod: store-scoped via subselect que sofre a RLS de `conversations` → **sem vazamento**. A reescrita (130400) virou robustez + habilitação; exigiu backfill para não regredir o pool. Aplicado e validado.
- **Backfill aplicado:** instâncias EXISTENTES receberam `access_rule kind=store` (todos da loja acessam — preserva o pool). Instâncias NOVAS (criadas pela UI) nascem sem regras = Owner/Gestor-only, por design. `purpose='atendimento'` via default.
- `.env.local` aponta para **produção** — qualquer migração exige autorização explícita do dono e espelhamento no Git (regra do projeto).

# WhatsApp — Exibir o telefone de origem (linha conectada)

> **Status:** Levantamento de design — **NÃO implementado**. Documento de registro para decisão/execução futura.
> **Data:** 2026-06-15
> **Autor:** Claude (AILA) — protocolo PRE-TASK, FASES 1–2 (exploração + planejamento), com consultoria do agente de design UI/UX.
> **Pedido original:** "Preciso que seja exibido em algum lugar o telefone de origem — o número de WhatsApp que está conectado na plataforma."
> **Mockup visual:** `docs/superpowers/mockups/2026-06-15-whatsapp-telefone-origem.html` (abrir no navegador — renderiza as peças com os tokens reais do tema diesel-dark).

---

## 1. Contexto

Hoje o operador (dono/atendente) não tem confirmação visual de **qual número de WhatsApp a plataforma está usando** para enviar mensagens. A informação existe, mas está praticamente escondida — exige navegar até Configurações → WhatsApp e ler um subtítulo apagado. Em cenário de **failover** (Meta ↔ Evolution) isso é crítico: a mensagem pode estar saindo pela linha reserva e nada na interface principal indica isso de forma legível.

---

## 2. Achado central (o mais importante)

**O número de origem já existe nos dados e já é o número REAL conectado — não precisa de migration nem de nova captura.** A tarefa é puramente de **exibição**.

- O campo `IWhatsAppAccount.phoneNumber` (coluna `whatsapp_accounts.phone_number`) é a linha de origem.
- A Edge Function `whatsapp-connect` (função `markConnected`) **sobrescreve `phone_number` com o número que o Evolution reporta como conectado** logo após o pareamento por QR:
  - Fonte: `GET /instance/fetchInstances` do Evolution → campo `owner` / `ownerJid` (formato `5599...@s.whatsapp.net`).
  - Conversão: `jidToPhone()` → E.164.
  - Também persiste `profileName` em `provider_config` (jsonb).
- Logo, todo lugar que carrega a conta já tem o número conectado disponível em `account.phoneNumber`.

**Conclusão:** sem mudança de schema, sem mudança de contrato, sem nova query → **blast radius baixíssimo**.

---

## 3. Inventário de features (arquivos relevantes)

### Tipo de domínio
- **`src/shared/types/conversation.ts`** (L.156-179) — `IWhatsAppAccount`:
  `id, storeId, label, phoneNumber, provider, credentialsRef, status, capabilities, providerConfig, currentState, stateChangedAt, failoverPolicy, failoverAccountId, isFailoverActive, createdAt`.
  → `phoneNumber` é a fonte de verdade da linha de origem; `label` é o nome amigável; `providerConfig` pode conter `profileName`.

### Onde o número JÁ aparece
- **`src/features/admin-settings/pages/WhatsAppAccountsPage.tsx`** (L.400) — exibe `{account.phoneNumber}` como subtítulo discreto `text-xs text-muted-foreground`, subordinado ao label. ⚠️ Usa **cores cruas** (`emerald-500`, `red-500`, `amber-500`) → débito de tokens (viola PRD-001).
- **`src/features/admin-settings/components/ConnectWhatsAppDialog.tsx`** (L.361) — exibe `pairing.profile.phoneNumber ?? account.phoneNumber` após conexão bem-sucedida ("Conectado como …").

### TopBar / Shell
- **`src/features/shell/components/TopBar.tsx`** — slot `ml-auto` com `<WhatsAppStatusButton />`, copiloto, notificações, tema, avatar. O `EnvironmentBadge` (L.149-182) é bom modelo de badge com tokens `severity-*`.
- **`src/features/shell/components/WhatsAppStatusButton.tsx`** — hoje é só ícone colorido (verde/âmbar/vermelho) + tooltip *"N contas conectadas"*. **Não mostra o número.** Usa cores cruas (débito de tokens).
- **`src/features/shell/hooks/useWhatsAppConnectionStatus.ts`** — query compartilhada (refetch 60s) que lista as contas da loja e alimenta o botão **e** o banner. Retorna `{ accounts[], total, connectedCount, disconnected[], alerting[], snoozed }`. **Fonte ideal para derivar o número, sem nova query.**
- **`src/features/shell/components/WhatsAppDisconnectedBanner.tsx`** — banner global; usa `label` (não o número).

### Conversa / Inbox
- **`src/features/conversations/components/ConversationHeader.tsx`** (L.86-92) — ⚠️ **REGRA EXPLÍCITA no código**: *nunca* usar `whatsappAccount.phoneNumber` no subtítulo do contato — ali é o telefone **do cliente**; misturar rotularia nossa linha como sendo a do contato (perigoso quando RLS esconde o cliente para um atendente em conversa transferida).
- **`src/features/conversations/components/InboxHeader.tsx`** — segunda linha (onde vive "Ordenar por…") é candidata à faixa "Origem".
- **`src/features/conversations/components/MessageInput.tsx`** — recebe `whatsappAccount: IWhatsAppAccount | null` (sabe a conta, mas não exibe).
- **`src/features/conversations/hooks/useConversationDetail.ts`** (L.33, L.98) — resolve a conta via `conv.whatsappAccountId` → `whatsappProvider.get(...)`.

### Utilitário de formatação
- **`src/shared/utils/format.ts`** (L.54-62) — `formatPhone()` só trata 10/11 dígitos; números com prefixo `55` (12-13 díg, como o WhatsApp guarda) caem no fallback cru. **Precisa de extensão aditiva** (sem quebrar 10/11 díg).

### Provider / contrato (sem mudança)
- **`src/providers/data/contracts/whatsappAccounts.ts`** — `list / get / update / getMetrics`.
- **`src/providers/data/hooks/useWhatsAppAccountsProvider.ts`** — hook de acesso.
- **`src/providers/data/impl/supabase/whatsappAccounts.ts`** (L.40-63) — `rowToWhatsAppAccount` mapeia `phone_number → phoneNumber`.

### Multistore
- Cada conta tem `storeId`. **Pode haver 1 ou N contas por loja** (o seed tem 2: Meta oficial + Evolution campanhas). A UI precisa **agregar** quando há várias.

---

## 4. Fluxo de dados (resumo)

```
Pareamento por QR (whatsapp-connect / markConnected)
   └─ Evolution GET /instance/fetchInstances → owner/ownerJid (jid)
        └─ jidToPhone() → E.164
             └─ UPDATE whatsapp_accounts.phone_number  (+ provider_config.profileName)

Runtime do app
   useWhatsAppConnectionStatus (60s)  ──►  WhatsAppStatusButton / DisconnectedBanner  (TopBar / global)
   useConversationDetail (por conversa) ─►  whatsappAccount → MessageInput / Header     (Atendimento)
   WhatsAppAccountsProvider.list({storeId}) ► WhatsAppAccountsPage                        (Configurações)
```

Todos já têm `account.phoneNumber` em mãos.

---

## 5. Opções de layout

### As 3 peças visuais

#### Peça 1 — Chip no TopBar (transforma o ícone atual em chip com número)
O `WhatsAppStatusButton` (hoje só ícone) vira um **chip compacto: ícone WhatsApp + número curto + ponto de status**, mantendo o clique que leva a Configurações → WhatsApp; clique abre um popover com detalhe (label, número formatado, status, failover, "Gerenciar conexões"). Colapsa para só o ícone no mobile.

```
TopBar (toda tela /app):
  GALLO BASE DIESEL   [Matriz ▾]        … [ ◎ WhatsApp · (55) 99800-1000 ● ]  🔔  ◐  (ES)
                                                                          └ ● verde = conectado
Variações:
  2+ linhas (agrega):   [ ◎ WhatsApp · 2 linhas ● ]      (números completos no popover)
  failover ativo:       [ ◎ (55) 99800-1000 ⇄ reserva ▲ ]   (âmbar/warning)
  desconectado:         [ ◎ WhatsApp · desconectado ▲ ]      (vermelho/critical)
```
- **Tokens:** chip `rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs`; número `font-medium tabular-nums text-foreground`; ponto `text-severity-{success|warning|critical}`.
- **Prós:** descoberta máxima (sempre à vista); reusa `useWhatsAppConnectionStatus` (zero nova query); resolve "de qual número estou enviando" globalmente; cobre failover.
- **Contras:** TopBar é espaço nobre/disputado; número por extenso polui em telas estreitas; com 2+ contas precisa agregar.
- **Esforço:** Médio (1 componente, dados prontos; cuidado com responsividade + popover).

#### Peça 2 — Faixa "Origem" no header do Inbox (e/ou chip no cluster direito da conversa)
Linha de contexto discreta **"Origem: ◎ (55) 99800-1000 ● Conectado"** na 2ª linha do `InboxHeader` (à direita). Opcionalmente um chip mínimo no `ConversationHeader` **no cluster direito de ações** — **nunca** no subtítulo do contato (respeita a regra das L.86-92).

```
/app/atendimento (header):
  📥 Caixa de Entrada · 128 conversas
  Ordenar por: recentes ▾            Origem: ◎ (55) 99800-1000 ● Conectado
```
- **Tokens:** rótulo `text-[11px] text-muted-foreground`; número `font-medium text-foreground tabular-nums`; ponto `bg-severity-success` (mesmo padrão do "tempo real" já no InboxHeader).
- **Prós:** aparece no contexto de uso (quem responde quer saber por qual linha); leitura passiva, baixo ruído.
- **Contras:** não é global (só Atendimento); risco de confusão origem-vs-contato no header da conversa se mal posicionado; duplica info em duas telas próximas.
- **Esforço:** Baixo-Médio (a faixa do Inbox é trivial; o chip da conversa exige disciplina de layout).

#### Peça 3 — Destaque na tela de contas (lar canônico)
Reformatar o card de cada conta em `WhatsAppAccountsPage`: **número formatado em destaque tipográfico** (não mais subtítulo apagado), com `+55`, badge de status grande, aviso de failover e **botão "Copiar número"**. Oportunidade de **migrar os hex hardcoded → tokens `severity-*`** (paga débito do PRD-001).

```
/app/configuracoes/whatsapp:
 ┌──────────────────────────────────────────────────────┐
 │ ◎  Atendimento Principal                              │
 │    +55 (55) 99800-1000              [ ● Conectada ]   │
 │    Evolution · Saudável             [ ⧉ Copiar ]      │
 └──────────────────────────────────────────────────────┘
```
- **Tokens:** número `text-base sm:text-lg font-semibold text-foreground tabular-nums`; prefixo `+55` `text-muted-foreground`; pills `severity-{success|critical|warning}`.
- **Prós:** é onde o dado pertence semanticamente; espaço de sobra; baixo risco; corrige débito de tokens.
- **Contras:** descoberta baixa (resolve "onde confiro", não "vejo de relance").
- **Esforço:** Baixo.

### Os 4 escopos propostos (combinações das peças)

| Escopo | Peças | Cobre "ver de relance"? | Esforço | Nota |
|---|---|---|---|---|
| **A — TopBar + tela de contas** ⭐ | P1 + P3 | ✅ Sim, global | Médio | **Recomendado.** Relance no topo + detalhe canônico. |
| **B — Só no TopBar** | P1 | ✅ Sim | Médio-baixo | Mínimo; contas seguem como hoje. |
| **C — Completo** | P1 + P2 + P3 | ✅ Sim + contexto | Médio-alto | Máxima visibilidade; mais arquivos tocados. |
| **D — Só na tela de contas** | P3 | ❌ Não | Baixo | Menor risco, menor descoberta. |

---

## 6. Recomendação priorizada

**Fazer primeiro o Escopo A: Peça 1 (chip no TopBar) + Peça 3 (destaque na tela de contas).**

Racional (descoberta vs. ruído):
1. O pedido literal — "ver de qual número o sistema está conectado/enviando" — é necessidade de **leitura rápida e onipresente**. Só a Peça 1 entrega isso em toda a plataforma sem navegação.
2. O custo de ruído da Peça 1 é gerenciável: o slot já existe como ícone; vira chip que mostra o número (1 conta) ou agrega ("2 linhas") com detalhe no popover. No mobile colapsa para o ícone atual → zero regressão.
3. Reusa o hook existente (`useWhatsAppConnectionStatus`) — sem query nova, dedupe garantido com o banner.
4. A Peça 3 entra logo em seguida porque é barata e corrige o débito de tokens (hex hardcoded) daquela tela, dando o "lar canônico" com número grande + copiar.
5. A Peça 2 fica como **opcional/fase 2** — a faixa do Inbox é bom plus, mas o chip do `ConversationHeader` carrega risco de confusão origem-vs-contato (regra de código desaconselha mexer ali).

Sequência: **A (P1+P3) → P2 opcional.**

---

## 7. Plano de implementação (quando aprovado)

Do menor para o maior risco:

1. **Base (TDD).** Estender `formatPhone` em `src/shared/utils/format.ts` de forma **aditiva**: tolerar prefixo `55` (12-13 díg) → `+55 (DD) NNNNN-NNNN`, mantendo 10/11 díg intactos. Criar helper de exibição da conta (número formatado + estado/cor). Testes Vitest co-localizados.
2. **Peça 3 — `WhatsAppAccountsPage`.** Número em destaque + botão "Copiar número" (`toast.success("Número copiado")`) + migrar hex → `severity-*`. Validar contraste em `/design-system`.
3. **Peça 1 — `WhatsAppStatusButton`.** Derivar número(s) do `useWhatsAppConnectionStatus`; chip responsivo (colapsa no mobile); popover de detalhes (label, número, status, failover). Manter o destino do clique.
4. **(opcional) Peça 2 — `InboxHeader`.** Faixa "Origem" na 2ª linha.

---

## 8. Detalhes de qualidade

- **Formatação:** reusar/estender `formatPhone`; não criar 2ª convenção de máscara; `tabular-nums` em todo número; sempre pt-BR (sem locale do browser).
- **Estado (cor + ícone, nunca só cor):** conectado → `severity-success` + `mdi:check-circle`/ponto; parcial/failover → `severity-warning` + `mdi:swap-horizontal`; desconectado → `severity-critical` + `mdi:alert-circle`; carregando/sem conta → `muted-foreground`.
- **Microcopy (pt-BR):** "Número de origem", "Enviando de", "Conectado como", "Linha conectada"; failover → "Failover ativo — enviando pela linha reserva +55 (…)"; "Copiar número" → toast "Número copiado".
- **Acessibilidade (WCAG 2.2 AA):** o chip continua `button` com `aria-label` completo (número + estado) mesmo quando o texto visível é abreviado; ponto de status `aria-hidden`; popover navegável por teclado (shadcn `Popover`/`HoverCard`); validar contraste dos `severity-*` nos 4 temas × 2 modos em `/design-system`; animações sob `motion-safe:`.
- **Responsivo:** TopBar colapsa número/rótulo (`hidden lg:inline`), restando o ícone (= comportamento atual, sem regressão); número completo segue acessível via tap → popover.

---

## 9. Pontos de risco

- TopBar é espaço disputado → mitigar colapsando no mobile e agregando 2+ contas.
- Migração hex → token pode alterar tom sutil → validar em `/design-system`.
- `formatPhone` deve permanecer **retrocompatível** com 10/11 dígitos.
- `phoneNumber` pode vir vazio/cru se o pareamento não resolveu `owner` → **fallback para `label`**.

---

## 10. O que NÃO fazer (anti-padrões)

- **Não** usar hex nem cor crua de Tailwind — só tokens semânticos (`severity-*`, `text-foreground`, `text-muted-foreground`). Ao tocar a tela de contas, **migrar** os hardcodes existentes.
- **Não** colocar a linha de origem no **subtítulo do contato** no `ConversationHeader` (regra explícita L.86-92). Se fizer a Peça 2, a origem vai no **cluster direito, com rótulo próprio**.
- **Não** criar uma segunda query para o número — derivar de `useWhatsAppConnectionStatus`.
- **Não** poluir o TopBar com número + país + provider tudo expandido em todas as larguras — detalhe vai para o popover/tela de contas.
- **Não** duplicar a mesma informação verbosa em 3 lugares sem hierarquia (TopBar = relance global; tela de contas = detalhe canônico; Inbox/Conversa só se pedido).

---

## 11. Referências

**Mockup visual (durável):** `docs/superpowers/mockups/2026-06-15-whatsapp-telefone-origem.html`

**Arquivos-chave para a implementação:**
- `src/features/shell/components/WhatsAppStatusButton.tsx` — alvo da Peça 1.
- `src/features/shell/hooks/useWhatsAppConnectionStatus.ts` — fonte de dados (contas, 60s, compartilhada).
- `src/features/shell/components/TopBar.tsx` — slot do chip (modelo: `EnvironmentBadge`).
- `src/features/admin-settings/pages/WhatsAppAccountsPage.tsx` — alvo da Peça 3 + hex a migrar.
- `src/features/conversations/components/ConversationHeader.tsx` — **ler L.86-92** antes de tocar.
- `src/features/conversations/components/InboxHeader.tsx` — faixa da Peça 2.
- `src/shared/utils/format.ts` — `formatPhone()` a estender.
- `src/shared/types/conversation.ts` — `IWhatsAppAccount.phoneNumber` (fonte).
- `supabase/functions/whatsapp-connect/index.ts` — `markConnected` (grava o número conectado).
- `src/providers/whatsapp/evolution/instance.ts` — `fetchInstanceProfile` / `jidToPhone`.
- `docs/dev/ux-guidelines.md` — regras transversais (tokens, a11y, motion-reduce).

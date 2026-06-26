# PRD-146: Notification Center — Ativação Real

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, migrations + `src/features/notifications/` (deltas na UI do 009) + Edge `notification-digest`_ |
| **Objetivo** | **Re-escopo declarado** (o Anexo C do PRD-008 pediu exatamente esta reavaliação): a UI do Center já existe (PRD-009) — este PRD **não a recria, ativa-a**. Quatro ativações: **(1) Persistência real** — migrations `crm.notifications` + `crm.notification_preferences` + `SupabaseNotificationProvider`/`PreferenceStore` reais (drop-in no factory do 008) + Realtime no badge — **fecha o gap estrutural da onda** (o 141 referencia a tabela; ninguém a criava); **(2) DeliveryStatus real por canal na UI** — ícones de canal com status vivo (email ✓ entregue, WhatsApp ✓✓ lido via view do 143, suprimido ⚠) + drawer com a linha do tempo de entregas; **(3) Digest agendado** — resumo por email (diário/semanal por categoria, configurável na tela do 009) via cron + template no registry do 142; **(4) Quiet hours ATIVADAS** — o campo adormecido do 008 ganha lógica: categorias não-transacionais em janela de silêncio têm canais externos segurados e desaguam no digest seguinte |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | P1 |
| **Épico** | Onda 8 — Notificações Reais (v2.4.0 "Reach") |
| **PRDs Relacionados** | PRD-008 F1 (fundação — campos adormecidos ativam aqui); PRD-009 F1 (UI — recebe deltas, não reescrita); PRD-141 (**co-dependência de ordem**: a Fase 1 daqui precede a implementação do 141 — a tabela que o trigger dele assume nasce aqui); PRD-143 (view de status); PRD-142 (template digest — DELTA +1 no registry); PRD-105 (Realtime); PRD-147 (preferências ganham trilha legal lá); PRD-150 |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Migrations primeiro; deltas cirúrgicos na UI existente; digest como Edge + cron |

### Critérios de Complexidade

> **Justificativa de Alta:** três razões. (1) **Este PRD carrega a persistência da onda inteira** — `crm.notifications` é a tabela-mãe que 141/143/144/145 referenciam; errar o schema aqui propaga para quatro canais (por isso a Fase 1 é gate de implementação de todos). (2) **Quiet hours + digest é uma máquina de retenção**: segurar a entrega certa, soltar no momento certo, **uma única vez**, sem duplicar com o envio individual — o estado `held` interage com tudo que o 141 já faz. (3) A UI do 009 foi desenhada para mock; ligar status reais multi-canal sem regredir UX exige deltas precisos, não reforma.

### Nota de Re-escopo (10/06/2026)

> O roadmap original descrevia o 146 como "substitui o toast-only do MVP". O PRD-009 (Fase 1) entregou o Center completo antes — exatamente como o Anexo C do PRD-008 antecipou ao pedir a reavaliação deste número. **Escopo ressignificado para "Ativação Real"** (persistência + status vivo + digest + quiet hours), número mantido — mesmo padrão dos PRDs 118 (Onda 5) e 140B (Onda 7).

---

## Contexto do Problema

Quatro dívidas convergem aqui:

1. **A tabela-fantasma:** o 141 declarou trigger `pg_net` no INSERT de `crm.notifications` — mas nenhum PRD da Fase 2 criou a tabela nem implementou o `SupabaseNotificationProvider` (esqueleto desde o 008). Gap estrutural detectado na revisão do sub-lote: **fechado aqui, com ordem de implementação declarada** (146-F1 → 141 → 142 → 143 → 146-F2+).
2. **Status cego:** o Center (009) mostra a notificação, mas "foi entregue? o cliente leu o WhatsApp? o email quicou?" — os dados existem (deliveries do 141, dispatch_status do 118) e a UI não os enxerga.
3. **Digest prometido:** o 008 excluiu explicitamente "digest agendado sofisticado → Onda 8". Gestor com 40 notificações operacionais/dia precisa do resumo matinal, não de 40 emails.
4. **Quiet hours de mentira:** o campo existe, modelado e adormecido. Gamificação às 23h continua chegando.

---

## Conceito da Solução

### Fase 1 — Persistência Real (gate da onda)

```sql
CREATE TABLE crm.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL,
  lifecycle text NOT NULL CHECK (lifecycle IN ('event','derived')),
  type text NOT NULL,                              -- NotificationEventType
  category text NOT NULL CHECK (category IN ('transactional','commercial','operational','gamification','system','marketing')),
  severity text NOT NULL CHECK (severity IN ('info','success','warning','critical')),
  recipient_id uuid NOT NULL,
  recipient_type text NOT NULL CHECK (recipient_type IN ('seller','customer')),
  store_id uuid REFERENCES crm.stores(id),
  title text NOT NULL,                             -- snapshot (008 RF-006)
  body text NOT NULL,
  entity_ref jsonb,                                -- { type, id }
  actions jsonb,
  status text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read','archived')),
  channels text[] NOT NULL,                        -- canais-alvo resolvidos
  delivery_status jsonb,                           -- agregado por canal (detalhe em deliveries)
  group_key text,
  source text NOT NULL DEFAULT 'system' CHECK (source IN ('system','rule','user')),
  digested_at timestamptz,                         -- entrou em digest (não repetir)
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  expires_at timestamptz,
  metadata jsonb
);
CREATE UNIQUE INDEX ON crm.notifications (recipient_id, recipient_type, dedupe_key);
CREATE INDEX ON crm.notifications (recipient_id, recipient_type, status, created_at DESC);
CREATE INDEX ON crm.notifications (group_key) WHERE group_key IS NOT NULL;

CREATE TABLE crm.notification_preferences (
  recipient_id uuid NOT NULL,
  recipient_type text NOT NULL,
  channel_matrix jsonb NOT NULL,                   -- categoria × canal (008 RF-004)
  quiet_hours jsonb,                               -- { start: '22:00', end: '07:00', tz } — ATIVA aqui
  digest jsonb,                                    -- { email: { frequency: 'daily'|'weekly'|'off', hour: 7, categories: [...] } }
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recipient_id, recipient_type)
);
-- RLS: dono lê/edita as próprias; service_role escreve notifications; gestores leem do escopo (matriz 006)
```

`SupabaseNotificationProvider` + `SupabaseNotificationPreferenceStore` implementam os contratos do 008 (drop-in no factory por `VITE_DATA_SOURCE`); Realtime (105) na tabela → badge do sino ao vivo, derivadas expiram visivelmente. **Ordem mandatória de implementação da onda: 146-F1 → 141 → 142 → 143 → 146-F2+** (declarada também nas notas do 141).

### Fases 2–3 — Status Vivo na UI (deltas no 009)

| Delta | Onde | O quê |
|---|---|---|
| Ícones de canal | linha da notificação (dropdown + página) | por canal-alvo: ✉/⬤WhatsApp/SMS/🔔 com cor de status (cinza pending, verde delivered, ✓✓ azul read via view do 143, âmbar suppressed/skipped, vermelho failed/bounced) + tooltip |
| Drawer de entregas | clique em "detalhes" | linha do tempo de `notification_deliveries`: canal, provider, tentativa, timestamps, erro legível — a verdade auditável visível |
| Seção "Entregas com problema" | página do Center, aba para gestor (RBAC) | fila de deliveries failed/bounced/suppressed do escopo, link para a ficha (badge do 141 já existe lá) — gestor age sobre email quebrado do cliente |

Fonte única: `v_notification_delivery_status` (143) — a UI **lê**, jamais infere.

### Fase 4 — Digest

```
pg_cron horário → Edge notification-digest
  para cada recipient com digest.email.frequency ≠ 'off' e hora local == digest.hour:
    coleta unread + não-digested das categorias escolhidas (+ held de quiet hours, RF-040)
    ≥1 item → render 'notification-digest' (registry 142 — DELTA +1)
            → EmailChannel (141)  → marca digested_at
    zero itens → silêncio (digest vazio é spam)
```

Template: agrupado por categoria, contagens, top 5 itens com link profundo, CTA "Abrir o Center". Idempotência diária por `(recipient, date)`.

### Fase 4 — Quiet Hours (ativação)

Guarda no dispatch (141 — **DELTA declarado**, uma condição):

```
categoria ∈ {transactional} → ignora quiet hours (decisão do 143, mantida)
categoria ∉ transactional E agora ∈ quiet_hours do recipient:
  canais externos da delivery → 'skipped_quiet_hours' (novo valor no CHECK de deliveries — migration aditiva)
  inApp entrega normalmente (silencioso por natureza)
  conteúdo entra no próximo digest (RF-040) — a válvula de escape
```

Sem scheduler de reenvio individual: a liberação **é** o digest — simplicidade deliberada (alternativa de fila `held` com release a cada 15min avaliada e descartada por complexidade sem ganho para o volume da operação).

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Migration de `crm.notifications` no 141 | O 141 já estava emitido; ativação de persistência é semanticamente deste PRD (Anexo C); a **ordem de implementação** declarada resolve sem retrabalho |
| Reescrever o Center "agora que é real" | O 009 foi desenhado para isto (Provider Pattern); deltas cirúrgicos preservam o investimento da Fase 1 |
| Reenvio individual pós-quiet-hours (fila held + release) | Scheduler novo para ganho marginal; digest matinal é a liberação natural e o que o gestor de fato quer |
| Digest também por WhatsApp | HSM de resumo = custo + template marketing; email é o meio de digest; reavaliar pós-147 |
| Status inferido na UI (sem view) | Duas fontes divergem; a view do 143 já unifica — UI só lê |
| Digest vazio "para manter o hábito" | Email sem conteúdo treina o usuário a ignorar — silêncio é feature |

---

## Escopo

### Incluído

- ✅ **Fase 1 (gate):** migrations `crm.notifications` + `crm.notification_preferences` (+RLS, índices, Realtime publication — DELTA 105 declarado); `SupabaseNotificationProvider` + `PreferenceStore` reais (drop-in); badge ao vivo; defaults de preferência por papel (Anexo B do 008) seedados no primeiro acesso
- ✅ Migration aditiva em `notification_deliveries`: valor `skipped_quiet_hours` no CHECK
- ✅ Deltas na UI do 009: ícones de canal com status (via view do 143), drawer de entregas, aba "Entregas com problema" (gestor, RBAC)
- ✅ Tela de preferências (009) ganha: configuração de quiet hours (início/fim/tz, default off) e de digest (frequência/hora/categorias) — persistindo de verdade
- ✅ Edge `notification-digest` + pg_cron horário; template `notification-digest` no registry do 142 (**DELTA +1 declarado**); idempotência por dia; `digested_at`
- ✅ Ativação de quiet hours no dispatch (141 — **DELTA**: uma guarda por categoria) com desaguamento no digest
- ✅ Audit: `digest_sent { recipient, items }`, `delivery_skipped_quiet_hours`, `preferences_updated`
- ✅ Testes: provider real (CRUD + dedupe UNIQUE + Realtime), guarda de quiet hours (transacional passa / gamificação segura), digest (coleta, idempotência diária, vazio = silêncio, held incluídos), drawer/ícones por fixture de deliveries, RBAC da aba de problemas
- ✅ **Ordem de implementação da onda documentada** (146-F1 primeiro) nas notas deste e do 141
- ✅ Documentação `docs/dev/notification-center-activation.md`

### Excluído

- ❌ Reescrita de qualquer tela do 009 (deltas apenas)
- ❌ Trilha legal de consentimento nas preferências (PRD-147 — a matriz persiste aqui; o registro imutável LGPD é lá)
- ❌ Digest por WhatsApp/push (email only; reavaliação pós-147)
- ❌ Reenvio individual pós-quiet-hours (digest é a liberação — decisão registrada)
- ❌ Notificações derivadas novas (reconciliador do 008 segue; nenhuma regra nova aqui)
- ❌ Push opt-in UI (PRD-145 já entrega no host do 009)

---

## Requisitos Funcionais

### Persistência (Fase 1 — gate)

- **RF-001:** Migrations conforme conceito; UNIQUE de dedupe por `(recipient, type, dedupe_key)`; Realtime publication estendida (DELTA 105).
- **RF-002:** Providers reais drop-in: alternar `VITE_DATA_SOURCE` troca mock↔Supabase sem tocar consumidores (009 funciona inalterado).
- **RF-003:** Defaults do Anexo B (008) materializados no primeiro acesso do recipient (lazy seed, idempotente).
- **RF-004:** Badge/lista ao vivo via Realtime; derivada expirada some sem refresh.

### Status na UI

- **RF-010:** Ícones por canal-alvo na linha (dropdown e página), cor/estado da view do 143; tooltip com timestamp.
- **RF-011:** Drawer "Detalhes da entrega": deliveries da notificação em linha do tempo (canal, provider, tentativa, status, erro humano-legível, webhook ids colapsados).
- **RF-012:** Aba "Entregas com problema" (Owner/Manager; seller vê só as dos próprios clientes): failed/bounced/suppressed dos últimos 30d, filtros por canal, link para a ficha.
- **RF-013:** UI nunca calcula status — só renderiza a view (fonte única).

### Quiet Hours

- **RF-020:** Config na tela de preferências: toggle + início/fim (passos 30min) + tz default America/Sao_Paulo; default **off**.
- **RF-021:** Guarda no dispatch (DELTA 141): não-transacional + dentro da janela → canais externos `skipped_quiet_hours`; inApp normal.
- **RF-022:** Itens skipped entram no próximo digest do recipient (RF-040) — nenhuma notificação some.

### Digest

- **RF-030:** Config: frequência (daily/weekly/off — default off), hora (default 7), categorias (default operacional+comercial).
- **RF-031:** Cron horário; janela por hora local do recipient; idempotência `(recipient, date)` — replay não duplica.
- **RF-032:** Coleta: unread + `digested_at IS NULL` das categorias + skipped_quiet_hours desde o último digest; zero → não envia.
- **RF-040:** Render `notification-digest` (142): agrupado por categoria, contagem, top 5 com deep-link, CTA Center; envio via EmailChannel; `digested_at` marcado em transação com o envio aceito.
- **RF-041:** Falha do envio → `digested_at` não marca (próxima janela retenta); audit.

### Testes/Docs

- **RF-050:** Suites conforme escopo; E2E mock: gamificação às 23h com quiet hours on → inApp só → digest 7h inclui → digested.
- **RF-051:** `notification-center-activation.md` + nota de ordem de implementação replicada no `_DONE` do 141.

---

## Requisitos Não-Funcionais

- **RNF-001 (Gate estrutural):** nenhum PRD da onda implementa antes da Fase 1 daqui — a tabela-mãe primeiro.
- **RNF-002 (Fonte única de status):** view do 143; zero inferência na UI.
- **RNF-003 (Nada se perde):** quiet hours seguram, digest entrega — invariante testada (toda skipped aparece em exatamente um digest).
- **RNF-004 (Silêncio é feature):** digest vazio não envia; transacional nunca é segurado.
- **RNF-005 (Drop-in honrado):** 009 inalterado funciona com o provider real (o contrato do 008 era para isto).

---

## Critérios de Aceitação

### RF-002: Drop-in Real

```gherkin
DADO VITE_DATA_SOURCE=supabase com as migrations aplicadas
QUANDO o Center (009) abre sem nenhuma alteração de código de UI
ENTÃO lista/badge vêm de crm.notifications via provider real
  E marcar como lida persiste e propaga via Realtime a outra aba
```

### RF-021/RF-040: Quiet Hours → Digest (nada se perde)

```gherkin
DADO seller com quiet hours 22:00–07:00 e digest daily 07:00
QUANDO 'meta batida' (gamification) dispara às 23:14
ENTÃO inApp entrega; email/whatsapp = skipped_quiet_hours
  E às 07:00 o digest inclui o item agrupado em Gamificação
  E digested_at marcado — não reaparece no digest seguinte

DADO 'payment.confirmed' (transactional) às 23:30
ENTÃO entrega IMEDIATA em todos os canais (guarda não se aplica)
```

### RF-010/RF-011: Status Vivo

```gherkin
DADO notificação com email delivered e whatsapp read
QUANDO a linha renderiza no Center
ENTÃO ✉ verde e WhatsApp ✓✓ azul, tooltips com horários
QUANDO abre o drawer
ENTÃO linha do tempo das 2 deliveries com timestamps e provider
```

### RF-031: Idempotência do Digest

```gherkin
DADO digest das 07:00 enviado para o recipient R
QUANDO o cron das 08:00 reexecuta a janela por qualquer motivo
ENTÃO (R, hoje) já consumido → zero novo email
```

---

## Fases de Implementação

### Fase 1 — Persistência Real (2 dias) — **GATE DA ONDA**
- Migrations + RLS + Realtime + providers drop-in + seed de defaults
- Badge ao vivo validado com o 009 intacto

### Fase 2 — Status na UI (1.5 dias)
- Ícones por canal + drawer (view do 143)

### Fase 3 — Aba de Problemas + Preferências (1 dia)
- RBAC, filtros; config quiet hours + digest persistindo

### Fase 4 — Quiet Hours + Digest (2 dias)
- Guarda no dispatch (DELTA 141) + skipped_quiet_hours
- Edge digest + cron + template (DELTA 142) + idempotência

### Fase 5 — Testes + Docs (1 dia)
- Invariante "nada se perde", E2E, docs
- `_DONE`

---

## Dependências

- **Depende de:** PRD-008/009 F1, PRD-105 (Realtime), PRD-141 (dispatch — recebe a guarda; **e depende da F1 daqui para existir**), PRD-142 (registry +1), PRD-143 (view de status)
- **Bloqueia:** implementação de toda a onda (Fase 1); 147 (preferências ganham trilha lá); 148/149 (digest e quiet hours os governam); 150
- **DELTAs declarados:** 141 (guarda quiet hours + ordem de implementação), 142 (template digest), 105 (publication), deliveries (CHECK +skipped_quiet_hours)
- **Decisões Pendentes:** defaults de digest por papel (gestor daily on? — sugerido on para operacional); horário padrão 07:00 — validar com o Owner

---

## Considerações de Segurança

- RLS espelha o 008: dono vê as próprias; gestor no escopo da matriz 006; manipulação de recipientId ignorada pelo provider
- Aba de problemas expõe erros de entrega, nunca conteúdo de terceiros fora do escopo
- Digest agrega só o que o recipient já podia ver — zero elevação por agregação
- quiet_hours/digest são preferências do titular — auditadas (base para o 147)

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.4.0-rc.6; CHANGELOG; renomear `PRD-146-notification-center-ativacao_DONE.md`; replicar a nota de ordem (146-F1 primeiro) no `_DONE` do 141; anotar DELTAs (141/142/105).

| Princípio | Descrição |
|-----------|-----------|
| **A tabela-mãe nasce primeiro** | 146-F1 é o gate da onda inteira |
| **Ativar, não reescrever** | O 009 foi desenhado para este dia |
| **Nada se perde** | Skipped → exatamente um digest |
| **Transacional não espera** | Quiet hours têm exceção de contrato |
| **UI lê, view decide** | Uma fonte de status |

| ❌ Evitar |
|-----------|
| Implementar 141 antes da F1 daqui |
| Reformar telas do 009 |
| Digest vazio enviado |
| Segurar transacional |
| Status inferido na UI |
| Skipped sem destino (sumiu = bug) |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ⏳ PENDENTE |
| **Data** | - |
| **Versão** | - |
| **Por** | - |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 10/06/2026 | v1 | Criação inicial — Sub-lote 5b do Lote 5 (Onda 8). Re-escopo "Ativação Real" conforme Anexo C do PRD-008 |

---

**AILA - Sistemas Inteligentes**

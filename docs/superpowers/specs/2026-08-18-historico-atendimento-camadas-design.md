# Histórico de Atendimento em camadas — design

**Data:** 2026-08-18
**Branch:** `claude/historico-atendimento-camadas`
**Companion visual:** `docs/design/fio-do-atendimento.html`
**Origem:** o dono relatou que o Histórico da ficha do cliente "está vazio demais, não existe histórico".

---

## 1. Diagnóstico

Investigação conduzida contra o banco de produção em 2026-08-18. Todos os números abaixo foram medidos, não estimados.

### 1.1 O que NÃO é o problema

O trigger `conversation_activity_capture` está íntegro:

- último evento gravado durante a própria investigação (13:47 de 18/08);
- definição no banco idêntica à migration `20260703170000` — sem drift;
- **0 divergências em 2.612 conversas** entre o `status` atual da conversa e o `to_status` do último evento registrado. Nenhuma transição está sendo perdida.

Não há bug de captura. O painel reporta fielmente um modelo que registra pouco.

### 1.2 As duas causas reais

**Causa A — o histórico começa em 04/07/2026.** 2.269 conversas (46% de 4.881) são anteriores ao trigger. O backfill da época (`20260703172000`) gravou **0 linhas**, porque o `audit_logs` de produção não continha os eventos de status esperados. A RPC de leitura cruza `conversation_activity` com `conversations`, então **conversa sem evento não vira card** — ela simplesmente não existe no painel.

**Causa B — o modelo cobre só o ciclo de vida da conversa.** Tipos capturados hoje: `created`, `status`, `assignment`, `reopen`, `participant_add`, `participant_remove`. Ficam de fora mensagem, nota, orçamento e pedido. Uma conversa aberta pelo vendedor — que já nasce em `em_andamento` e nunca muda — produz **exatamente um evento**.

### 1.3 Impacto medido

| Métrica | Valor |
|---|---|
| Conversas anteriores ao registro | 2.269 / 4.881 (46%) |
| Conversas pós-trigger com evento único | 1.221 / 2.612 (47%) |
| Clientes cujo painel abre **vazio** | 90 / 473 (19%) |
| Clientes que veem no máximo 2 linhas | 334 / 473 (71%) |

### 1.4 Fontes disponíveis para enriquecer

| Tabela | Linhas | Tem `conversation_id`? | Tem `customer_id`? |
|---|---|---|---|
| `messages` | 217.445 | sim | não (via conversa) |
| `quotes` | 2 | sim | sim |
| `orders` | 0 | sim | sim |
| `conversation_notes` | 6 | sim | não (via conversa) |
| `customer_notes` | 3 | não | sim |

**Consequência de projeto:** as entidades comerciais estão vazias em produção. Ligar orçamento e pedido ao fio é correto e barato, mas **não produz linha nenhuma hoje** — o ganho imediato vem de mensagens e do backfill. Isso não é motivo para deixá-las de fora; é motivo para não medir o sucesso da entrega por elas.

---

## 2. Decisões

Todas validadas com o dono antes desta spec.

**D1 — Propósito: as três camadas.** O fio responde "o que já falamos", "como o atendimento foi conduzido" e "o que rendeu de negócio" num só lugar, com filtros — em vez de escolher uma das três.

**D2 — Forma: cards por conversa + filtros.** O card por atendimento (formato atual) é mantido como unidade de leitura; a barra de filtros vem do padrão já validado em `LeadTimeline` (`Tudo / Conversas / Notas / Histórico`).

**D3 — O card sobrevive ao filtro, encolhendo.** Filtrar enxuga o conteúdo do card, nunca remove a conversa da lista. Nenhuma conversa some de vista por causa de um filtro.

**D4 — Mensagens entram agregadas.** Uma linha por conversa: contagem + prévia da última mensagem. Nunca uma linha por mensagem — são 217 mil na base. O clique abre a conversa.

**D5 — Conversa pré-registro aparece, fechada, com aviso.** Card colapsado declarando que o detalhe não existe. Hoje essas conversas somem por completo, o que é pior do que aparecer sem miolo.

*Precisão sobre D5:* `pre_registro` significa **nascida antes do marco**, não "sem eventos". As 1.192 conversas antigas que foram mexidas depois de 04/07 já têm eventos parciais — elas abrem normalmente, mas carregam o mesmo aviso, porque o que falta nelas é o começo. Só colapsa o card que não tem evento nenhum.

**D6 — `customer_notes` fica fora do fio.** São notas da ficha, não de atendimento, e não pertencem a nenhuma conversa — entrariam quebrando D2/D3. Continuam na aba Notas da ficha, onde já vivem. (Custo da exclusão hoje: 3 registros.)

**D0 — Fato de domínio que contradiz o nome dos tipos (descoberto na execução, 18/08).** O tipo `assignment` **não** é onde moram as atribuições. O trigger classifica o evento pelo que mudou, nesta ordem: se o status mudou, o tipo é `status`, mesmo que o dono tenha mudado junto. Como assumir uma conversa muda status **e** dono na mesma `UPDATE`, a atribuição sai gravada como `status` com `to_seller_id` preenchido.

Medido em produção:

| tipo | total | com `to_seller_id` |
|---|---|---|
| `status` | 3.322 | **1.478** |
| `assignment` | 154 | 143 |
| `participant_add` | 121 | 121 |
| `created` | 3.304 | 12 |

Portanto **qualquer código que queira saber "quem assumiu" deve olhar `to_seller_id`, nunca o tipo `assignment`** — filtrar por tipo descarta ~91% das atribuições reais. Colaboradores são excluídos por tipo (`participant_add`/`participant_remove`), que é o único uso legítimo do tipo nessa decisão.

**D7 — A agregação de mensagens roda no banco.** Medido via `EXPLAIN ANALYZE`: a agregação usa *index only scan* sobre `messages_conversation_created_at_idx`. Feita pelo cliente, pagaria RLS por linha sobre 217 mil registros — o padrão que já causou incidente de performance neste projeto (ver `docs/dev/` e o histórico de assinatura de mídia).

---

## 3. Arquitetura

Quatro camadas, cada uma com uma responsabilidade e um critério de pronto.

### 3.1 Banco — nova RPC `get_customer_timeline(p_customer_id uuid)`

Retorna **JSONB** (não `RETURNS TABLE`): o payload tem duas granularidades — conversa e evento — e achatá-las repetiria o agregado da conversa em cada linha de evento.

A RPC atual `get_customer_activity` **permanece intacta e em uso** até a UI nova subir. Desligar a feature é parar de chamar a nova função; não há passo destrutivo no rollout.

**Gate de acesso:** idêntico ao da RPC atual — `is_staff()` OR dono da carteira OR `can_access_conversation()` em qualquer conversa do cliente. `SECURITY DEFINER`, `search_path` vazio, `revoke ... from public, anon`, `grant execute to authenticated`. Nenhum relaxamento de acesso faz parte desta entrega.

**Forma do retorno:**

```jsonc
{
  "customer_id": "uuid",
  "generated_at": "timestamptz",
  "conversations": [
    {
      "id": "uuid",
      "channel": "whatsapp",
      "status": "resolvida",
      "created_at": "timestamptz",
      "closed_at": "timestamptz|null",
      "assigned_seller_id": "uuid|null",
      "pre_registro": false,          // created_at < MARCO (ver abaixo)
      "message_count": 18,
      "last_message_at": "timestamptz|null",
      "last_message_preview": "texto truncado em 120 chars",
      "events": [
        { "id": "uuid", "type": "status", "at": "timestamptz",
          "from_status": "aguardando", "to_status": "em_andamento",
          "from_seller_id": null, "to_seller_id": "uuid",
          "actor_id": "uuid|null", "actor_kind": "seller" }
      ],
      "notes":  [ { "id": "uuid", "at": "timestamptz", "author_id": "uuid", "body": "texto" } ],
      "quotes": [ { "id": "uuid", "at": "timestamptz", "total": 0, "status": "..." } ],
      "orders": [ { "id": "uuid", "at": "timestamptz", "total": 0 } ]
    }
  ]
}
```

Conversas ordenadas por `created_at` desc; `events` por `at` asc dentro de cada conversa.

**O marco.** `MARCO = '2026-07-04 01:43:17+00'` — o timestamp do primeiro evento realmente gravado pelo trigger, medido no banco. Vive como constante única na migration da RPC; nenhuma outra camada redefine essa data.

**Prévia da mensagem:** truncada em 120 caracteres no banco, para não trafegar corpo de mensagem inteiro. Mensagens sem texto (mídia pura) entram com preview vazio e o tipo de mídia é resolvido na UI.

### 3.2 Trigger para `note`/`quote`/`order` — CORTADO por decisão

O desenho original previa uma terceira migration, que ampliaria o trigger para gravar eventos de tipo `note`, `quote` e `order` em `conversation_activity`. **Ela foi cortada e não existe.** Não há migration de trigger nesta entrega — o rollout tem duas migrations, não três (§8).

**Por que foi cortada.** Nota, orçamento e pedido **já chegam ao fio**: a RPC `get_customer_timeline` lê `conversation_notes`, `quotes` e `orders` diretamente, por `conversation_id` (ver o payload da §3.1). Um trigger que gravasse os mesmos fatos em `conversation_activity` produziria **contagem dobrada** — cada nota apareceria uma vez como evento e outra vez como nota lida da tabela de origem, e o `itemCount` do card contaria as duas.

A leitura direta ainda é estritamente melhor que o trigger em dois pontos:

- **É retroativa.** O trigger valeria só daqui pra frente; a leitura direta já mostra toda nota, orçamento e pedido que existem hoje no banco, sem backfill nenhum.
- **Carrega conteúdo.** O evento em `conversation_activity` teria só ponteiro e timestamp; a leitura direta traz o corpo da nota e o total do negócio, que é o que o card precisa renderizar.

Consequência: o `CHECK` de `conversation_activity.type` **não é tocado** por esta entrega, e `conversation_notes` mantém `conversation_notes_notify_mentions` como seu único trigger.

**Fora deste escopo (deliberado):** etiqueta e troca de carteira. Etiqueta muda com frequência alta e inundaria o fio; carteira é do cliente, não da conversa, e não tem card onde morar. Ambas ficam registradas como candidatas para uma fase seguinte.

### 3.3 Backfill — migration separada e reversível

Sintetiza eventos **exclusivamente a partir de colunas reais**. Nada é inferido.

Das 2.269 conversas anteriores ao marco, **1.192 já possuem eventos** — foram atualizadas depois de 04/07 e o trigger disparou no `UPDATE`. Essas têm timeline parcial (falta o começo, não o todo) e **não** são tocadas pelo backfill.

| Evento sintetizado | Fonte | Quantidade medida |
|---|---|---|
| `created` | `conversations.created_at`, `to_status` = `null` | 1.077 |
| `status` (encerramento) | `conversations.closed_at`, `to_status` = status atual | 25 |

O `to_status` do `created` sintetizado é **`null`, não `aguardando`**: o trigger real grava o status de nascimento, e para essas conversas esse dado não existe. Preenchê-lo com o status mais provável seria inventar — a UI renderiza "Conversa aberta" sem status.

Todos com `actor_kind = 'system'` e `actor_id = null` — não há como saber quem agiu, e atribuir a alguém seria inventar.

**Não sintetizamos evento de atribuição** para as 87 conversas com dono: existe o dono, não existe a data em que ele assumiu. O dono aparece no resumo do card, não como evento datado.

**Reversibilidade:** as linhas do backfill são identificáveis (`actor_kind = 'system'` + `created_at` anterior ao marco + inseridas na janela da migration). A migration acompanha o `DELETE` de rollback comentado no cabeçalho.

**Idempotência:** a migration só insere onde não existe evento para aquela conversa, para poder ser reaplicada sem duplicar.

### 3.4 Engine — função pura, testada

`src/features/attendance-history/engine/customerTimeline.ts`

Recebe o payload da RPC e devolve o view-model dos cards. Concentra as regras D3/D4/D5, que é onde elas ficam verificáveis sem subir tela.

Responsabilidades:
- fundir eventos, notas, orçamentos, pedidos e o agregado de mensagens num trilho ordenado por conversa;
- classificar cada item em `conversa | nota | historico` para o filtro;
- aplicar o filtro **preservando o card** (D3);
- montar o resumo do card (contagem, duração, dono);
- marcar o card `pre_registro` como colapsado com aviso (D5).

O engine atual `attendanceTimeline.ts` permanece enquanto a RPC antiga estiver em uso; é removido no mesmo PR que troca a UI, não antes.

### 3.5 UI — `AttendanceHistoryPanel`

Ganha a barra de filtros e passa a consumir o novo engine. O componente é hoje **inline-only** (o modo sheet foi removido em #529), e continua assim — os dois consumidores (`ProfileTabs` e `CustomerTabs`) não mudam de assinatura.

Query key isolada — `["customer-timeline", customerId]`, distinta da atual `["customer-activity", customerId]`. **O cache do atendimento é congelado e não pode ser tocado**: nada de compartilhar ou invalidar chaves de conversa/mensagem.

---

## 4. Casos de borda

| Situação | Comportamento |
|---|---|
| Cliente sem nenhuma conversa | Estado vazio atual, inalterado |
| Conversa sem mensagem | Card sem a linha de mensagens; sem placeholder |
| Conversa pré-registro **com** mensagens | Card fechado com aviso, mas a contagem de mensagens aparece no resumo — a mensagem existe mesmo sem timeline |
| Conversa pré-registro com eventos **parciais** (as 1.192) | Card abre normalmente com os eventos que existem, e mantém o aviso: o que falta é o começo, não o todo |
| Mensagem só com mídia | Preview vazio; a UI mostra o rótulo do tipo de mídia |
| Filtro sem nenhum item em todos os cards | Cards vazios permanecem (D3); mensagem de "nenhum item neste filtro" no topo |
| Conversa ancorada em lead (sem `customer_id`) | Fora de escopo — a ficha do lead tem o próprio `LeadTimeline` |
| Nota apagada | Não existe delete de nota hoje; o evento é append-only e permanece |

---

## 5. Testes

**Engine (Vitest, obrigatório — é onde as regras vivem):**
- fusão ordena corretamente itens de fontes diferentes com timestamps intercalados;
- D3: filtro reduz itens mas preserva o card, inclusive quando o card fica sem nenhum item;
- D4: N mensagens viram uma linha agregada, nunca N linhas;
- D5: conversa `pre_registro` sai colapsada e com aviso;
- resumo calcula duração e dono corretamente, inclusive para conversa sem dono;
- payload vazio e payload malformado não derrubam o componente.

**Banco:**
- a RPC nega leitura para quem não passa no gate (mesma matriz de acesso da RPC atual);
- backfill é idempotente: rodar duas vezes não duplica;
- backfill não toca conversa que já tem evento.

**Gate prático de CI:** `bun run build` + `bun run test`, como no resto do projeto.

---

## 6. Riscos

| Risco | Mitigação |
|---|---|
| Payload grande para cliente com muitas conversas | Prévia truncada em 120 chars no banco; sem corpo de mensagem completo. Se necessário, paginar por conversa numa fase seguinte |
| `statement_timeout` de 8s no papel `authenticated` | Agregação sob índice, medida; a RPC é `SECURITY DEFINER`, então não paga RLS por linha |
| CHECK de `type` divergente entre migration e banco | A migration lê o CHECK vigente antes de reescrever — precedente já registrado neste projeto |
| Backfill errado (o de julho tinha bug de tipo e gravou 0 linhas) | Idempotente e reversível. Antes de aplicar, rodar o `SELECT` de contagem e conferir que ele devolve exatamente **1.077** e **25**; se divergir, a migration não é aplicada |
| Regressão no painel do lead | `LeadTimeline` **não é tocado** nesta entrega |

---

## 7. Fora de escopo

- Etiquetas e troca de carteira como evento (candidatas à fase seguinte).
- `customer_notes` no fio (D6).
- Timeline de lead — `LeadTimeline` fica como está.
- Paginação do fio.
- Qualquer mudança no cache do atendimento.

---

## 8. Ordem de rollout

A ordem importa e não é negociável neste projeto: **mergear PR não aplica migration**.

São **duas** migrations, nesta ordem — não há migration de trigger (§3.2):

1. `20260818120000_get_customer_timeline.sql` (a RPC) → aplicada manualmente, com OK explícito do dono.
2. `20260818122000_backfill_pre_registro.sql` (o backfill) → aplicada manualmente, com OK explícito do dono, e conferida por contagem.
3. Merge do PR com engine + UI.
4. Smoke pelo dono: cliente com conversa recente, cliente só com conversas antigas, e cliente sem conversa.

Os arquivos das migrations vão versionados em `supabase/migrations/` no mesmo PR, mesmo sem terem sido aplicados.

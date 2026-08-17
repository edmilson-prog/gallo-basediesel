# Painel lateral do Atendimento (lead) — refatoração pelo ui_kit

**Data:** 2026-08-14
**Fonte da verdade:** projeto Claude Design `0dddcf0e-782d-4f2e-be6c-0a094c427bbe`,
arquivo `ui_kits/atendimento/painel/painel-lead-v2-conversao.html` (mais
`ui_kits/atendimento/painel/pn-ui.jsx` e `colors_and_type.css`).
**Alvo no app:** `LeadProfileFiche` — a ficha lateral das conversas ancoradas em
lead (`conversation.customerId == null && conversation.leadId != null`).

---

## 1. O que o kit muda

O painel antigo respondia **"o que este lead tem"**: badges de temperatura e
origem, bloco de funis, um bloco de dados colapsado e o card de gestão da
conversa, tudo empilhado numa coluna só.

O kit reenquadra o painel em torno do que ele **serve para**: esta pessoa ainda
não é cliente, aqui está exatamente o que falta para virar, e aqui está o botão.
Todo o resto sai da primeira dobra e vai para trás de um rail de seções.

Três blocos na Visão geral, nesta ordem:

1. **Conversão em cliente** — anel de progresso, checklist de 5 campos com
   captura no lugar, CTA de conversão e dois atalhos de fuga.
2. **Funil** — participação, etapa, trilha de etapas e valor estimado.
3. **Conversa e registro** — status, atendente, instância, colaboradores,
   etiquetas, dono e criação.

---

## 2. Mapeamento kit → app

| Kit | App | Nota |
|---|---|---|
| `PnFrame` 348px | `aside w-[360px]` já existente | largura do produto mantida |
| `PnRail` (10 ícones, 4 travados) | `LeadPanelRail` + `panelSections.ts` | espelha `TAB_ORDER` de `customers/components/ProfileTabs.tsx` — 1:1 |
| `PnCard` / `PnRow` / `PnRing` / `PnChip` | `conversations/components/panel/PanelKit.tsx` | gramática única compartilhada |
| Card "Conversão em cliente" | `LeadConversionCard` + `engine/conversionReadiness.ts` | |
| `FieldRow` + "informar" | `ConversionFieldRow` (popover de captura) | escreve direto no lead |
| Card "Funil" + trilha de etapas | `FicheFunnelsBlock` / `FicheParticipationRow` | ganharam trilha e `FunnelValueField` |
| Card "Conversa e registro" | `ConversationManagementCard variant="panel"` | variante nova, não restilização |
| `PN.gold` / `green` / `red` / `blue` | `primary` / `severity-success` / `severity-critical` / `severity-info` | kit é dark-only em hex; app usa só tokens semânticos (`.claude/rules/temas.md`) |
| painel `#171314` sobre app `#141011` | painel `bg-background`, cards `bg-card` | reproduz a relação do kit no dark e lê como card elevado no light |

### Rail — o que está destravado

| Seção | Conteúdo |
|---|---|
| Visão geral | os três cards acima |
| Histórico | `LeadTimeline variant="panel"` (conversa + notas + auditoria) |
| Ficha do lead | `LeadRecordSection` — os 5 campos + dono/criação/valor/próxima ação/tags |
| Conversas | `LeadConversationsSection` — as conversas do lead, a atual marcada |
| Mídias | **delega** para o `ConversationMediaPanel` da própria tela |
| Anotações | a mesma `LeadTimeline`, pré-filtrada em `nota` |

Travadas (só existem para cliente convertido): Produtos, Orçamentos, Entregas,
Insights. Clicar **responde** — abre um corpo explicando o que a conversão
destrava, com atalho de volta. O kit também responde (`onLocked` dispara toast);
um tooltip sozinho não diria nada no touch, onde metade dos breakpoints do painel
vive.

---

## 3. Decisões do dono (2026-08-14)

1. **CPF/CNPJ e endereço viram colunas em `leads`** (migration), não rascunho de
   sessão — a captura é de verdade e sobrevive ao reload.
2. **Rail completo com conteúdo real** onde já existe.
3. **O CTA de conversão trava de verdade** quando falta dado obrigatório.
4. **Os dois atalhos ligam em fluxos existentes.**

---

## 4. Camada de dados

`supabase/migrations/20260814170000_lead_document_address.sql` adiciona:

- `leads.document text` — CPF (11) ou CNPJ (14), **só dígitos**, com CHECK.
- `leads.address jsonb` — mesmo shape de `customers.address` (`ICustomerAddress`),
  para a conversão copiar o objeto em vez de traduzir.

Sem backfill e sem default: um lead existente genuinamente não tem nenhum dos
dois, e gravar objeto vazio tornaria "nunca informado" indistinguível de
"informado em branco" — que é exatamente a distinção que o checklist lê.

**A RPC não muda.** `lead_via_conversation` devolve `setof public.leads` via
`select l.*`, então as duas colunas atravessam o portão de conversa sozinhas.

**Sondagem de coluna.** `providers/data/impl/supabase/leads.ts` generalizou o
mecanismo que já existia para `next_action_kind`: `OPTIONAL_COLUMNS` +
`withColumnProbe`, que rebaixa uma coluna por 42703 e repete. Mergear o PR não
aplica a migration, então o painel precisa funcionar contra um banco sem ela — e
o PostgREST só nomeia uma coluna por erro, daí o laço em vez de um retry único.

---

## 5. Regra de prontidão

`engine/conversionReadiness.ts` — função pura, 22 testes.

**Obrigatórios:** telefone, nome, documento. **Opcionais:** e-mail, endereço.

A regra não foi inventada: espelha `ConvertLeadModal.validate`. B2C quer nome +
11 dígitos de CPF; B2B quer CNPJ válido + razão/fantasia/contato, e o modal
pré-preenche os três (de `lead.name` e do lookup da Receita que o CNPJ dispara).
Por isso um lead com nome + documento válido converte mesmo em um clique.

Dois cuidados que valem registrar:

- **Nome de uma palavra NÃO bloqueia.** "Transbrasa" é um nome real. A dúvida
  "isto é só o nome do WhatsApp" vira **hint** na linha, que informa sem travar.
  O que bloqueia é nome vazio ou nome que é o próprio número.
- **Documento só conta com dígito verificador válido.** Aceitar 11 dígitos
  quaisquer prometeria conversão em um clique que o modal recusaria em seguida.

---

## 6. Desvios conscientes do kit

1. **"Vincular a cliente existente" fica sempre acessível**, mesmo com o CTA
   travado. Vincular não precisa de nenhum dos 5 campos — anexa o lead a um
   cliente que já os tem. O kit não tinha esse caminho para mostrar; travá-lo
   junto seria uma regressão inventada por fidelidade.
2. **A trilha de etapas some com menos de 3 etapas** — uma barra de 1 ou 2
   segmentos é decoração, não informação.
3. **Valor estimado é por participação**, não o `lead.estimatedValue`
   (`@deprecated`): um lead em dois funis são duas receitas distintas, e ler o
   agregado aqui duplicaria o forecast.
4. **Seção "Mídias" delega** em vez de reimplementar a galeria dentro de 360px.
5. **Rótulos curtos no card de registro** ("Status", "Atendente", "Etiquetas") —
   os longos empurram o valor para fora da linha em 360px. Só na variante painel;
   a ficha do cliente segue com os originais.

---

## 7. Atalhos do rodapé

- **"Só orçamento"** → `/app/orcamentos/novo?leadId=…`. `IQuote.leadId` e
  `quotes.lead_id` já existiam ("mutually exclusive with customerId"); faltava a
  porta de entrada. O `QuoteEditor` troca o autocomplete de cliente por um chip
  fixo do lead, e frota/kits sugeridos/recompra ficam vazios — um lead não tem
  nenhum dos três, e inventar seria pior que não mostrar.
  Só aparece para quem consegue ler o lead **fora** do portão de conversa (a tela
  de orçamento não tem conversa), mesma composição de `canOpenLeadPage`.
- **"É pessoal"** → etiqueta `pessoal` no lead; o card de conversão recolhe para
  uma faixa com desfazer. Tag em vez de coluna: `leads.tags` já existe, já
  filtra e já viaja para o cliente na conversão.

---

## 8. Gates

| Gate | Resultado |
|---|---|
| `bun run build` | ✅ |
| `bun run test` | ✅ 3458/3458 (399 arquivos) |
| `bunx tsc --noEmit` | 382 erros — **idêntico ao baseline da `main`** (delta 0) |
| `bun run lint` | inutilizável: ~405 mil erros `Delete ␍` em todo o repo, inclusive em arquivos não tocados (falso positivo de `core.autocrlf` no Windows). ESLint nos arquivos novos, filtrando `prettier/prettier`: **0 erros, 0 warnings**. |

---

## 9. Pendências

- 🔴 **A migration `20260814170000` NÃO foi aplicada em produção.** Mergear o PR
  não aplica. Até aplicar, a sondagem rebaixa `document`/`address` e o checklist
  fica em 2/5 com "CPF ou CNPJ" sempre pendente — o painel funciona, mas o CTA
  nunca destrava. Aplicar exige OK explícito do dono.
- Smoke em produção: captura inline dos 5 campos, conversão com CNPJ
  pré-preenchido, "Só orçamento" com lead, rail nas três larguras (coluna ≥1440,
  drawer 768–1439, sheet <768).
- Bump de versão + changelog não entram neste PR.

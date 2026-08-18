# Edição inline de clientes — Design

**Data:** 2026-07-23 · **Branch:** `worktree-customers-inline-edit` · **Solicitação:** "preciso implementar a edição do clientes. a edição precisa ser inline" (print da ficha do cliente com o menu ⋮ aberto em "Editar dados").

## Contexto

- A ação **"Editar dados"** no `ProfileMenu` é hoje um stub: `toast.info("Edição de dados será detalhada em PRD-019.")`. O PRD-019 real é o de configurações/admin (`_DONE`) — não existe PRD dedicado à edição de cliente; esta é uma tarefa de prompt direto.
- Os dados cadastrais do cliente são exibidos read-only no **`CadastraisCard`** (aba "Visão geral" — `OverviewTab`), usado em duas superfícies: página de detalhe (`variant="page"`) e ficha lateral do Atendimento (`variant="column"`, via `CustomerProfileFiche`). A ficha do Atendimento é área sensível (cache/RPCs congelados) e **não será alterada em comportamento**.
- Tags já têm edição inline própria (`TagsCard`); status/carteira têm fluxos dedicados (menu ⋮, transferência); nome de exibição tem o fluxo "Renomear contato" (RPC). O buraco é exatamente o cadastro: identidade, documento, contato e endereço.
- Já existe um padrão de edição inline maduro na ficha de lead (PRs #343/#344): draft engine puro (`toDraft`/`validate`/`buildPatch`) + card que alterna leitura ↔ inputs no lugar. Este design o espelha.

## Decisão (abordagem C — card self-contained)

Abordagens consideradas:

- **A) Modal de edição** — rejeitada: o dono pediu explicitamente edição inline.
- **B) Estado de edição na página (como leads)** — `editing/draft/errors` na `CustomerDetailPage`, card controlado. Rejeitada: o `CadastraisCard` é compartilhado com a ficha do Atendimento via `ProfileTabs` → prop drilling por componentes compartilhados e risco de tocar a superfície congelada.
- **C) Card self-contained (escolhida)** — o modo de edição vive dentro do `CadastraisCard` (lápis no header do card → inputs inline → Salvar/Cancelar no rodapé). O card só liga a edição quando `editable` é passado (somente na página de detalhe). A ficha do Atendimento continua montando o card sem props novas = zero mudança de comportamento lá.

### Campos editáveis (v1)

| Grupo | Campos | Validação |
|---|---|---|
| B2B | razão social, nome fantasia, CNPJ, contato principal | razão social obrigatória; CNPJ opcional, mas se preenchido → checksum `isValidCnpj`, persistido só dígitos; nome fantasia/contato opcionais |
| B2C | nome completo, CPF | nome obrigatório; CPF opcional, se preenchido → checksum `isValidCpf`, só dígitos |
| Contato | e-mail | opcional; se preenchido → regex; vazio → **limpa** o campo |
| Endereço | rua, número, complemento, bairro, cidade, UF, CEP | tudo vazio → **limpa** o endereço; se qualquer campo preenchido → rua, cidade e UF (2 letras) obrigatórios; CEP se preenchido → 8 dígitos; complemento sempre opcional |

**Fora do v1 (deliberado):**

- **Telefone** — é a âncora do WhatsApp (webhook casa cliente por telefone; histórico de DDI 55/9º dígito com backfills e self-heal). Edição manual pode partir conversas ou criar âncora duplicada. Fica read-only no modo edição, com dica explicando. Se o dono quiser, vira um fluxo próprio guardado (com normalização `normalizeBrDialDigits` + verificação de colisão).
- **Tipo B2B↔B2C** — mexe na discriminated union e já existe fluxo próprio de conversão (`convertPendingContact`).
- Status, vendedor/carteira, tags, portal, campos de BI/DINTEC, `whatsappName`/avatar (webhook-owned) — já têm donos ou são read-only por design.

### Gate de escrita (lição: gatear pelo predicado da RLS, não pelo papel)

RLS `customers_update` = `store_id = current_store_id() AND (is_staff() OR seller_id = current_seller_id())`. O CTA (lápis + item de menu) só aparece quando:

```
usePermission("customer", "edit")  // RBAC
&& (hasRole(["Owner", "Gestor"]) || customer.sellerId === currentUser.id)
```

Vendedor que só ATENDE o contato (pool/instância) enxerga a página mas não vê o CTA — espelha exatamente o que a RLS deixaria passar (contato `pending_review` com `sellerId null` → só staff).

### Arquitetura

1. **`src/features/customers/utils/customerDraft.ts`** (engine puro, TDD):
   - `ICustomerDraft` (strings de formulário) + `ICustomerDraftErrors`;
   - `toCustomerDraft(customer)` — snapshot do cliente para o formulário (documento/CEP formatados);
   - `validateCustomerDraft(draft)` — regras da tabela acima;
   - `buildCustomerPatch(customer, draft)` — **só campos alterados**; sempre inclui `type` quando um campo de variante muda (o `customerPatchToRow` só mapeia campos de variante na presença de `patch.type`); clears emitem a **chave presente** com `undefined` (`{ email: undefined }`, `{ address: undefined }`).
2. **`customerPatchToRow` (supabase/customers.ts)** — `email` e `address` trocam o guard `!== undefined` por `"key" in patch` + `?? null` (mesmo fix do `leadPatchToRow`; sem isso, limpar campo é no-op silencioso no Supabase). Mock (`patchById`) já aplica `undefined` no merge.
3. **`CadastraisCard`** — props novas opcionais `editable?: boolean` e `editSignal?: number`. Internamente: `editing/draft/errors/saving`; Salvar → `provider.update(id, patch)` + `auditLog("customer.data_updated", {before, after})` + invalidate `["customer-profile", id]` e `["customers-list"]` + toast; patch vazio → sai da edição sem request. `editSignal` (contador) liga a edição vindo do menu ⋮.
4. **`OverviewTab`** — repassa `cadastraisEditable`/`editSignal` só no `variant="page"`.
5. **`ProfileTabs`** — repassa os props opcionais (fiche não os passa; default read-only).
6. **`ProfileMenu`** — prop opcional `onEditData?: () => void`. Presente (página de detalhe): substitui o stub e dispara aba Visão geral + sinal de edição. Ausente (ficha do Atendimento): navega para `/app/clientes/$id`. Item continua gated por `canEdit` **e** pelo predicado da RLS acima.
7. **`CustomerDetailPage`** — `goToTab("visao-geral")` + incrementa `editSignal` quando o menu pedir edição.
8. **i18n** — novas strings em `CUSTOMER_STRINGS.overview.cadastrais` (editar, salvar, cancelar, erros de validação, toasts, labels de endereço, dica do telefone), pt-BR com acentos corretos.

### Erros e concorrência

- Falha no `update` (RLS 42501/rede) → toast de erro, permanece em edição com o draft intacto.
- O draft é congelado ao entrar em edição; se um realtime/refetch mudar o cliente no meio, o Salvar aplica apenas os campos alterados vs o snapshot da entrada (last-write-wins por campo — mesmo trade-off do fluxo de leads).

### Testes

- `customerDraft.test.ts` (Vitest, co-localizado): round-trip sem mudanças → patch vazio; inclusão de `type` nos patches de variante; clears de e-mail/endereço com chave presente; validações (checksum CNPJ/CPF, e-mail, CEP, UF, obrigatórios); endereço parcial vs vazio; documento vazio permitido (não inventa dado).
- Gate de CI prático: `bun run test` + `bun run build`; `bunx tsc --noEmit` avaliado por delta (baseline ~315 erros pré-existentes).

### Assunções explícitas (sessão autônoma)

1. "Inline" = editar no lugar, na ficha do cliente (padrão da ficha de lead) — não é edição por célula na tabela da listagem.
2. Telefone fora do v1 pelo risco WhatsApp (justificado acima) — reversível se o dono discordar.
3. Documento (CNPJ/CPF) editável **com** checksum, permitindo vazio — clientes DINTEC/convertidos podem não ter documento e a edição não força inventar um.
4. Nada de migration/deploy: a RLS existente já cobre o fluxo (staff + dono da carteira via `provider.update` direto).

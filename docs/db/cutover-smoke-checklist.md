# Cutover Mock → Supabase — checklist de smoke (Fase 2)

> Como **ligar o app no Supabase localmente** (sem mexer no default) e **validar manualmente** owner + vendedor + loja anônima. Branch `feat/fase2-supabase-cutover` (PR #39, draft). Gerado em 2026-06-09.

## 0. O que NÃO muda

- O **default continua `mock`** (`getDataProviders()` / `AUTH_SOURCE` em `factory`). Este teste é **local**, via `.env.local` (gitignored) — não altera o que está no ar nem o build de produção.
- O **flip de verdade** (mudar o default para `supabase`) é o marco final e só acontece quando você aprovar, após este smoke passar.

## 1. `.env.local` (copie para a raiz do projeto)

```dotenv
# Liga dados + auth reais no Supabase (local só)
VITE_DATA_SOURCE=supabase
VITE_AUTH_SOURCE=supabase

# Conexão do projeto — valores PÚBLICOS, seguros no bundle do cliente
VITE_SUPABASE_URL=https://njizaasajkdqptlxddqn.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ALn6oBa23R-owwnDJoWNfg_TU9Ywt0A
```

> ⛔ **NUNCA** coloque a `service_role` / secret key aqui (sem prefixo `VITE_`, e só em `.env.local` quando for **seed/scripts** server-side). Ela ignora o RLS — jamais no cliente.

Rode: `bun run dev` (o pre-hook copia o CHANGELOG). Para **reverter**: apague o `.env.local` (ou volte os dois `*_SOURCE` para `mock`) e reinicie o dev server.

> 💡 Se a UI não refletir a troca, é o **dev server zumbi** com cache de branch antiga — reinicie o processo do Vite.

## 2. Smoke — Owner (staff, acesso total)

Login real (email/senha do owner). Confirme:

- [ ] Login entra e o JWT carrega o papel (sem loop de auth).
- [ ] Dashboards carregam com **volume real** (ex.: ~477 pedidos, 70 clientes, 351 peças, 80 leads).
- [ ] **Catálogo interno** mostra custo/margem/estoque (colunas completas — staff).
- [ ] Clientes / Leads / Pedidos / Orçamentos listam e abrem detalhe.
- [ ] **Escrita** funciona (editar um cliente / mudar status de pedido) — write policies.
- [ ] Inbox/Conversas carrega; Configurações abrem.
- [ ] **Console limpo** (sem `permission denied` / 403).

## 3. Smoke — Vendedor (seller_internal / external, isolamento)

Login como um vendedor (peça ao owner para criar/!definir acesso, ou use um já existente). Confirme:

- [ ] Vê **só a própria carteira** (clientes/leads/pedidos/comissões) — contagens **menores** que as do owner.
- [ ] **Não vê** financeiro staff-only (DRE/despesas/fluxo de caixa) nem a carteira de **outros** vendedores.
- [ ] **Pool de não-atribuídos:** os filtros "Sem atribuição"/"Em fila" no inbox mostram conversas sem dono; consegue **reivindicar** uma (vira sua); **não** consegue atribuir a outro.
- [ ] **Console limpo.**

## 4. Smoke — Loja pública anônima (sem login)

Abra `/loja` **deslogado** (aba anônima ajuda). Confirme:

- [ ] **Home:** catálogo carrega, preços/imagens aparecem, faixa "mais vendidos" rankeia (RPC).
- [ ] **`/loja/busca`** e **`/loja/categoria/...`:** filtros, "só em estoque", ordenação "mais vendidos".
- [ ] **Ficha do produto:** "pronta entrega / apenas X em estoque", aba de equivalências, relacionados.
- [ ] **Carrinho:** adicionar item, cap de quantidade por estoque, badge "sem estoque".
- [ ] **Console limpo** na navegação — **nenhum** `permission denied`/403 (sinal de que a projeção `anon` e as RPCs estão certas).
- [ ] ⚠️ **Checkout vai falhar** ao finalizar (cria pedido como anon → negado). **Esperado** — é a frente de *checkout-backend* (handoff), fora da Fase 2.

## 5. Se algo quebrar

- Cole no chat os **erros do console** (especialmente `42501 permission denied`, com a tabela/coluna citada).
- Anote em **qual papel** e **qual tela** ocorreu — o RLS é por papel; o diagnóstico parte daí.
- Nada destrutivo: é tudo leitura/escrita normal gated por RLS; reverter é só apagar o `.env.local`.

## 6. Pendências conhecidas (não são bugs do smoke)

- **Checkout B2C** → handoff (frente futura), falha por design no modo anon.
- **Mídia/Storage** → simulada (`storage_ref` fake); não há bytes reais nem upload — exibição é placeholder.
- **Convite por email** → inerte até setar `RESEND_API_KEY` (Edge Function `invite-seller-email`).

## 7. Resultado — smoke de RLS por impersonação (2026-06-09)

Fronteira de segurança validada no banco (impersonação `set local role` + claims). **Camada DB/RLS: ✅ APROVADA.** A UI (seções 2–4) segue para validação manual.

**Paridade (staff) × isolamento (vendedor não-staff):**

| Tabela              | Owner (staff) | Lucas (`seller_internal`) | Recorte                            |
| ------------------- | ------------- | ------------------------- | ---------------------------------- |
| customers           | 70            | 18                        | per-seller                         |
| orders              | 477           | 132                       | per-seller (filha herda)           |
| quotes              | 80            | 10                        | per-seller                         |
| leads               | 80            | 18                        | per-seller                         |
| conversations       | 96            | 42                        | per-seller + pool (28 own + 14)    |
| messages            | 693           | 326                       | herda de conversations             |
| commissions         | 40            | 12                        | per-seller                         |
| goals               | 85            | 24                        | per-seller                         |
| recommendations     | 25            | 12                        | per-seller                         |
| product_indicators  | 10            | 2                         | per-seller                         |
| expenses            | 120           | **0**                     | staff-only                         |
| cash_flow_entries   | 5             | **0**                     | staff-only                         |
| distribution_traces | 40            | **0**                     | staff-only                         |
| audit_logs          | 40            | **0**                     | staff+financeiro (#43)             |
| carteira_transfers  | 8             | **0**                     | staff-only (#43)                   |
| media_assets        | 90            | **36**                    | dono via cliente/conversa (#43)    |
| quick_replies       | 20            | 8                         | own + shared                       |
| asset_combos        | 5             | 0                         | own                                |
| customer_segments   | 6             | 6                         | own + shared (5 shared + 1 dele)   |
| parts               | 351           | 351                       | catálogo full (staff+vendedor)     |
| vehicle_models      | 21            | 21                        | global                             |

**Escrita:** Lucas atualiza o **próprio** cliente → 1 linha ✅. (Per-seller write boundary dos Slices 1–4 + `carteira_transfers` agora `with check(is_staff())`.)

**Loja anônima (`anon`):**
- `parts`: **344** ativas visíveis, **0** inativas (policy `active = true`) ✅
- Colunas concedidas ao `anon` em `parts`: `name, unit_price, stock_available, stock_minimum` — **custo/margem/fornecedor/fiscal/localização NÃO concedidos** ✅
- `storefront_config(HQ)` → jsonb ✅ · `storefront_top_selling(HQ)` → **186** IDs ✅
- `orders` → **0** linhas · `stores` → **0** linhas (grants em massa presentes, mas **RLS ativa** sem policy `anon` → nega) ✅

**Advisor de segurança:** sem novos WARN (só os 2 RPCs `storefront_*` definer, intencionais, + leaked-password config).

## 8. Flip do cutover — Preview (2026-06-09)

Decisão: virar o cutover **apenas no ambiente Preview da Vercel**, mantendo **produção em `mock`** até a loja transacional (checkout B2C + auth de cliente) estar pronta ou blindada. Coerente com "PR #39 draft, não mergear até a Fase 2 fechar".

- **Env (escopo Preview):** `VITE_DATA_SOURCE=supabase`, `VITE_AUTH_SOURCE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (publishable — nunca service_role).
- **Produção:** intacta em `mock` (default do código).
- **Como aplica:** Vite inlina no build → cada novo deploy da branch `feat/fase2-supabase-cutover` roda em `supabase`. Mudança de env exige redeploy.
- **Validação:** smoke das seções 2–4 na URL de Preview (foco no `/app`; loja-browse OK; checkout B2C falha por design).
- **Reverter:** remover os env vars do Preview (ou trocar para `mock`) e redeployar.

> **Gap conhecido exposto no Preview:** checkout B2C e `/loja/conta` (auth mock) quebram no modo supabase — esperado, é a frente de checkout-backend/handoff (fora da Fase 2 atual). Não bloqueia a validação do `/app`.

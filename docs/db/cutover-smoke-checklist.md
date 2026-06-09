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

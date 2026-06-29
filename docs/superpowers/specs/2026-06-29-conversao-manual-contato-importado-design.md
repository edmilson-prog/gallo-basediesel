# Conversão manual de contato importado → cliente

> **Data:** 2026-06-29
> **Status:** Design aprovado (aguardando review do spec antes do plano)
> **Tipo:** Feature nova
> **Relacionado:** `docs/dev/conversation-access-model.md` (modelo de 2 portões), PR #191 (`HIDDEN_CUSTOMER_TAGS`/`excludeTags`), PR #194 (`customers.seller_id` nullable)

---

## 1. Contexto e problema

Contatos importados do WhatsApp (importação de histórico/contatos Evolution Go + webhook ao vivo) nascem como `customers` B2C com `status='ativo'`, `seller_id = NULL` e a tag **`pending_review`**. Eles servem apenas de **âncora** da conversa (`conversations.customer_id`) e:

- ficam **escondidos da tela Clientes** (via `excludeTags: ['pending_review']` — PR #191);
- **não entram na carteira** de nenhum vendedor (`seller_id` nulo — PR #194);
- aparecem **somente no Atendimento/Inbox**.

Hoje **não existe** um caminho para promover um desses contatos a **cliente de fato**. A decisão do dono (2026-06-28) foi: a virada é um **processo manual**. Esta spec desenha esse processo.

### O que "virar cliente de fato" significa, tecnicamente

Aparecer na tela Clientes é governado por **uma tag**: enquanto o contato carregar `pending_review` (ou `reviewed_not_customer`, ver §3), ele fica fora da lista. Logo, **converter = remover `pending_review`** (e, no nosso desenho, dar um dono de carteira e completar um cadastro mínimo).

### A trava de RLS que molda a solução

A policy `customers_update` (migration `20260608235552_rls_per_seller_carteira_scope.sql`) exige:

```sql
store_id = current_store_id() AND (is_staff() OR seller_id = current_seller_id())
```

Como o contato importado tem `seller_id = NULL`, a cláusula `seller_id = current_seller_id()` é **sempre falsa** → um vendedor **não-staff não consegue dar UPDATE** num contato pendente (nem na tag, nem no dono). Só `is_staff()` (Owner/Gestor) passa direto. Esse fato é o eixo de todo o desenho.

---

## 2. Decisões (todas confirmadas com o dono)

| # | Decisão | Escolha |
|---|---------|---------|
| D1 | Quem dispara e de quem fica a carteira | **Atendente assume**: quem tem acesso à conversa converte e o cliente entra **na carteira dele**; staff pode escolher outro dono. |
| D2 | Atrito da conversão | **Formulário rápido de revisão**: nome pré-preenchido, escolha B2C/B2B, **documento opcional**. |
| D3 | Onde fica o gatilho | **Ficha no Atendimento** (faixa + menu ⋮) **+ fila de revisão dedicada** (staff). |
| D4 | Destino de quem não é cliente | **Converter + "Não é cliente"** (tag `reviewed_not_customer`). |
| D5 | Backend | **RPC `SECURITY DEFINER`** gated por acesso à conversa (idiomático; igual a `transfer_conversation`). |
| D6 | Filtro de tags da fila | Implementar o param **`tags` (include) server-side** no Supabase, alinhando ao mock que já filtra (mata a divergência mock↔prod). |

---

## 3. Modelo de dados & tags (sem colunas novas)

O ciclo de vida do contato é governado **só por tag** — nenhuma coluna nova:

```
                          ┌──────────────────────────┐
 import / webhook  ──▶    │  pending_review (sem dono)│  ──┐
                          └──────────────────────────┘    │
                                                           │ convert_pending_contact
                            ┌──────────────────────────┐   │  (remove tag, seta seller_id,
        ┌───────────────────│   cliente de fato         │◀──┘   grava cadastro)
        │  aparece em        │   (sem pending_review,    │
        │  Clientes          │    seller_id preenchido)  │
        │                    └──────────────────────────┘
        │
        │                   ┌──────────────────────────┐
        └── escondido ◀──── │ reviewed_not_customer     │  ◀── mark_contact_not_customer
            de Clientes      │ (sem dono, só Atendimento)│       (troca a tag)
                             └──────────────────────────┘
```

- **`HIDDEN_CUSTOMER_TAGS`** passa de `['pending_review']` para **`['pending_review', 'reviewed_not_customer']`** (`src/features/customers/utils/listFilters.ts`). Assim o descartado **não vaza** para a tela Clientes.
- A **fila de revisão** lista somente `pending_review` (os ainda não triados). O descarte tira o item da fila.
- **Rastreabilidade por auditoria**, não por coluna: a RPC grava `audit_logs` com ações `convert_pending_contact` e `mark_contact_not_customer` (entidade = customer). Badge de origem na ficha (estilo `PreConversionBadge` do lead) fica como **extensão futura** — YAGNI agora.

> **Observação sobre tipo (B2C↔B2B):** a tabela `customers` é única; o discriminated union é montado em `rowToCustomerBase` conforme a coluna `type`. Converter para B2B é só setar `type='B2B'` e preencher `razao_social`/`nome_fantasia`/`cnpj`/`contact_name`. As colunas B2C (`cpf`/`full_name`) coexistem na mesma linha e ficam inertes.

---

## 4. Backend — duas RPCs `SECURITY DEFINER`

Ambas com `set search_path = ''`, mutação **atômica** e auditada. São a **única** porta que muta um contato sem dono; a RLS de `customers_update` permanece **intocada**.

### 4.1 `convert_pending_contact(...)`

**Parâmetros (lógicos):** `p_customer_id`, `p_type` (`'B2C'|'B2B'`), campos de identificação conforme o tipo (B2C: `full_name`, `cpf?`; B2B: `razao_social`, `nome_fantasia`, `cnpj?`, `contact_name?`), `p_seller_id` (opcional). *A forma exata da assinatura — params nomeados vs `jsonb` — é detalhe do plano.*

**Gating (autorização):**
```sql
is_staff()
OR exists (
  select 1 from public.conversations c
  where c.customer_id = p_customer_id
    and public.can_access_conversation(c.id)
)
```

**Regras:**
1. **Idempotência/segurança:** aborta (erro tipado) se o customer **não** tiver mais a tag `pending_review` (já convertido/descartado por outro).
2. **Dono da carteira:**
   - caller **não-staff** → `seller_id` é **forçado** para `current_seller_id()` (o param `p_seller_id` é ignorado — ninguém joga cliente na carteira alheia);
   - caller **staff** → aceita `p_seller_id` escolhido (default: ele mesmo).
3. **Cadastro:** grava `type` + campos de identificação; documento pode ficar nulo.
4. **Tag:** remove `pending_review` do array (preservando quaisquer outras tags).
5. **Auditoria:** insere em `audit_logs` (`actor_id = current_seller_id()`, respeitando o FK NOT NULL → sellers; se o ator não tiver seller, ver Risco R3).
6. Retorna a linha do customer atualizada.

### 4.2 `mark_contact_not_customer(p_customer_id)`

Mesmo gating. Troca `pending_review` → `reviewed_not_customer` no array (sem mexer em outras tags), **não** seta dono, audita. Idempotente (aborta se não houver `pending_review`).

### 4.3 Migration

Migration **versionada** em `supabase/migrations/` (nome `YYYYMMDDHHMMSS_convert_pending_contact_rpcs.sql`) e **aplicada manualmente via MCP com OK explícito do dono** — o workflow de migração é no-op (regra do projeto: mergear PR não aplica migration).

---

## 5. Camada de dados (Provider Pattern)

### 5.1 Contrato

`ICustomersProvider` (`src/providers/data/contracts/customers.ts`) ganha:

```ts
convertPendingContact(input: IConvertPendingContactInput): Promise<ICustomer>;
markContactNotCustomer(customerId: ID): Promise<ICustomer>;
```

`IConvertPendingContactInput`: `{ customerId, type, fullName?/razaoSocial?/nomeFantasia?/contactName?, document?, sellerId? }` — campos por tipo, documento e sellerId opcionais.

### 5.2 Implementações

- **Supabase** (`impl/supabase/customers.ts`): cada método chama a RPC correspondente (`rpc('convert_pending_contact', …)`) e mapeia o retorno por `rowToCustomerBase`.
- **Mock** (`mocks/api/` via provider mock): muta o `mockStore` — remove/troca a tag, seta `sellerId`, grava o cadastro. Mantém **paridade mock↔supabase** (o app em Demonstração se comporta igual).

### 5.3 Filtro `tags` (include) server-side — D6

Implementar o param `tags` no `customers.list` supabase como **array-overlap** (`.overlaps('tags', '{...}')`), **simétrico ao `excludeTags`** que já existe. Hoje o param é ignorado no Supabase mas **já filtra no mock** → esta mudança **alinha** as duas fontes.

- A **fila** chama `list({ tags: ['pending_review'], … })`.
- **Efeito colateral aceito:** o filtro de tags da **tela Clientes** (que hoje não faz nada em prod) passa a filtrar de verdade — exatamente como já faz no demo. Coberto por teste; sem mudança de UI.

---

## 6. UI — ficha no Atendimento (pool-safe, caso a caso)

A ficha do cliente já vive no Atendimento (`ConversationPage` → `CustomerProfileFiche` → `CustomerProfile`), resolvida de forma pool-safe por `useConversationDetail` (`getViaConversation`).

- Quando o customer da conversa tem `pending_review`, exibir uma **faixa de alerta** no topo da ficha (componente novo `PendingContactBanner` — **layout A do companion**: barra âmbar fina entre o header e o corpo, botões logo abaixo): texto "Contato pendente de revisão" + botões **Converter em cliente** e **Não é cliente**.
- Os mesmos itens entram no menu ⋮ (`ProfileMenu`), **substituindo** o placeholder atual "Editar dados → PRD-019".
- **Converter** abre `ConvertContactDialog` (modal novo) — formulário rápido em **coluna única** (**layout A do companion**: campos empilhados, sem seções nem wizard; escolher "Empresa" revela os campos B2B logo abaixo):
  - nome **pré-preenchido** com `whatsappName`/`fullName`;
  - seletor **B2C/B2B** (B2B revela razão social, nome fantasia, CNPJ, contato);
  - **documento opcional** (CPF/CNPJ conforme tipo);
  - campo **"Vendedor responsável"**: **oculto/fixo no próprio atendente** quando não-staff; **select de vendedores** quando staff (default: ele mesmo).
- **Não é cliente** → diálogo de confirmação simples → `markContactNotCustomer`.

A validação do formulário roda num **engine puro testável** (ver §9).

---

## 7. UI — fila de revisão dedicada (staff)

- Rota nova **`/app/atendimento/contatos-pendentes`**, feature `src/features/contact-review/` (nome a confirmar no plano).
- Gated por **staff** (Owner/Gestor). Lista os `pending_review` da loja — que o staff enxerga por `is_staff()` — com busca, e **reusa o mesmo `ConvertContactDialog`** + a ação de descarte.
- **Seletor de visualização (decisão do dono, 2026-06-29):** a fila oferece os **3 modelos** vistos no companion — **Tabela** (densa, default), **Cards** (grade) e **Lista + painel** (estilo inbox) — e o usuário **alterna pela UI** por um seletor no topo. A preferência é **persistida por navegador** (`localStorage`, padrão `gallo-<feature>-…` como nas larguras de coluna). Os 3 modos compartilham os mesmos dados, ações e o `ConvertContactDialog`; a busca e a paginação valem para qualquer modo.
- **Não-staff:** por construção da RLS de `customers_select` (`is_staff() OR seller_id = current_seller_id()`), um vendedor **não vê** contatos sem dono numa listagem direta de customers → a fila apareceria **vazia**. Portanto **não** colocamos o link no menu dele (ele usa a ficha, no contexto da conversa). **Sem caminho morto.**

---

## 8. Permissões & RLS (resumo)

- A conversão/descarte de um contato **sem dono** só acontece pelas **RPCs `SECURITY DEFINER`**, gated por `is_staff()` **ou** acesso à conversa (`can_access_conversation`). A policy `customers_update` **não muda**.
- **Ficha** = qualquer atendente com acesso à conversa (pool-safe). **Fila** = staff (por construção).
- Coerência com os **2 portões** (`docs/dev/conversation-access-model.md`): atender ≠ ser dono. A conversão é o **ato explícito** de cruzar de Atendimento (portão A) para Carteira (portão B); por isso é uma operação deliberada, com um botão próprio, e não um efeito colateral de atribuir a conversa.

---

## 9. Testes

- **Engine puro** (`src/features/contact-review/engine/`, TDD): validação do input de conversão — campos obrigatórios por tipo (B2C exige `fullName`; B2B exige `razaoSocial`/`nomeFantasia`), documento opcional, normalização de telefone/documento. Sem dependências de rede.
- **`toListParams` / filtro `tags`**: teste de que `tags` vira filtro de include e que `excludeTags` continua valendo (e a fila pede `['pending_review']`).
- **`rls-regression.sql`** (roda contra o banco de produção; aplicar a migration **antes** do merge — lição do PR #194):
  - não-staff **converte** contato de conversa que **acessa** → ✅;
  - não-staff é **barrado** em contato de conversa que **não** acessa → ✅ (erro de autorização);
  - não-staff não consegue forçar `seller_id` de outro vendedor (vira o próprio) → ✅;
  - staff converte/descarta sempre → ✅;
  - após converter, o customer **deixa** de ter `pending_review` e ganha `seller_id` → ✅.

---

## 10. Cache / invalidação

Ao converter/descartar, invalidar as query keys de:

- **lista de clientes** (o convertido passa a aparecer; o descartado some da fila);
- **detalhe do cliente** (ficha reflete novo dono/tags);
- **detalhe da conversa** (`useConversationDetail` — a faixa some, a carteira atualiza).

🔒 **Não tocar no cache congelado do Atendimento (#137):** signing de mídia em lote, Realtime e as query keys de **mensagens** ficam **intactos**. A invalidação aqui é só nas chaves de **customer** e **conversation-detail** — disjuntas das de mensagens/mídia.

---

## 11. Fora de escopo (MVP)

- **Desfazer descarte** (reativar um `reviewed_not_customer`) — fácil de somar depois.
- **Dedupe/merge** de contatos duplicados.
- **Conversão em lote** na fila (por ora, item a item).
- **Badge de origem** "convertido de contato importado" na ficha.
- Correção retroativa dos 1.355 contatos legados (eles ficam quietos no Atendimento; a conversão é caso a caso).

---

## 12. Riscos & mitigações

| # | Risco | Mitigação |
|---|-------|-----------|
| R1 | Filtro `tags` server-side muda o comportamento da tela Clientes em prod | É **alinhamento** ao mock (que já filtra), não comportamento novo; coberto por teste; sem mudança de UI. Aval do dono obtido. |
| R2 | Múltiplas conversas para o mesmo customer (multi-instância) no gating | O `exists (… can_access_conversation …)` autoriza se **qualquer** conversa do customer for acessível — semântica correta (quem fala com o contato pode convertê-lo). |
| R3 | `audit_logs.actor_id` é NOT NULL → sellers; ator pode não ter `seller_id` | A RPC usa `current_seller_id()`; o plano define o fallback (pular auditoria ou usar ator de sistema) se vier nulo — espelha o tratamento já usado nas Edge Functions. |
| R4 | Race: dois atendentes convertem/descartam o mesmo contato | A RPC valida a presença de `pending_review` e aborta com erro tipado se já triado (idempotência). |
| R5 | CI `rls-regression` falha por inserir âncora antes da migration | Aplicar a migration **antes** do merge e `gh run rerun --failed` (procedimento já validado no #194). |
| R6 | Mudar `tags` por array inteiro pode perder tags concorrentes | A RPC manipula o array **dentro** da transação (remove/troca só a tag-alvo, preserva o resto), em vez de sobrescrever às cegas. |

---

## 13. Arquivos afetados (estimativa)

**Backend / dados**
- `supabase/migrations/<novo>_convert_pending_contact_rpcs.sql` (novo) — 2 RPCs.
- `supabase/tests/rls-regression.sql` — casos novos.
- `src/providers/data/contracts/customers.ts` — 2 métodos + `IConvertPendingContactInput`.
- `src/providers/data/impl/supabase/customers.ts` — RPCs + filtro `tags` include.
- `src/providers/data/impl/mock/…` (ou `src/mocks/api/…`) — paridade mock.

**UI**
- `src/features/customers/utils/listFilters.ts` — `HIDDEN_CUSTOMER_TAGS += 'reviewed_not_customer'`.
- `src/features/customers/components/…` — `PendingContactBanner`, `ConvertContactDialog`, ajuste no `ProfileMenu`/`ProfileHeader`.
- `src/features/contact-review/` (novo) — fila: página, hooks, `engine/` (validação), barrel.
- `src/routes/app/atendimento/contatos-pendentes.tsx` (novo) — rota staff-only.
- i18n pt-BR dos novos componentes.

---

## 14. Próximo passo

Após aprovação desta spec pelo dono → invocar **writing-plans** para detalhar o plano de implementação (fases, ordem, contratos exatos das RPCs e dos hooks, TDD).

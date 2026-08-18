# CNPJ Enrichment Inline Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Botão "Buscar na Receita" ao lado do CNPJ no editor inline B2B (`CadastraisCard`) que valida e preenche razão social / nome fantasia / endereço via Minha Receita.

**Architecture:** Reutiliza `useMinhaReceita`/`minhaReceitaMapper` (já em produção no ConvertLeadModal). Lógica de aplicação ao draft numa função pura testada `applyCnpjCompanyToDraft`. UI acoplada ao `EditView` do card.

**Tech Stack:** React 19, shadcn/ui, sonner, Vitest.

## Global Constraints

- pt-BR com acentos; comentários em inglês.
- Sem hook/mapper novos — só reuso.
- Não tocar o gate de salvar nem `buildCustomerPatch` do #364.
- `bun run test` + `bun run build` verdes; `tsc --noEmit` por delta; ESLint limpo. Commits atômicos; PR draft; nunca mergear sem OK.

---

### Task 1: `applyCnpjCompanyToDraft` (TDD)

**Files:**
- Modify: `src/features/customers/utils/customerDraft.ts`
- Test: `src/features/customers/utils/customerDraft.test.ts`

**Interfaces:**
- Consumes: `ICustomerDraft` (mesmo arquivo), `ICnpjCompany` de `../hooks/useMinhaReceita` (re-exporta de `../utils/minhaReceitaMapper`), `formatCep` (já no arquivo).
- Produces: `applyCnpjCompanyToDraft(draft: ICustomerDraft, company: ICnpjCompany): ICustomerDraft`.

- [ ] **Step 1: Testes que falham** — em `customerDraft.test.ts`:
  - razão social é sobrescrita; nome fantasia vazio da API mantém o atual; nome fantasia não-vazio sobrescreve;
  - com `company.address`, os 7 subcampos são preenchidos (state uppercase, zipCode via `formatCep` já vem mascarado do mapper); sem `company.address`, endereço do draft é mantido;
  - `cnpj`, `contactName`, `email`, `fullName`, `cpf` nunca mudam.

- [ ] **Step 2: Rodar e ver falhar** — `bun run test -- customerDraft` → FAIL (função não existe).

- [ ] **Step 3: Implementar** (append em `customerDraft.ts`):

```ts
import type { ICnpjCompany } from "../hooks/useMinhaReceita";

/**
 * Overlays the official Receita company data onto the draft. Called from the
 * inline editor's "Buscar na Receita" button; nothing persists until the user
 * clicks Salvar, so it overwrites the fields the API provides and leaves the
 * rest untouched. A blank field from the API never wipes an existing value.
 */
export function applyCnpjCompanyToDraft(
  draft: ICustomerDraft,
  company: ICnpjCompany,
): ICustomerDraft {
  const next: ICustomerDraft = { ...draft };
  if (company.razaoSocial.trim()) next.razaoSocial = company.razaoSocial.trim();
  if (company.nomeFantasia.trim()) next.nomeFantasia = company.nomeFantasia.trim();
  const addr = company.address;
  if (addr) {
    next.street = addr.street;
    next.number = addr.number;
    next.complement = addr.complement ?? "";
    next.district = addr.district;
    next.city = addr.city;
    next.state = addr.state.toUpperCase();
    next.zipCode = formatCep(addr.zipCode);
  }
  return next;
}
```

- [ ] **Step 4: Rodar e ver passar** — `bun run test -- customerDraft` → PASS.
- [ ] **Step 5: Commit** — `feat(customers): add applyCnpjCompanyToDraft to overlay Receita data on the draft`.

---

### Task 2: Botão de busca no `CadastraisCard`

**Files:**
- Modify: `src/features/customers/components/cards/CadastraisCard.tsx`
- Modify: `src/features/customers/i18n/pt-BR.ts` (strings novas)

**Interfaces:**
- Consumes: `useMinhaReceita` (`../hooks/useMinhaReceita`), `isSituacaoAtiva` (`../utils/minhaReceitaMapper`), `isValidCnpj`/`onlyDigits` (`../utils/cnpjCpf`), `applyCnpjCompanyToDraft` (Task 1), `toast` (sonner).

- [ ] **Step 1: i18n** — em `CUSTOMER_STRINGS.overview.cadastrais` adicionar:

```ts
      lookupCnpj: "Buscar na Receita",
      lookupCnpjHint: "Informe um CNPJ válido para buscar.",
      lookupLoading: "Consultando a Receita…",
      lookupSuccessToast: "Dados preenchidos pela Receita.",
      lookupNotFoundToast: "CNPJ não encontrado na Receita.",
      lookupErrorToast: "Não foi possível consultar a Receita agora.",
      situacaoActive: "Situação ativa na Receita",
      situacaoInactivePrefix: "Situação na Receita:",
```

- [ ] **Step 2: Fiar o hook + handler no `CadastraisCard`** — dentro do componente:
  - `const { lookup, status, data: cnpjData, reset: resetCnpj } = useMinhaReceita();`
  - `const cnpjValid = draft ? isValidCnpj(draft.cnpj) : false;`
  - `handleLookup`: guard `if (!draft || !cnpjValid) return;` → `const company = await lookup(onlyDigits(draft.cnpj));` → em sucesso: `setDraft((prev) => (prev ? applyCnpjCompanyToDraft(prev, company) : prev)); toast.success(COPY.lookupSuccessToast);` → `status === "invalid"` (retorno null + `useMinhaReceita.status`): tratar via o valor de retorno e o `status`; usar toasts `lookupNotFoundToast`/`lookupErrorToast`. (Ler `status` após o await para distinguir invalid vs error, ou inspecionar `company === null` + o estado — implementação: se `company` veio, sucesso; senão, ler `status` do hook no próximo render OU capturar via retorno. Simplest: após `await lookup`, se `!company`, disparar toast condicional pelo `statusRef`.)
  - Resetar o estado do lookup ao entrar/sair de edição (`resetCnpj()` em `startEdit`/`cancelEdit`) para o badge não vazar entre sessões.

  Nota de implementação para distinguir invalid/error sem corrida de estado: o `lookup` retorna `null` tanto para invalid quanto error, mas seta `status`. Como `status` só atualiza no próximo render, capturar o desfecho lendo o **retorno** + um `useRef` que espelha `status` **não** funciona no mesmo tick. Solução limpa: após `const company = await lookup(...)`, se `company` existe → sucesso; senão ler o `status` atual do closure **não** está atualizado. Portanto: derivar a mensagem do próprio `useMinhaReceita` **error string** exposto (`error`) via um efeito, OU (preferido) mostrar o toast de erro/invalid a partir de um `useEffect` que observa `status`:
    - `useEffect(() => { if (status === "invalid") toast.error(COPY.lookupNotFoundToast); else if (status === "error") toast.error(COPY.lookupErrorToast); }, [status]);` e o sucesso continua no handler (aplica o draft). Isso evita a corrida e mantém um único ponto por desfecho.

- [ ] **Step 3: UI no `EditView` (B2B)** — o campo CNPJ vira input + botão:
  - Passar props novas ao `EditView`: `onLookup: () => void`, `lookupLoading: boolean`, `cnpjValid: boolean`, `situacao?: string` (de `cnpjData?.situacaoCadastral`).
  - Layout: `<div className="flex items-end gap-2">` com o `Field` do CNPJ ocupando `flex-1` e um `Button` (variant outline, size sm/icon) à direita: `disabled={!cnpjValid || lookupLoading}`, spinner `mdi:loading` animate-spin em loading, senão `mdi:office-building-search-outline`; `aria-label`/title = `COPY.lookupCnpj` (ou hint quando desabilitado).
  - Abaixo do campo, quando `situacao` presente: badge verde/âmbar (`isSituacaoAtiva`) com o texto — mesmo estilo do ConvertLeadModal (`bg-success/15 text-success` vs `bg-warning/15 text-warning`).

- [ ] **Step 4: Verificar** — `bun run test` (suíte) + `bun run build` PASS; prettier + ESLint limpos; `tsc --noEmit` por delta.
- [ ] **Step 5: Commit** — `feat(customers): add "Buscar na Receita" CNPJ enrichment button to the inline editor`.

---

### Task 3: Verificação final, revisão e PR

- [ ] **Step 1:** `bun run test` verde; `bun run build` OK; `bunx tsc --noEmit` sem delta novo.
- [ ] **Step 2:** Revisão adversarial (subagente) focando: corrida de estado invalid/error, autofill não apagar dados bons, não tocar campos fora de escopo, badge não vazar entre sessões de edição.
- [ ] **Step 3:** Push + `gh pr create --draft` (base `main`). Não mergear sem OK.

# Conversão de lead — autofill CNPJ + vincular a cliente existente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No modal "Converter lead em cliente", enriquecer o autofill de CNPJ com endereço + situação cadastral da Receita Federal, e adicionar um segundo modo que vincula o lead a um cliente **já existente** em vez de criar um duplicado.

**Architecture:** A lógica de parsing da resposta da Minha Receita (`minhareceita.org`) é extraída para uma função pura testável (`minhaReceitaMapper.ts`); o hook `useMinhaReceita` passa a delegar a ela, ganhando endereço + situação cadastral no retorno sem quebrar quem já o consome (`NewCustomerModal`, `RegisterPage`). O `ConvertLeadModal` ganha um toggle de modo (`Criar novo cliente` / `Vincular a cliente existente`); o modo "novo" reaproveita o hook para autofill; o modo "vincular" busca clientes já cadastrados via `customersProvider.list({ storeId, search })` (mesmo padrão já usado em "Nova conversa") e, ao submeter, só atualiza o `lead` — o cliente selecionado nunca é escrito, porque a RLS de `customers_update` exige que o vendedor seja dono da carteira daquele cliente.

**Tech Stack:** React 19, TanStack Query, Vitest, bun, Tailwind v4 + shadcn/ui, Iconify (`@/components/Icon`).

## Global Constraints

- **Provider Pattern:** dados só via `@/providers/data` hooks (`useCustomersProvider`, `useLeadsProvider`). Nenhuma mudança em `impl/*`, contratos ou mocks é necessária nesta feature — `list`, `create` e `update` já suportam tudo que é preciso.
- **Nenhuma migration/RLS nova.** O modo "vincular a cliente existente" **nunca** escreve no `customers` — só no `lead` (`stage` + `convertedToCustomerId`). Motivo: `customers_update` exige `is_staff() OR seller_id = current_seller_id()`; escrever no cliente selecionado poderia falhar com 403 para um vendedor não-staff dono de um lead cujo cliente já pertence a outra carteira.
- **`ICnpjCompany` é expandido de forma retrocompatível** — campos novos são opcionais; `NewCustomerModal.tsx` e `RegisterPage.tsx` continuam funcionando sem alteração (ambos ficam fora do escopo desta entrega — YAGNI).
- **Campos brutos confirmados da API Minha Receita** (`GET https://minhareceita.org/{cnpj}`, chamada real de teste): `razao_social`, `nome_fantasia`, `descricao_situacao_cadastral`, `logradouro`, `numero`, `complemento`, `bairro`, `municipio`, `uf`, `cep`.
- **Convenções:** TS `strict`, sem `any`; interfaces `I`-prefixed; UI/strings em pt-BR com acentos, sempre via `LEADS_STRINGS.convertModal` (o arquivo já segue esse padrão — não hardcodar texto novo na JSX); comentários em inglês; Conventional Commits atômicos terminando em `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- **Gate por task:** `bun run test` (verde, baseline 287 arquivos / 2236 testes já confirmada limpa nesta worktree) e `bunx tsc --noEmit` (zero erro novo introduzido pelos arquivos desta feature). Branch: `worktree-lead-convert-cnpj-link`. **Não mergear sem OK explícito do dono** — integração via PR.

---

## File Structure

- Create: `src/features/customers/utils/minhaReceitaMapper.ts` — parsing puro da resposta bruta da Minha Receita → `ICnpjCompany` (com endereço + situação cadastral) + `isSituacaoAtiva`.
- Create: `src/features/customers/utils/minhaReceitaMapper.test.ts` — TDD do mapper.
- Modify: `src/features/customers/hooks/useMinhaReceita.ts` — delega o parsing ao mapper; re-exporta `ICnpjCompany` de lá.
- Modify: `src/features/leads/i18n/pt-BR.ts` — novas chaves em `convertModal`.
- Modify: `src/features/leads/components/ConvertLeadModal.tsx` — autofill de CNPJ enriquecido (Task 4) + modo "vincular a cliente existente" (Task 5).

---

## FASE A — Mapper puro da Minha Receita (TDD)

### Task 1: `minhaReceitaMapper` — parsing + situação cadastral

**Files:**
- Create: `src/features/customers/utils/minhaReceitaMapper.ts`
- Test: `src/features/customers/utils/minhaReceitaMapper.test.ts`

**Interfaces:**
- Produces: `ICnpjCompanyAddress`, `ICnpjCompany` (`cnpj`, `razaoSocial`, `nomeFantasia`, `situacaoCadastral?`, `address?`), `IMinhaReceitaRawResponse`, `formatCep(rawCep: string): string`, `isSituacaoAtiva(situacao: string | undefined): boolean`, `mapMinhaReceitaResponse(digits: string, raw: IMinhaReceitaRawResponse): ICnpjCompany`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import {
  formatCep,
  isSituacaoAtiva,
  mapMinhaReceitaResponse,
  type IMinhaReceitaRawResponse,
} from "./minhaReceitaMapper";

describe("formatCep", () => {
  it("formats 8 raw digits into 00000-000", () => {
    expect(formatCep("20031170")).toBe("20031-170");
  });

  it("returns the input unchanged when it isn't 8 digits", () => {
    expect(formatCep("123")).toBe("123");
  });
});

describe("isSituacaoAtiva", () => {
  it("is true for ATIVA", () => {
    expect(isSituacaoAtiva("ATIVA")).toBe(true);
  });

  it("is false for any other status", () => {
    expect(isSituacaoAtiva("BAIXADA")).toBe(false);
    expect(isSituacaoAtiva("SUSPENSA")).toBe(false);
  });

  it("is false when undefined", () => {
    expect(isSituacaoAtiva(undefined)).toBe(false);
  });
});

describe("mapMinhaReceitaResponse", () => {
  const fullRaw: IMinhaReceitaRawResponse = {
    razao_social: "PETROLEO BRASILEIRO S A PETROBRAS",
    nome_fantasia: "PETROBRAS - EDISE",
    descricao_situacao_cadastral: "ATIVA",
    logradouro: "REPUBLICA DO CHILE",
    numero: "65",
    complemento: "",
    bairro: "CENTRO",
    municipio: "RIO DE JANEIRO",
    uf: "RJ",
    cep: "20031170",
  };

  it("maps name, situation and address from a full response", () => {
    const result = mapMinhaReceitaResponse("33000167000101", fullRaw);
    expect(result).toEqual({
      cnpj: "33000167000101",
      razaoSocial: "PETROLEO BRASILEIRO S A PETROBRAS",
      nomeFantasia: "PETROBRAS - EDISE",
      situacaoCadastral: "ATIVA",
      address: {
        street: "REPUBLICA DO CHILE",
        number: "65",
        complement: undefined,
        district: "CENTRO",
        city: "RIO DE JANEIRO",
        state: "RJ",
        zipCode: "20031-170",
      },
    });
  });

  it("omits address when logradouro/municipio/uf are missing", () => {
    const result = mapMinhaReceitaResponse("33000167000101", {
      razao_social: "EMPRESA SEM ENDERECO",
      nome_fantasia: "",
    });
    expect(result.address).toBeUndefined();
  });

  it("defaults the house number to S/N when absent", () => {
    const result = mapMinhaReceitaResponse("33000167000101", {
      ...fullRaw,
      numero: "",
    });
    expect(result.address?.number).toBe("S/N");
  });

  it("trims a blank razao_social/nome_fantasia to empty string, not undefined", () => {
    const result = mapMinhaReceitaResponse("33000167000101", {});
    expect(result.razaoSocial).toBe("");
    expect(result.nomeFantasia).toBe("");
    expect(result.situacaoCadastral).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/features/customers/utils/minhaReceitaMapper.test.ts`
Expected: FAIL (o módulo `./minhaReceitaMapper` ainda não existe).

- [ ] **Step 3: Implementar**

```ts
/**
 * Pure mapping from the Minha Receita (minhareceita.org) raw JSON response
 * into the app's ICnpjCompany shape. Kept separate from useMinhaReceita.ts
 * so the parsing rules are testable without mocking fetch.
 */

export interface ICnpjCompanyAddress {
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface ICnpjCompany {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  /** e.g. "ATIVA" | "BAIXADA" | "SUSPENSA" | "INAPTA" | "NULA". */
  situacaoCadastral?: string;
  address?: ICnpjCompanyAddress;
}

export interface IMinhaReceitaRawResponse {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
}

/** "20031170" -> "20031-170". Returns the input unchanged if it isn't 8 digits. */
export function formatCep(rawCep: string): string {
  const digits = rawCep.replace(/\D/g, "");
  if (digits.length !== 8) return rawCep;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/** Only "ATIVA" (Receita's active status) counts as active — anything else, including undefined, doesn't. */
export function isSituacaoAtiva(situacao: string | undefined): boolean {
  return (situacao ?? "").trim().toUpperCase() === "ATIVA";
}

export function mapMinhaReceitaResponse(
  digits: string,
  raw: IMinhaReceitaRawResponse,
): ICnpjCompany {
  const logradouro = raw.logradouro?.trim();
  const municipio = raw.municipio?.trim();
  const uf = raw.uf?.trim();

  const address: ICnpjCompanyAddress | undefined =
    logradouro && municipio && uf
      ? {
          street: logradouro,
          number: raw.numero?.trim() || "S/N",
          complement: raw.complemento?.trim() || undefined,
          district: raw.bairro?.trim() ?? "",
          city: municipio,
          state: uf.toUpperCase(),
          zipCode: raw.cep ? formatCep(raw.cep) : "",
        }
      : undefined;

  return {
    cnpj: digits,
    razaoSocial: (raw.razao_social ?? "").trim(),
    nomeFantasia: (raw.nome_fantasia ?? "").trim(),
    situacaoCadastral: raw.descricao_situacao_cadastral?.trim() || undefined,
    address,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test src/features/customers/utils/minhaReceitaMapper.test.ts`
Expected: PASS (10 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/customers/utils/minhaReceitaMapper.ts src/features/customers/utils/minhaReceitaMapper.test.ts
git commit -m "$(cat <<'EOF'
feat(customers): add pure Minha Receita response mapper

Extracts CNPJ lookup parsing (name, address, situacao cadastral) into
a testable pure function, ahead of useMinhaReceita consuming it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## FASE B — Hook compartilhado

### Task 2: `useMinhaReceita` delega ao mapper

**Files:**
- Modify: `src/features/customers/hooks/useMinhaReceita.ts` (arquivo inteiro — 118 linhas atuais)

**Interfaces:**
- Consumes: `mapMinhaReceitaResponse`, `type ICnpjCompany`, `type IMinhaReceitaRawResponse` (Task 1).
- Produces: `useMinhaReceita()` com a MESMA assinatura pública de hoje (`lookup`, `status`, `loading`, `error`, `data`, `reset`) — `NewCustomerModal.tsx` e `RegisterPage.tsx` continuam compilando sem alteração. `ICnpjCompany` passa a ser re-exportado deste arquivo (mesmo caminho de import de antes).

- [ ] **Step 1: Substituir o conteúdo do arquivo**

```ts
import { useCallback, useRef, useState } from "react";
import { onlyDigits } from "../utils/cnpjCpf";
import {
  mapMinhaReceitaResponse,
  type ICnpjCompany,
  type IMinhaReceitaRawResponse,
} from "../utils/minhaReceitaMapper";

/**
 * CNPJ lookup against the public Minha Receita service (https://minhareceita.org).
 *
 * The service mirrors the Receita Federal open dataset and requires no API key.
 * A 200 means the CNPJ exists (and we get the company data for autofill); a 404
 * means it is unknown/invalid. Because the API is community-run, network/CORS
 * failures are treated as a soft "could not verify" state — the caller is
 * expected to let the form proceed (the local checksum already passed).
 */

const MINHA_RECEITA_BASE = "https://minhareceita.org";
const TIMEOUT_MS = 8000;

/** idle → loading → (success | invalid | error). */
export type CnpjLookupStatus = "idle" | "loading" | "success" | "invalid" | "error";

export type { ICnpjCompany };

export interface IUseMinhaReceitaResult {
  lookup: (rawCnpj: string) => Promise<ICnpjCompany | null>;
  status: CnpjLookupStatus;
  loading: boolean;
  error: string | null;
  data: ICnpjCompany | null;
  reset: () => void;
}

export function useMinhaReceita(): IUseMinhaReceitaResult {
  const [status, setStatus] = useState<CnpjLookupStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ICnpjCompany | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setError(null);
    setData(null);
  }, []);

  const lookup = useCallback(async (rawCnpj: string): Promise<ICnpjCompany | null> => {
    const digits = onlyDigits(rawCnpj);
    if (digits.length !== 14) {
      setStatus("invalid");
      setError("CNPJ inválido.");
      setData(null);
      return null;
    }

    // Cancel any in-flight request so a stale response can't overwrite this one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

    setStatus("loading");
    setError(null);
    setData(null);

    try {
      const res = await fetch(`${MINHA_RECEITA_BASE}/${digits}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      if (res.status === 404) {
        setStatus("invalid");
        setError("CNPJ não encontrado na Receita.");
        return null;
      }
      if (!res.ok) {
        setStatus("error");
        setError("Não foi possível validar o CNPJ agora.");
        return null;
      }

      const body = (await res.json()) as IMinhaReceitaRawResponse;
      const out = mapMinhaReceitaResponse(digits, body);
      setData(out);
      setStatus("success");
      return out;
    } catch {
      // Aborts (timeout/superseded), CORS and offline all land here.
      if (controller.signal.aborted && abortRef.current !== controller) {
        // Superseded by a newer lookup — keep that one's state.
        return null;
      }
      setStatus("error");
      setError("Não foi possível validar o CNPJ agora.");
      return null;
    } finally {
      window.clearTimeout(timeout);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  return { lookup, status, loading: status === "loading", error, data, reset };
}
```

- [ ] **Step 2: Verificar**

Run: `bunx tsc --noEmit`
Expected: zero erro novo relacionado a `useMinhaReceita.ts`, `NewCustomerModal.tsx` ou `RegisterPage.tsx`.

Run: `bun run test`
Expected: 287 arquivos / 2236+ testes passando (a suíte inteira continua verde — este hook não tinha teste próprio antes e continua sem, mas nada deve quebrar).

- [ ] **Step 3: Commit**

```bash
git add src/features/customers/hooks/useMinhaReceita.ts
git commit -m "$(cat <<'EOF'
refactor(customers): useMinhaReceita delegates parsing to the pure mapper

No behavior change for existing consumers (NewCustomerModal,
RegisterPage) — ICnpjCompany gains optional address/situacaoCadastral
fields that they simply don't read yet.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## FASE C — i18n

### Task 3: Novas chaves em `LEADS_STRINGS.convertModal`

**Files:**
- Modify: `src/features/leads/i18n/pt-BR.ts:178-207` (bloco `convertModal`)

**Interfaces:**
- Produces: novas chaves lidas pelas Tasks 4 e 5 como `COPY.<chave>`.

- [ ] **Step 1: Substituir o bloco `convertModal`**

Localize (linhas 178-207):

```ts
  convertModal: {
    title: "Converter lead em cliente",
    description: "Confirme os dados para criar a ficha do cliente.",
    typeLabel: "Tipo de cliente",
    typeB2B: "Empresa (B2B)",
    typeB2C: "Pessoa (B2C)",
    razaoSocial: "Razão social",
    razaoSocialPlaceholder: "Razão social registrada",
    nomeFantasia: "Nome fantasia",
    nomeFantasiaPlaceholder: "Nome fantasia",
    cnpj: "CNPJ",
    cnpjPlaceholder: "00.000.000/0000-00",
    contactName: "Contato principal",
    fullName: "Nome completo",
    cpf: "CPF",
    cpfPlaceholder: "000.000.000-00",
    email: "E-mail",
    phone: "Telefone",
    cancel: "Cancelar",
    submit: "Converter",
    submitting: "Convertendo…",
    requiredFullName: "Informe o nome completo.",
    requiredCpf: "Informe um CPF válido (11 dígitos).",
    requiredRazao: "Informe a razão social.",
    requiredFantasia: "Informe o nome fantasia.",
    requiredCnpj: "Informe um CNPJ válido (14 dígitos).",
    requiredContact: "Informe o contato principal.",
    successToast: "Lead convertido em cliente.",
    errorToast: "Não foi possível converter o lead.",
  },
```

Substitua por:

```ts
  convertModal: {
    title: "Converter lead em cliente",
    description: "Confirme os dados para criar a ficha do cliente.",
    descriptionLink: "Selecione o cliente já cadastrado para vincular a este lead.",
    modeLabel: "Tipo de conversão",
    modeNew: "Criar novo cliente",
    modeLink: "Vincular a cliente existente",
    typeLabel: "Tipo de cliente",
    typeB2B: "Empresa (B2B)",
    typeB2C: "Pessoa (B2C)",
    razaoSocial: "Razão social",
    razaoSocialPlaceholder: "Razão social registrada",
    nomeFantasia: "Nome fantasia",
    nomeFantasiaPlaceholder: "Nome fantasia",
    cnpj: "CNPJ",
    cnpjPlaceholder: "00.000.000/0000-00",
    cnpjChecking: "Consultando Receita…",
    cnpjLookupError: "Não foi possível validar o CNPJ na Receita agora.",
    cnpjRetry: "Tentar novamente",
    cnpjNotFound: "CNPJ não encontrado na Receita.",
    cnpjSituacaoWarning: (situacao: string) =>
      `CNPJ com situação ${situacao} na Receita Federal.`,
    contactName: "Contato principal",
    fullName: "Nome completo",
    cpf: "CPF",
    cpfPlaceholder: "000.000.000-00",
    email: "E-mail",
    phone: "Telefone",
    searchLabel: "Cliente existente",
    searchPlaceholder: "Buscar por nome, CNPJ/CPF ou telefone…",
    searchHint: "Digite ao menos 2 caracteres para buscar.",
    searchNoResults: "Nenhum cliente encontrado.",
    changeCustomer: "Trocar",
    cancel: "Cancelar",
    submit: "Converter",
    submitting: "Convertendo…",
    submittingCnpj: "Validando CNPJ…",
    requiredFullName: "Informe o nome completo.",
    requiredCpf: "Informe um CPF válido (11 dígitos).",
    requiredRazao: "Informe a razão social.",
    requiredFantasia: "Informe o nome fantasia.",
    requiredCnpj: "Informe um CNPJ válido (14 dígitos).",
    requiredContact: "Informe o contato principal.",
    successToast: "Lead convertido em cliente.",
    successToastLinked: "Lead vinculado ao cliente existente.",
    errorToast: "Não foi possível converter o lead.",
  },
```

- [ ] **Step 2: Verificar**

Run: `bunx tsc --noEmit`
Expected: zero erro novo. `LEADS_STRINGS` é um `export const` sem anotação de tipo explícita (TypeScript infere a estrutura do próprio literal) — adicionar chaves novas ao objeto não pode gerar erro de tipo.

- [ ] **Step 3: Commit**

```bash
git add src/features/leads/i18n/pt-BR.ts
git commit -m "$(cat <<'EOF'
feat(leads): add i18n strings for CNPJ enrichment and customer linking

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## FASE D — `ConvertLeadModal`

### Task 4: Autofill de CNPJ (endereço + situação cadastral)

**Files:**
- Modify: `src/features/leads/components/ConvertLeadModal.tsx` (arquivo inteiro — 259 linhas atuais)

**Interfaces:**
- Consumes: `useMinhaReceita` (Task 2), `isSituacaoAtiva` (Task 1), `formatCnpj`/`isValidCnpj`/`onlyDigits` (`@/features/customers/utils/cnpjCpf`, já existentes), `useDebounce` (`@/shared/hooks/useDebounce`, já existente), `Icon` (`@/components/Icon`), `LEADS_STRINGS.convertModal` (Task 3).
- Produces: mesmo `ConvertLeadModal` exportado com a MESMA prop interface (`IConvertLeadModalProps`) de hoje — nenhum consumidor (`LeadsPage.tsx`, `LeadDetailPage.tsx`) precisa mudar nesta task.

Esta task **não** mexe no modo "vincular" (Task 5) — só enriquece o fluxo B2B existente.

- [ ] **Step 1: Substituir o conteúdo do arquivo**

```tsx
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { ICustomer, ID, ILead } from "@/shared/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Icon } from "@/components/Icon";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { useLeadsProvider } from "@/providers/data/hooks/useLeadsProvider";
import { useAuth } from "@/features/auth/useAuth";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { useDebounce } from "@/shared/hooks/useDebounce";
import { formatCnpj, isValidCnpj, onlyDigits } from "@/features/customers/utils/cnpjCpf";
import { isSituacaoAtiva } from "@/features/customers/utils/minhaReceitaMapper";
import { useMinhaReceita } from "@/features/customers/hooks/useMinhaReceita";
import { usePipelineSettings } from "../hooks/usePipelineSettings";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { CLOSING_STAGE_ID } from "../utils/leadDisplay";
import { LEADS_STRINGS } from "../i18n/pt-BR";

const COPY = LEADS_STRINGS.convertModal;

type CustomerType = "B2B" | "B2C";

/** Visual validation state for the CNPJ field (drives icon + message). */
type CnpjFieldState = "idle" | "checking" | "valid" | "invalid" | "warning";

export interface IConvertLeadModalProps {
  lead: ILead | null;
  onClose: () => void;
  onConverted?: (customerId: ID) => void;
}

export function ConvertLeadModal({ lead, onClose, onConverted }: IConvertLeadModalProps) {
  const customersProvider = useCustomersProvider();
  const leadsProvider = useLeadsProvider();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const { currentStoreId } = useCurrentStore();
  const { stages } = usePipelineSettings(currentStoreId);

  const [type, setType] = useState<CustomerType>("B2C");
  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const {
    lookup: lookupCnpj,
    reset: resetCnpj,
    status: cnpjStatus,
    data: cnpjData,
  } = useMinhaReceita();
  const debouncedCnpj = useDebounce(cnpj, 500);

  useEffect(() => {
    if (!lead) return;
    setType("B2C");
    setFullName(lead.name);
    setCpf("");
    setRazaoSocial("");
    setNomeFantasia(lead.name);
    setCnpj("");
    setContactName(lead.name);
    setEmail(lead.email ?? "");
    setErrors({});
    resetCnpj();
  }, [lead, resetCnpj]);

  // CNPJ lookup against Minha Receita once a valid 14-digit number is typed.
  // Autofill only into empty fields so the seller's own input is never lost.
  useEffect(() => {
    if (type !== "B2B") {
      resetCnpj();
      return;
    }
    const digits = onlyDigits(debouncedCnpj);
    if (digits.length !== 14 || !isValidCnpj(debouncedCnpj)) {
      resetCnpj();
      return;
    }
    let active = true;
    void lookupCnpj(debouncedCnpj).then((company) => {
      if (!active || !company) return;
      setRazaoSocial((prev) => (prev.trim() ? prev : company.razaoSocial));
      setNomeFantasia((prev) => (prev.trim() ? prev : company.nomeFantasia || company.razaoSocial));
    });
    return () => {
      active = false;
    };
  }, [debouncedCnpj, type, lookupCnpj, resetCnpj]);

  const cnpjFieldState = useMemo<CnpjFieldState>(() => {
    if (type !== "B2B") return "idle";
    const digits = onlyDigits(cnpj);
    if (digits.length < 14) return "idle";
    if (!isValidCnpj(cnpj)) return "invalid";
    if (cnpjStatus === "loading") return "checking";
    if (cnpjStatus === "invalid") return "invalid";
    if (cnpjStatus === "error") return "warning";
    if (cnpjStatus === "success") return "valid";
    return "checking";
  }, [type, cnpj, cnpjStatus]);

  const cnpjChecking = type === "B2B" && cnpjStatus === "loading";

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (type === "B2C") {
      if (!fullName.trim()) next.fullName = COPY.requiredFullName;
      const digits = cpf.replace(/\D/g, "");
      if (digits.length !== 11) next.cpf = COPY.requiredCpf;
    } else {
      if (!razaoSocial.trim()) next.razaoSocial = COPY.requiredRazao;
      if (!nomeFantasia.trim()) next.nomeFantasia = COPY.requiredFantasia;
      if (!isValidCnpj(cnpj)) next.cnpj = COPY.requiredCnpj;
      else if (cnpjStatus === "invalid") next.cnpj = COPY.cnpjNotFound;
      if (!contactName.trim()) next.contactName = COPY.requiredContact;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!lead) return;
    if (!validate()) return;
    if (!currentStoreId) return;

    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const baseCustomer = {
        storeId: lead.storeId,
        sellerId: lead.sellerId,
        phone: lead.phone,
        email: email.trim() ? email.trim() : lead.email,
        status: "ativo" as const,
        tags: [...lead.tags],
        convertedFromLeadId: lead.id,
        convertedFromLeadAt: nowIso,
        convertedBySellerId: currentUser?.sellerId ?? lead.sellerId,
      };

      // Only attach the Receita address when it matches the CNPJ actually being
      // submitted — guards against a stale lookup from a CNPJ the seller edited afterward.
      const matchingAddress =
        cnpjData && cnpjData.cnpj === onlyDigits(cnpj) ? cnpjData.address : undefined;

      const customer =
        type === "B2B"
          ? await customersProvider.create({
              ...baseCustomer,
              type: "B2B",
              cnpj: onlyDigits(cnpj),
              razaoSocial: razaoSocial.trim(),
              nomeFantasia: nomeFantasia.trim(),
              contactName: contactName.trim(),
              ...(matchingAddress ? { address: matchingAddress } : {}),
            } as Omit<ICustomer, "id" | "createdAt" | "notes">)
          : await customersProvider.create({
              ...baseCustomer,
              type: "B2C",
              cpf: onlyDigits(cpf),
              fullName: fullName.trim(),
            } as Omit<ICustomer, "id" | "createdAt" | "notes">);

      const closingStage = stages.find((s) => s.id === CLOSING_STAGE_ID) ?? lead.stage;
      await leadsProvider.update(lead.id, {
        stage: closingStage,
        convertedToCustomerId: customer.id,
      });

      auditLog({
        action: "lead.converted",
        resource: "lead",
        resourceId: lead.id,
        before: { stageId: lead.stage.id },
        after: { stageId: closingStage.id, customerId: customer.id, type },
      });
      auditLog({
        action: "customer.created",
        resource: "customer",
        resourceId: customer.id,
        after: { from: "lead-conversion", leadId: lead.id, type },
      });

      toast.success(COPY.successToast);
      await queryClient.invalidateQueries({ queryKey: ["leads-list"] });
      await queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
      await queryClient.invalidateQueries({ queryKey: ["customers-list"] });
      onConverted?.(customer.id);
    } catch {
      toast.error(COPY.errorToast);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={lead !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{COPY.title}</DialogTitle>
          <DialogDescription>{COPY.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{COPY.typeLabel}</Label>
            <RadioGroup
              value={type}
              onValueChange={(v) => setType(v as CustomerType)}
              className="grid grid-cols-2 gap-2"
            >
              <label className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                <RadioGroupItem value="B2C" id="convert-b2c" />
                {COPY.typeB2C}
              </label>
              <label className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                <RadioGroupItem value="B2B" id="convert-b2b" />
                {COPY.typeB2B}
              </label>
            </RadioGroup>
          </div>

          {type === "B2C" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={COPY.fullName} error={errors.fullName} colSpan={2}>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </Field>
              <Field label={COPY.cpf} error={errors.cpf}>
                <Input
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  placeholder={COPY.cpfPlaceholder}
                />
              </Field>
              <Field label={COPY.email}>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label={COPY.razaoSocial} error={errors.razaoSocial} colSpan={2}>
                  <Input
                    value={razaoSocial}
                    onChange={(e) => setRazaoSocial(e.target.value)}
                    placeholder={COPY.razaoSocialPlaceholder}
                  />
                </Field>
                <Field label={COPY.nomeFantasia} error={errors.nomeFantasia} colSpan={2}>
                  <Input
                    value={nomeFantasia}
                    onChange={(e) => setNomeFantasia(e.target.value)}
                    placeholder={COPY.nomeFantasiaPlaceholder}
                  />
                </Field>
                <Field label={COPY.cnpj} error={errors.cnpj}>
                  <div className="relative">
                    <Input
                      className="pr-9"
                      value={cnpj}
                      aria-invalid={cnpjFieldState === "invalid"}
                      aria-describedby="convert-cnpj-msg"
                      onChange={(e) => setCnpj(formatCnpj(e.target.value))}
                      placeholder={COPY.cnpjPlaceholder}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                      {cnpjFieldState === "checking" && (
                        <Icon
                          icon="mdi:loading"
                          size={16}
                          className="animate-spin text-muted-foreground motion-reduce:animate-none"
                        />
                      )}
                      {cnpjFieldState === "valid" && (
                        <Icon icon="mdi:check-circle" size={16} className="text-success" />
                      )}
                      {cnpjFieldState === "invalid" && (
                        <Icon icon="mdi:alert-circle" size={16} className="text-destructive" />
                      )}
                      {cnpjFieldState === "warning" && (
                        <Icon icon="mdi:cloud-alert-outline" size={16} className="text-warning" />
                      )}
                    </span>
                  </div>
                </Field>
                <Field label={COPY.contactName} error={errors.contactName}>
                  <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
                </Field>
                <Field label={COPY.email} colSpan={2}>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
              </div>

              <div id="convert-cnpj-msg" aria-live="polite" className="space-y-1.5">
                {cnpjFieldState === "checking" && (
                  <p className="text-xs text-muted-foreground">{COPY.cnpjChecking}</p>
                )}
                {cnpjFieldState === "valid" && cnpjData && (
                  <p className="inline-flex flex-wrap items-center gap-1.5 rounded-md bg-success/10 px-2.5 py-1.5 text-xs text-success">
                    <Icon icon="mdi:office-building-outline" size={14} />
                    <span className="font-medium">{cnpjData.razaoSocial}</span>
                    {cnpjData.address && (
                      <span className="text-success/80">
                        · {cnpjData.address.city}/{cnpjData.address.state}
                      </span>
                    )}
                  </p>
                )}
                {cnpjFieldState === "valid" &&
                  cnpjData?.situacaoCadastral &&
                  !isSituacaoAtiva(cnpjData.situacaoCadastral) && (
                    <p className="flex items-center gap-1.5 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
                      <Icon icon="mdi:alert-outline" size={14} />
                      {COPY.cnpjSituacaoWarning(cnpjData.situacaoCadastral)}
                    </p>
                  )}
                {cnpjFieldState === "warning" && (
                  <div className="flex flex-wrap items-center gap-2 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
                    <Icon icon="mdi:cloud-alert-outline" size={14} />
                    <span>{COPY.cnpjLookupError}</span>
                    <button
                      type="button"
                      onClick={() => void lookupCnpj(cnpj)}
                      className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline"
                    >
                      <Icon icon="mdi:refresh" size={14} />
                      {COPY.cnpjRetry}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {COPY.cancel}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={busy || cnpjChecking}>
            {busy ? COPY.submitting : cnpjChecking ? COPY.submittingCnpj : COPY.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface IFieldProps {
  label: string;
  error?: string;
  colSpan?: 1 | 2;
  children: React.ReactNode;
}

function Field({ label, error, colSpan = 1, children }: IFieldProps) {
  return (
    <div className={`space-y-1 ${colSpan === 2 ? "col-span-2" : ""}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-[10px] text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verificar**

Run: `bunx tsc --noEmit`
Expected: zero erro novo.

Run: `bun run test`
Expected: suíte inteira verde (nenhum teste existente cobre este componente — verificação é por compilação + suíte geral não quebrada).

- [ ] **Step 3: Commit**

```bash
git add src/features/leads/components/ConvertLeadModal.tsx
git commit -m "$(cat <<'EOF'
feat(leads): enrich B2B lead conversion with Receita Federal autofill

CNPJ lookup now also attaches the registered address to the new
customer and warns (non-blocking) when the CNPJ's situacao cadastral
isn't ATIVA.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Vincular lead a cliente existente

**Files:**
- Modify: `src/features/leads/components/ConvertLeadModal.tsx` (arquivo inteiro — resultado da Task 4, ~330 linhas)

**Interfaces:**
- Consumes: `customersProvider.list({ storeId, search, pageSize })` (contrato já existente, `src/providers/data/contracts/customers.ts`), `useDebounce` (já importado na Task 4), `LEADS_STRINGS.convertModal` (Task 3: `modeLabel`, `modeNew`, `modeLink`, `descriptionLink`, `searchLabel`, `searchPlaceholder`, `searchHint`, `searchNoResults`, `changeCustomer`, `successToastLinked`).
- Produces: mesmo `ConvertLeadModal` exportado, mesma prop interface — nenhum consumidor externo muda.

- [ ] **Step 1: Substituir o conteúdo do arquivo**

```tsx
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { ICustomer, ID, ILead } from "@/shared/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Icon } from "@/components/Icon";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { useLeadsProvider } from "@/providers/data/hooks/useLeadsProvider";
import { useAuth } from "@/features/auth/useAuth";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { useDebounce } from "@/shared/hooks/useDebounce";
import { formatCnpj, isValidCnpj, onlyDigits } from "@/features/customers/utils/cnpjCpf";
import { isSituacaoAtiva } from "@/features/customers/utils/minhaReceitaMapper";
import { useMinhaReceita } from "@/features/customers/hooks/useMinhaReceita";
import { usePipelineSettings } from "../hooks/usePipelineSettings";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { CLOSING_STAGE_ID } from "../utils/leadDisplay";
import { LEADS_STRINGS } from "../i18n/pt-BR";

const COPY = LEADS_STRINGS.convertModal;

type CustomerType = "B2B" | "B2C";
type ConvertMode = "new" | "link";

/** Visual validation state for the CNPJ field (drives icon + message). */
type CnpjFieldState = "idle" | "checking" | "valid" | "invalid" | "warning";

export interface IConvertLeadModalProps {
  lead: ILead | null;
  onClose: () => void;
  onConverted?: (customerId: ID) => void;
}

export function ConvertLeadModal({ lead, onClose, onConverted }: IConvertLeadModalProps) {
  const customersProvider = useCustomersProvider();
  const leadsProvider = useLeadsProvider();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const { currentStoreId } = useCurrentStore();
  const { stages } = usePipelineSettings(currentStoreId);

  const [mode, setMode] = useState<ConvertMode>("new");
  const [type, setType] = useState<CustomerType>("B2C");
  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [query, setQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<ICustomer | null>(null);
  const [searchResults, setSearchResults] = useState<ICustomer[]>([]);
  const debouncedQuery = useDebounce(query, 400);

  const {
    lookup: lookupCnpj,
    reset: resetCnpj,
    status: cnpjStatus,
    data: cnpjData,
  } = useMinhaReceita();
  const debouncedCnpj = useDebounce(cnpj, 500);

  useEffect(() => {
    if (!lead) return;
    setMode("new");
    setType("B2C");
    setFullName(lead.name);
    setCpf("");
    setRazaoSocial("");
    setNomeFantasia(lead.name);
    setCnpj("");
    setContactName(lead.name);
    setEmail(lead.email ?? "");
    setErrors({});
    setQuery("");
    setSelectedCustomer(null);
    setSearchResults([]);
    resetCnpj();
  }, [lead, resetCnpj]);

  // CNPJ lookup against Minha Receita once a valid 14-digit number is typed.
  // Autofill only into empty fields so the seller's own input is never lost.
  // Gated on mode === "new": switching to "link" must stop background lookups.
  useEffect(() => {
    if (mode !== "new" || type !== "B2B") {
      resetCnpj();
      return;
    }
    const digits = onlyDigits(debouncedCnpj);
    if (digits.length !== 14 || !isValidCnpj(debouncedCnpj)) {
      resetCnpj();
      return;
    }
    let active = true;
    void lookupCnpj(debouncedCnpj).then((company) => {
      if (!active || !company) return;
      setRazaoSocial((prev) => (prev.trim() ? prev : company.razaoSocial));
      setNomeFantasia((prev) => (prev.trim() ? prev : company.nomeFantasia || company.razaoSocial));
    });
    return () => {
      active = false;
    };
  }, [mode, debouncedCnpj, type, lookupCnpj, resetCnpj]);

  // Server-side customer search, scoped to the lead's own store — only while
  // linking and only once selectedCustomer is cleared.
  useEffect(() => {
    if (mode !== "link" || !lead || selectedCustomer) {
      setSearchResults([]);
      return;
    }
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    let active = true;
    void customersProvider
      .list({ storeId: lead.storeId, search: q, pageSize: 8 })
      .then((res) => {
        if (active) setSearchResults(res.data);
      })
      .catch(() => {
        if (active) setSearchResults([]);
      });
    return () => {
      active = false;
    };
  }, [mode, lead, selectedCustomer, debouncedQuery, customersProvider]);

  const cnpjFieldState = useMemo<CnpjFieldState>(() => {
    if (mode !== "new" || type !== "B2B") return "idle";
    const digits = onlyDigits(cnpj);
    if (digits.length < 14) return "idle";
    if (!isValidCnpj(cnpj)) return "invalid";
    if (cnpjStatus === "loading") return "checking";
    if (cnpjStatus === "invalid") return "invalid";
    if (cnpjStatus === "error") return "warning";
    if (cnpjStatus === "success") return "valid";
    return "checking";
  }, [mode, type, cnpj, cnpjStatus]);

  const cnpjChecking = mode === "new" && type === "B2B" && cnpjStatus === "loading";

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (type === "B2C") {
      if (!fullName.trim()) next.fullName = COPY.requiredFullName;
      const digits = cpf.replace(/\D/g, "");
      if (digits.length !== 11) next.cpf = COPY.requiredCpf;
    } else {
      if (!razaoSocial.trim()) next.razaoSocial = COPY.requiredRazao;
      if (!nomeFantasia.trim()) next.nomeFantasia = COPY.requiredFantasia;
      if (!isValidCnpj(cnpj)) next.cnpj = COPY.requiredCnpj;
      else if (cnpjStatus === "invalid") next.cnpj = COPY.cnpjNotFound;
      if (!contactName.trim()) next.contactName = COPY.requiredContact;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!lead) return;
    if (!currentStoreId) return;

    if (mode === "link") {
      if (!selectedCustomer) return;
      setBusy(true);
      try {
        const closingStage = stages.find((s) => s.id === CLOSING_STAGE_ID) ?? lead.stage;
        await leadsProvider.update(lead.id, {
          stage: closingStage,
          convertedToCustomerId: selectedCustomer.id,
        });

        auditLog({
          action: "lead.converted",
          resource: "lead",
          resourceId: lead.id,
          before: { stageId: lead.stage.id },
          after: {
            stageId: closingStage.id,
            customerId: selectedCustomer.id,
            linkedExisting: true,
          },
        });

        toast.success(COPY.successToastLinked);
        await queryClient.invalidateQueries({ queryKey: ["leads-list"] });
        await queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
        onConverted?.(selectedCustomer.id);
      } catch {
        toast.error(COPY.errorToast);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!validate()) return;

    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const baseCustomer = {
        storeId: lead.storeId,
        sellerId: lead.sellerId,
        phone: lead.phone,
        email: email.trim() ? email.trim() : lead.email,
        status: "ativo" as const,
        tags: [...lead.tags],
        convertedFromLeadId: lead.id,
        convertedFromLeadAt: nowIso,
        convertedBySellerId: currentUser?.sellerId ?? lead.sellerId,
      };

      // Only attach the Receita address when it matches the CNPJ actually being
      // submitted — guards against a stale lookup from a CNPJ the seller edited afterward.
      const matchingAddress =
        cnpjData && cnpjData.cnpj === onlyDigits(cnpj) ? cnpjData.address : undefined;

      const customer =
        type === "B2B"
          ? await customersProvider.create({
              ...baseCustomer,
              type: "B2B",
              cnpj: onlyDigits(cnpj),
              razaoSocial: razaoSocial.trim(),
              nomeFantasia: nomeFantasia.trim(),
              contactName: contactName.trim(),
              ...(matchingAddress ? { address: matchingAddress } : {}),
            } as Omit<ICustomer, "id" | "createdAt" | "notes">)
          : await customersProvider.create({
              ...baseCustomer,
              type: "B2C",
              cpf: onlyDigits(cpf),
              fullName: fullName.trim(),
            } as Omit<ICustomer, "id" | "createdAt" | "notes">);

      const closingStage = stages.find((s) => s.id === CLOSING_STAGE_ID) ?? lead.stage;
      await leadsProvider.update(lead.id, {
        stage: closingStage,
        convertedToCustomerId: customer.id,
      });

      auditLog({
        action: "lead.converted",
        resource: "lead",
        resourceId: lead.id,
        before: { stageId: lead.stage.id },
        after: { stageId: closingStage.id, customerId: customer.id, type },
      });
      auditLog({
        action: "customer.created",
        resource: "customer",
        resourceId: customer.id,
        after: { from: "lead-conversion", leadId: lead.id, type },
      });

      toast.success(COPY.successToast);
      await queryClient.invalidateQueries({ queryKey: ["leads-list"] });
      await queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
      await queryClient.invalidateQueries({ queryKey: ["customers-list"] });
      onConverted?.(customer.id);
    } catch {
      toast.error(COPY.errorToast);
    } finally {
      setBusy(false);
    }
  };

  const submitDisabled = busy || cnpjChecking || (mode === "link" && !selectedCustomer);

  return (
    <Dialog open={lead !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{COPY.title}</DialogTitle>
          <DialogDescription>{mode === "link" ? COPY.descriptionLink : COPY.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{COPY.modeLabel}</Label>
            <RadioGroup
              value={mode}
              onValueChange={(v) => {
                setMode(v as ConvertMode);
                setErrors({});
              }}
              className="grid grid-cols-2 gap-2"
            >
              <label className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                <RadioGroupItem value="new" id="convert-mode-new" />
                {COPY.modeNew}
              </label>
              <label className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                <RadioGroupItem value="link" id="convert-mode-link" />
                {COPY.modeLink}
              </label>
            </RadioGroup>
          </div>

          {mode === "link" ? (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{COPY.searchLabel}</Label>
              {selectedCustomer ? (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {selectedCustomer.type === "B2B"
                        ? selectedCustomer.nomeFantasia || selectedCustomer.razaoSocial
                        : selectedCustomer.fullName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {selectedCustomer.type === "B2B"
                        ? `CNPJ ${selectedCustomer.cnpj}`
                        : `CPF ${selectedCustomer.cpf}`}{" "}
                      · {selectedCustomer.phone}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-xs font-medium text-primary hover:underline"
                    onClick={() => {
                      setSelectedCustomer(null);
                      setQuery("");
                    }}
                  >
                    {COPY.changeCustomer}
                  </button>
                </div>
              ) : (
                <>
                  <Input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={COPY.searchPlaceholder}
                  />
                  {query.trim().length > 0 && query.trim().length < 2 && (
                    <p className="text-[10px] text-muted-foreground">{COPY.searchHint}</p>
                  )}
                  {debouncedQuery.trim().length >= 2 && (
                    <div className="max-h-56 overflow-y-auto rounded-md border border-border">
                      {searchResults.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-muted-foreground">
                          {COPY.searchNoResults}
                        </p>
                      ) : (
                        searchResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted"
                            onClick={() => setSelectedCustomer(c)}
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {c.type === "B2B" ? c.nomeFantasia || c.razaoSocial : c.fullName}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {c.type === "B2B" ? c.cnpj : c.cpf}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{COPY.typeLabel}</Label>
                <RadioGroup
                  value={type}
                  onValueChange={(v) => setType(v as CustomerType)}
                  className="grid grid-cols-2 gap-2"
                >
                  <label className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                    <RadioGroupItem value="B2C" id="convert-b2c" />
                    {COPY.typeB2C}
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                    <RadioGroupItem value="B2B" id="convert-b2b" />
                    {COPY.typeB2B}
                  </label>
                </RadioGroup>
              </div>

              {type === "B2C" ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label={COPY.fullName} error={errors.fullName} colSpan={2}>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </Field>
                  <Field label={COPY.cpf} error={errors.cpf}>
                    <Input
                      value={cpf}
                      onChange={(e) => setCpf(e.target.value)}
                      placeholder={COPY.cpfPlaceholder}
                    />
                  </Field>
                  <Field label={COPY.email}>
                    <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                  </Field>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={COPY.razaoSocial} error={errors.razaoSocial} colSpan={2}>
                      <Input
                        value={razaoSocial}
                        onChange={(e) => setRazaoSocial(e.target.value)}
                        placeholder={COPY.razaoSocialPlaceholder}
                      />
                    </Field>
                    <Field label={COPY.nomeFantasia} error={errors.nomeFantasia} colSpan={2}>
                      <Input
                        value={nomeFantasia}
                        onChange={(e) => setNomeFantasia(e.target.value)}
                        placeholder={COPY.nomeFantasiaPlaceholder}
                      />
                    </Field>
                    <Field label={COPY.cnpj} error={errors.cnpj}>
                      <div className="relative">
                        <Input
                          className="pr-9"
                          value={cnpj}
                          aria-invalid={cnpjFieldState === "invalid"}
                          aria-describedby="convert-cnpj-msg"
                          onChange={(e) => setCnpj(formatCnpj(e.target.value))}
                          placeholder={COPY.cnpjPlaceholder}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                          {cnpjFieldState === "checking" && (
                            <Icon
                              icon="mdi:loading"
                              size={16}
                              className="animate-spin text-muted-foreground motion-reduce:animate-none"
                            />
                          )}
                          {cnpjFieldState === "valid" && (
                            <Icon icon="mdi:check-circle" size={16} className="text-success" />
                          )}
                          {cnpjFieldState === "invalid" && (
                            <Icon icon="mdi:alert-circle" size={16} className="text-destructive" />
                          )}
                          {cnpjFieldState === "warning" && (
                            <Icon icon="mdi:cloud-alert-outline" size={16} className="text-warning" />
                          )}
                        </span>
                      </div>
                    </Field>
                    <Field label={COPY.contactName} error={errors.contactName}>
                      <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
                    </Field>
                    <Field label={COPY.email} colSpan={2}>
                      <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                    </Field>
                  </div>

                  <div id="convert-cnpj-msg" aria-live="polite" className="space-y-1.5">
                    {cnpjFieldState === "checking" && (
                      <p className="text-xs text-muted-foreground">{COPY.cnpjChecking}</p>
                    )}
                    {cnpjFieldState === "valid" && cnpjData && (
                      <p className="inline-flex flex-wrap items-center gap-1.5 rounded-md bg-success/10 px-2.5 py-1.5 text-xs text-success">
                        <Icon icon="mdi:office-building-outline" size={14} />
                        <span className="font-medium">{cnpjData.razaoSocial}</span>
                        {cnpjData.address && (
                          <span className="text-success/80">
                            · {cnpjData.address.city}/{cnpjData.address.state}
                          </span>
                        )}
                      </p>
                    )}
                    {cnpjFieldState === "valid" &&
                      cnpjData?.situacaoCadastral &&
                      !isSituacaoAtiva(cnpjData.situacaoCadastral) && (
                        <p className="flex items-center gap-1.5 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
                          <Icon icon="mdi:alert-outline" size={14} />
                          {COPY.cnpjSituacaoWarning(cnpjData.situacaoCadastral)}
                        </p>
                      )}
                    {cnpjFieldState === "warning" && (
                      <div className="flex flex-wrap items-center gap-2 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
                        <Icon icon="mdi:cloud-alert-outline" size={14} />
                        <span>{COPY.cnpjLookupError}</span>
                        <button
                          type="button"
                          onClick={() => void lookupCnpj(cnpj)}
                          className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline"
                        >
                          <Icon icon="mdi:refresh" size={14} />
                          {COPY.cnpjRetry}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {COPY.cancel}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitDisabled}>
            {busy ? COPY.submitting : cnpjChecking ? COPY.submittingCnpj : COPY.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface IFieldProps {
  label: string;
  error?: string;
  colSpan?: 1 | 2;
  children: React.ReactNode;
}

function Field({ label, error, colSpan = 1, children }: IFieldProps) {
  return (
    <div className={`space-y-1 ${colSpan === 2 ? "col-span-2" : ""}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-[10px] text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verificar**

Run: `bunx tsc --noEmit`
Expected: zero erro novo.

Run: `bun run test`
Expected: 287+ arquivos passando, nenhuma regressão.

- [ ] **Step 3: Commit**

```bash
git add src/features/leads/components/ConvertLeadModal.tsx
git commit -m "$(cat <<'EOF'
feat(leads): link a lead to an existing customer instead of duplicating

Adds a mode toggle to ConvertLeadModal — "Vincular a cliente
existente" searches customers.list scoped to the lead's store and,
on submit, only patches the lead (stage + convertedToCustomerId). The
selected customer is never written to, since customers_update RLS
requires the caller to already own that customer's wallet.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Verificação final (após a Task 5)

- [ ] Rodar a suíte completa: `bun run test` — esperado 100% verde, incluindo os novos testes do mapper.
- [ ] Rodar `bunx tsc --noEmit` — nenhum erro novo introduzido pelos 4 arquivos tocados (comparar contra a baseline pré-existente, se houver).
- [ ] Conferir manualmente (dono) no navegador: modal abre em "Criar novo cliente" por padrão; digitar um CNPJ real autopreenche razão social/nome fantasia + mostra cidade/UF; um CNPJ de empresa baixada mostra o alerta âmbar; alternar para "Vincular a cliente existente" busca e permite selecionar um cliente da mesma loja; converter nesse modo não cria cliente novo e não altera o cliente selecionado (conferir na ficha dele que nada mudou).

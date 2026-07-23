# Enriquecimento por CNPJ no editor inline de clientes — Design

**Data:** 2026-07-23 · **Branch:** `worktree-customer-cnpj-enrich` · **Base:** merge #364 (edição inline de clientes). **Solicitação:** "coloca um botão do lado [do CNPJ] para chamada de API para validação e preenchimento automático dos campos" (print do editor inline B2B aberto).

## Contexto

- O merge #364 entregou a **edição inline** dos dados cadastrais no `CadastraisCard` (aba Visão geral da página de detalhe). No modo B2B o editor mostra razão social, nome fantasia, **CNPJ**, contato, e-mail e endereço.
- O projeto **já tem** a infraestrutura de consulta/enriquecimento por CNPJ contra a **Minha Receita** (`https://minhareceita.org`, espelho aberto da Receita Federal, sem API key):
  - `src/features/customers/hooks/useMinhaReceita.ts` — hook `lookup(rawCnpj) → ICnpjCompany | null` com estados `idle|loading|success|invalid|error`, AbortController + timeout de 8s, tolerante a CORS/offline.
  - `src/features/customers/utils/minhaReceitaMapper.ts` — mapper puro `mapMinhaReceitaResponse` → `ICnpjCompany` (`razaoSocial`, `nomeFantasia`, `situacaoCadastral`, `address`), `isSituacaoAtiva`, `formatCep`.
  - Já usado **em produção** pelo `ConvertLeadModal` (PRs #350/#351) — o padrão de UX (badge de situação cadastral, autofill) está estabelecido lá.
- Diferença de UX pedida: o ConvertLeadModal faz lookup **automático** (debounce ao digitar). Aqui o dono quer um **botão explícito** ao lado do CNPJ. É mais simples e mais previsível — nada de rede enquanto se digita.

## Decisão

**Botão explícito de enriquecimento no editor inline B2B**, reutilizando a infra existente sem criar hook/mapper novos.

### Gatilho e layout

- No `EditView` do `CadastraisCard` (só quando `type === "B2B"`), o campo CNPJ passa a ser `input + botão` lado a lado. O botão ("Buscar na Receita", ícone `mdi:cloud-search-outline` / spinner `mdi:loading` em loading) fica à direita do input.
- **Habilitado** só quando `isValidCnpj(draft.cnpj)` (checksum válido, 14 dígitos). Desabilitado caso contrário e enquanto `loading`. Como o `title` não aparece em botão desabilitado, o hint ("Informe um CNPJ válido…") é renderizado como texto inline abaixo do campo quando o botão está desabilitado e não há erro de validação em exibição.

### Fluxo

1. Clique → `useMinhaReceita().lookup(onlyDigits(draft.cnpj))`.
2. Estados:
   - `loading` → botão vira spinner, desabilitado.
   - `success` → aplica `applyCnpjCompanyToDraft(draft, company)` ao draft; toast de sucesso; renderiza um **badge de situação cadastral** abaixo do campo (verde se `isSituacaoAtiva`, âmbar caso contrário, com o texto da situação — ex.: "BAIXADA").
   - `invalid` (404) → toast "CNPJ não encontrado na Receita."; não altera o draft.
   - `error` (rede/CORS/timeout) → toast "Não foi possível consultar a Receita agora."; não altera o draft.

### `applyCnpjCompanyToDraft(draft, company): ICustomerDraft` (função pura, testada)

Como é o editor inline (nada persiste até **Salvar**), o botão **sobrescreve** com os dados oficiais e o usuário revisa/ajusta antes de salvar. Regras (evitam apagar dado bom com vazio):

| Campo | Regra |
|---|---|
| `razaoSocial` | sempre que `company.razaoSocial` não-vazio (a Receita sempre traz) |
| `nomeFantasia` | só se `company.nomeFantasia` não-vazio; senão **mantém** o valor atual do draft |
| endereço (`street/number/complement/district/city/state/zipCode`) | só se `company.address` presente; sobrescreve todos os subcampos (CEP mascarado via `formatCep`, UF uppercase); senão **mantém** o endereço atual |
| `cnpj`, `contactName`, `email`, `fullName`, `cpf` | **nunca** tocados (CNPJ é a chave da busca; contato/e-mail a Receita não fornece de forma confiável; telefone não é editável) |

A função vive em `src/features/customers/utils/customerDraft.ts` (junto do resto do modelo de draft) e recebe/retorna `ICustomerDraft` — reaproveita `formatCep` já exportado ali.

### Erros e concorrência

- O `useMinhaReceita` já cancela requests in-flight (AbortController) e trata timeout/superseded — reutilizado tal e qual.
- O enriquecimento **não salva** — só popula o draft. O gate de salvar (RLS staff/dono) e o `buildCustomerPatch` (diff só dos campos alterados) do #364 seguem intactos: o patch conterá exatamente o que o enriquecimento mudou.
- Se o usuário editar o CNPJ depois de buscar, o badge de situação persiste até nova busca/limpeza — aceitável (mesmo comportamento tolerante do ConvertLeadModal).

### Testes

- `customerDraft.test.ts`: `applyCnpjCompanyToDraft` — sobrescreve razão social; nome fantasia vazio da API **não** apaga o atual; endereço aplicado com CEP mascarado/UF uppercase; sem `company.address` mantém endereço atual; nunca toca cnpj/contato/email.
- Gate de CI: `bun run test` + `bun run build`; `tsc --noEmit` por delta.

### Fora de escopo (YAGNI)

- Lookup automático com debounce (o dono pediu botão explícito).
- Enriquecimento de B2C (CPF não tem serviço público equivalente).
- Persistir `situacaoCadastral` no cliente (é sinal de tela, não campo do modelo).
- Preencher contato/e-mail (a Receita não fornece de forma confiável; o mapper atual não os expõe).

### Assunções explícitas (sessão autônoma)

1. "Preenchimento automático dos campos" = razão social + nome fantasia + endereço (o que a Receita fornece). Contato/e-mail ficam de fora.
2. Sobrescrever (não só-preencher-vazio), porque é ação explícita num editor com revisão antes de salvar. Reversível: o usuário ajusta ou cancela.
3. Reutiliza `useMinhaReceita`/`minhaReceitaMapper` sem alterá-los.

# Conversão de lead em cliente — autofill CNPJ (Receita Federal) + vínculo a cliente existente

**Data:** 2026-07-21 · **Status:** design aprovado pelo dono (sessão 2026-07-21)
**Branch:** `worktree-lead-convert-cnpj-link`

## 1. Contexto e problema

O modal "Converter lead em cliente" (`src/features/leads/components/ConvertLeadModal.tsx`) hoje só sabe fazer uma coisa: criar um `ICustomer` novo a partir dos dados digitados manualmente pelo vendedor. Isso gera dois atritos observados pelo dono:

1. **Digitação manual de dados de empresa (B2B)** — razão social, nome fantasia (e, potencialmente, endereço) já existem publicamente na Receita Federal; o vendedor os redigita à mão.
2. **Nenhum caminho para reaproveitar um cliente já cadastrado** — se o lead na verdade é (ou virou) alguém que já é cliente da loja, a única opção hoje é criar um registro **duplicado**.

Esta spec cobre as duas lacunas dentro do mesmo modal.

## 2. Descobertas do código existente (o que já resolve parte do problema)

- **`useMinhaReceita`** (`src/features/customers/hooks/useMinhaReceita.ts`) já consulta a API pública Minha Receita (espelho do dataset aberto da Receita Federal, sem API key) e já é usado por `NewCustomerModal` e `RegisterPage` (storefront) — mas só extrai `razao_social`/`nome_fantasia`. Endereço e situação cadastral **não** são extraídos hoje em lugar nenhum do app.
- **Busca de cliente server-side** já existe e é usada em produção: `customersProvider.list({ storeId, search, pageSize })` (ver `NewConversationDialog.tsx`), com paridade mock↔supabase (`buildCustomerSearchOr` no supabase, filtro equivalente no mock).
- **Trava de RLS que molda o design do "vincular"**: a policy `customers_update` exige `is_staff() OR seller_id = current_seller_id()`. Se um vendedor não-staff tentasse gravar qualquer coisa num cliente que já pertence à carteira de outro vendedor, levaria 403. **Logo: vincular a um cliente existente NUNCA escreve no registro do cliente** — só no lead. Isso elimina de saída qualquer necessidade de gating extra ou RPC nova.

## 3. Decisões (confirmadas com o dono, 2026-07-21)

| # | Decisão | Escolha |
|---|---------|---------|
| D1 | Escopo do autofill de CNPJ | Nome (razão social/fantasia) **+ endereço completo** anexado ao cliente na criação **+ alerta** se a situação cadastral não for "ATIVA". Endereço **não** vira campos de input novos no modal — é anexado em segundo plano; o modal mostra só um resumo (cidade/UF) para conferência visual. |
| D2 | Mutação do cliente ao vincular a um existente | **Nenhuma.** O modal só atualiza o `lead` (`stage` + `convertedToCustomerId`). O cliente selecionado fica 100% intocado — decisão reforçada pela trava de RLS (§2). |
| D3 | Layout da escolha "novo" vs "existente" | Dois modos no topo do modal, via `RadioGroup` (mesmo estilo do radio B2B/B2C atual): `Criar novo cliente` (default) / `Vincular a cliente existente`. |

## 4. Modelo de dados — `ICnpjCompany` (expansão não-quebradora)

```ts
export interface ICnpjCompany {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  /** "ATIVA" | "BAIXADA" | "SUSPENSA" | "INAPTA" | "NULA" | outros valores da Receita. */
  situacaoCadastral?: string;
  address?: {
    street: string;      // logradouro + numero
    number: string;
    complement?: string; // complemento
    district: string;    // bairro
    city: string;        // municipio
    state: string;       // uf
    zipCode: string;      // cep, formatado 00000-000
  };
}
```

Campos novos são opcionais — consumidores existentes (`NewCustomerModal`, `RegisterPage`) continuam funcionando sem alteração, pois ignoram os campos que não leem.

### 4.1 Mapeamento (função pura, testável)

Novo arquivo `src/features/customers/utils/minhaReceitaMapper.ts`:

```ts
export function mapMinhaReceitaResponse(raw: IMinhaReceitaRawResponse): ICnpjCompany
export function isSituacaoAtiva(situacao: string | undefined): boolean
```

Campos brutos confirmados via chamada real à API (`GET https://minhareceita.org/{cnpj}`):
`razao_social`, `nome_fantasia`, `descricao_situacao_cadastral`, `logradouro`, `numero`, `complemento`, `bairro`, `municipio`, `uf`, `cep`.

- `zipCode` é formatado para `00000-000` (mesmo padrão usado pelos geradores mock — `src/mocks/generators/customer.ts`).
- Linha de endereço só é montada quando `logradouro`/`municipio`/`uf` vierem preenchidos (senão `address` fica `undefined` — não se cria endereço parcial/quebrado).
- `isSituacaoAtiva` retorna `true` só quando a descrição normalizada for exatamente `"ATIVA"`.

`useMinhaReceita.ts` passa a chamar `mapMinhaReceitaResponse` em vez de montar o objeto inline — o hook fica só com a orquestração de rede (abort/timeout/estados), e o parsing vira testável sem mockar `fetch`.

## 5. UI — `ConvertLeadModal.tsx`

### 5.1 Toggle de modo (novo, no topo)

```
Tipo de conversão
( ) Criar novo cliente          ( ) Vincular a cliente existente
```

- Estado novo: `mode: "new" | "link"`, default `"new"`.
- Trocar de modo reseta erros e a seleção de cliente (mesma lógica de "trocar de tipo limpa erros" que já existe para B2B/B2C).
- O formulário abaixo do toggle é condicional a `mode`.

### 5.2 Modo "Criar novo cliente" (existente + autofill)

Mantém o formulário atual (radio B2C/B2B, campos por tipo). Mudanças:

- Quando `type === "B2B"`, ao digitar um CNPJ com checksum local válido (`isValidCnpj`), dispara `lookupCnpj` (debounce 500ms via `useDebounce`, mesmo padrão do `NewCustomerModal`).
- Autofill só em campos vazios: `razaoSocial`, `nomeFantasia` (nunca sobrescreve o que o vendedor já digitou).
- Indicador visual no campo CNPJ (ícone + mensagem), reaproveitando os 4 estados já usados no `NewCustomerModal`: `checking` (spinner) / `valid` (check verde) / `invalid` (alerta vermelho — bloqueia submit) / `warning` (nuvem âmbar, falha de rede — **não** bloqueia submit, com link "Tentar novamente").
- Cartão de confirmação verde (quando `status === "success"`): nome da empresa **+ cidade/UF** do endereço retornado (quando presente).
- Alerta âmbar adicional, não-bloqueante, quando `cnpjData.situacaoCadastral` existir e `!isSituacaoAtiva(...)`: *"CNPJ com situação **{situacaoCadastral}** na Receita Federal."* — some assim que a Situação voltar a ser "ATIVA" numa nova consulta.
- No `handleSubmit`, quando `type === "B2B"` e `cnpjData?.address` estiver presente, o `address` é incluído no payload de `customersProvider.create(...)` (silenciosamente — sem novos inputs no modal).
- Submit continua bloqueado só por: CPF/CNPJ com checksum inválido, CNPJ retornando 404 na Receita (`cnpjStatus === "invalid"`), campos obrigatórios vazios — igual ao comportamento atual, `warning` nunca bloqueia.

### 5.3 Modo "Vincular a cliente existente" (novo)

```
Buscar cliente por nome, CNPJ/CPF ou telefone…
[resultados clicáveis, até 8]
```

- Estado: `query`, `debouncedQuery` (`useDebounce`, 400ms), `results: ICustomer[]`, `selectedCustomer: ICustomer | null`.
- Busca dispara só com `debouncedQuery.trim().length >= 2`, via `customersProvider.list({ storeId: lead.storeId, search: debouncedQuery, pageSize: 8 })` — **restrita à loja do lead** (multi-loja: um cliente de outra loja não deve fechar este lead).
- Resultado clicado → vira `selectedCustomer`; a busca fecha e mostra um chip: nome + documento (CNPJ/CPF) + telefone + tipo (B2B/B2C), com botão "Trocar" (limpa a seleção e reabre a busca) — mesmo padrão visual do `CustomerAutocomplete` (`src/features/quotes/components/new/CustomerAutocomplete.tsx`), reimplementado inline (sem importar entre features) para manter a busca restrita por `storeId` server-side em vez do fetch-500-e-filtra-client-side daquele componente.
- Botão "Converter" fica **desabilitado** enquanto `selectedCustomer === null`.

### 5.4 `handleSubmit` — ramificação por modo

```ts
if (mode === "link") {
  if (!selectedCustomer) return;
  const closingStage = stages.find(s => s.id === CLOSING_STAGE_ID) ?? lead.stage;
  await leadsProvider.update(lead.id, {
    stage: closingStage,
    convertedToCustomerId: selectedCustomer.id,
  });
  auditLog({
    action: "lead.converted",
    resource: "lead",
    resourceId: lead.id,
    before: { stageId: lead.stage.id },
    after: { stageId: closingStage.id, customerId: selectedCustomer.id, linkedExisting: true },
  });
  toast.success(COPY.successToastLinked);
  await queryClient.invalidateQueries({ queryKey: ["leads-list"] });
  await queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
  onConverted?.(selectedCustomer.id);
  return;
}
// mode === "new": fluxo atual (customersProvider.create + auditLog "customer.created" + invalidação de customers-list)
```

Note que o modo "link" **não** invalida `["customers-list"]` (nenhum cliente foi criado ou alterado) e **não** emite o audit `customer.created`.

## 6. i18n (`src/features/leads/i18n/pt-BR.ts`, dentro de `convertModal`)

Novas chaves: `modeLabel` ("Tipo de conversão"), `modeNew` ("Criar novo cliente"), `modeLink` ("Vincular a cliente existente"), `searchPlaceholder` ("Buscar cliente por nome, CNPJ/CPF ou telefone…"), `searchNoResults`, `changeCustomer` ("Trocar"), `requiredCustomer` (guarda de submit, não exibida como erro de campo — só desabilita o botão), `successToastLinked` ("Lead vinculado ao cliente existente."), `cnpjSituacaoWarning(situacao: string)`.

## 7. Testes

- **`src/features/customers/utils/minhaReceitaMapper.test.ts`** (TDD, pure, sem rede):
  - mapeia uma resposta completa (todos os campos) → `ICnpjCompany` com `address` preenchido;
  - resposta sem `logradouro`/`municipio`/`uf` → `address` fica `undefined`;
  - `isSituacaoAtiva("ATIVA")` → `true`; qualquer outro valor (incl. `undefined`) → `false`.
- `bun run test` (suíte completa) deve continuar 100% verde — baseline já confirmada (287 arquivos / 2236 testes) na worktree antes de qualquer mudança.
- Sem migration/RLS nova ⇒ sem novo caso em `supabase/tests/rls-regression.sql`.

## 8. Fora de escopo (YAGNI)

- Campos de endereço editáveis inline no modal (fica para uma tela de edição futura, se pedido).
- Reassociar `sellerId`/carteira do cliente ao vincular (é uma operação de transferência de carteira deliberada, já existente como feature própria — não um efeito colateral da conversão).
- Alertar sobre divergência de telefone/nome entre o lead e o cliente selecionado.
- Desfazer um vínculo já feito (edição do `convertedToCustomerId` depois de salvo).
- Estender o autofill enriquecido (endereço + situação) para `NewCustomerModal`/`RegisterPage` — só o `ConvertLeadModal` ganha o comportamento novo nesta entrega; os outros dois continuam como estão (a expansão do hook é retro-compatível, então isso é só uma limitação de escopo, não uma restrição técnica).

## 9. Arquivos afetados

- `src/features/customers/hooks/useMinhaReceita.ts` — usa o mapper novo, `ICnpjCompany` expandido.
- `src/features/customers/utils/minhaReceitaMapper.ts` (novo) + `.test.ts` (novo).
- `src/features/leads/components/ConvertLeadModal.tsx` — toggle de modo, autofill CNPJ, busca/vínculo.
- `src/features/leads/i18n/pt-BR.ts` — novas chaves em `convertModal`.

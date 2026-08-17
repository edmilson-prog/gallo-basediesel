# PRD-216: Notas Fiscais de Entrada (`Tally`)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | (mesmo da Fase 1/2) |
| **Codinome** | `Tally` — o ato de conferir a mercadoria contra o documento |
| **Objetivo** | Implantar o ciclo completo da nota fiscal de entrada: XML da NF-e entra por quatro origens, o fornecedor é vinculado pelo CNPJ ou criado do próprio XML, a nota fica **em conferência** para vínculo item a item (com conversão de unidade e fracionamento), e o **lançamento** produz efeito real em estoque, custo médio e regras aprendidas por fornecedor |
| **Tipo** | Feature (subsistema novo) |
| **Complexidade** | Alta |
| **Total de Fases** | 4 (uma PR por fase) |
| **Prioridade** | Alta (P1) |
| **Épico** | Suprimentos |
| **Nº do PRD** | 216 — próximo livre após o lote 211–215 |
| **PRDs Relacionados** | PRD-052 (movimentação de estoque — ativa o tipo `entrada_compra` reservado), PRD-201 (estoque crítico — propõe a entidade `Supplier`, aqui materializada), PRD-005 (Provider Pattern), PRD-007 (multi-loja), PRD-006 (RBAC: recurso `supplies`), PRD-127/128/129 (NF-e de **saída** — não confundir) |
| **Fonte da verdade (design)** | Claude Design · projeto `0dddcf0e-782d-4f2e-be6c-0a094c427bbe` · `ui_kits/notas/` |
| **Padrão de código** | Feature-based; código em `src/features/fiscal-notes/`; lógica de negócio em `engine/` com Vitest |
| **Implementação** | 🔵 Claude Code CLI |

### Critérios de Complexidade Utilizados

> **Justificativa de Alta:** subsistema inteiramente novo — sete tabelas, RLS em todas, quatro telas, um parser de XML fiscal que precisa rodar em dois runtimes (browser e Deno), uma RPC transacional que muta catálogo e custo, um motor de sugestão em cascata com fallback de LLM, e quatro origens de ingestão distintas (duas das quais nascem desligadas por falta de credencial). Nada disso existe hoje: o repositório não tem tabela de fornecedor, de nota fiscal nem de contas a pagar.

---

## Contexto do Problema

A GALLO recebe mercadoria de fornecedores diariamente, e hoje **nada disso passa pela plataforma**. O XML da NF-e chega por e-mail, alguém confere no papel, e o lançamento acontece no DINTEC. A consequência é que o cérebro comercial não sabe o que entrou: o custo médio das peças não acompanha a compra, o catálogo não aprende o código do fornecedor, e a movimentação de estoque só enxerga a saída.

Essa lacuna está registrada no próprio código como dívida planejada. Em `src/shared/types/inventory-movement.ts`, o tipo `entrada_compra` e o campo `invoiceNumber` existem desde o PRD-052 marcados como **Fase 2** — "activate once the DINTEC ERP integration lands". Nunca ativaram. Em `src/shared/types/catalog.ts`, `IPart.suppliers[]` (com `invoiceNumber`, `invoiceDate`, `quantity`, `cost`), `IPart.fiscal` (NCM, ICMS, ST) e `IPart.averageCost` estão modelados e vazios — o formato do dado existe, o produtor não.

Este PRD é a Fase 2 desenhada, e ela não depende do DINTEC: a nota de entrada vira a origem do dado.

### O problema por trás do problema

Três atritos operacionais que a conferência manual não resolve e que definem o desenho:

1. **A unidade da nota não é a unidade do estoque.** O fornecedor fatura caixa com 12; a loja vende unidade. Sem conversão, o saldo entra errado por um fator inteiro.
2. **A compra é em volume, a venda é em fração.** Balde de 20 L de óleo vira litro a granel; tambor de 200 L de Arla vira bombona de 20 L; balde de 20 kg de graxa vira pote de 1 kg. O estoque precisa receber o que a loja vende, não o que o caminhão trouxe.
3. **O custo que importa não é o `vUnCom` da nota.** Frete e IPI precisam ser rateados por valor entre os itens, senão a margem é calculada sobre um custo mentiroso.

---

## Conceito da Solução

### Situação Atual (As-Is)

- Nenhuma tabela de fornecedor, nota fiscal ou título a pagar nas 242 migrations existentes.
- `deriveInventoryMovements` deriva apenas `saida_venda` e `devolucao`, a partir de pedidos. O ledger nunca é persistido — é lido, não gravado.
- `IPart.suppliers[]`, `IPart.fiscal` e `IPart.averageCost` existem no tipo e são populados só pelo gerador de mocks.
- Não há grupo **Suprimentos** na navegação.

### Situação Desejada (To-Be)

Grupo **SUPRIMENTOS** novo na sidebar, entre Comercial e Gestão, com quatro telas:

| Tela | Rota | O que faz |
|------|------|-----------|
| **Notas de entrada** | `/app/suprimentos/notas` | Uma linha por nota: fornecedor, emissão/entrada, itens, valor, duplicatas, situação. KPIs do mês no topo. Nota em conferência abre a Entrada; nota lançada abre o resumo do que ela produziu. |
| **Importar XML** | `/app/suprimentos/importar` | Fila de XML com processamento passo a passo, vínculo/criação do fornecedor pelo CNPJ, contagem de vínculos por tipo. **Importar nunca lança.** |
| **Entrada de nota** | `/app/suprimentos/entrada/$id` | A conferência item a item: vínculo, conversão de unidade, fracionamento. `Lançar entrada` só habilita com tudo conferido. |
| **Análise IA** | `/app/suprimentos/analise` | Cards do que a análise viu: desvio de preço, economia de embalagem, NCM divergente, cadastro incompleto, fracionamento por giro, chave duplicada. |

### O fluxo em uma linha

XML → **importar** (fornecedor vinculado pelo CNPJ ou criado do próprio `<emit>`) → nota **em conferência** (vínculo item a item + conversão/fracionamento) → **lançar** (saldo convertido no estoque + custo médio recalculado + regras salvas para o fornecedor + duplicatas gravadas).

### Decisões de produto herdadas do kit

- **Importar ≠ lançar.** O XML entra sozinho, mas estoque e custo só mudam com conferência humana. A IA sugere com evidência e grau de confiança; nunca aplica.
- **Fornecedor criado nasce incompleto de propósito.** Razão social, CNPJ, IE e endereço vêm do XML; contato e categoria não vêm, então ficam vazios em vez de inventados.
- **Nota lançada é imutável.** Corrigir é estornar — o estorno desfaz o efeito e devolve a nota para conferência.
- **Vermelho só para o que bloqueia** (item sem vínculo, fator de conversão indefinido). A ação primária carrega o dourado.

---

## Arquitetura

### Onde o código vive

```
src/features/fiscal-notes/
├── engine/                     lógica pura, testada com Vitest
│   ├── nfeParser.ts            XML NF-e 4.00 → objeto tipado (SEM dependência de DOM)
│   ├── nfeKey.ts               validação da chave de 44 dígitos (DV módulo 11)
│   ├── costAllocation.ts       rateio de frete/IPI/desconto por valor do item
│   ├── unitConversion.ts       direto · converter · fracionar → qtd/unidade/custo de estoque
│   ├── averageCost.ts          custo médio ponderado contra o saldo existente
│   ├── itemMatcher.ts          cascata determinística de sugestão de vínculo
│   └── analysis.ts             os seis cards da Análise
├── api/                        mutations (importar, conferir, lançar, estornar)
├── hooks/                      TanStack Query
├── components/                 tabela, gaveta do item, fila, cards
├── pages/                      as quatro telas
├── i18n/pt-BR.ts
└── index.ts                    barrel
```

### O parser precisa rodar em dois runtimes

As quatro origens de ingestão compartilham **um** parser. Duas delas rodam no navegador, duas em Edge Function (Deno). **Deno não expõe `DOMParser`**, então o parser não pode depender de DOM: é um leitor de XML próprio, sem dependência externa, escrito em TypeScript puro.

O espelhamento segue o padrão já consolidado no repositório — `scripts/sync-fiscal-shared.ts` copia `engine/{nfeParser,nfeKey,costAllocation,unitConversion}.ts` para `supabase/functions/_shared/fiscal/`, exatamente como `sync-whatsapp-shared.ts`, `sync-sdr-shared.ts`, `sync-business-hours-shared.ts` e `sync-conversation-rescue-shared.ts` já fazem.

> ⚠️ Mexeu em `src/features/fiscal-notes/engine/`? Rode o script de sync e redeploye as Edge Functions afetadas.

### As quatro origens

Uma fila (`fiscal_note_ingestion_queue`), quatro produtores:

| # | Origem | Onde parseia | Estado na entrega |
|---|--------|--------------|-------------------|
| 1 | **Upload manual** | navegador | ✅ **padrão, ligado** |
| 2 | **Upload com parse na Edge** | Edge Function `fiscal-note-import` | ✅ ligado |
| 3 | **E-mail monitorado** | Edge Function `fiscal-note-inbox` | ⚪ desligado — falta credencial no Vault |
| 4 | **Consulta SEFAZ pela chave** | Edge Function `fiscal-note-sefaz` | ⚪ desligado — falta certificado A1 no Vault |

Cada origem tem switch próprio em `/app/configuracoes/notas-fiscais`. Origem 1 funciona no dia 1, sem infraestrutura. As origens 3 e 4 entregam código, Edge Function e tela de configuração prontos, mas **nascem desligadas** — mesmo padrão do NPS transacional e da área de IA/LLM hoje.

---

## Modelo de Dados

Sete tabelas novas, todas com `store_id` e **RLS habilitada**. Entidades comerciais carregam `division` (default `parts`).

| Tabela | Papel | Chaves e restrições |
|--------|-------|---------------------|
| `suppliers` | Fornecedor de primeira classe | `unique (store_id, cnpj)` · `created_from_xml boolean` |
| `fiscal_notes` | A nota | `unique (access_key)` — é o que impede o mesmo XML entrar duas vezes · `status ∈ {conferencia, lancada, cancelada}` · `origin ∈ {upload, upload_edge, email, sefaz, manual}` — `manual` fica **reservado**, sem produtor (nota digitada está fora de escopo) · `xml_path` (Storage) |
| `fiscal_note_items` | Item como veio no XML + as decisões da conferência | `supplier_code` (cProd), `ncm`, `cfop`, `ean`, `unit`, `quantity`, `unit_value` · `link_mode ∈ {auto, ia, novo, pend}` · `conv_mode ∈ {direto, conv, frac}` · `confirmed boolean` |
| `fiscal_note_duplicates` | Duplicatas lidas do XML | `note_id`, `number`, `due_date`, `amount` |
| `supplier_part_codes` | O mapa **cProd → SKU**, aprendido na primeira conferência | `unique (supplier_id, supplier_code)` |
| `supplier_conversion_rules` | Fator de conversão/fracionamento por fornecedor+produto | `applied_count` para a tela de regras aprendidas |
| `fiscal_note_ingestion_queue` | A fila das quatro origens | `source`, `status`, `error`, `raw_xml_path` |

**Storage:** bucket privado `fiscal-xml` guarda o XML original para auditoria. Privado — nunca público.

**Provider Pattern:** dois contracts novos (`suppliers.ts`, `fiscalNotes.ts`) com implementação `mock` e `supabase`, expostos só pelo barrel `@/providers/data`. Nenhuma feature importa `@/mocks` nem `@/providers/data/impl/*`.

---

## Regras de Cálculo

Estas são as regras que o `engine/` implementa e que os testes travam.

### RC-01 — Rateio de frete, IPI e desconto

Rateio **por valor do item**, nunca por quantidade ou por peso:

```
produtos     = Σ (item.total_value)
rateio(item) = (frete + ipi − desconto) × item.total_value / produtos
```

### RC-02 — Quantidade e custo na unidade de estoque

```
fator      = modo === 'direto' ? 1 : conv_factor
qtdEstoque = item.quantity × fator
custoUnit  = (item.total_value + rateio(item)) / qtdEstoque
```

`custoUnit` é o custo que vai para a margem — **nunca** o `vUnCom` da nota.

### RC-03 — Fracionamento

Quando `conv_mode = 'frac'`, o saldo entra no **SKU de destino** (`conv_target_part_id`), não no SKU faturado. O `fator` é o rendimento por embalagem (balde 20 L → 20; tambor 200 L → 10 bombonas de 20 L).

### RC-04 — Custo médio ponderado

No lançamento, para cada peça afetada:

```
novoCM = (saldoAtual × cmAtual + qtdEntrada × custoUnit) / (saldoAtual + qtdEntrada)
```

Saldo negativo ou zero cai no `custoUnit` da entrada.

### RC-05 — Chave de acesso

44 dígitos, validados por composição (cUF, AAMM, CNPJ do emitente, modelo, série, nNF, tpEmis, cNF) **e** por dígito verificador módulo 11. Chave inválida rejeita a importação com erro explícito; chave repetida rejeita como duplicada.

---

## Motor de Sugestão e Análise

### RS-01 — Cascata determinística de vínculo

Cada degrau produz uma sugestão com grau de confiança e **evidência escrita** (o texto que a gaveta mostra ao conferente):

| Ordem | Critério | Confiança | Evidência exemplo |
|-------|----------|-----------|-------------------|
| 1 | `cProd` já mapeado em `supplier_part_codes` | vínculo direto (`auto`) | "Código já mapeado para este fornecedor" |
| 2 | EAN idêntico ao do cadastro | 95–99% | "EAN idêntico ao do cadastro" |
| 3 | NCM igual **e** sobreposição alta de tokens da descrição | 80–94% | "Mesma referência R60T no nome e NCM igual" |
| 4 | Sobreposição de tokens sem NCM igual | 60–79% | "Descrição compatível — NCM difere do cadastro" |
| 5 | Sem candidato | — | cai em `pend` ou vai ao LLM |

### RS-02 — Fallback de LLM

Somente o item que sai da cascata **sem candidato** vai ao modelo, pela área de IA/LLM que já existe. Se não houver chave configurada no Vault, o item cai em `pend` e o humano resolve — a feature **degrada, não quebra**.

### RS-03 — Os seis cards da Análise

Todos são cálculo determinístico. Nenhum depende de modelo:

1. **Desvio de preço** — unitário fora do histórico de compra da peça, com a série das últimas compras.
2. **Economia de embalagem** — mesma peça mais barata por unidade em outra embalagem/fornecedor.
3. **NCM divergente** — NCM da nota diferente do cadastro (muda imposto).
4. **Cadastro incompleto** — fornecedor criado do XML com contato e categoria vazios.
5. **Fracionamento por giro** — embalagem parada versus fração que gira.
6. **Chave duplicada** — verificação de reentrada de XML.

### RS-04 — O que a análise nunca faz

Lançar nota sem conferência humana · alterar custo ou NCM sem aceite · criar vínculo definitivo sem a primeira confirmação.

---

## O Lançamento

### RF-100 — Transação única

`post_fiscal_note(note_id)` — RPC `SECURITY DEFINER`, tudo ou nada:

1. Valida que **todos** os itens estão conferidos; recusa com erro se houver pendente.
2. Cria as peças novas a partir do rascunho (nascem com NCM e custo da nota; categoria e preço de venda ficam para depois).
3. Grava `supplier_part_codes` — o vínculo aprendido, que na próxima nota do fornecedor aplica sozinho.
4. Grava `supplier_conversion_rules` com o fator confirmado.
5. Recalcula `parts.average_cost` (RC-04) e incrementa `parts.stock_available` com a quantidade convertida.
6. Empurra a linha em `IPart.suppliers[]` (número e data da nota, quantidade, custo).
7. Marca a nota `lancada`, com `posted_at` e `posted_by`.

### RF-101 — Estorno

RPC inversa. Desfaz saldo e custo médio, devolve a nota para `conferencia`. Nota lançada não tem edição — a UI só oferece estorno.

### RF-102 — A movimentação `entrada_compra` **não vira tabela**

Decisão de arquitetura que economiza uma tabela e mantém a coerência do que já existe: hoje o ledger de movimentação é **derivado**, nunca persistido — `deriveInventoryMovements` lê pedidos e emite `saida_venda`/`devolucao`. Este PRD **estende a mesma derivação** para ler também as notas lançadas e emitir `entrada_compra`, preenchendo `invoiceNumber` com o número da nota.

O ledger continua derivado e ganha uma segunda fonte. Os campos reservados desde o PRD-052 saem do limbo sem migration nenhuma.

### RF-103 — Duplicatas ficam gravadas, sem consumidor

Contas a pagar está **fora do escopo** deste PRD. As duplicatas são lidas do XML e gravadas em `fiscal_note_duplicates` no formato que o módulo financeiro vai consumir depois. Na tela, aparecem como "prévia" enquanto a nota está em conferência e como "gravadas" depois do lançamento — nunca como título criado, porque não são.

---

## Casca: Navegação, Acesso e Tema

### RF-110 — Grupo SUPRIMENTOS

Novo grupo em `src/features/shell/config/navigation.ts`, entre Comercial e Gestão. O item "Notas de entrada" carrega badge com a contagem de notas em conferência.

### RF-111 — Recurso RBAC `supplies` — exige seed no banco

O recurso precisa de **migration de seed**, não apenas da constante em `src/features/rbac/permissions/resources.ts`. Recurso que existe só no código faz o menu desaparecer para todos os papéis — lição já registrada neste repositório (ver `20260807140000_seed_contact_rbac_resource.sql` e `20260806180000_rbac_funnel_resource.sql` como precedentes).

Permissões: `supplies.view`, `supplies.import`, `supplies.post` (lançar/estornar — restrita), `supplies.manage_suppliers`.

### RF-112 — Tokens semânticos, não o hex do kit

O kit é dark-only e usa hex cru (`#141011`, `#E0BB4E`, `#E23A40`). No app, componentes consomem **apenas** tokens semânticos: o ouro do kit é `primary`; verde/vermelho/roxo/azul são `severity-*`; superfícies são `bg-background`/`bg-card`/`border-border`. Nenhuma referência a primitivo `--gallo-*` nem hex direto. Funciona nos dois temas.

### RF-113 — Regras de UX obrigatórias

Conforme `docs/dev/ux-guidelines.md`: header glassmorphism com tokens semânticos, `ScrollProgressBar` na divisa do bloco fixo, busca com largura dinâmica + atalho `/` + `kbd` + `Escape`, colunas redimensionáveis via `@/shared/hooks/useResizableColumns` com persistência em `gallo-fiscal-notes-column-widths`, delimitadores verticais somente no header, e menu de visibilidade de colunas no clique-direito do cabeçalho.

### RF-114 — Auditoria

Toda mutação registra trilha via `auditLogger`: importação, conferência de item, lançamento, estorno, criação de fornecedor e criação de peça.

---

## Fora de Escopo

Explicitamente **não** entra neste PRD:

- ❌ **Contas a pagar** — as duplicatas ficam gravadas; o módulo que as consome é outro PRD.
- ❌ **Tabela persistida de movimentação de estoque** — segue derivada (RF-102).
- ❌ **NF-e de saída / emissão** — é PRD-127/128/129, assunto diferente.
- ❌ **Manifestação do destinatário na SEFAZ** — só a consulta pela chave.
- ❌ **Nota digitada manualmente** — o botão existe na lista do kit mas abre aviso; cadastro manual completo fica para quando houver demanda sem XML.
- ❌ **Devolução ao fornecedor** e nota de crédito.

---

## Fases de Implementação

Quatro fases, **uma PR cada**, na ordem. Cada uma fecha sozinha.

### Fase 1 — Fundação (sem UI)

Tipos em `src/shared/types/`, o `engine/` completo com testes Vitest, as sete migrations com RLS, o script de sync, os dois contracts com implementação mock e Supabase, e o bucket de Storage.

**Entregável verificável:** `bun run test` verde com cobertura dos sete módulos do engine, incluindo o parser rodando contra um XML de NF-e real.

### Fase 2 — Lista e importação

Grupo SUPRIMENTOS na navegação, seed RBAC, telas **Notas de entrada** e **Importar XML** com upload e parse no cliente (origem 1), vínculo/criação de fornecedor pelo CNPJ.

**Entregável verificável:** soltar um XML na tela cria a nota em conferência com o fornecedor certo.

### Fase 3 — Conferência e lançamento

Tela **Entrada de nota** com a gaveta de vínculo · conversão · fracionamento, prévia do efeito no estoque e no custo médio, `Confirmar vinculados` em lote, RPC de lançar e estornar, e a derivação `entrada_compra` (RF-102).

**Entregável verificável:** lançar uma nota move saldo, recalcula custo médio e faz `entrada_compra` aparecer em Gestão → Movimentação.

### Fase 4 — Análise e as outras três origens

Tela **Análise IA** com os seis cards e as regras aprendidas, fallback de LLM, tela de configuração `/app/configuracoes/notas-fiscais`, e as Edge Functions `fiscal-note-import`, `fiscal-note-inbox` e `fiscal-note-sefaz` — as duas últimas desligadas.

**Entregável verificável:** os cards aparecem após importar, e os switches das origens 3 e 4 mostram o motivo de estarem desligados.

---

## Critérios de Aceite

| # | Critério |
|---|----------|
| CA-01 | XML válido soltado na tela cria nota `conferencia`; o mesmo XML pela segunda vez é rejeitado por chave duplicada. |
| CA-02 | CNPJ conhecido vincula o fornecedor; CNPJ novo cria o cadastro com razão social, CNPJ, IE e endereço do `<emit>` — e com contato e categoria **vazios**. |
| CA-03 | Item com `cProd` já mapeado chega vinculado; item com EAN igual chega como sugestão de alta confiança com evidência escrita. |
| CA-04 | `Lançar entrada` permanece desabilitado enquanto houver item não conferido ou fator de conversão indefinido. |
| CA-05 | Item em CX com fator 12 e quantidade 16 entra como 192 UN no estoque, com custo unitário incluindo o rateio de frete e IPI. |
| CA-06 | Item fracionado credita o SKU de destino, não o SKU faturado. |
| CA-07 | Após lançar, `average_cost` da peça reflete a média ponderada com o saldo anterior (RC-04). |
| CA-08 | Após lançar, a movimentação `entrada_compra` aparece em Gestão → Movimentação com o número da nota em `invoiceNumber`. |
| CA-09 | Nota lançada não oferece edição; o estorno desfaz saldo e custo e devolve a nota para conferência. |
| CA-10 | A segunda nota do mesmo fornecedor aplica sozinha o vínculo e o fator aprendidos na primeira. |
| CA-11 | Sem chave de LLM no Vault, itens sem candidato caem em `pend` e a feature segue utilizável. |
| CA-12 | Todas as telas passam em tema claro e escuro sem hex direto nem primitivo `--gallo-*`. |
| CA-13 | Papel sem `supplies.view` não enxerga o grupo SUPRIMENTOS; papel sem `supplies.post` vê a tela mas não lança. |

---

## Riscos e Dependências

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| **Migrations não são aplicadas ao mergear a PR** | 🔴 Alta | Aplicação em produção é manual e exige OK explícito do dono. As migrations vão exportadas para `supabase/migrations/` na mesma PR, mas a feature não funciona em produção até serem aplicadas. |
| **Origem SEFAZ exige certificado digital A1** | 🟡 Média | Nasce desligada. Código e Edge Function entregues; ligar depende de material que o projeto não tem hoje. |
| **Origem e-mail exige credencial de caixa** | 🟡 Média | Nasce desligada, mesmo tratamento. |
| **Recurso RBAC sem seed derruba o menu para todos** | 🔴 Alta | Migration de seed é item obrigatório da Fase 2, com precedente no repositório. |
| **Parser quebrar em XML de layout atípico** | 🟡 Média | Testes contra XML real; erro de parse falha a importação com mensagem explícita em vez de gravar nota parcial. |
| **`bun run build` não faz type-check** | 🟢 Baixa | Rodar `bunx tsc --noEmit` à parte e avaliar código novo por delta contra o baseline pré-existente. |

---

## Versionamento

Ao fim da Fase 4: bump **MINOR** para `0.180.0` com codinome **`Tally`**, entrada no `CHANGELOG.md` e tag `v0.180.0`.

> ⚠️ Reconferir o número imediatamente antes do bump — PRs abertas com bump concorrente já causaram colisão de versão neste repositório.

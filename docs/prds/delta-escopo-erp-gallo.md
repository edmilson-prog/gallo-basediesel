# Delta de Escopo — GALLO ERP (Absorção da Operação Turbo Diesel)

> **Destinatário:** Time comercial (recálculo de preço do projeto)
> **Origem:** Ampliação de escopo motivada pela impossibilidade de integração com o DINTEC (sem API, sem acesso a banco — limitação institucional confirmada em 27/05/2026). Substituir o DINTEC deixou de ser hipótese e virou trajetória registrada nas Fases 4–5 (§14 do briefing da Fase 2).
> **Natureza do documento:** levantamento conceitual do _gap_. Não é estimativa de esforço nem cronograma — serve para o comercial dimensionar o acréscimo de escopo. A conversão em PRDs/horas exige sessão dedicada de detalhamento.

---

## 1. Princípio que organiza o delta

Hoje o GALLO **lê e analisa** (estoque-análise, DRE, fluxo de caixa, curva ABC, rentabilidade). Para absorver a operação do cliente, ele precisa passar a **executar e ser a fonte da verdade**: dar entrada de mercadoria, baixar estoque físico, emitir documento fiscal, gerar e baixar título financeiro.

É uma mudança de **natureza**, não de tamanho: o projeto sai de "produto de inteligência comercial" para "sistema de retaguarda crítico" — com o ônus correspondente de SLA, suporte e responsabilidade fiscal sobre a operação do cliente.

---

## 2. Decisão estrutural de custo: terceirizar a emissão fiscal

A parte mais cara e de manutenção perpétua do fiscal (geração de XML, assinatura, transmissão à SEFAZ, contingência, acompanhamento de legislação de envio) **é terceirizada** via provider de emissão (ex.: Focus NFe / PlugNotas), atrás do Provider Pattern já previsto no PRD-127.

Consequência prática: o emissor **formata o que a plataforma manda — não adivinha**. Sobra para a plataforma o **dado e o fluxo de negócio** que alimentam o emissor (cadastro fiscal do produto, motor de regras tributárias, fluxos de entrada e devolução). Esse é o trabalho finito e estável; o trabalho perpétuo fica com o terceiro.

**Leitura para o comercial:** terceirizar não apaga o bloco fiscal do orçamento — ele **encolhe**. Custo fiscal de desenvolvimento = só a coluna "Interno" do Bloco A. Custo recorrente = assinatura do emissor (a definir por cotação; preços de NF-e produto da PlugNotas/NFE.io não são públicos).

---

## 3. Legenda das tabelas

**Classificação**

- `NOVO` — não existe, nem parcial. Entra integralmente no novo escopo.
- `ENDURECER` — já existe versão analítica/mockada na Fase 1/2; vira operacional. Entra como evolução, **não como construção do zero**.
- `FASE 2` — já está orçado na Fase 2. **Não recobrar.**

**Quem constrói**

- `Interno` — desenvolvido pela AILA. **É aqui que mora o custo de desenvolvimento.**
- `Terceirizado` — fornecedor externo assume (custo recorrente de assinatura, não de dev).
- `Misto` — núcleo interno + apoio de serviço externo.

**Esforço relativo** — estimativa **qualitativa e orientativa** do arquiteto (Alto / Médio / Baixo). Não é cotação; serve só para o comercial ponderar peso entre itens.

---

## 4. Blocos de escopo

### Bloco A — Fiscal

| Feature                                                                | Classificação                          | Quem constrói                 | Prioridade | Esforço  | Depende de                                |
| ---------------------------------------------------------------------- | -------------------------------------- | ----------------------------- | ---------- | -------- | ----------------------------------------- |
| Emitir NF-e (saída)                                                    | ENDURECER (placeholder no PRD-032/127) | Terceirizado                  | P0         | Médio    | Cadastro fiscal produto, motor tributário |
| Emitir NFC-e (balcão B2C)                                              | NOVO                                   | Terceirizado                  | P0         | Médio    | idem + PDV                                |
| Cancelamento / carta de correção / inutilização                        | NOVO                                   | Terceirizado                  | P0         | Baixo    | Emissão NF-e                              |
| Cadastro fiscal do produto (NCM, CEST, CFOP, CST/CSOSN, origem)        | NOVO                                   | **Interno**                   | P0         | Alto     | Cadastro completo de produto (Bloco F)    |
| Motor de regras tributárias (ICMS, ICMS-ST, IPI, PIS/COFINS, DIFAL)    | NOVO                                   | **Interno**                   | P0         | **Alto** | Cadastro fiscal produto                   |
| Entrada de NF de compra (importar XML do fornecedor → estoque + custo) | NOVO                                   | **Interno**                   | P0         | Alto     | Estoque físico, recebimento               |
| Manifestação do Destinatário (MDe)                                     | NOVO                                   | Misto                         | P1         | Médio    | Entrada de NF de compra                   |
| Devolução de venda/compra (documento + estorno de estoque)             | NOVO                                   | Misto                         | P1         | Alto     | Emissão, estoque físico                   |
| Exportação SPED Fiscal / Contribuições                                 | NOVO                                   | Contador / ferramenta externa | P2         | Médio    | Operação fiscal consolidada               |

> **Alerta — Reforma Tributária:** o motor tributário tem **custo de manutenção recorrente**, não só de construção. Terceirizar a emissão ameniza, mas a lógica de operação fiscal continua exigindo acompanhamento. Sinalizar ao cliente como custo de manutenção, não de projeto único.

### Bloco B — Compras / Suprimentos

| Feature                                               | Classificação                  | Quem constrói | Prioridade | Esforço | Depende de                           |
| ----------------------------------------------------- | ------------------------------ | ------------- | ---------- | ------- | ------------------------------------ |
| Cadastro de fornecedor                                | ENDURECER (parcial na Onda 14) | **Interno**   | P0         | Baixo   | —                                    |
| Cotação de compra (RFQ a múltiplos fornecedores)      | NOVO                           | **Interno**   | P1         | Médio   | Cadastro fornecedor                  |
| Pedido de compra                                      | NOVO                           | **Interno**   | P0         | Médio   | Cadastro fornecedor, produto         |
| Recebimento / conferência (tratamento de divergência) | NOVO                           | **Interno**   | P0         | Alto    | Pedido de compra, estoque físico     |
| Custo médio ponderado                                 | NOVO                           | **Interno**   | P0         | Médio   | Recebimento, entrada de NF de compra |

### Bloco C — Estoque Físico (operacional)

| Feature                                                           | Classificação                                 | Quem constrói | Prioridade | Esforço | Depende de                         |
| ----------------------------------------------------------------- | --------------------------------------------- | ------------- | ---------- | ------- | ---------------------------------- |
| Movimentação real (entrada / saída / ajuste)                      | ENDURECER (hoje derivado de vendas — PRD-052) | **Interno**   | P0         | Alto    | Cadastro completo de produto       |
| Inventário / contagem cíclica                                     | NOVO                                          | **Interno**   | P1         | Médio   | Movimentação                       |
| Endereçamento (depósito / prateleira) + transferência entre lojas | NOVO                                          | **Interno**   | P1         | Médio   | Movimentação, multistore (PRD-007) |
| Reserva de estoque vinculada a pedido                             | NOVO                                          | **Interno**   | P1         | Médio   | Movimentação, pedido (PRD-032)     |
| Rastreabilidade por nº de série                                   | NOVO                                          | **Interno**   | P2         | Médio   | Movimentação                       |

### Bloco D — Financeiro Operacional

| Feature                                                            | Classificação                                       | Quem constrói           | Prioridade | Esforço | Depende de                    |
| ------------------------------------------------------------------ | --------------------------------------------------- | ----------------------- | ---------- | ------- | ----------------------------- |
| Boleto / PIX / cartão (emissão + webhook)                          | **FASE 2** (Onda 7 — PRD-131/131B/134/135)          | Terceirizado (Asaas/MP) | —          | —       | já orçado                     |
| Conciliação bancária / cartão                                      | **FASE 2** (PRD-138)                                | Misto                   | —          | —       | já orçado                     |
| Contas a receber — gestão de título (geração, baixa, vínculo à NF) | NOVO                                                | **Interno**             | P0         | Alto    | Venda/NF, pagamentos (Fase 2) |
| Contas a pagar — título de fornecedor, agendamento, baixa          | NOVO                                                | **Interno**             | P0         | Alto    | Recebimento (Bloco B)         |
| Régua de inadimplência / cobrança                                  | NOVO                                                | **Interno**             | P1         | Médio   | Contas a receber              |
| Plano de contas + centro de custo                                  | NOVO                                                | **Interno**             | P1         | Médio   | —                             |
| DRE / Fluxo de Caixa / Despesas                                    | ENDURECER (hoje mockado/derivado — PRD-048/054/055) | **Interno**             | P1         | Médio   | Contas a pagar/receber reais  |

> **Atenção ao recálculo:** pagamentos (boleto/PIX/cartão/conciliação) **já estão na Fase 2** e DRE/Fluxo/Despesas **já existem** (viram evolução). Não orçar esses como construção nova — risco de cobrar duas vezes.

### Bloco E — PDV / Frente de Caixa _(se houver venda de balcão)_

| Feature                                            | Classificação | Quem constrói                     | Prioridade | Esforço | Depende de            |
| -------------------------------------------------- | ------------- | --------------------------------- | ---------- | ------- | --------------------- |
| PDV (NFC-e, abertura/fechamento de caixa, sangria) | NOVO          | **Interno**                       | P1         | Alto    | NFC-e, estoque físico |
| TEF (maquininha)                                   | NOVO          | Terceirizado (adquirente/gateway) | P1         | Médio   | PDV                   |

> **Confirmar com o cliente** se há operação de balcão. Se a venda é 100% B2B/remota, o Bloco E pode sair inteiro do escopo.

### Bloco F — Cadastros Mestres (fonte da verdade)

| Feature                                                                                 | Classificação                 | Quem constrói | Prioridade | Esforço | Depende de          |
| --------------------------------------------------------------------------------------- | ----------------------------- | ------------- | ---------- | ------- | ------------------- |
| Produto: catálogo (leitura) → cadastro completo (fiscal, custo, multi-preço, foto, OEM) | ENDURECER (PRD-030 é leitura) | **Interno**   | P0         | Alto    | — (base de tudo)    |
| Cliente: ficha → dados fiscais + limite de crédito + condições comerciais               | ENDURECER (PRD-012)           | **Interno**   | P0         | Médio   | —                   |
| Tabelas de preço / política comercial (desconto por cliente/volume)                     | NOVO                          | **Interno**   | P1         | Médio   | Cadastro de produto |

### Bloco G — Logística / Expedição

| Feature                 | Classificação                     | Quem constrói        | Prioridade | Esforço | Depende de             |
| ----------------------- | --------------------------------- | -------------------- | ---------- | ------- | ---------------------- |
| Separação / picking     | NOVO                              | **Interno**          | P1         | Médio   | Pedido, estoque físico |
| Romaneio / expedição    | NOVO                              | **Interno**          | P1         | Baixo   | Picking                |
| Roteirização de entrega | NOVO (já mapeado Fase 3, Onda 17) | Misto (API de rotas) | P2         | Médio   | Expedição              |

### Bloco H — Venda / Faturamento (item orquestrador do ciclo)

> **Esta é a peça-chave do delta.** Não é um bloco "a mais" — é o que **fecha o ciclo** orçamento → pedido → **venda efetivada**, convertendo o pedido (compromisso comercial) em transação fiscal + física + financeira. Ela só funciona consumindo os Blocos A (NF), C (estoque) e D (título); por isso define o mínimo necessário desses blocos e deve ser usada como **norte** da construção (constrói-se de fora pra dentro, guiado pelo que a venda precisa consumir). O ciclo comercial em si — orçamento (PRD-031), pedido (PRD-032) e a análise de vendas (PRD-041) — **já está implementado** (`_DONE`); o Bloco H é a camada de **efetivação operacional** que falta, escopo genuinamente novo, e **não recobre** o que já existe.

**Modelagem (decisões consolidadas):**

- Entidade própria de primeira classe `IVenda` / `IFaturamento`, com relação **1:N** ao pedido (permite faturamento parcial e múltiplas NFs por pedido). **Não** é extensão do `IOrder` — o documento fiscal tem ciclo de vida próprio (autorizada/rejeitada/cancelada), independente do fulfillment.
- Gatilho **configurável**, default **manual** (operador "fatura" o pedido); o modo balcão (PDV/NFC-e) dispara no ato — depende do Bloco E.
- Implementada como **saga** (transação distribuída sobre A/C/D) com **idempotência** e **compensação**: se uma etapa falha após outra concluir (ex.: NF autorizada mas baixa de estoque falhou), reverte as anteriores. A idempotência já está **especificada** no PRD-102 (Edge Functions), mas esse PRD **ainda não foi implementado** — integra a faixa 100–201 (backend real), pendente. Quando o backend estiver construído, a saga **reaproveita** essa infraestrutura, sem mecanismo próprio. Até lá, é **dependência**, não recurso pronto.

**Estados (`status`):** `pendente` → `processando` → `nf_autorizada` → `concluida`; exceções `falha` (dispara compensação) e `cancelada` (estorna estoque + cancela título + cancela NF).

| Feature                                        | Classificação | Quem constrói | Prioridade | Esforço  | Depende de                               |
| ---------------------------------------------- | ------------- | ------------- | ---------- | -------- | ---------------------------------------- |
| Entidade `IVenda`/`IFaturamento` (1:N pedido)  | NOVO          | **Interno**   | P0         | Médio    | Pedido (PRD-032)                         |
| Orquestração saga (idempotência + compensação) | NOVO          | **Interno**   | P0         | **Alto** | PRD-102 _(a implementar)_ + Blocos A·C·D |
| Faturamento parcial (múltiplas NFs por pedido) | NOVO          | **Interno**   | P1         | Médio    | Entidade venda                           |
| Registro de NF externa (modo `externo_manual`) | NOVO          | **Interno**   | P1         | Baixo    | Entidade venda                           |
| Cancelamento de venda (estorno em cadeia)      | NOVO          | **Interno**   | P1         | Médio    | Saga + Blocos A·C·D                      |

**Parâmetro de habilitação — `faturamentoMode` (por `IStore`):**

Requisito do cliente: poder ligar/desligar a venda efetivada por configuração, para cobrir o período de transição DINTEC → GALLO e a opção de emitir NF em programa de terceiros. Modelado como **Provider Pattern** (mesmo padrão de WhatsApp e fonte de dados), **por loja** (a transição é loja a loja, não global), como **parâmetro de runtime** editável no admin — **não** env var (o `VITE_DATA_SOURCE` é build-time; este muda em produção sem redeploy).

`faturamentoMode: 'gallo_nativo' | 'externo_dintec' | 'externo_manual'`

| Modo             | Emite NF?                              | Baixa estoque? | Gera título? | Quando usar                                                     |
| ---------------- | -------------------------------------- | -------------- | ------------ | --------------------------------------------------------------- |
| `externo_dintec` | Não — DINTEC emite                     | Não (DINTEC)   | Não (DINTEC) | Transição inicial; DINTEC ainda é fonte da verdade              |
| `externo_manual` | Não — operador registra nº/chave da NF | Sim (GALLO)    | Sim (GALLO)  | Estoque/financeiro já em GALLO; NF sai em programa de terceiros |
| `gallo_nativo`   | Sim — via provider fiscal (Bloco A)    | Sim            | Sim          | Plataforma plena                                                |

A saga é **ciente do modo**: executa apenas o subconjunto de ações que GALLO "dona" naquele momento (no `externo_dintec` é praticamente um stub que marca o pedido como faturado fora; no `gallo_nativo` roda completa). A decisão fica concentrada na configuração, sem `if` espalhado pelo código.

> **Leitura para o comercial:** o esforço aqui é majoritariamente a **orquestração saga** (Alto); o resto da entidade é Médio/Baixo. O `faturamentoMode` em si é configuração barata — mas é o que viabiliza **go-live sem big-bang** (cada loja migra de modo quando estiver pronta), reduzindo risco de implantação. É argumento de venda, não só linha de custo.

---

## 5. Resumo executivo para o comercial

**Onde está o custo de desenvolvimento (coluna Interno):**

1. **Bloco B (Compras) + Bloco C (Estoque físico)** — o coração operacional que o GALLO ainda não tem. Maior bloco de esforço novo.
2. **Cadastros e fluxos do Bloco A (Fiscal — parte interna)** e **Bloco D (Contas a pagar/receber)** — alto esforço, alta criticidade.
3. **Bloco F (Cadastros mestres)** — pré-requisito de quase tudo; precisa vir primeiro.
4. **Bloco H (Venda/Faturamento — orquestração saga)** — a peça que fecha o ciclo. Esforço alto na orquestração; a fundação de consistência (idempotência) já está **especificada** no PRD-102, mas esse PRD ainda **não foi implementado** (está na faixa 100–201, pendente). Não é mecanismo do zero, porém **depende** dessa base ser construída antes.

**O que NÃO infla o orçamento (boa notícia para a margem):**

- A emissão fiscal e os pagamentos — as duas coisas que mais assustam — são em boa parte **terceirizadas** (custo recorrente de assinatura) ou **já orçadas na Fase 2**.
- O `faturamentoMode` (Bloco H) é configuração barata e, mais que isso, **reduz risco de implantação**: permite migração loja a loja sem big-bang. Vale destacar como diferencial na proposta, não só como custo.

**Itens que dependem de confirmação do cliente antes de orçar:**

- **Bloco E (PDV/TEF):** só entra se houver venda de balcão.
- **SPED (A):** depende de definição com a contabilidade do cliente.
- **Rastreabilidade por nº de série (C):** depende do nível de controle de garantia desejado.

**Custos recorrentes a destacar na proposta (não são "projeto"):**

- Assinatura do emissor fiscal (NF-e/NFC-e).
- Manutenção do motor tributário (Reforma Tributária).
- Taxas dos gateways de pagamento (já na Fase 2).
- SLA / suporte de sistema crítico (modelo de manutenção perpétua, não entrega pontual).

---

## 6. Ressalvas finais (honestidade técnica)

1. Este é o **gap conceitual**, não a lista de PRDs. Converter em esforço real exige cruzar item a item com os PRDs já escritos e detalhar cada feature — caso contrário há risco de dupla contagem (já corrigido aqui para pagamentos e DRE/Fluxo).
2. A coluna **Esforço relativo** é julgamento de arquiteto, qualitativo. Não substitui estimativa formal.
3. Distribuir esse escopo entre as Fases 4 e 5 (não tudo de uma vez) é o que o §14 do briefing já recomenda — entregar por domínio, com janelas de validação, reduz risco de cutover.

---

_Documento gerado para subsidiar o recálculo comercial. Sujeito a refinamento na sessão dedicada de detalhamento das Fases 4–5._

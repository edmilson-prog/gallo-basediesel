# Bootstrap de Documentação de Banco Existente — AILA - Sistemas Inteligentes

> **Versão:** 1.1  
> **Data:** Junho/2026  
> **Autor:** AILA - Sistemas Inteligentes  
> **Aplicação:** Todos os projetos com banco de dados já em operação

---

## 📚 Documentos Relacionados

Este documento faz parte do sistema de documentação de banco de dados da AILA - Sistemas Inteligentes.

| Documento | Descrição |
|-----------|-----------|
| `PROTOCOLO-DOCUMENTACAO-BANCO.md` | Protocolo principal: fundação + modo incremental (a ser criado) |
| **`BOOTSTRAP-BANCO-EXISTENTE.md`** | ⬅ Você está aqui — Procedimento de documentação de banco já existente |
| `CLAUDE.md` (raiz do repositório) | Convenções do projeto, lido automaticamente pelo agente a cada sessão — fonte das convenções esperadas |
| `MODELO-DADOS-{projeto}.md` | Índice mestre do modelo de dados, gerado pelo bootstrap |
| `guia-prd.md` | Guia metodológico de criação de PRDs (base AILA) |

> **Nota de sequência:** Este documento-satélite é dependente do `PROTOCOLO-DOCUMENTACAO-BANCO.md`, que define a **anatomia canônica da ficha** e do frontmatter. Enquanto o protocolo principal não existir, a Seção 13 traz uma referência operacional do formato de saída, suficiente para o agente produzir corretamente. Quando o protocolo principal for criado, a Seção 13 será substituída por uma referência a ele.

---

## 1. Propósito e Quando Usar

### 1.1 O que este documento resolve

A documentação de banco da AILA opera em **dois modos**, com regras quase opostas:

| Modo | Situação | Regra central |
|------|----------|---------------|
| **Incremental** | Projeto cujo banco nasce já dentro do protocolo | O agente **não varre o banco**; lê a documentação. Cada alteração é documentada no ato. |
| **Bootstrap** | Banco que **já existe** sem documentação adequada | O agente **varre o banco** — uma única vez, deliberadamente — e o **produto** dessa varredura é a documentação que todos os agentes futuros vão ler. |

Este documento governa o **Modo Bootstrap**.

### 1.2 Quando você está em bootstrap

- Projeto legado com banco em produção e documentação inexistente ou parcial.
- Sistema **herdado/adquirido** de cliente ou terceiro.
- Projeto que estava no nível "só esqueleto" (Seção 7) sendo **reativado**.
- Um banco novo agregado a um projeto que já estava no protocolo.

### 1.3 O bootstrap tem fim

O bootstrap é uma operação **única por banco**. Ao concluir (Seção 12 aprovada), o projeto **migra para o Modo Incremental** e passa a ser governado pelo `PROTOCOLO-DOCUMENTACAO-BANCO.md`. A partir daí, a regra "documentação primeiro, banco como último recurso" entra em vigor.

> **Reconciliação com o protocolo principal:** A regra "o agente nunca introspecta o banco vivo" vale para a **operação rotineira**. Introspectar é proibido como rotina, mas **obrigatório como ato de fabricação da documentação** durante o bootstrap. Esta é a única exceção, e ela termina quando o bootstrap termina.

---

## 2. Princípio Inviolável — O Agente Nunca Inventa

Este é o princípio mais importante do documento. Em um banco com centenas de tabelas, a tentação (e o risco) de preencher lacunas com suposições plausíveis é enorme — e uma suposição errada **envenena o catálogo**: o próximo agente zero-contexto vai confiar nela e tomar decisões erradas.

### 2.1 A regra

> **O agente nunca afirma como fato aquilo que não verificou. Ele infere com citação de fonte, ou marca como desconhecido e pergunta. Nunca inventa.**

Esta é a mesma disciplina anti-alucinação já adotada no RAG dos projetos AILA: na ausência de base, dizer "informação insuficiente" em vez de fabricar.

### 2.2 A assimetria do bootstrap

| Camada | Origem | Confiabilidade |
|--------|--------|----------------|
| **Mecânica** (colunas, tipos, FKs, índices, constraints, triggers, RLS policies) | Extraível do próprio banco | Alta — é a verdade física |
| **Contexto** (significado de domínio, razão de uma RLS, regra de negócio por trás de uma coluna) | **NÃO está no schema** — vive no código, no histórico ou na cabeça de quem construiu | Variável — precisa de inferência rastreável ou confirmação humana |

A camada mecânica o agente colhe sem esforço. A camada de contexto é onde a regra do 2.1 se aplica com rigor.

### 2.3 Marcador de origem (obrigatório)

Todo campo de **contexto** carrega um marcador que diz ao próximo agente quanto confiar:

| Marcador | Significado |
|----------|-------------|
| `✅ verificado` | Confirmado por humano que conhece o domínio |
| `🔍 inferido` | Deduzido pelo agente **com citação da fonte** (ex.: arquivo de código, mensagem de commit) |
| `❓ pendente` | Não foi possível inferir com confiança — aguarda resposta humana |

Campo mecânico não precisa de marcador (é sempre verificável contra o banco). Campo de contexto **sem marcador é considerado inválido**.

---

## 3. O Desafio da Escala

Bancos AILA chegam a **800+ tabelas**. Nessa ordem de grandeza, "o agente foi cuidadoso" não é garantia de nada. A diligência do agente não escala — o que escala é **mecanismo**.

### 3.1 Por que a abordagem ingênua quebra

| Problema na escala | Consequência |
|--------------------|--------------|
| Janela de contexto finita | O agente **não cabe** 800 schemas de tabela na memória de uma vez |
| Completude por inspeção visual | Ninguém confere "olhando" se 800 tabelas foram cobertas |
| Sessão única | Um bootstrap de 800 tabelas atravessa **muitas sessões e agentes** |
| Transcrição manual | Escrever 800 fichas mecânicas à mão é inviável e cheio de erro |
| Enriquecer tudo | Contexto à mão para 800 tabelas nunca termina e a maioria não compensa |

### 3.2 Os cinco mecanismos que tornam a escala tratável

1. **Enumeração primeiro (contrato de completude).** Antes de documentar qualquer coisa, lista-se *mecanicamente* todo objeto do banco num manifesto-checklist. "Sem esquecer nada" deixa de depender de atenção e vira **reconciliação**.
2. **Geração obrigatória da camada mecânica.** A ferramenta gera todos os esqueletos de uma vez; o agente nunca transcreve.
3. **Classificação em tiers.** O esforço caro de contexto vai só para o que compensa; o resto recebe esqueleto.
4. **Resumabilidade.** O próprio estado do bootstrap é documentado; qualquer agente zero-contexto retoma de onde parou.
5. **Reconciliação final.** No fim, re-enumera o banco vivo e cruza com o manifesto — prova mecânica de que nada ficou de fora.

Cada fase do procedimento (Seções 6 a 12) existe para servir um desses cinco mecanismos.

---

## 4. Pré-Requisitos

Antes de iniciar, o agente deve ter:

| Pré-requisito | Detalhe |
|---------------|---------|
| **Acesso de leitura ao banco** (ou dump de schema) | Conexão read-only ou arquivo de schema. Nunca exige acesso de escrita ao banco. |
| **Acesso ao código da aplicação** | Indispensável para a Fase 3 (inferência de contexto a partir de como cada tabela é usada). |
| **Ferramenta de introspecção do stack** | Específica do banco (Apêndice A). A saída, porém, é sempre o mesmo formato de ficha. |
| **Destino gravável da documentação** | `docs/database/` (padrão AILA), com subpastas `tables/` e `functions/`. |
| **Formato de saída** | A anatomia da ficha (Seção 13 / protocolo principal). |
| **`CLAUDE.md` do projeto** | Convenções esperadas (nomenclatura, tipos, padrões). Define o "deveria ser"; o banco real define o "é". |

> **Regra stack-agnóstica:** a **descoberta** é específica do stack (os comandos de Postgres, MySQL e SQL Server diferem); o **formato documentado é idêntico em todos os projetos**. É isso que permite normalizar a documentação entre bancos heterogêneos.

> **Convenções: citar, não redefinir.** As convenções de nomenclatura e tipos do projeto vivem no `CLAUDE.md` (padrão AILA v1.7) — a ficha as **referencia**, não as repete. Em bootstrap há uma sutileza: o banco já existe e pode **divergir** do CLAUDE.md (ex.: tabela legada em camelCase contra a convenção snake_case). Nesse caso o agente documenta o que **é** (a verdade mecânica do banco) e **sinaliza a divergência** na ficha — nunca a corrige silenciosamente.

---

## 5. Visão Geral do Procedimento

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│   FASE 0     │──▶│   FASE 1     │──▶│   FASE 2     │──▶│   FASE 3     │──▶│   FASE 4     │
│ Enumeração   │   │Classificação │   │  Esqueleto   │   │Enriquecimento│   │  Validação   │
│ + Manifesto  │   │  em Tiers    │   │  Mecânico    │   │  de Contexto │   │  + Sign-off  │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
   contrato de        limita o          gerado, não       infere com         humano confirma
   completude         esforço caro      transcrito        fonte ou pergunta  o que foi inferido
                                                                                     │
                                                                                     ▼
                                                                          ┌──────────────────┐
                                                                          │   VERIFICAÇÃO    │
                                                                          │ FINAL (Seção 12) │
                                                                          │  reconciliação   │
                                                                          └──────────────────┘
                                                                                     │
                                                                                     ▼
                                                                          Projeto migra para
                                                                           Modo Incremental
```

> **Instrução-chave (AILA):** *Lembre-se: explore a estrutura dos dados, planeje primeiro cada passo, analise, investigue a fundo, pense e revise tudo antes de realizar qualquer atualização ou implementação.*

---

## 6. Fase 0 — Enumeração e Manifesto

**Objetivo:** criar o contrato de completude. Esta fase responde diretamente a "buscar em cada cantinho do banco sem esquecer nada" — você enumera os cantos **primeiro**, mecanicamente, de forma que nada *possa* ser esquecido.

### 6.1 O que enumerar

O agente lista **todo objeto** do banco, em **todos os schemas** (não apenas `public`):

- Tabelas (base tables)
- Views e materialized views
- Functions e stored procedures
- Triggers
- RLS policies
- Sequences
- Enums e tipos customizados
- Edge Functions (no Supabase, vivem no repositório em `supabase/functions/`, **não** no Postgres — enumerar a pasta)

Os comandos de enumeração por stack estão no **Apêndice A**.

### 6.2 O Manifesto

O resultado da enumeração é persistido em `docs/database/_MANIFESTO-BOOTSTRAP.md` — o checklist mestre e fonte da verdade do progresso. Cada objeto é uma linha:

| Coluna do manifesto | Conteúdo |
|---------------------|----------|
| `objeto` | Nome qualificado (`schema.nome`) |
| `tipo` | tabela / view / function / trigger / rls_policy / enum / edge_function |
| `tier` | nucleo / suporte / estrutural / suspeita-morta (preenchido na Fase 1) |
| `status` | pendente / gerado / enriquecido / validado |
| `ficha` | caminho do arquivo de destino (ex.: `tables/TABLE-clientes.md`) |
| `observacao` | notas do agente (ex.: "FK órfã detectada", "sem uso no código") |

### 6.3 A garantia

> **Completude = toda linha do manifesto alcança no mínimo o status `gerado`.**

O manifesto não é burocracia: é o instrumento que transforma "confio que o agente cobriu tudo" em "é matematicamente verificável que tudo foi coberto". Sem ele, a 800 tabelas, não há como afirmar completude.

---

## 7. Fase 1 — Classificação em Tiers

**Objetivo:** limitar o esforço caro de enriquecimento ao que compensa. Das 800 tabelas, tipicamente algumas dezenas são núcleo de domínio; a maioria é junção, log ou tabela técnica que não justifica contexto escrito à mão.

### 7.1 Os tiers

| Tier | Característica | Tratamento |
|------|---------------|------------|
| **`nucleo`** | Muitas FKs apontando para ela + uso intenso no código + substantivo de negócio (cliente, processo, pedido) | Enriquecimento **completo** (Fase 3) + validação humana |
| **`suporte`** | Uso moderado no código; entidade secundária | Enriquecimento **leve**; aprofunda sob demanda |
| **`estrutural`** | Tabela de junção pura (PK composta só de FKs, poucas/nenhuma outra coluna); ou sufixo técnico (`_log`, `_audit`, `_history`, `_tmp`) | **Só esqueleto** mecânico; contexto não compensa |
| **`suspeita-morta`** | Zero referências no código; sem escrita recente (se detectável) | **Só esqueleto** + flag `❓ esta tabela ainda é usada?` para o humano |

As heurísticas de classificação automática estão no **Apêndice B**. O tier de cada objeto é gravado no manifesto.

### 7.2 Por que isso importa na escala

Sem tiers, o agente tentaria escrever contexto para 800 tabelas e o bootstrap nunca terminaria. Com tiers, o trabalho caro converge para ~60 tabelas que carregam o significado do sistema, e as outras ~740 recebem o esqueleto mecânico confiável — que já é suficiente para um agente zero-contexto saber o que existe e onde.

---

## 8. Fase 2 — Geração do Esqueleto Mecânico

**Objetivo:** produzir, de forma **automatizada**, a camada mecânica de todas as fichas de uma vez.

### 8.1 Regra inegociável na escala

> **A camada mecânica é gerada, nunca digitada à mão.**

A 800 tabelas, transcrição manual é inviável e introduz erro. A ferramenta (tbls ou equivalente — Apêndice A) lê o banco e gera todos os esqueletos. O trabalho do agente é **enriquecer e validar em cima**, não transcrever.

### 8.2 O que cada ficha de esqueleto contém

| Seção da ficha | Origem | Estado inicial |
|----------------|--------|----------------|
| **Frontmatter** (table, schema, status, contagem de colunas, RLS on/off, etc.) | Auto-preenchido da introspecção | Completo |
| **Colunas** (nome, tipo, nullable, default, PK/FK) | Introspecção | Completo |
| **Índices** | Introspecção | Completo |
| **Constraints** | Introspecção | Completo |
| **Triggers** | Introspecção | Completo |
| **RLS policies** | Introspecção (`pg_policies`) | Completo (regra), `❓ pendente` (justificativa) |
| **Relacionamentos** (FKs entrando e saindo) | Introspecção | Completo |
| **Descrição da entidade** | — | `❓ pendente` |
| **Regras de negócio** | — | `❓ pendente` |

Ao gerar o esqueleto de um objeto, o agente marca sua linha no manifesto como `gerado`.

### 8.3 Saídas agregadas (também geradas nesta fase)

| Saída | Regra na escala |
|-------|-----------------|
| **Índice mestre** | **Hierárquico**, agrupado por schema/domínio. Um índice plano de 800 linhas é inútil — o mestre é um índice-de-índices, com sub-índices por domínio. |
| **Diagrama ER** | **Por domínio**, nunca um único diagrama de 800 entidades (que é ruído ilegível). O panorama global vira um mapa de domínios (caixas = domínios, setas = relações entre domínios); o detalhe mora no ER de cada domínio. |
| **Panorama de RLS** | Mapa consolidado de acesso de todas as tabelas com RLS — a história de segurança do banco em um lugar. |
| **Catálogo de Edge Functions** | Em `functions/`, uma entrada por função: trigger, tabelas que toca, input/output, secrets. |

---

## 9. Fase 3 — Enriquecimento de Contexto

**Objetivo:** preencher o "porquê" das tabelas `nucleo` (e levemente `suporte`), respeitando o Princípio Inviolável (Seção 2).

### 9.1 Como o agente infere

O contexto **não está no schema**. O agente o reconstrói de fontes rastreáveis, **sempre citando a origem**:

| Fonte de inferência | O que revela |
|---------------------|--------------|
| **Código da aplicação** (buscar o nome da tabela no codebase) | Como é consultada, qual lógica de negócio a cerca, nomes de variáveis/funções que revelam intenção |
| **Histórico de migrations / commits** | Quando a tabela/coluna surgiu e, pelas mensagens, por quê |
| **Comentários no banco** (`COMMENT ON`, se existirem) | Documentação que já vivia junto do schema |

Toda afirmação inferida recebe marcador `🔍 inferido` **com a fonte** (ex.: `🔍 inferido de src/services/billing.ts`).

### 9.2 O que não se infere, pergunta-se

Quando o agente não consegue inferir com confiança, ele **não inventa** — gera uma **lista de perguntas cirúrgicas** para o humano. Cirúrgicas, não genéricas:

| ❌ Pergunta ruim | ✅ Pergunta cirúrgica |
|------------------|----------------------|
| "Me explique o banco" | "A coluna `cases.restricted` é booleana e não aparece em nenhum lugar do frontend que escaneei. Qual o propósito dela?" |
| "Pra que serve a tabela X?" | "A tabela `tmp_reconciliation` não tem FK nem uso no código. É temporária/descartável ou ainda é usada por algum job?" |

### 9.3 Disciplina de escala

- **Processar em lotes por domínio** (não tabela isolada): tabelas relacionadas são enriquecidas juntas, o que melhora a qualidade da inferência.
- **Persistir após cada lote** e atualizar o manifesto (`enriquecido`): garante resumabilidade (Seção 11) e não perde trabalho entre sessões.
- **Respeitar a janela de contexto**: o agente nunca tenta carregar o banco inteiro; trabalha o lote, salva, libera.

---

## 10. Fase 4 — Validação e Sign-off

**Objetivo:** confirmar o que foi inferido e transformar `🔍 inferido` em `✅ verificado` onde o humano valida.

### 10.1 O que o humano valida

| Tier | Validação |
|------|-----------|
| `nucleo` e `suporte` | Humano revisa as fichas enriquecidas, **corrige inferências erradas** (o agente vai errar semântica de domínio em alguns casos), responde a lista de perguntas e confirma os flags de "suspeita-morta". |
| `estrutural` e `suspeita-morta` | **Aceitas como geradas.** Não há contexto a verificar — a verdade mecânica vinda da introspecção é confiável por si. |

### 10.2 Conclusão

Fichas validadas têm seu status atualizado para `validado` no manifesto. Quando a verificação final (Seção 12) passa, o **projeto migra para o Modo Incremental** e o protocolo principal assume daí em diante.

> **Escala:** o humano não valida 800 fichas — valida as poucas dezenas de tier `nucleo`/`suporte`. É por isso que o tiering (Fase 1) é o que torna a validação humanamente possível.

---

## 11. Resumabilidade e Múltiplas Sessões

Um bootstrap de 800 tabelas **não cabe em uma sessão** e provavelmente passa por vários agentes ao longo de dias. O procedimento aplica a si mesmo a filosofia do protocolo: **o estado do bootstrap é documentado**, e qualquer agente zero-contexto retoma de onde o anterior parou.

### 11.1 Como um agente retoma

1. Lê o `_MANIFESTO-BOOTSTRAP.md`.
2. Encontra a primeira linha que **não** está no status-alvo.
3. Continua a partir dela.

### 11.2 Regras de resumabilidade

| Regra | Razão |
|-------|-------|
| **Nunca recomeçar do zero** | O manifesto já registra o que foi feito |
| **Nunca reprocessar objeto já no status-alvo** | Evita trabalho duplicado e divergência |
| **Atualizar o manifesto imediatamente após cada objeto** | Mesma disciplina do "definition of done" incremental: documentar é parte de concluir, não tarefa seguinte |
| **Persistir em lotes pequenos** | Uma interrupção perde no máximo um lote, não o dia |

---

## 12. Verificação Final de Completude

**Objetivo:** a prova mecânica de "sem esquecer nada".

### 12.1 A reconciliação

Ao final, o agente **re-enumera o banco vivo** (repete a Fase 0) e cruza o resultado com o manifesto:

> **Todo objeto presente no catálogo do banco deve ter uma linha correspondente no manifesto com status ≥ `gerado`. Qualquer objeto no banco que não esteja na documentação é uma falha de completude.**

### 12.2 Por que re-enumerar no fim

O bootstrap pode durar dias. O schema pode **ter mudado** durante o processo (alguém aplicou uma migration). Re-enumerar **no fim** — e não só no início — detecta objetos criados no meio do caminho. A enumeração inicial abre o contrato; a final o fecha.

### 12.3 Resultado

| Resultado da reconciliação | Ação |
|----------------------------|------|
| Manifesto cobre 100% do catálogo | Bootstrap concluído → migrar para Modo Incremental |
| Há objeto no banco fora do manifesto | Adicionar ao manifesto e voltar à fase apropriada |
| Há ficha sem objeto correspondente no banco | Objeto foi removido durante o bootstrap → marcar ficha como `deprecated` (nunca apagar — preserva histórico) |

---

## 13. Formato de Saída (Referência Operacional)

> **Provisório:** a spec **canônica** da ficha viverá no `PROTOCOLO-DOCUMENTACAO-BANCO.md`. Esta seção é a referência operacional para o agente produzir corretamente enquanto o protocolo principal não existe. Quando ele for criado, esta seção será substituída por uma referência a ele.

### 13.1 Frontmatter de cada ficha de tabela

```yaml
---
objeto: clients
tipo: tabela
schema: public
status: existente          # existente | mock | producao
tier: nucleo               # nucleo | suporte | estrutural | suspeita-morta
dominio: crm
rls_enabled: true
colunas: 14
edge_functions: []         # funções que tocam esta tabela
prds_relacionados: []      # preenchido quando entrar no modo incremental
atualizado_em: 2026-06-17
fonte_contexto: inferido   # verificado | inferido | pendente
---
```

### 13.2 Seções fixas da ficha (nesta ordem)

1. **Cabeçalho** — nome, propósito em uma linha, status, tier
2. **Descrição da entidade** — papel no domínio `[marcador de origem]`
3. **Colunas** — tabela: nome, tipo, nullable, default, observação `[mecânico]`
4. **Relacionamentos** — FKs entrando e saindo `[mecânico]`
5. **RLS** — policies (regra `[mecânico]` + justificativa `[marcador de origem]`)
6. **Índices** — `[mecânico]`
7. **Triggers** — `[mecânico]`
8. **Regras de negócio** — `[marcador de origem]`
9. **Perguntas pendentes** — lista para o humano (some quando respondidas)
10. **Histórico** — alterações nesta tabela ao longo do tempo

### 13.3 Convenção de nomes (endereço previsível)

| Objeto | Arquivo |
|--------|---------|
| Tabela `clients` | `docs/database/tables/TABLE-clients.md` |
| Edge function `sync-andamentos` | `docs/database/functions/FUNCTION-sync-andamentos.md` |
| Manifesto | `docs/database/_MANIFESTO-BOOTSTRAP.md` |
| Índice mestre | `docs/database/MODELO-DADOS-{projeto}.md` |

> O nome é o endereço: um agente que precisa da tabela `clients` **constrói** o caminho `tables/TABLE-clients.md` por regra, sem buscar.

---

## 14. Anti-Padrões — O Que Evitar

### 14.1 Inventar contexto para preencher lacuna

❌ **Errado:** documentar a tabela `transactions` como "armazena transações financeiras" sem verificar (quando na verdade são eventos de auditoria).

✅ **Correto:** `🔍 inferido de src/audit/logger.ts: parece armazenar eventos de auditoria` ou `❓ pendente: confirmar propósito com o dev`.

### 14.2 Documentar sem enumerar primeiro

❌ **Errado:** sair documentando tabela por tabela conforme encontra, confiando na memória para saber se cobriu tudo.

✅ **Correto:** Fase 0 primeiro — enumerar todo o catálogo no manifesto, depois processar contra o checklist.

### 14.3 Transcrever a camada mecânica à mão

❌ **Errado:** digitar colunas e tipos de 800 tabelas manualmente.

✅ **Correto:** gerar a camada mecânica com ferramenta; enriquecer e validar em cima.

### 14.4 Enriquecer tudo com a mesma profundidade

❌ **Errado:** escrever contexto detalhado para tabelas de junção e logs.

✅ **Correto:** tiers — esforço de contexto só onde compensa; esqueleto para o resto.

### 14.5 Um único diagrama ER e um índice plano

❌ **Errado:** um diagrama Mermaid com 800 entidades; um índice de 800 linhas.

✅ **Correto:** ER por domínio + mapa de domínios; índice hierárquico (índice-de-índices).

### 14.6 Tratar o bootstrap como sessão única

❌ **Errado:** assumir que o bootstrap termina numa rodada e não registrar progresso.

✅ **Correto:** manifesto como estado persistente; atualizar após cada objeto; qualquer agente retoma.

### 14.7 Não reconciliar no fim

❌ **Errado:** declarar concluído porque "processou bastante tabela".

✅ **Correto:** re-enumerar o banco vivo e cruzar com o manifesto — completude é provada, não presumida.

---

## 15. Checklist do Agente

A garantia de "não esquecer nada", em forma operacional:

### Fase 0 — Enumeração
- [ ] Enumerou tabelas em **todos** os schemas (não só `public`)
- [ ] Enumerou views, functions, triggers, RLS policies, sequences, enums
- [ ] Enumerou edge functions (pasta `supabase/functions/`)
- [ ] Persistiu tudo no `_MANIFESTO-BOOTSTRAP.md` com status `pendente`

### Fase 1 — Tiers
- [ ] Classificou cada objeto (nucleo/suporte/estrutural/suspeita-morta)
- [ ] Registrou o tier no manifesto
- [ ] Marcou tabelas sem uso no código como `suspeita-morta`

### Fase 2 — Esqueleto
- [ ] Gerou a camada mecânica com ferramenta (não à mão)
- [ ] Frontmatter completo em cada ficha
- [ ] Índice mestre hierárquico (não plano)
- [ ] ER por domínio (não um diagrama gigante)
- [ ] Panorama de RLS consolidado
- [ ] Catálogo de edge functions
- [ ] Marcou objetos como `gerado` no manifesto

### Fase 3 — Contexto
- [ ] Enriqueceu tier `nucleo` (e leve em `suporte`)
- [ ] Toda afirmação de contexto tem marcador de origem
- [ ] Toda inferência cita a fonte
- [ ] Gerou lista de perguntas cirúrgicas para o humano
- [ ] Persistiu por lote e atualizou manifesto (`enriquecido`)

### Fase 4 — Validação
- [ ] Humano validou fichas `nucleo`/`suporte`
- [ ] Inferências erradas corrigidas
- [ ] Perguntas respondidas; flags de "suspeita-morta" confirmados
- [ ] Marcou objetos como `validado`

### Fase Final — Reconciliação
- [ ] Re-enumerou o banco vivo
- [ ] Cruzou catálogo atual contra o manifesto
- [ ] 100% dos objetos do banco têm ficha (status ≥ `gerado`)
- [ ] Fichas órfãs (objeto removido) marcadas como `deprecated`
- [ ] Projeto migrado para Modo Incremental

---

## Apêndice A — Receitas de Introspecção por Stack

> A **descoberta** é específica do stack; o **formato de saída** é idêntico em todos os projetos.

### A.1 PostgreSQL / Supabase

**Enumerar todas as tabelas (todos os schemas de usuário):**
```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
  AND table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name;
```

**Views, functions, triggers, RLS policies, tipos:**
```sql
-- Views
SELECT table_schema, table_name FROM information_schema.views
WHERE table_schema NOT IN ('pg_catalog', 'information_schema');

-- Functions / procedures
SELECT n.nspname AS schema, p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema');

-- Triggers
SELECT event_object_schema, event_object_table, trigger_name,
       event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_schema NOT IN ('pg_catalog', 'information_schema');

-- RLS policies (todas)
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies;

-- Enums e tipos customizados
SELECT n.nspname AS schema, t.typname, t.typtype
FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND t.typtype IN ('e','c','d');   -- enum, composite, domain
```

**Detalhe por tabela (colunas, FKs, índices, RLS on/off, comentários):**
```sql
-- Colunas
SELECT column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = :schema AND table_name = :table
ORDER BY ordinal_position;

-- Foreign keys
SELECT kcu.column_name,
       ccu.table_schema AS ref_schema, ccu.table_name AS ref_table,
       ccu.column_name AS ref_column, tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = :schema AND tc.table_name = :table;

-- Índices
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = :schema AND tablename = :table;

-- RLS habilitada?
SELECT c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = :schema AND c.relname = :table;

-- Comentários (COMMENT ON)
SELECT obj_description(format('%I.%I', :schema, :table)::regclass, 'pg_class');
```

**Edge Functions (Supabase):** não estão no Postgres. Enumerar via CLI `supabase functions list` ou listar a pasta `supabase/functions/` do repositório.

### A.2 MySQL / MariaDB

- Tabelas/colunas: `information_schema.TABLES`, `information_schema.COLUMNS`
- FKs: `information_schema.KEY_COLUMN_USAGE` (com `REFERENCED_TABLE_NAME IS NOT NULL`)
- Índices: `information_schema.STATISTICS`
- Triggers: `information_schema.TRIGGERS`
- **Sem RLS nativo** — registrar isso explicitamente na ficha (controle de acesso fica na aplicação).

### A.3 SQL Server

- Tabelas/colunas: `INFORMATION_SCHEMA.TABLES`, `sys.columns`
- FKs: `sys.foreign_keys` + `sys.foreign_key_columns`
- Índices: `sys.indexes`
- RLS: `sys.security_policies` + `sys.security_predicates`

### A.4 Ferramentas recomendadas

| Ferramenta | Uso |
|------------|-----|
| **tbls** | Gera Markdown por tabela + diagrama ER a partir do banco vivo (Postgres, MySQL, SQL Server e outros). Principal recomendação para a Fase 2. |
| **SchemaSpy** | Gera documentação HTML navegável. |
| **`supabase db dump`** | Exporta o schema completo para inspeção offline. |
| **DBML / dbdocs.io** | Representação textual do schema; útil para diagramas. |

---

## Apêndice B — Heurísticas de Classificação em Tiers

Sinais que o agente usa para classificar automaticamente (Fase 1). Nenhum é definitivo isolado; o conjunto orienta.

| Sinal | Aponta para |
|-------|-------------|
| Muitas FKs de outras tabelas apontando para ela (alto in-degree) | `nucleo` |
| Nome é substantivo de negócio (cliente, processo, pedido, fatura) | `nucleo` |
| Referenciada com frequência no código da aplicação | `nucleo` / `suporte` |
| PK composta **apenas** de FKs + ≤ ~3 colunas no total | `estrutural` (tabela de junção pura) |
| Sufixo `_log`, `_audit`, `_history`, `_evento`, `_tmp`, `_staging` | `estrutural` |
| Prefixo de sistema/extensão (ex.: tabelas internas de libs) | `estrutural` |
| Zero referências no código + sem escrita recente (se detectável) | `suspeita-morta` (flag para humano) |

> **Regra de segurança:** na dúvida entre `nucleo` e `suporte`, classificar como `suporte` (recebe ao menos esqueleto + contexto leve). Na dúvida entre dar contexto ou marcar morta, **nunca** descartar — gerar esqueleto e perguntar ao humano.

---

## Glossário

| Termo | Definição |
|-------|-----------|
| **Bootstrap** | Documentação inicial, única, de um banco que já existe |
| **Modo Incremental** | Operação rotineira: documentar cada alteração no ato; banco como último recurso |
| **Manifesto** | Checklist mestre de todos os objetos do banco; contrato de completude e estado do progresso |
| **Tier** | Nível de profundidade de documentação atribuído a um objeto (nucleo/suporte/estrutural/suspeita-morta) |
| **Camada mecânica** | Fatos extraíveis do schema: colunas, tipos, FKs, índices, triggers, RLS policies |
| **Camada de contexto** | Significado e regras que não estão no schema; exigem inferência rastreável ou confirmação humana |
| **Marcador de origem** | Selo de confiabilidade de um campo de contexto: `✅ verificado` / `🔍 inferido` / `❓ pendente` |
| **Reconciliação** | Cruzamento final entre o catálogo do banco vivo e o manifesto, provando completude |
| **Ficha** | Documento de uma tabela ou objeto, em endereço previsível |
| **Edge Function** | Função serverless do Supabase; vive no repositório, não no Postgres |

---

## Controle de Versões deste Documento

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | Jun/2026 | AILA | Versão inicial. Procedimento de bootstrap em 5 fases + reconciliação. Mecanismos de escala para 800+ tabelas: manifesto como contrato de completude, classificação em tiers, geração mecânica obrigatória, resumabilidade e reconciliação final. Princípio inviolável anti-invenção com marcadores de origem. Apêndices de introspecção por stack e heurísticas de tiers. |
| 1.1 | Jun/2026 | AILA | Alinhamento com o guia AILA v1.7: exemplos de ficha com nomes de tabela em inglês snake_case (`TABLE-clients.md`); índice mestre com sufixo de projeto (`MODELO-DADOS-{projeto}.md`); `CLAUDE.md` referenciado como fonte das convenções esperadas, com regra de sinalização de divergências em bancos legados (documentar o que é, não corrigir em silêncio). |

---

> **Nota Final:** Documento vivo. Depende do `PROTOCOLO-DOCUMENTACAO-BANCO.md` para a anatomia canônica da ficha; a Seção 13 é provisória até a criação do protocolo principal.

---

**AILA - Sistemas Inteligentes**

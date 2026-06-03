# PRD-034: Catálogo de Modelos de Veículos

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | (repositório do projeto GALLO BASE DIESEL) |
| **Objetivo** | Estabelecer um catálogo canônico de modelos de veículos (marca + modelo + motor), eliminando strings livres divergentes e servindo de chave estável para Kits de composição e para a frota de clientes. |
| **Tipo** | Feature |
| **Complexidade** | Média |
| **Total de Fases** | 4 |
| **Prioridade** | Alta |
| **Épico** | Composição por Modelo (Kits) |
| **PRDs Relacionados** | PRD-002 (Modelo Conceitual), PRD-004 (Mocks), PRD-005 (Provider Pattern), PRD-006 (RBAC), PRD-016 (Veículos), PRD-030 (Catálogo de Peças), PRD-035 (Kits de Composição) |
| **Padrão de código** | Feature-based; código em `src/features/vehicle-models/`; tipos em `src/shared/types/vehicle-models.ts` |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios |
|--------------|-----------|
| **Baixa** | 1 arquivo, sem dependências externas, < 100 linhas |
| **Média** | 2-5 arquivos, banco OU integração, funcionalidade isolada |
| **Alta** | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Média:** entidade nova de referência (`IVehicleModel`) com CRUD próprio, validação de duplicata e geração de mocks por consolidação dos dados existentes; superfície de gestão embutida em `/app/kits` (espinha de navegação por modelo); sem integrações externas no MVP; consumida por PRD-035 (Kits) e pelo delta do PRD-016 (`IVehicle.modelId`). A complexidade não é Alta porque não há regras de negócio transacionais nem múltiplas integrações — é um catálogo de referência.

---

## Contexto do Problema

A plataforma já modela a relação peça↔veículo no nível individual (`IPart.applications`) e já trata o veículo do cliente como entidade de primeira classe (`IVehicle`, PRD-016). Porém, **não existe uma noção canônica de "modelo de mercado"**. Hoje, marca, modelo e motor são strings livres tanto em `IVehicle` quanto nas aplicações de peças.

A consequência aparece de forma concreta na listagem de veículos: um mesmo modelo real — por exemplo, "Scania R 450" — surge como entradas divergentes (`DC13`, `DC13 EURO 5`, `DC13 EURO 6`) porque o motor é digitado livremente. Isso impede agregações confiáveis, dificulta a busca e, principalmente, **inviabiliza pendurar uma composição curada de peças no modelo** (objetivo do PRD-035).

Este PRD resolve a raiz do problema: cria um catálogo canônico de modelos que serve de chave estável para os Kits e para a frota de clientes, na mesma lógica de dado de referência já usada no catálogo de peças (PRD-030). É pré-requisito do PRD-035 e do delta do PRD-016.

---

## Conceito da Solução

### Situação Atual (As-Is)

- `IVehicle` armazena `brand`, `model` e `engine` como texto livre.
- `IPart.applications` referencia marca/modelo/ano/motor também como texto livre.
- Não há entidade que represente o "modelo de mercado" de forma única; variações da mesma combinação coexistem como registros distintos.

### Situação Desejada (To-Be)

- Existe a entidade canônica `IVehicleModel` (marca + modelo + motor + faixa de anos).
- O catálogo é gerenciável por Gestor/Owner dentro de `/app/kits`, que passa a ter como espinha a navegação por modelo.
- Os mocks são derivados por consolidação das combinações distintas já presentes nos ~60 veículos e nas ~200 aplicações de peças, normalizando variações (ex.: as três grafias de "Scania R 450" tornam-se entradas canônicas corretas).
- O modelo canônico é a chave para o PRD-035 (Kits penduram em `modelId`) e para o delta do PRD-016 (`IVehicle.modelId`).

**Entidade `IVehicleModel`:**

```typescript
interface IVehicleModel {
  id: ID;
  brand: string;             // "Scania"
  model: string;             // "R 450"
  engine: string;            // "DC13 143 Euro 5"
  yearStart?: number;        // início da faixa de aplicação (opcional)
  yearEnd?: number;          // fim da faixa de aplicação (opcional)
  status: 'ativo' | 'inativo';
  createdBy: ID;
  createdAt: ISO8601;
  updatedAt: ISO8601;
  updatedBy?: ID;
}
```

> **Nota de modelagem — referência viva.** `IVehicleModel` é dado de referência vivo. `IVehicle` denormaliza `brand/model/engine` como display (snapshot leve), mas aponta para o modelo canônico via `modelId` (delta do PRD-016). Kits (PRD-035) referenciam `modelId`, nunca as strings.

### Alternativas Consideradas

| Alternativa | Por que foi descartada |
|-------------|------------------------|
| Autocomplete derivado das strings existentes (sem entidade canônica) | Resolve a digitação, mas não cria chave estável; variações continuam coexistindo; Kit teria de casar por string (frágil). Decisão do arquiteto foi pela entidade canônica agora. |
| Modelo canônico embutido dentro do PRD-035 (Kits) | Mistura duas preocupações (catálogo de referência vs. feature de Kit) num único PRD; viola a disciplina de "uma preocupação por PRD" do projeto. |
| Página dedicada e isolada `/app/modelos` | Usuário não tem o modelo mental de "gerenciar um catálogo de modelos"; geraria página órfã. O catálogo mora dentro de `/app/kits` como espinha de navegação. |
| Importar modelos de base externa (FIPE-like / DINTEC) no MVP | Sem backend ainda; dependência externa fora do escopo da Fase 1. Reservado para Fase 2. |

---

## Escopo

### Incluído

- ✅ Entidade `IVehicleModel` em `src/shared/types/vehicle-models.ts`
- ✅ Mocks (PRD-004) derivados por consolidação das combinações distintas dos ~60 veículos + ~200 aplicações de peças existentes, com variações normalizadas
- ✅ `useVehicleModelsProvider` (Provider Pattern, PRD-005) com interface estável (`list`, `get`, `create`, `update`, `delete`)
- ✅ Superfície de gestão embutida em `/app/kits`: navegação/listagem por modelo (a estrutura de Kits dentro de cada modelo é entregue no PRD-035)
- ✅ Busca textual (marca/modelo/motor) + filtro por marca + filtro por status
- ✅ CRUD de modelo (criar, editar, inativar) — Gestor/Owner
- ✅ Validação de duplicata (marca + modelo + motor único)
- ✅ Permissões via PRD-006 (`vehicle_model.*`)
- ✅ Audit log em criação, edição e inativação
- ✅ Empty states contextuais

### Excluído

- ❌ Importação de modelos via DINTEC ou base padrão de mercado — Fase 2
- ❌ Geração detalhada por ano/versão (model year a model year) — fora do MVP
- ❌ Imagens/fotos do modelo — Fase 2
- ❌ Vínculo automático em massa de veículos a modelos por heurística de IA — fora do MVP (vínculo é feito no delta do PRD-016 com revisão humana)
- ❌ Especificações técnicas detalhadas (cilindrada, potência, normas de emissão como campos estruturados) — fora do MVP (motor é string descritiva única)

---

## Requisitos Funcionais

### Modelo e mocks

- **RF-001:** Definir `IVehicleModel` em `src/shared/types/vehicle-models.ts` conforme conceito.
- **RF-002:** Gerar mocks (PRD-004) por consolidação das combinações distintas marca+modelo+motor presentes nos veículos (PRD-016) e nas aplicações de peças (PRD-030). Normalizar variações da mesma combinação (ex.: `DC13` / `DC13 EURO 5` / `DC13 EURO 6` de "Scania R 450" viram entradas canônicas corretas e distintas quando representarem motores realmente diferentes).
- **RF-003:** Garantir cobertura das 5 marcas (Volvo, Scania, Mercedes-Benz, Ford Cargo, Iveco) nos mocks gerados.

### Provider

- **RF-004:** Criar `useVehicleModelsProvider` com interface estável (`list`, `get`, `create`, `update`, `delete`), preparado para drop-in replacement Mock → Supabase na Fase 2.

### Listagem e navegação por modelo

- **RF-005:** Em `/app/kits`, renderizar a espinha de navegação por modelo: listagem dos modelos canônicos com marca, modelo, motor, faixa de anos e status.
- **RF-006:** Busca textual (debounce 300ms) em marca, modelo e motor.
- **RF-007:** Filtros: marca (multi-select) e status (ativo/inativo). URL sync de busca e filtros.
- **RF-008:** Contador "N modelos no catálogo" + estado vazio contextual quando não houver modelos.

### CRUD de modelo

- **RF-009:** Modal/página de criação de modelo (Gestor/Owner) com campos: marca (dropdown das 5 marcas + "Outro"), modelo (texto, obrigatório), motor (texto, obrigatório), faixa de anos (yearStart/yearEnd, opcionais).
- **RF-010:** Edição de modelo (Gestor/Owner), preservando `id` e referências.
- **RF-011:** Inativação de modelo (status `inativo`) em vez de exclusão física quando houver Kits ou veículos vinculados (preserva integridade referencial); exclusão física permitida apenas para modelos sem vínculos.
- **RF-012:** Validação de duplicata: combinação marca + modelo + motor deve ser única. Bloquear criação/edição que gere duplicata, com feedback inline.
- **RF-013:** Audit log (PRD-006) em criação, edição e inativação.

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Listagem e busca de modelos respondem em < 1s sobre o dataset mockado.
- **RNF-002 (Tipagem):** Zero `any`; `status` tipado via union literal.
- **RNF-003 (Compatibilidade):** Chrome, Firefox, Safari, Edge; light + dark mode obrigatórios.
- **RNF-004 (Drop-in replacement):** Provider preparado para troca Mock → Supabase via `VITE_DATA_SOURCE` sem alterar componentes consumidores.
- **RNF-005 (Acessibilidade):** WCAG 2.1 AA.

---

## Critérios de Aceitação

### RF-002: Mocks consolidados

```gherkin
DADO que os veículos e aplicações de peças contêm "Scania R 450" com motores "DC13", "DC13 EURO 5" e "DC13 EURO 6"
QUANDO os mocks de IVehicleModel são gerados
ENTÃO existe um conjunto canônico de modelos sem strings duplicadas para a mesma combinação real
  E variações que representam motores distintos viram entradas distintas e corretas
```

### RF-005: Navegação por modelo

```gherkin
DADO que sou Gestor e acesso /app/kits
QUANDO a página carrega
ENTÃO vejo a listagem de modelos canônicos com marca, modelo, motor, faixa de anos e status
```

### RF-012: Validação de duplicata

```gherkin
DADO que já existe o modelo Scania / R 450 / DC13 143 Euro 5
QUANDO tento criar outro modelo com a mesma combinação marca + modelo + motor
ENTÃO o sistema bloqueia a criação
  E exibe feedback inline "Modelo já existe no catálogo"
```

### Cenários de Erro

```gherkin
DADO que tento inativar um modelo que possui Kits ou veículos vinculados
QUANDO confirmo a ação
ENTÃO o modelo é marcado como inativo (não excluído fisicamente)
  E mantém as referências íntegras

DADO que sou Vendedor (sem permissão de escrita)
QUANDO acesso a navegação de modelos
ENTÃO vejo os modelos em modo leitura
  E não vejo os botões de criar/editar/inativar
```

---

## Fases de Implementação

| Fase | Objetivo | Arquivos Estimados |
|------|----------|-------------------|
| 1 | Modelo + mocks consolidados | 2-3 |
| 2 | Provider + permissões RBAC | 2-3 |
| 3 | Navegação por modelo + busca/filtros em /app/kits | 2-3 |
| 4 | CRUD + validação + audit + polish | 2-3 |

### Detalhamento das Fases

#### Fase 1: Modelo e mocks

**Objetivo:** entidade definida e catálogo canônico semeado.

**Ações:**
- [ ] Definir `IVehicleModel` em `src/shared/types/vehicle-models.ts`
- [ ] Implementar geração de mocks por consolidação (veículos + aplicações), normalizando variações
- [ ] Validar cobertura das 5 marcas

**Validação:** dataset de modelos canônico, sem duplicatas para a mesma combinação real.

#### Fase 2: Provider e permissões

**Objetivo:** acesso a dados padronizado e seguro.

**Ações:**
- [ ] `useVehicleModelsProvider` com interface estável
- [ ] Permissões `vehicle_model.*` em `src/shared/rbac/permissions.ts`
- [ ] Atualizar matriz visual de auditoria (PRD-006)

**Validação:** provider responde list/get/create/update/delete; permissões refletidas na matriz.

#### Fase 3: Navegação por modelo

**Objetivo:** espinha de `/app/kits` operacional.

**Ações:**
- [ ] Listagem de modelos em `/app/kits` com colunas e contador
- [ ] Busca textual + filtros (marca, status) com URL sync
- [ ] Empty states

**Validação:** Gestor navega, busca e filtra modelos; estados vazios coerentes.

#### Fase 4: CRUD e polish

**Objetivo:** ciclo de gestão completo.

**Ações:**
- [ ] Criar/editar/inativar modelo com validação de duplicata
- [ ] Audit log em todas as mutações
- [ ] Mobile responsivo + dark mode

**Validação:** duplicata bloqueada; inativação preserva referências; auditoria registrada.

---

## Dependências

### PRDs Anteriores

| PRD | Descrição | Status |
|-----|-----------|--------|
| PRD-002 | Modelo Conceitual (registry de tipos) | ✅ Concluído |
| PRD-004 | Mocks e geradores | ✅ Concluído |
| PRD-005 | Provider Pattern | ✅ Concluído |
| PRD-006 | RBAC e auditoria | ✅ Concluído |
| PRD-016 | Veículos | ✅ Concluído |
| PRD-030 | Catálogo de Peças | ✅ Concluído |

### Serviços Externos

| Serviço | Tipo | Status |
|---------|------|--------|
| — | — | Nenhum no MVP (Fase 1 mockup) |

### Decisões Pendentes

- [ ] Nenhuma. Decisões consolidadas: entidade canônica adotada agora; catálogo mora em `/app/kits`; mocks por consolidação.

---

## Cadeia de PRDs

Este PRD faz parte do épico **"Composição por Modelo (Kits)"**.

| Ordem | PRD | Título | Status | Relação |
|-------|-----|--------|--------|---------|
| **1** | **PRD-034** | **Catálogo de Modelos** | **🔄 ATUAL** | Base do épico |
| 2 | PRD-035 | Kits de Composição por Modelo | ⏳ | Depende de PRD-034 |
| 3 | Delta PRD-016 | `IVehicle.modelId` + aplicação de Kit | ⏳ | Depende de PRD-034 e PRD-035 |

> **Nota:** Implemente na ordem indicada. PRD-034 deve estar ✅ antes de iniciar o PRD-035.

**Legenda:** ✅ Implementado | 🔄 Atual | ⏳ Pendente

---

## Considerações de Segurança

### Dados Sensíveis

| Dado | Classificação | Proteção |
|------|---------------|----------|
| Modelo de veículo (marca/modelo/motor) | Público (referência) | Sem PII; controle de escrita por RBAC |

### Autenticação e Autorização

Leitura liberada para todos os papéis autenticados. Escrita (criar/editar/inativar) restrita a Gestor/Owner via `vehicle_model.*` (PRD-006).

### Auditoria

Logar criação, edição e inativação de modelo (autor, timestamp, valores alterados), conforme padrão de audit log do PRD-006.

---

## Fluxos de Usuário

### Fluxo Principal (Happy Path)

1. Gestor acessa `/app/kits`
2. Sistema lista os modelos canônicos (espinha de navegação)
3. Gestor identifica que falta um modelo e clica "Novo modelo"
4. Preenche marca, modelo, motor e faixa de anos
5. Sistema valida duplicata e salva; audit log registrado
6. Modelo passa a estar disponível para receber Kits (PRD-035) e para vínculo de veículos (delta PRD-016)

### Fluxos de Exceção

- **Modelo já existe:** validação inline bloqueia e orienta o Gestor a localizar o modelo existente.
- **Modelo com vínculos:** ao tentar excluir, o sistema oferece inativação em vez de exclusão física.

### Fluxos de Erro

- **Falha ao salvar:** feedback de erro não destrutivo; dados do formulário preservados.

---

### Convenções de Código (Referência Rápida)

| Elemento | Convenção | Exemplo |
|----------|-----------|---------|
| **Componentes React** | PascalCase | `VehicleModelList.tsx` |
| **Hooks** | camelCase + `use` | `useVehicleModelsProvider.ts` |
| **Pastas** | kebab-case | `vehicle-models/` |
| **Variáveis/Funções** | camelCase | `vehicleModel`, `findDuplicateModel()` |
| **Interfaces** | PascalCase + `I` | `IVehicleModel` |
| **Tabelas (banco, Fase 2)** | snake_case (plural) | `vehicle_models` |
| **Colunas (banco, Fase 2)** | snake_case | `created_at`, `year_start` |
| **Env vars (frontend)** | `VITE_` prefix | `VITE_DATA_SOURCE` |
| **Estrutura de pastas** | Feature-based | `src/features/vehicle-models/` |
| **Ícones** | Iconify (`@iconify/react`) | `<Icon icon="mdi:truck" />` |
| **Tema** | Light + Dark obrigatório | CSS variables para cores |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Este PRD foi criado pelo Agente Arquiteto. Você é o Desenvolvedor operando via Claude Code CLI.

### Esclarecimento de Dúvidas

> **💬 Antes de implementar, faça perguntas para esclarecer qualquer ambiguidade sobre: requisitos funcionais, restrições técnicas, dependências, comportamentos esperados e critérios de aceitação.**

### Instruções Obrigatórias

> **⚠️ 1. ANTES DE IMPLEMENTAR:** explore a estrutura dos dados existentes (veículos do PRD-016 e aplicações do PRD-030), planeje a consolidação dos mocks, investigue a fundo e revise antes de implementar.

> **⚠️ 2. APÓS IMPLEMENTAR:**
> - Incrementar a versão do app (SemVer)
> - Atualizar o CHANGELOG.md (Keep a Changelog)
> - Renomear este arquivo para `PRD-034-catalogo-modelos_DONE.md`
> - Atualizar a seção "Status de Implementação"

### Guia de Versionamento (SemVer)

| Tipo de Mudança | Ação | Exemplo |
|-----------------|------|---------|
| Correção de bug | PATCH +1 | 1.0.0 → 1.0.1 |
| Nova funcionalidade | MINOR +1, PATCH = 0 | 1.0.1 → 1.1.0 |
| Mudança incompatível | MAJOR +1, outros = 0 | 1.1.0 → 2.0.0 |

**Codinome sugerido:** "Catalog" (catálogo canônico de modelos).

### Princípios de Implementação

| Princípio | Descrição |
|-----------|-----------|
| **Dado de referência vivo** | Modelo é fonte viva; veículos denormalizam display, Kits referenciam `modelId` |
| **Consolidação criteriosa** | Normalizar variações reais; não fundir motores legitimamente distintos |
| **Integridade referencial** | Inativar em vez de excluir quando houver vínculos |
| **Drop-in replacement** | Provider com interface estável para Fase 2 |

### Orientações Gerais

| Aspecto | Orientação |
|---------|------------|
| **Consolidação de mocks** | Priorizar correção da combinação real sobre quantidade; documentar regras de normalização aplicadas |
| **Superfície em /app/kits** | Entregar apenas a espinha de navegação por modelo; a gestão de Kits dentro de cada modelo é do PRD-035 |

### O que NÃO Fazer

| ❌ Evitar |
|----------|
| Manter marca/modelo/motor como única fonte em string livre |
| Fundir motores realmente distintos numa só entrada na consolidação |
| Excluir fisicamente modelos com Kits/veículos vinculados |
| Implementar a gestão de Kits aqui (pertence ao PRD-035) |
| Criar página `/app/modelos` separada e órfã |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ✅ IMPLEMENTADO |
| **Data de Implementação** | 2026-06-03 |
| **Versão do App** | v0.63.0 Catalog |
| **Implementado por** | Claude Opus 4.8 (subagent-driven) |
| **Observações** | Sub-projeto 1 do épico Kits por modelo; consolidação dos mocks de modelos existentes adiada para PRD-035. |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 03/06/2026 | v1 | Criação inicial — catálogo canônico de modelos (`IVehicleModel`) como base do épico de Kits |

---

**AILA - Sistemas Inteligentes**

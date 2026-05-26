# PRD-033: Cálculo de Frete (esqueleto navegável)

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                                                |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                                                                                     |
| **Objetivo**          | Centralizar a lógica de cálculo de frete já consumida por PRDs 022, 031 e 032 — com 3 estratégias configuráveis (valor fixo por região / a combinar / cálculo preliminar por peso), painel admin para edição, e estrutura preparada para integração com transportadoras reais na Fase 2 |
| **Tipo**              | Feature                                                                                                                                                                                                                                                                                 |
| **Complexidade**      | Média                                                                                                                                                                                                                                                                                   |
| **Total de Fases**    | 3                                                                                                                                                                                                                                                                                       |
| **Prioridade**        | Média                                                                                                                                                                                                                                                                                   |
| **Épico**             | Bloco 3 — Comercial Operacional                                                                                                                                                                                                                                                         |
| **Profundidade**      | **Esqueleto enxuto (E)**                                                                                                                                                                                                                                                                |
| **PRDs Relacionados** | PRD-019 (Configurações), PRD-022 (Orçamento SDR), PRD-030 (Catálogo — peso), PRD-031 (Orçamento), PRD-032 (Pedido)                                                                                                                                                                      |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                                                                      |
| **Padrão de código**  | Feature-based; código em `src/features/shipping/`                                                                                                                                                                                                                                       |

---

## Contexto do Problema

PRDs 022, 031 e 032 já consomem `calculateShippingPlaceholder()` — função simples que retorna valor fixo por região. Esse cálculo está espalhado nos três PRDs com lógica duplicada. Três problemas concretos sem PRD-033 centralizando:

**Lógica duplicada em 3 lugares.** Cada PRD reimplementa "mesma cidade R$ 50 / mesmo estado R$ 80 / outros 'a combinar'". Mudança numa exige mudança nos outros. **Owner não pode configurar sem mexer no código.** Valores hardcoded; cliente real (GALLO) vai querer ajustar via UI. **Sem espaço para evolução.** Quando integrar com Correios/transportadoras na Fase 2, refatoração será maior do que precisava.

Este PRD centraliza tudo: função única `calculateShipping()` em `src/features/shipping/`, configurações em `IPlatformSettings.shipping`, painel admin `/app/configuracoes/frete` para edição visual, e estrutura preparada para drop-in replacement na Fase 2 quando integrar transportadora real.

---

## Conceito da Solução

### Modelo

```typescript
IShippingConfig {
  strategy: 'fixed_by_region' | 'to_negotiate_default' | 'preliminary_by_weight';
  rates: IShippingRate[];
  defaultWhenNoMatch: 'to_negotiate' | 'fixed_value';
  defaultFallbackValue?: number;
}

IShippingRate {
  id: ID;
  name: string;                       // "Mesma cidade", "RS", "SC + PR"
  scope: 'city' | 'state' | 'states' | 'nationwide';
  // Critérios
  cities?: string[];                  // se scope='city'
  states?: string[];                  // se scope='state' ou 'states'
  // Valor
  baseValue: number;
  weightSurcharge?: number;            // R$/kg adicional (opcional)
  // Status
  isActive: boolean;
}

IShippingResult {
  value?: number;                     // se calculado
  isToNegotiate: boolean;
  appliedRate?: IShippingRate;         // qual regra casou
  notes?: string;                     // mensagem ao cliente
}
```

### Estratégias

| Estratégia                  | Comportamento MVP                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `fixed_by_region` (default) | Busca primeiro rate cujos critérios casam com endereço do cliente; retorna `baseValue`    |
| `to_negotiate_default`      | Sempre retorna `isToNegotiate: true` — útil para clientes que não querem valor preliminar |
| `preliminary_by_weight`     | `baseValue + (peso * weightSurcharge)` se houver `weightSurcharge`                        |

### Defaults no MVP

```typescript
defaultShippingConfig: IShippingConfig = {
  strategy: "fixed_by_region",
  rates: [
    {
      name: "Frederico Westphalen",
      scope: "city",
      cities: ["Frederico Westphalen"],
      baseValue: 50,
      isActive: true,
    },
    { name: "RS", scope: "state", states: ["RS"], baseValue: 80, isActive: true },
    { name: "SC + PR", scope: "states", states: ["SC", "PR"], baseValue: 120, isActive: true },
  ],
  defaultWhenNoMatch: "to_negotiate",
  defaultFallbackValue: undefined,
};
```

### Função pública

```typescript
function calculateShipping(input: {
  address: IAddress;
  items?: IOrderItem[] | IQuoteItem[]; // para cálculo por peso
  config: IShippingConfig;
}): IShippingResult;
```

Função pura — recebe contexto, retorna resultado. Substituível por chamada a API de transportadora na Fase 2 sem mudar consumidores.

### Painel admin `/app/configuracoes/frete`

Sub-rota das configurações (PRD-019), Owner-only. UI:

**Seção 1 — Estratégia atual:**

- Radio com 3 opções, descrição de cada
- Default quando nenhuma regra casa: dropdown ("A combinar" / "Valor fixo de R$ X")

**Seção 2 — Regras de frete (se strategy='fixed_by_region'):**

- Tabela editável:
  - Nome da regra
  - Escopo (cidade / estado / múltiplos estados / nacional)
  - Valor base
  - Sobretaxa por kg (opcional)
  - Toggle ativo
  - Botão remover
- Botão "+ Adicionar regra"

**Seção 3 — Simulador:**

- Input: endereço (cidade + estado)
- Input opcional: peso total dos items
- Botão "Calcular"
- Resultado: valor + regra aplicada + notas

**Seção 4 — Placeholder Fase 2:**

- Card informativo: "Integração com transportadoras (Correios, Mercurio, JadLog) disponível na Fase 2 — permitirá cálculo real por CEP origem/destino, dimensões e peso"

### Permissões

- **Owner**: edita configurações, vê simulador
- **Gestor**: vê configurações (read-only) e simulador
- **Vendedor**: NÃO acessa o painel; usa cálculo via PRDs 031/032

### Alternativas Consideradas

| Alternativa                                       | Por que foi descartada                                       |
| ------------------------------------------------- | ------------------------------------------------------------ |
| Sem PRD dedicado (lógica fica nos 3 consumidores) | Duplicação maior + refatoração custosa na Fase 2             |
| Integrar transportadora real no MVP               | Complexidade alta (autenticação API, contratos, debug)       |
| Cálculo por CEP via tabela completa               | Massa de dados muito grande sem ROI no MVP                   |
| Apenas valor fixo único (sem regiões)             | Cliente quer cobrar diferenciado por região — feature básica |
| Sem peso                                          | Caminhão pesado → frete alto inerente — peso importa         |

**Decisão consolidada:** **3 estratégias configuráveis, painel admin para edição, simulador para validação, estrutura preparada para drop-in replacement Fase 2.**

---

## Escopo

### Incluído

- ✅ Modelo `IShippingConfig`, `IShippingRate`, `IShippingResult` em `src/shared/types/shipping.ts`
- ✅ Função pública `calculateShipping(input): IShippingResult` em `src/features/shipping/api/`
- ✅ Substituição dos stubs em PRDs 022, 031, 032 pela função real
- ✅ Default config carregado em `IPlatformSettings.shipping`
- ✅ Painel admin `/app/configuracoes/frete` (sub-rota de PRD-019) com:
  - Seleção de estratégia
  - CRUD de regras (tabela editável)
  - Simulador interativo
  - Card placeholder informando sobre Fase 2
- ✅ 3 estratégias: `fixed_by_region`, `to_negotiate_default`, `preliminary_by_weight`
- ✅ Lógica de match de regra: city > state > states > nationwide (mais específico primeiro)
- ✅ Cálculo por peso opcional (multiplicador R$/kg)
- ✅ Mensagem ao cliente quando "a combinar"
- ✅ Permissões (Owner edita, Gestor visualiza, Vendedor não acessa)
- ✅ Audit log em mudanças de configuração
- ✅ Substituir sub-rota placeholder de "Frete" em PRD-019 por edição funcional

### Excluído

- ❌ Integração com transportadoras reais (Correios, Mercurio, JadLog) — Fase 2
- ❌ Cálculo por CEP origem/destino — Fase 2
- ❌ Cálculo por dimensões (cubagem) — Fase 2
- ❌ Múltiplas opções de frete (expresso vs normal) — Fase 2
- ❌ Cotação automática com APIs externas — Fase 2
- ❌ Promoções de frete grátis acima de X — Fase 2
- ❌ Tracking real do envio — Fase 2
- ❌ Comparativo de preços entre transportadoras — Fase 2
- ❌ Calculadora pública para cliente B2C no e-commerce — entra no PRD-064 (e-commerce)

---

## Requisitos Funcionais

### Modelo

- **RF-001:** Adicionar `IShippingConfig`, `IShippingRate`, `IShippingResult`, `ShippingStrategy` em `src/shared/types/shipping.ts`.
- **RF-002:** Estender `IPlatformSettings.shipping` (substituir `sdrShippingPlaceholder` do PRD-022 por `shipping` completo).
- **RF-003:** Default config carregado em mocks (PRD-004 update) com 3 regras (Frederico Westphalen / RS / SC+PR).

### Função pública

- **RF-004:** Criar `calculateShipping(input): IShippingResult` em `src/features/shipping/api/calculate.ts`:
  - Função **pura**
  - Match em ordem de especificidade: cidade > estado(s) > nationwide
  - Se nenhum match e `defaultWhenNoMatch='to_negotiate'`: retorna `{ isToNegotiate: true, notes: 'a combinar' }`
  - Se `defaultWhenNoMatch='fixed_value'`: retorna `{ value: defaultFallbackValue, isToNegotiate: false }`
- **RF-005:** Se strategy='preliminary_by_weight' E regra tem `weightSurcharge`:
  - Calcular peso total = sum(items.map(item => item.partWeight \* item.quantity))
  - Adicionar `weightSurcharge * peso` ao `baseValue`
  - `notes` indica: "Cálculo preliminar baseado em peso"

### Substituir stubs nos PRDs anteriores

- **RF-006:** PRD-022: substituir `calculateShippingPlaceholder` por `calculateShipping`. Função agora retorna estrutura `IShippingResult` consistente.
- **RF-007:** PRD-031 (criação de orçamento): botão "Calcular frete" chama `calculateShipping` real.
- **RF-008:** PRD-032 (criação de pedido): herda frete do orçamento via snapshot (não recalcula).

### Painel admin

- **RF-009:** Criar `ShippingConfigPage` em `src/features/shipping/pages/`, rota `/app/configuracoes/frete`.
- **RF-010:** Protegido por `<GuardedRoute permission={{ resource: 'settings', action: 'edit' }}>` — Owner.
- **RF-011:** Gestor pode acessar em modo read-only (banner "Edição requer permissão de Owner").
- **RF-012:** Atualizar PRD-019: substituir sub-rota placeholder de Frete por embed deste painel.

### Seções do painel

- **RF-013:** **Seção 1 — Estratégia**:
  - Radio com 3 opções + descrição de cada
  - Para `to_negotiate_default`: aviso "Todas as cotações retornarão 'a combinar'"
  - Para `preliminary_by_weight`: lembrete de que items precisam ter `weight` cadastrado no catálogo
- **RF-014:** **Seção 2 — Regras** (visível quando strategy='fixed_by_region' ou 'preliminary_by_weight'):
  - Tabela com colunas: nome, escopo, valor base, sobretaxa/kg, ativo, ações
  - Cada linha editável inline
  - Botão "+ Adicionar regra" abre modal:
    - Nome (texto)
    - Escopo (radio: cidade / estado / múltiplos estados / nacional)
    - Cidades/estados conforme escopo (multi-input ou dropdown)
    - Valor base (R$)
    - Sobretaxa por kg (R$/kg, opcional)
    - Toggle ativo
- **RF-015:** Default quando nenhuma regra casa:
  - Dropdown: "A combinar" / "Valor fixo de R$ \_\_\_"
  - Se "Valor fixo", input numérico ao lado
- **RF-016:** **Seção 3 — Simulador**:
  - Inputs: cidade, estado, peso total (opcional)
  - Botão "Calcular"
  - Resultado: valor calculado OU "a combinar" + regra aplicada + notas
- **RF-017:** **Seção 4 — Placeholder Fase 2**:
  - Card informativo com texto:
    > "Integração com transportadoras (Correios, Mercurio, JadLog) disponível na Fase 2 — permitirá cálculo real por CEP origem/destino, dimensões, peso e múltiplas opções de envio (expresso vs normal)"

### Persistência

- **RF-018:** Salvar via `useSettingsProvider().update()`.
- **RF-019:** Toast de confirmação ao salvar.
- **RF-020:** Audit log com sumário das mudanças.
- **RF-021:** Modal de confirmação se há mudanças não salvas ao tentar navegar.

### Permissões

- **RF-022:** Owner: edita tudo.
- **RF-023:** Gestor: visualiza tudo, simulador funciona, edição bloqueada (campos disabled com tooltip).
- **RF-024:** Vendedor: sem acesso (GuardedRoute redireciona).

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** `calculateShipping()` < 5ms (lookup local).
- **RNF-002 (Tipagem):** Zero `any`.
- **RNF-003 (Compatibilidade Fase 2):** Interface se mantém quando substituir por chamada a API real.
- **RNF-004 (Acessibilidade):** WCAG 2.1 AA.

---

## Critérios de Aceitação

### Cálculo

```gherkin
DADO config com regras default e strategy='fixed_by_region'
QUANDO calculateShipping({ address: { city: 'Frederico Westphalen', state: 'RS' } }) executa
ENTÃO retorna { value: 50, isToNegotiate: false, appliedRate: 'Frederico Westphalen' }

DADO endereço em Erechim/RS
QUANDO calculateShipping executa
ENTÃO retorna { value: 80, appliedRate: 'RS' } (match em estado)

DADO endereço em Curitiba/PR
QUANDO calculateShipping executa
ENTÃO retorna { value: 120, appliedRate: 'SC + PR' }

DADO endereço em São Paulo/SP (sem match)
QUANDO calculateShipping executa
ENTÃO retorna { isToNegotiate: true, notes: 'a combinar' }
```

### Strategy preliminary_by_weight

```gherkin
DADO strategy='preliminary_by_weight' E regra com baseValue=80 e weightSurcharge=2
  E items totalizando 15kg
QUANDO calculateShipping executa
ENTÃO retorna { value: 110 } (80 + 2*15)
  E notes inclui "Cálculo preliminar baseado em peso"
```

### Painel admin

```gherkin
DADO sou Owner e acesso /app/configuracoes/frete
QUANDO a página carrega
ENTÃO vejo 4 seções (estratégia, regras, simulador, placeholder Fase 2)

DADO adiciono nova regra "Bahia" estado=BA, baseValue=200 e salvo
QUANDO save processa
ENTÃO regra é persistida em IPlatformSettings.shipping.rates
  E próximas cotações para BA retornam R$ 200
  E audit log registra

DADO uso o simulador com cidade=Porto Alegre, estado=RS
QUANDO clico "Calcular"
ENTÃO vejo resultado: R$ 80 (regra RS aplicada)

DADO sou Gestor
QUANDO acesso /app/configuracoes/frete
ENTÃO vejo tudo mas inputs estão disabled
  E banner: "Edição requer permissão de Owner"
  E simulador funciona normalmente
```

### Integração com outros PRDs

```gherkin
DADO PRD-022 (SDR) cria orçamento para cliente em Frederico Westphalen
QUANDO calculateShipping é chamado
ENTÃO retorna R$ 50 (usa regra atual; não mais hardcoded)
  E quote.shippingCost = 50

DADO PRD-031 vendedor cria orçamento e clica "Calcular frete"
QUANDO ação processa
ENTÃO usa endereço de entrega do orçamento
  E preenche shippingCost automaticamente
  E mostra qual regra casou
```

### Cenários de erro

```gherkin
DADO nenhuma regra ativa (Owner desativou todas)
QUANDO calculateShipping executa
ENTÃO retorna defaultWhenNoMatch resultado
  E painel mostra banner "Atenção: sem regras ativas — todas cotações usarão default"

DADO tento criar regra com nome duplicado
QUANDO submeto
ENTÃO validação: "Já existe regra com esse nome"
```

---

## Fases de Implementação

| Fase | Objetivo                                                             | Arquivos Estimados |
| ---- | -------------------------------------------------------------------- | ------------------ |
| 1    | Modelo + função pública + substituição dos stubs em PRDs 022/031/032 | 4-5                |
| 2    | Painel admin com seções de estratégia, regras CRUD                   | 4-5                |
| 3    | Simulador + permissões + integração com PRD-019 + polish             | 3-4                |

### Detalhamento das Fases

#### Fase 1: Modelo e Função

- [ ] Tipos `IShippingConfig`, `IShippingRate`, `IShippingResult`
- [ ] `calculateShipping()` função pura
- [ ] Mocks: default config carregado
- [ ] Substituir `calculateShippingPlaceholder` no PRD-022 pela função real
- [ ] Substituir stubs nos PRDs 031 e 032

**Validação:** orçamentos criados via SDR/manual usam regras configuráveis; valores batem com regras default.

#### Fase 2: Painel

- [ ] `ShippingConfigPage` com 4 seções
- [ ] Tabela editável de regras
- [ ] Modal "+ Adicionar regra"
- [ ] Validações + audit log + toast

**Validação:** Owner adiciona/edita/desativa regras; mudanças refletem em próximas cotações.

#### Fase 3: Simulador, Permissões, Polish

- [ ] Simulador interativo funcionando
- [ ] Permissões (Owner edita, Gestor read-only, Vendedor sem acesso)
- [ ] Atualizar PRD-019 substituindo placeholder por embed deste painel
- [ ] Mobile responsivo
- [ ] Documentação `docs/shipping.md`

**Validação:** simulador retorna valor certo; Gestor vê mas não edita; sub-rota acessível via /app/configuracoes/frete.

---

## Dependências

### PRDs Anteriores

| PRD                                | Status      |
| ---------------------------------- | ----------- |
| PRD-002 (IAddress)                 | 📝 Redigido |
| PRD-005 (Provider)                 | 📝 Redigido |
| PRD-006 (RBAC)                     | 📝 Redigido |
| PRD-019 (Configurações — sub-rota) | 📝 Redigido |
| PRD-022 (substitui stub)           | 📝 Redigido |
| PRD-030 (peso opcional em IPart)   | 📝 Redigido |
| PRD-031 (substitui stub)           | 📝 Redigido |
| PRD-032 (substitui stub)           | 📝 Redigido |

### Decisões Pendentes

Nenhuma.

---

## Cadeia de PRDs

| Ordem  | PRD          | Status       |
| ------ | ------------ | ------------ |
| 1-18   | PRDs 010-032 | 📝           |
| **19** | **PRD-033**  | **🔄 ATUAL** |

> **Marco:** com este PRD, **Bloco 3 (Comercial Operacional) está completo**.

---

## Considerações de Segurança

### Configuração afeta valores comerciais

Mudança em regras afeta orçamentos novos. Audit log obrigatório. Mudança ampla pode gerar surpresa em vendedores — toast confirma.

### Default seguro

`defaultWhenNoMatch='to_negotiate'` é mais conservador que valor fixo — protege empresa de cobrar errado em regiões não mapeadas.

### Snapshot no pedido

PRD-032 preserva `shippingCost` no pedido — mudança nas regras não afeta pedidos já feitos.

---

## Fluxos de Usuário

### Fluxo Principal — Owner configura frete

1. João Gallo acessa `/app/configuracoes/frete`
2. Estratégia atual: `fixed_by_region`
3. Vê 3 regras default (Frederico Westphalen / RS / SC + PR)
4. Adiciona nova regra "MG" (estado=MG, baseValue=180)
5. Usa simulador: cidade=Belo Horizonte, estado=MG → R$ 180
6. Salva → audit log
7. Próximo orçamento para BH cobra R$ 180

### Fluxo SDR

1. Cliente em Curitiba/PR pede orçamento via SDR
2. PRD-022 chama `calculateShipping({ address: { city: 'Curitiba', state: 'PR' } })`
3. Função retorna R$ 120 (regra "SC + PR")
4. Mensagem ao cliente inclui "Frete: R$ 120,00"

### Fluxo Vendedor

1. Vendedor cria orçamento manual em PRD-031
2. Cliente é de Manaus/AM (sem regra)
3. Clica "Calcular frete"
4. Resultado: "a combinar" (fallback default)
5. Vendedor edita manualmente após confirmar com cliente

---

## Convenções de Código

| Elemento        | Convenção           | Exemplo                                                             |
| --------------- | ------------------- | ------------------------------------------------------------------- |
| **Página**      | PascalCase + `Page` | `ShippingConfigPage`                                                |
| **Função**      | camelCase           | `calculateShipping()`                                               |
| **Pasta**       | kebab-case          | `shipping/`                                                         |
| **Git commits** | Conventional        | `feat(shipping): centralize shipping calculation with 3 strategies` |

---

## Notas para o Agente Desenvolvedor

### Princípios

| Princípio                     | Descrição                                                |
| ----------------------------- | -------------------------------------------------------- |
| **Centralização**             | 1 função pública consumida por 3+ PRDs                   |
| **Drop-in para Fase 2**       | Interface estável para receber dados de transportadoras  |
| **Default seguro**            | "A combinar" quando não há match                         |
| **Snapshot preserva valores** | Pedido não recalcula quando regras mudam                 |
| **Permissões granulares**     | Owner edita, Gestor vê, Vendedor consome via outros PRDs |

### O que NÃO Fazer

| ❌ Evitar                                               |
| ------------------------------------------------------- |
| Integrar com transportadora real — Fase 2               |
| Cálculo por CEP completo — Fase 2                       |
| Múltiplas opções de envio (expresso vs normal) — Fase 2 |
| Hardcodar valores no código                             |
| Permitir Vendedor acessar painel                        |
| Esquecer audit log em mudanças                          |
| Recalcular frete em pedido já criado                    |

---

## Status de Implementação

| Campo      | Valor       |
| ---------- | ----------- |
| **Status** | ⏳ PENDENTE |

---

## Histórico

| Data       | Versão | Alteração                                                                                   |
| ---------- | ------ | ------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — centralização de cálculo de frete, 3 estratégias, painel admin, simulador |

---

**AILA - Sistemas Inteligentes**

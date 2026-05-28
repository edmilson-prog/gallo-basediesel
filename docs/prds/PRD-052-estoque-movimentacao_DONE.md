# PRD-052: Estoque (Movimentação)

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                  |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                       |
| **Objetivo**          | Construir histórico de movimentações de estoque — no MVP derivado de saídas (pedidos pagos), com placeholder coerente para entradas/ajustes/transferências (Fase 2 com integração DINTEC) |
| **Tipo**              | Feature                                                                                                                                                                                   |
| **Complexidade**      | Média                                                                                                                                                                                     |
| **Total de Fases**    | 3                                                                                                                                                                                         |
| **Prioridade**        | Média                                                                                                                                                                                     |
| **Épico**             | Bloco 4b — Gestão B (Onda 2)                                                                                                                                                              |
| **Profundidade**      | **Esqueleto enxuto (E)**                                                                                                                                                                  |
| **PRDs Relacionados** | PRD-030 (Catálogo), PRD-032 (Pedido), PRD-050 (Estoque Análise)                                                                                                                           |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                        |
| **Padrão de código**  | Feature-based; código em `src/features/inventory-movement/`                                                                                                                               |

### Critérios de Complexidade

> **Justificativa de Média:** modelo de movimentação derivado de pedidos pagos no MVP (sem mutations próprias), tabela cronológica com filtros, integração com PRD-030 e PRD-032, placeholder para 3 tipos de movimentação (entrada/ajuste/transferência) preparados para Fase 2.

---

## Contexto do Problema

PRD-050 analisa estoque atual (estado). Owner também precisa **histórico de movimentações**:

**O que aconteceu com esse estoque?** Saiu 200 filtros do estoque em janeiro — para quais pedidos? **Quando entrou aquele lote?** Entrada de mercadoria placeholder até DINTEC. **Houve ajuste manual?** Inventário detectou divergência — registro auditável.

No MVP, apenas saídas (derivado de pedidos pagos) são reais. Entradas, ajustes e transferências são placeholders coerentes preparando estrutura para Fase 2.

---

## Conceito da Solução

### Tipos de movimentação

| Tipo                 | MVP                             | Fase 2             |
| -------------------- | ------------------------------- | ------------------ |
| `saida_venda`        | ✅ Derivado de pedido pago      | Real               |
| `entrada_compra`     | ⏸ Placeholder                   | DINTEC integration |
| `ajuste_inventario`  | ⏸ Placeholder                   | DINTEC integration |
| `transferencia_loja` | ⏸ Placeholder                   | Multi-loja Fase 2  |
| `devolucao`          | ✅ Derivado de pedido devolvido | Real               |

### Modelo

```typescript
IInventoryMovement {
  id: ID;
  type: MovementType;
  partId: ID;
  partName: string;                  // snapshot
  partOemCode: string;
  quantity: number;                  // positivo entrada, negativo saída
  // Origem
  orderId?: ID;                      // se saida_venda ou devolucao
  // Detalhes (Fase 2)
  invoiceNumber?: string;
  reason?: string;
  performedBy: ID;                   // user que executou (ou sistema)
  performedAt: ISO8601;
  storeId: ID;
  notes?: string;
}

type MovementType = 'saida_venda' | 'entrada_compra' | 'ajuste_inventario' | 'transferencia_loja' | 'devolucao';
```

### Página `/app/estoque-movimentacao`

Header: filtros (tipo, produto, período, vendedor responsável, loja Owner).

**Tabela cronológica** (reversa, mais recente primeiro):

- Data/hora
- Tipo (badge colorido)
- Produto + OEM
- Quantidade (verde se entrada, vermelho se saída)
- Origem (link para pedido se saida_venda)
- Executado por
- Notas

**KPIs no topo:**

- Total movimentações no período
- Saídas (R$ valor)
- Entradas (placeholder)
- Ajustes (placeholder)

**Botão "Nova movimentação manual"** com tooltip "Disponível na Fase 2 — entradas e ajustes via DINTEC".

### Drill-downs

- Click em linha saida_venda → pedido (PRD-032)
- Click em produto → ficha (PRD-030)

### Permissões

- **Owner**: tudo
- **Gestor**: loja
- **Financeiro**: read-only
- **Vendedor**: SEM ACESSO

### Alternativas Consideradas

| Alternativa                                 | Por que descartada                                              |
| ------------------------------------------- | --------------------------------------------------------------- |
| Implementar entradas/ajustes manuais no MVP | Sem integração DINTEC, duplicação manual gera inconsistências   |
| Sem placeholder das outras movimentações    | Owner não vê estrutura completa do que virá                     |
| Mutar estoque via essas movimentações       | PRD-030 define stockQuantity; mutar criaria 2 fontes de verdade |

---

## Escopo

### Incluído

- ✅ Modelo `IInventoryMovement`, `MovementType`
- ✅ Geração derivada: para cada pedido pago, gera IInventoryMovement tipo `saida_venda` por item
- ✅ Para cada pedido devolvido, gera tipo `devolucao`
- ✅ Mocks: ~150 movimentações históricas (derivadas dos pedidos mock)
- ✅ Página `/app/estoque-movimentacao` substituindo placeholder do PRD-003
- ✅ Tabela cronológica + filtros + URL sync
- ✅ Drill-downs (pedido, produto)
- ✅ KPIs com saídas reais + placeholders para entradas/ajustes
- ✅ Botão "Nova movimentação manual" placeholder (tooltip Fase 2)
- ✅ Permissões (Vendedor bloqueado)
- ✅ Mobile responsivo

### Excluído

- ❌ CRUD manual de entradas/ajustes — Fase 2 (DINTEC)
- ❌ Mutar estoque via movimentações — Fase 2
- ❌ Reservas / bloqueios — Fase 2
- ❌ Transferências entre lojas reais — Fase 2 (PRD-007)
- ❌ Notificações de movimentações suspeitas — Fase 2
- ❌ Export — Fase 2

---

## Requisitos Funcionais

- **RF-001:** Tipos `IInventoryMovement`, `MovementType`.
- **RF-002:** Hook `useInventoryMovements(filters)` deriva de orders pagos/devolvidos.
- **RF-003:** Página `InventoryMovementPage` em `src/features/inventory-movement/pages/`.
- **RF-004:** Tabela paginada (50/página) ordenada por performedAt desc.
- **RF-005:** 5 filtros: tipo, produto (autocomplete), período, vendedor, loja (Owner).
- **RF-006:** URL sync.
- **RF-007:** 4 KPIs no topo (total, saídas R$, entradas placeholder, ajustes placeholder).
- **RF-008:** Botão "Nova movimentação manual" desabilitado com tooltip Fase 2.
- **RF-009:** Drill-down em saida_venda → /app/pedidos/:orderId.
- **RF-010:** Drill-down em produto → /app/catalogo/:partId.
- **RF-011:** Permissões: Vendedor bloqueado; Gestor loja; Owner cross-store.

---

## Requisitos Não-Funcionais

- **RNF-001:** Página renderiza < 350ms com 150 movimentações.
- **RNF-002:** Memorização.
- **RNF-003:** Mobile com scroll horizontal.
- **RNF-004:** WCAG AA.

---

## Critérios de Aceitação

```gherkin
DADO 80 pedidos pagos com ~200 items totais
QUANDO useInventoryMovements executa
ENTÃO retorna ~200 IInventoryMovement tipo 'saida_venda' (uma por item)

DADO 5 pedidos devolvidos
QUANDO useInventoryMovements roda
ENTÃO retorna também movimentações tipo 'devolucao' correspondentes

DADO acesso /app/estoque-movimentacao
QUANDO observo
ENTÃO vejo tabela cronológica reversa
  E filtros funcionais
  E botão "Nova movimentação manual" desabilitado

DADO clico em linha saida_venda
QUANDO navega
ENTÃO sou levado ao pedido correspondente (PRD-032)
```

---

## Fases de Implementação

| Fase | Objetivo                                   |
| ---- | ------------------------------------------ |
| 1    | Modelo + hook derivado + página com tabela |
| 2    | Filtros + KPIs + drill-downs               |
| 3    | Placeholders + permissões + polish         |

---

## Dependências

| PRD                    | Status |
| ---------------------- | ------ |
| PRD-030                | 📝     |
| PRD-032                | 📝     |
| PRD-050 (complementar) | 📝     |

---

## Cadeia

| Ordem  | PRD               |
| ------ | ----------------- |
| 1-31   | 010-051           |
| **32** | **PRD-052 ATUAL** |
| 33     | PRD-053           |

---

## Considerações de Segurança

- Histórico de movimentações é dado sensível — Vendedor bloqueado
- Audit log não necessário (movimentações já são imutáveis no MVP, derivadas)

---

## Convenções

| Elemento | Convenção               |
| -------- | ----------------------- |
| Página   | `InventoryMovementPage` |
| Pasta    | `inventory-movement/`   |

---

## Notas para o Agente Desenvolvedor

- Movimentações derivadas (não mutate stockQuantity aqui)
- Placeholders coerentes para 3 tipos Fase 2
- Não duplicar dados — sempre derivar de orders
- Banner sobre integração DINTEC na configuração de PRD-030

---

## Status

| Campo  | Valor                             |
| ------ | --------------------------------- |
| Status | ✅ IMPLEMENTADO (v0.37.0 — Trail) |

---

## Histórico

| Data       | Versão | Alteração                                                                                                           |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — movimentações derivadas de pedidos com placeholder para entradas/ajustes Fase 2                   |
| 27/05/2026 | v1     | Implementado em v0.37.0 (Trail) — feature `inventory-movement/` + rota `/app/gestao/estoque-movimentacao` + sidebar |

---

**AILA - Sistemas Inteligentes**

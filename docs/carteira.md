# Gestão de Carteira e Transferências

> PRD-018 — feature `src/features/carteira/`.

A carteira do vendedor segue regra 1:1 estrita: cada cliente pertence a exatamente
um vendedor (`customer.sellerId`). Esta feature entrega o sistema completo de
**transferências** entre vendedores, com três sabores diferentes, reversão
automática para o tipo temporário e painel administrativo dedicado.

## Tipos

| Tipo                   | Significado                            | Reversão                |
| ---------------------- | -------------------------------------- | ----------------------- |
| `temporary`            | Cobertura por período definido         | Automática na `endDate` |
| `permanent_individual` | Transferência permanente de 1 cliente  | Manual via "Reverter"   |
| `permanent_batch`      | Transferência permanente em lote (M:N) | Manual via "Reverter"   |

Todas movem `customer.sellerId = toSellerId` na criação. Na reversão (manual ou
automática), `customer.sellerId` volta para `fromSellerId`.

## Modelo

`ICarteiraTransfer` (em `src/shared/types/lead.ts`):

```ts
{
  id, storeId, type,
  fromSellerId, toSellerId,
  customerIds: ID[],
  reason: string,
  startDate, endDate?, autoRevertAt?,
  status: 'active' | 'reverted' | 'expired',
  createdBy, createdAt,
}
```

## Reversão automática (MVP)

`useAutoRevertTimer` é registrado uma vez no `AppLayout` (rota `/app/*`) e roda
**a cada 60 segundos** quando o usuário corrente é Owner ou Gestor. Para cada
transferência `temporary` com `autoRevertAt <= now` e `status='active'`, chama
`provider.expire(transferId)`, que:

1. Reescreve `customer.sellerId = fromSellerId` em todos os clientes da
   transferência.
2. Atualiza `transfer.status = 'expired'`.
3. Grava entrada de audit log `transfer.expire`.

Esse caminho depende do app estar aberto em pelo menos uma aba com um
Owner/Gestor logado.

### Fase 2 — Edge Function com cron real

Na Fase 2 (Supabase), o timer do front é substituído por uma **Edge Function**
acionada via `pg_cron` a cada minuto. A função executa exatamente o mesmo
fluxo, mas dentro do banco em uma transação atômica, com RLS preservada e sem
depender do cliente. O front continuará chamando `useAutoRevertTimer` apenas
como fallback durante a janela em que o serviço estiver indisponível.

## Atomicidade

O mock atualiza `customers` via `useMockStore.setState` aplicando o patch em
um único `setState` (mapeamento por id). Caso uma transferência em lote falhe
após N de M atualizações em produção, a Edge Function da Fase 2 envolverá
todas as atualizações em uma transação Postgres — rollback automático no erro.

## Audit log

Todas as mutações geram entradas em `audit_log` com `resource='transfer'`:

| Action            | Quando                                    |
| ----------------- | ----------------------------------------- |
| `transfer.create` | Criação de qualquer tipo                  |
| `transfer.revert` | Reversão manual (Owner/Gestor)            |
| `transfer.expire` | Reversão automática pelo timer/Edge Func. |

O snapshot `after` traz `{ type, fromSellerId, toSellerId, customerCount,
reason, endDate, autoRevertAt }`, suficiente para reconstruir a transferência
em disputas de comissão (vide PRD-047 — Onda 2).

## Permissões

| Papel    | Acesso ao painel | Cria | Reverte | Cross-store |
| -------- | ---------------- | ---- | ------- | ----------- |
| Owner    | ✅               | ✅   | ✅      | ✅          |
| Gestor   | ✅               | ✅   | ✅      | ❌          |
| Vendedor | ❌               | ❌   | ❌      | ❌          |

Vendedor recebe apenas o **banner discreto** na ficha do cliente quando há
cobertura temporária ativa, e toasts quando sua carteira muda (Fase 2).

## Integração com outros PRDs

- **PRD-012 (Ficha do Cliente):** menu ⋮ → "Transferir carteira" abre
  `NewPermanentIndividualTransferModal`.
- **PRD-015 (Lista de Clientes):** ação em lote "Transferir vendedor" abre
  `NewPermanentBatchTransferModal` agrupando por `fromSellerId` quando a
  seleção atravessa vendedores diferentes.
- **PRD-006 (Auditoria):** a aba **Auditoria** do painel embebe o componente
  do PRD-006 com filtro pré-aplicado por `resource='transfer'`.

## Caminho dos arquivos

```
src/features/carteira/
├── components/
│   ├── ActiveTransferCard.tsx
│   ├── CoverageBanner.tsx
│   ├── CustomerListModal.tsx
│   ├── NewPermanentBatchTransferModal.tsx
│   ├── NewPermanentIndividualTransferModal.tsx
│   ├── NewTemporaryTransferModal.tsx
│   ├── RevertTransferModal.tsx
│   ├── SellerRoute.tsx
│   ├── TransferAuditTab.tsx
│   ├── TransferFiltersBar.tsx
│   ├── TransferHistoryTable.tsx
│   └── TransferTypeBadge.tsx
├── hooks/
│   ├── useAutoRevertTimer.ts
│   ├── useStoreCustomers.ts
│   ├── useTransferMutations.ts
│   └── useTransfersList.ts
├── i18n/pt-BR.ts
├── pages/CarteiraPage.tsx
└── utils/formatters.ts
```

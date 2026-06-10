-- POC Fase 2 (PRD-101/104 vertical slice): public.stores
-- snake_case columns per project convention; the Supabase provider maps them
-- back to the camelCase IStore the UI consumes.

create table public.stores (
  id               text primary key,
  name             text not null,
  type             text not null check (type in ('matriz', 'filial', 'parceira')),
  address          text not null,
  cnpj             text not null,
  settings         jsonb not null,
  active_divisions text[] not null default '{parts}',
  created_at       timestamptz not null
);

comment on table public.stores is
  'Stores/units of the platform. Maps to IStore (src/shared/types/platform.ts). POC for Fase 2.';

-- RLS is mandatory (advisor flags rls_disabled_in_public). The policy below is a
-- TEMPORARY POC allowance: it grants read to anon/authenticated because Supabase
-- Auth (PRD-107) is not wired yet, so auth.uid() is null. Replace with a
-- per-store, role-aware policy in PRD-103 (RLS) / PRD-107 (Auth).
alter table public.stores enable row level security;

create policy "stores_select_poc_temp"
  on public.stores
  for select
  to anon, authenticated
  using (true);

-- Seed: headquarters store (Matriz) — mirrors SEED_STORE. The settings blob is a
-- faithful POC subset (scalar fields + small arrays); catalog-heavy arrays are
-- left empty until the dedicated PRDs decompose/seed them.
insert into public.stores (id, name, type, address, cnpj, settings, active_divisions, created_at)
values (
  'store-matriz',
  'GALLO BASE DIESEL — Matriz',
  'matriz',
  'Av. Brasil, 1500 — Centro, Frederico Westphalen / RS — CEP 98400-000',
  '12.345.678/0001-90',
  jsonb_build_object(
    'storeId', 'store-matriz',
    'lifecycleThresholds', jsonb_build_object('dormantDays', 60, 'lostDays', 180),
    'vehicleCadastroMode', 'aprovacao_obrigatoria',
    'defaultDivision', 'parts',
    'sdrEnabled', true,
    'sdrQuoteValidityDays', 7,
    'sdrAutoDiscountPct', 0,
    'escalationQueueTimeoutMinutesUrgent', 5,
    'escalationQueueTimeoutMinutesNormal', 30,
    'escalationUrgentBroadcastDelaySeconds', 30,
    'discountApprovalThresholdPct', 0.05,
    'quoteDefaultValidityDays', 7,
    'insightsEnabled', true,
    'whatsappAccounts', jsonb_build_array(
      jsonb_build_object('id', 'wa-meta-matriz', 'label', 'GALLO Matriz (Oficial)'),
      jsonb_build_object('id', 'wa-evo-campanhas', 'label', 'GALLO Campanhas')
    ),
    'abcCurveSettings', jsonb_build_object('periodMonths', 12, 'classAThreshold', 0.8, 'classBThreshold', 0.95),
    'commissionSettings', jsonb_build_object(
      'active', true, 'defaultRate', 0.03, 'splitPolicy', 'coverage_full',
      'goalBonusEnabled', true, 'rules', jsonb_build_array(), 'closedPeriods', jsonb_build_array()
    ),
    'financialSettings', jsonb_build_object(
      'taxOnSalesPct', 0.16, 'taxOnProfitPct', 0.2,
      'fixedExpenses', jsonb_build_object('payroll', 35000, 'rentInfra', 12000, 'other', 8000)
    ),
    'cashflowSettings', jsonb_build_object('openingBalance', 50000, 'minBalanceAlert', 10000),
    'inventoryAnalysisSettings', jsonb_build_object('consumptionWindowDays', 90, 'targetCoverageDays', 30, 'excessCoverageDays', 180)
  ),
  array['parts'],
  '2026-01-01T00:00:00.000Z'
);

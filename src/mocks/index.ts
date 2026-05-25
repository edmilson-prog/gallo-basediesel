/**
 * GALLO BASE DIESEL — Public surface of the mock layer.
 *
 * Features and components MUST import data exclusively from this module:
 *
 *   import { customersApi, ordersApi } from '@/mocks';
 *
 * The Zustand store, generators and data seeds are **internal** to the module
 * and never exposed beyond `src/mocks/`. An ESLint rule enforces the boundary.
 */
export * from "./api";
export { useResetMocks, type IResetResult } from "./hooks/useResetMocks";

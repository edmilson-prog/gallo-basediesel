/**
 * Typed errors thrown by the mock API surface.
 *
 * Consumers MUST narrow with `instanceof` to render appropriate UI; never rely
 * on string matching. These errors are the contract a `SupabaseProvider` is
 * expected to mirror in Fase 2.
 */
export abstract class MockError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** Resource queried by id (or natural key) does not exist. */
export class MockNotFoundError extends MockError {
  readonly code = "MOCK_NOT_FOUND";
  constructor(resource: string, id?: string) {
    super(id ? `${resource} not found: ${id}` : `${resource} not found`);
  }
}

/** Input failed validation against a model invariant. */
export class MockValidationError extends MockError {
  readonly code = "MOCK_VALIDATION";
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}

/** Transient transport failure — analogous to a 5xx on a real backend. */
export class MockNetworkError extends MockError {
  readonly code = "MOCK_NETWORK";
  constructor(message = "Simulated network failure") {
    super(message);
  }
}

/** Operation not authorized under current RBAC. Reserved for PRD-006. */
export class MockUnauthorizedError extends MockError {
  readonly code = "MOCK_UNAUTHORIZED";
  constructor(message = "Operation not authorized") {
    super(message);
  }
}

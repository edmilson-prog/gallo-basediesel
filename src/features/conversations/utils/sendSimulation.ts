/**
 * Tunable knobs for the simulated send pipeline in `useMessageSend`.
 *
 * Lives inside the feature (not in `@/mocks/config`) because the mock
 * config module is internal to the mock layer — features must not import
 * from it directly (enforced by `no-restricted-imports`). When Fase 2
 * wires real providers, the failure rate becomes irrelevant and only the
 * read-rate simulation will remain useful as a UX tester.
 */

/** Probability (0..1) that an outbound message ends up failing. */
export const SEND_FAILURE_RATE = 0.05;

/** Probability (0..1) that a delivered outbound message is read. */
export const SEND_READ_RATE = 0.8;

/** @see src/providers/data/errors.ts — identical shape, kept local for isolation. */
export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

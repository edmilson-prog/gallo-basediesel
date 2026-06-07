/**
 * Read-only slash-command parser (PRD-027 RF-007, D-5).
 *
 * Inspects the textarea `value` + `caret` and decides whether a slash menu
 * should be active. Fires only when `/` opens a token at the START of the
 * message or immediately AFTER whitespace — never inside a URL, a date
 * (`12/05`), a fraction (`3/4`) or a `//` escape (literal slash).
 *
 * Pure: no React, no side effects. The composer's `handleKey` only changes
 * behavior while `active === true` (conditional gate).
 */

export interface ISlashState {
  active: boolean;
  command: string;
  query: string;
}

const INACTIVE: ISlashState = { active: false, command: "", query: "" };

export function parseSlash(value: string, caret: number): ISlashState {
  if (caret <= 0) return INACTIVE;
  // Consider only the text up to the caret.
  const head = value.slice(0, caret);
  // Find the last slash before the caret.
  const slashIndex = head.lastIndexOf("/");
  if (slashIndex < 0) return INACTIVE;

  // The char immediately before the slash must be start-of-string or whitespace.
  const prev = slashIndex === 0 ? "" : (head[slashIndex - 1] ?? "");
  if (prev !== "" && !/\s/.test(prev)) return INACTIVE;

  // `//` escape → literal slash, never a command.
  if (head[slashIndex + 1] === "/") return INACTIVE;

  const token = head.slice(slashIndex + 1);
  // A bare "/" with nothing typed yet is still an active (empty) command.
  // The token must not contain whitespace before the command word; the first
  // run of word chars is the command, the remainder (after one space) is query.
  const match = /^([a-zA-Z0-9_]*)(?:\s+(.*))?$/.exec(token);
  if (!match) return INACTIVE;

  return {
    active: true,
    command: match[1] ?? "",
    query: (match[2] ?? "").trim(),
  };
}

/**
 * Whether a "new version" push may go out right now.
 *
 * This is the whole safety surface of a broadcast, so it lives apart from the
 * I/O and is covered by tests. Broadcasting to every subscribed device is the
 * exact shape of the SDR mass-dispatch incident; the difference here is that
 * every send has to pass three gates first.
 */

export type BroadcastVerdict =
  /** Go. */
  | "send"
  /** version.json unreadable — never guess, never announce. */
  | "unknown-build"
  /** This build already had its announcement. The dedupe key is the build id. */
  | "already-notified"
  /** First run ever: record the live build silently. Without this the very first
   *  tick would announce "nova versão" for a build everyone is already running. */
  | "bootstrap"
  /** Night. The device-level "silenciar das 22h às 6h" is a local preference the
   *  server cannot read, so the server keeps its own, wider window. */
  | "quiet-hours";

/** First hour that may receive a broadcast, in America/Sao_Paulo. */
export const QUIET_END_HOUR = 7;
/** First hour that may NOT, in America/Sao_Paulo. */
export const QUIET_START_HOUR = 21;

/**
 * Hour of the day in São Paulo.
 *
 * Fixed UTC-3: Brazil abolished daylight saving in 2019, so no zone database is
 * needed for this. If DST ever returns, this is the line to fix.
 */
export function saoPauloHour(now: Date): number {
  return (now.getUTCHours() + 24 - 3) % 24;
}

export function isQuietHour(now: Date): boolean {
  const hour = saoPauloHour(now);
  return hour < QUIET_END_HOUR || hour >= QUIET_START_HOUR;
}

export interface IBroadcastInput {
  /** Build id read from the live /version.json. */
  liveBuildId: string | null | undefined;
  /** True when a row for this build id already exists. */
  alreadyNotified: boolean;
  /** True when the table has never recorded a build. */
  isFirstRun: boolean;
  now: Date;
}

export function decideBroadcast({
  liveBuildId,
  alreadyNotified,
  isFirstRun,
  now,
}: IBroadcastInput): BroadcastVerdict {
  if (!liveBuildId) return "unknown-build";
  if (alreadyNotified) return "already-notified";
  // Antes da janela de silêncio: registrar o build atual não é um anúncio, e
  // adiar isso até de manhã só atrasaria a estreia sem ganho nenhum.
  if (isFirstRun) return "bootstrap";
  // A build that lands at night is not lost: the gate re-opens in the morning
  // and by then we announce whatever build is live, which is the newest one.
  if (isQuietHour(now)) return "quiet-hours";
  return "send";
}

/** Lock-screen copy. Keeps the version visible so "again?" has an answer. */
export function buildUpdateNotification(version: string | null | undefined) {
  const label = version?.trim();
  return {
    title: "GALLO Atendimento",
    body: label
      ? `Versão ${label} disponível — toque para atualizar.`
      : "Nova versão disponível — toque para atualizar.",
    url: "/atendimento",
    // One tag for every update push: a device that missed two releases sees one
    // line, not a stack of them.
    tag: "app-update",
  };
}

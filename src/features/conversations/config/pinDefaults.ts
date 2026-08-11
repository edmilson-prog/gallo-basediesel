import type { IInboxPinsSettings } from "@/shared/types";

/** Smallest cap the settings screen accepts. */
export const MIN_PINNED = 1;

/**
 * Largest cap accepted. Doubles as the pageSize of the pinned-conversations
 * fetch — the block never asks for more rows than the cap allows to exist.
 */
export const MAX_PINNED = 20;

/** Default cap per attendant (spec 2026-08-11, decision D-4). */
export const DEFAULT_INBOX_PINS_SETTINGS: IInboxPinsSettings = { maxPinned: 5 };

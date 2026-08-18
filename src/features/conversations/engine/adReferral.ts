import type { IAdReferral } from "@/shared/types";

/** Beyond this many characters the collapsed 3-line clamp certainly cuts the
 *  body, so the card offers a "ver mais" toggle. */
const BODY_CLAMP_CHARS = 180;
const BODY_CLAMP_LINES = 3;

/**
 * Display-ready projection of `conversations.ad_referral`. Every field is
 * already trimmed, validated and de-duplicated: the card renders it as-is.
 */
export interface IAdReferralView {
  headline?: string;
  body?: string;
  /** True when the collapsed body is cut and the card must offer "ver mais". */
  bodyCollapsible: boolean;
  mediaType?: "image" | "video";
  /** Ad permalink (`sourceUrl`), only when it is a safe http(s) URL. */
  adUrl?: string;
  /** Post/reel permalink (`mediaUrl`), omitted when it repeats `adUrl`. */
  postUrl?: string;
  sourceId?: string;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * The referral is provider payload — an attacker-controlled ad could carry a
 * `javascript:`/`data:` URL that would execute on click. Only http(s) survives.
 */
function safeUrl(value: string | undefined): string | undefined {
  const raw = clean(value);
  if (!raw) return undefined;
  try {
    const { protocol } = new URL(raw);
    return protocol === "http:" || protocol === "https:" ? raw : undefined;
  } catch {
    return undefined;
  }
}

function normalizeMediaType(value: string | undefined): "image" | "video" | undefined {
  return value === "image" || value === "video" ? value : undefined;
}

function isCollapsible(body: string | undefined): boolean {
  if (!body) return false;
  return body.length > BODY_CLAMP_CHARS || body.split("\n").length > BODY_CLAMP_LINES;
}

/**
 * Projects a raw referral into what the thread card shows. Returns `null` when
 * nothing usable survives validation — an empty card is worse than no card.
 */
export function buildAdReferralView(
  referral: IAdReferral | undefined | null,
): IAdReferralView | null {
  if (!referral) return null;

  const headline = clean(referral.headline);
  const body = clean(referral.body);
  const adUrl = safeUrl(referral.sourceUrl);
  const postUrl = safeUrl(referral.mediaUrl);
  const sourceId = clean(referral.sourceId);
  const mediaType = normalizeMediaType(referral.mediaType);

  if (!headline && !body && !adUrl && !postUrl && !sourceId) return null;

  return {
    headline,
    body,
    bodyCollapsible: isCollapsible(body),
    mediaType,
    adUrl,
    postUrl: postUrl && postUrl !== adUrl ? postUrl : undefined,
    sourceId,
  };
}

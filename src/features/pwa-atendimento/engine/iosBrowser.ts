/**
 * Which browser is showing this page on an iPhone.
 *
 * It matters more than it looks. On iOS the Push API exists **only** for a web
 * app on the Home Screen, and the reliable way to put one there is Safari's
 * Share → "Adicionar à Tela de Início". Every iOS browser runs on WebKit, but
 * the others reach that flow through their own menus — and a shortcut created
 * from them can land as a plain bookmark that opens in a tab, which has no
 * `PushManager` at all. An attendant who installs from Chrome ends up with an
 * icon that looks installed and never rings.
 *
 * So the install screen says so out loud instead of letting someone repeat the
 * attempt and conclude the notifications are broken.
 */
export type IosBrowserKind = "safari" | "other" | "not-ios";

/** UA markers every non-Safari iOS browser adds to an otherwise Safari-ish UA. */
const NON_SAFARI_IOS = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo|GSA/;

export function detectIosBrowser(userAgent: string): IosBrowserKind {
  if (!/iPhone|iPad|iPod/.test(userAgent)) return "not-ios";
  return NON_SAFARI_IOS.test(userAgent) ? "other" : "safari";
}

/** True when the user is one tap away from installing the wrong way. */
export function shouldWarnAboutIosBrowser(userAgent: string): boolean {
  return detectIosBrowser(userAgent) === "other";
}

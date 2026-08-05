/**
 * Human label for the device the user is currently signed in from.
 *
 * Derived from the user agent, which is the only session detail the browser can
 * state truthfully — listing the OTHER active sessions needs a server-side read
 * of `auth.sessions` and is not built yet.
 */

export interface IDeviceDescription {
  /** e.g. "Chrome · Windows". */
  label: string;
  /** Iconify name (lucide set). */
  icon: string;
}

function browserOf(ua: string): string | null {
  // Order matters: Edge and Opera both advertise Chrome in their UA string.
  if (/\bEdg[A-Z]?\//.test(ua)) return "Edge";
  if (/\bOPR\//.test(ua) || /\bOpera\//.test(ua)) return "Opera";
  if (/\bFirefox\//.test(ua)) return "Firefox";
  if (/\bChrome\//.test(ua)) return "Chrome";
  if (/\bSafari\//.test(ua)) return "Safari";
  return null;
}

function systemOf(ua: string): { name: string; icon: string } | null {
  if (/\biPad\b/.test(ua)) return { name: "iPadOS", icon: "lucide:tablet" };
  if (/\biPhone\b|\biPod\b/.test(ua)) return { name: "iOS", icon: "lucide:smartphone" };
  if (/\bAndroid\b/.test(ua)) {
    return { name: "Android", icon: /\bMobile\b/.test(ua) ? "lucide:smartphone" : "lucide:tablet" };
  }
  if (/\bWindows\b/.test(ua)) return { name: "Windows", icon: "lucide:monitor" };
  if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) return { name: "macOS", icon: "lucide:monitor" };
  if (/\bLinux\b|\bX11\b/.test(ua)) return { name: "Linux", icon: "lucide:monitor" };
  return null;
}

/** Builds the "<browser> · <system>" label, degrading to a generic wording. */
export function describeDevice(userAgent: string): IDeviceDescription {
  const browser = browserOf(userAgent);
  const system = systemOf(userAgent);
  if (!browser && !system) {
    return { label: "Navegador · sistema não identificado", icon: "lucide:monitor" };
  }
  return {
    label: `${browser ?? "Navegador"} · ${system?.name ?? "sistema não identificado"}`,
    icon: system?.icon ?? "lucide:monitor",
  };
}

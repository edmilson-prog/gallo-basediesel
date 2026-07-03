import type { IApplication, IPart } from "@/shared/types";
import { buildPartInsertText, priceText } from "./partInsertText";

export function copyValue(part: IPart): string {
  return priceText(part);
}

export function copyCode(part: IPart): string {
  return [part.sku, ...part.oemCodes].filter(Boolean).join(" · ");
}

function applicationLine(a: IApplication): string {
  const years = `${a.yearStart}–${a.yearEnd}`;
  const engine = a.engine ? ` (${a.engine})` : "";
  return `${a.vehicleBrand} ${a.vehicleModel} ${years}${engine}`;
}

/** Full sheet for clipboard: insert text + applications. Never cost/margin. */
export function copyFullSheet(part: IPart): string {
  const lines = [buildPartInsertText(part)];
  if (part.applications.length > 0) {
    lines.push(`Aplicação: ${part.applications.map(applicationLine).join(" · ")}`);
  }
  return lines.join("\n");
}

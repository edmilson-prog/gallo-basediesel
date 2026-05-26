import type {
  IExtractedAttributes,
  IPartCandidate,
  IPartIdentificationDecision,
} from "@/shared/types";

const NUMBER_EMOJI = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];

function formatPrice(value?: number): string {
  if (value == null) return "consulte";
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function describeMissingAttribute(attr: keyof IExtractedAttributes): string {
  switch (attr) {
    case "brand":
      return "a marca do caminhão (Volvo, Scania, Mercedes-Benz, Ford Cargo ou Iveco)";
    case "model":
      return "o modelo (ex.: FH 460, R 450, Actros 2651)";
    case "year":
      return "o ano do caminhão";
    case "engine":
      return "o motor (ex.: D13K460, DC13, OM 457 LA)";
    case "partCategory":
      return "que tipo de peça você precisa (filtro, freio, embreagem etc.)";
    case "partSubtype":
      return "qual o subtipo (ex.: filtro de óleo, ar, combustível, cabine)";
    case "oemCode":
      return "o código numérico que aparece na peça antiga, se você tiver";
    default:
      return "mais detalhes sobre a peça";
  }
}

function describeCandidate(candidate: IPartCandidate, index: number): string {
  const bullet = NUMBER_EMOJI[index] ?? `${index + 1}.`;
  const price = formatPrice(candidate.estimatedPrice);
  const tag = candidate.isEquivalent
    ? `equivalente${candidate.partBrand ? ` ${candidate.partBrand}` : ""}`
    : `original${candidate.partBrand ? ` ${candidate.partBrand}` : ""}`;
  const oem = candidate.oemCode ? ` (cód. ${candidate.oemCode})` : "";
  return `${bullet} ${candidate.partName}${oem} — ${price} — ${tag}`;
}

function describeEquivalence(top: IPartCandidate, candidate: IPartCandidate): string | null {
  if (!candidate.isEquivalent) return null;
  if (top.estimatedPrice == null || candidate.estimatedPrice == null) return null;
  if (candidate.estimatedPrice >= top.estimatedPrice) return null;
  const saving = Math.round(
    ((top.estimatedPrice - candidate.estimatedPrice) / top.estimatedPrice) * 100,
  );
  if (saving < 5) return null;
  return ` — economia ${saving}%`;
}

/**
 * Render the message the SDR should send to the customer for a given
 * identification decision. Templates intentionally stay in code (vs. the
 * editable `IPlatformSettings.sdrTemplates`) because they interpolate the
 * dynamic candidate list — making them user-editable on Fase 2 is a separate
 * scope.
 */
export function formatConfirmationMessage(
  candidates: IPartCandidate[],
  decision: IPartIdentificationDecision,
  attributes: IExtractedAttributes,
): string {
  const ranked = [...candidates].sort((a, b) => b.score - a.score);
  if (decision.kind === "confirm_auto" && ranked[0]) {
    const top = ranked[0];
    const price = formatPrice(top.estimatedPrice);
    return `🔍 Encontrei: ${top.partName}${top.oemCode ? ` (cód. ${top.oemCode})` : ""} — ${price}. Confirma que é essa?`;
  }

  if (decision.kind === "ask_user" && ranked.length > 0) {
    const top = ranked[0];
    const linhas = ranked.slice(0, 3).map((c, i) => {
      const economy = describeEquivalence(top, c);
      return describeCandidate(c, i) + (economy ?? "");
    });
    const header = buildHeader(attributes);
    return `🔎 ${header}:\n\n${linhas.join("\n")}\n\nQual você precisa? Responde 1, 2 ou 3.`;
  }

  if (decision.kind === "request_more_info") {
    const missing = decision.missingAttributes ?? [];
    if (missing.length === 0) {
      return "Pra te ajudar melhor, pode me dar mais detalhes sobre a peça que você precisa?";
    }
    const perguntas = missing.slice(0, 3).map((m) => `• ${describeMissingAttribute(m)}`);
    return `Pra te ajudar melhor, preciso saber:\n${perguntas.join("\n")}`;
  }

  return "Pra te ajudar melhor, pode me dar mais detalhes sobre a peça que você precisa?";
}

function buildHeader(attributes: IExtractedAttributes): string {
  const parts: string[] = ["Encontrei algumas opções"];
  if (attributes.brand && attributes.model) {
    parts.push(
      `pro seu ${attributes.brand} ${attributes.model}${attributes.year ? ` ${attributes.year}` : ""}`,
    );
  } else if (attributes.brand) {
    parts.push(`pro seu ${attributes.brand}`);
  }
  return parts.join(" ");
}

/** Friendly message returned when the customer sends a photo (RF-020). */
export const PHOTO_PLACEHOLDER_MESSAGE = [
  "Vi a foto! No momento ainda não consigo ler códigos automaticamente.",
  "Você consegue digitar o código numérico que aparece na peça?",
  "Ou me dizer a marca, modelo e ano do caminhão?",
].join(" ");

/** Message returned when an OEM code lookup did not match anything (RF-019). */
export const OEM_NOT_FOUND_MESSAGE =
  "Não encontrei a peça com esse código. Você pode me dizer a marca e o modelo do veículo?";

/** Customer answer parser used to convert "1/2/3" or "primeiro" into an index. */
export function parseCustomerChoice(text: string): number | null {
  const norm = text.trim().toLowerCase();
  if (/^\s*1(\D|$)|primeir|primeiro/.test(norm)) return 0;
  if (/^\s*2(\D|$)|segund/.test(norm)) return 1;
  if (/^\s*3(\D|$)|terceir/.test(norm)) return 2;
  const num = Number(norm.match(/^\s*(\d)/)?.[1]);
  if (!Number.isNaN(num) && num >= 1 && num <= 5) return num - 1;
  return null;
}

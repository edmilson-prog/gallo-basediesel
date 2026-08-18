import type { IContact, ITriageContext, ITriageSuggestion } from "@/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { contactInitials } from "../../engine/contactInitials";
import { CONTACT_SOURCE_LABELS } from "../../utils/labels";

/** Reasons a contact is not a commercial lead at all. */
export const TRIAGE_IGNORE_REASONS = [
  "Fornecedor",
  "Concorrente",
  "Ligou por engano",
  "Assunto pessoal",
  "Spam",
] as const;

export interface ITriageDecisionCardProps {
  contact: IContact;
  suggestions: ITriageSuggestion[];
  isLoadingSuggestions: boolean;
  context: ITriageContext | undefined;
  ignoreReason: string;
  onIgnoreReasonChange: (reason: string) => void;
  onLink: (suggestion: ITriageSuggestion) => void;
  onPickCustomer: () => void;
  onCreateIndividual: () => void;
  onMerge: () => void;
  onSkip: () => void;
  onIgnore: () => void;
  onOpenConversation: () => void;
  busy: boolean;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
      {children}
    </kbd>
  );
}

/** Green above 70, amber above 50, muted below — the same ladder the eye reads. */
function confidenceTone(confidence: number): string {
  if (confidence >= 70) return "text-severity-success";
  if (confidence >= 50) return "text-severity-warning";
  return "text-muted-foreground";
}

/**
 * One loose contact, everything known about it, and every way out.
 *
 * The order on screen is the order of the decision: who this is, what they
 * asked for, who they probably are, and only then the buttons. The reason
 * under each suggestion is what earns the click — the percentage alone never
 * convinced anyone to link a contact.
 */
export function TriageDecisionCard({
  contact,
  suggestions,
  isLoadingSuggestions,
  context,
  ignoreReason,
  onIgnoreReasonChange,
  onLink,
  onPickCustomer,
  onCreateIndividual,
  onMerge,
  onSkip,
  onIgnore,
  onOpenConversation,
  busy,
}: ITriageDecisionCardProps) {
  const cityLabel = contact.city
    ? contact.uf
      ? `${contact.city} / ${contact.uf}`
      : contact.city
    : "sem cidade";

  return (
    <div className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-sm font-semibold text-muted-foreground">
            {contactInitials(contact.name)}
          </span>

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-foreground">{contact.name}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">
                {contact.phone ?? "sem telefone"}
              </span>
              <span className="text-muted-foreground/50">·</span>
              <span className="text-xs text-muted-foreground">{cityLabel}</span>
              <Badge variant="outline" className="text-[10px]">
                {CONTACT_SOURCE_LABELS[contact.source]}
              </Badge>
              <Badge className="border-severity-info/40 bg-severity-info/15 text-[10px] text-severity-info">
                <Icon icon="mdi:link-variant-off" size={12} />
                Sem cliente
              </Badge>
            </div>
          </div>

          {context?.conversationId && (
            <Button variant="ghost" size="sm" className="shrink-0" onClick={onOpenConversation}>
              <Icon icon="mdi:message-text-outline" size={15} />
              Ver conversa ({context.messageCount})
            </Button>
          )}
        </div>

        {context?.firstInboundText && (
          <div className="mt-2.5 flex gap-2.5 rounded-xl border border-border bg-muted/30 p-3.5">
            <Icon
              icon="mdi:format-quote-open"
              size={16}
              className="mt-0.5 shrink-0 text-muted-foreground"
            />
            <div className="min-w-0">
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                {context.firstInboundText}
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                primeira mensagem recebida · via {CONTACT_SOURCE_LABELS[contact.source]}
              </p>
            </div>
          </div>
        )}

        <h3 className="mb-2 mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {isLoadingSuggestions
            ? "Procurando cliente…"
            : suggestions.length > 0
              ? "Vincular a cliente"
              : "Nenhum cliente provável"}
        </h3>

        {isLoadingSuggestions ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            Comparando telefone, e-mail e nome com a base de clientes…
          </div>
        ) : suggestions.length > 0 ? (
          suggestions.map((suggestion, index) => (
            <div
              key={suggestion.customerId}
              className={cn(
                "mb-2 flex items-center gap-3 rounded-xl border bg-card p-3",
                index === 0 ? "border-severity-success/40" : "border-border",
              )}
            >
              <span
                className={cn(
                  "w-12 shrink-0 text-right text-lg font-bold tabular-nums",
                  confidenceTone(suggestion.confidence),
                )}
              >
                {suggestion.confidence}%
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Icon
                    icon="mdi:office-building-outline"
                    size={15}
                    className="shrink-0 text-primary"
                  />
                  <span className="truncate text-sm font-medium text-foreground">
                    {suggestion.customerName}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{suggestion.reason}</p>
              </div>

              <Button
                size="sm"
                variant={index === 0 ? "default" : "outline"}
                className="shrink-0"
                disabled={busy}
                onClick={() => onLink(suggestion)}
              >
                <Icon icon="mdi:link-variant" size={15} />
                Vincular
                <Kbd>{index + 1}</Kbd>
              </Button>
            </div>
          ))
        ) : (
          <div className="flex gap-2.5 rounded-xl border border-dashed border-border bg-muted/20 p-3.5">
            <Icon
              icon="mdi:file-search-outline"
              size={16}
              className="mt-0.5 shrink-0 text-muted-foreground"
            />
            <p className="text-sm leading-relaxed text-muted-foreground">
              Telefone, e-mail e nome não batem com nenhum cliente da base. Busque um cliente à mão,
              crie uma pessoa física ou tire o contato da agenda.
            </p>
          </div>
        )}

        <div className="my-4 h-px bg-border" />

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={onPickCustomer}>
            <Icon icon="mdi:magnify" size={15} />
            Buscar cliente
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={onCreateIndividual}>
            <Icon icon="mdi:account-outline" size={15} />É pessoa física
            <Kbd>P</Kbd>
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onMerge}>
            <Icon icon="mdi:call-merge" size={15} />
            Mesclar com contato existente
            <Kbd>M</Kbd>
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onSkip}>
            <Icon icon="mdi:subdirectory-arrow-right" size={15} />
            Decidir depois
            <Kbd>J</Kbd>
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-severity-critical/30 bg-severity-critical/[0.07] p-3">
          <Icon
            icon="mdi:shield-off-outline"
            size={16}
            className="shrink-0 text-severity-critical"
          />
          <span className="text-xs text-muted-foreground">Não é contato comercial:</span>

          <Select value={ignoreReason} onValueChange={onIgnoreReasonChange}>
            <SelectTrigger className="h-8 w-[186px] text-xs" aria-label="Motivo para ignorar">
              <SelectValue placeholder="Escolha o motivo" />
            </SelectTrigger>
            <SelectContent>
              {TRIAGE_IGNORE_REASONS.map((reason) => (
                <SelectItem key={reason} value={reason} className="text-xs">
                  {reason}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant="outline"
            className="border-severity-critical/40 text-severity-critical hover:bg-severity-critical/10 hover:text-severity-critical"
            disabled={busy || ignoreReason === ""}
            title={ignoreReason === "" ? "Escolha o motivo primeiro" : undefined}
            onClick={onIgnore}
          >
            Ignorar contato
            <Kbd>I</Kbd>
          </Button>
        </div>

        <p className="mt-4 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <Icon icon="mdi:keyboard-outline" size={15} className="shrink-0" />
          <Kbd>1</Kbd>–<Kbd>3</Kbd> vincular sugestão · <Kbd>P</Kbd> pessoa física · <Kbd>I</Kbd>{" "}
          ignorar · <Kbd>M</Kbd> mesclar · <Kbd>J</Kbd>/<Kbd>K</Kbd> navegar
        </p>
      </div>
    </div>
  );
}

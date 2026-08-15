import { Link } from "@tanstack/react-router";
import type { ContactScope, ContactSource, IContactScopeCounts, ID } from "@/shared/types";
import type { ContactRecencyBucket } from "@/providers/data";
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
import { UNASSIGNED_OWNER } from "../../engine/contactFilters";
import { CONTACT_SOURCE_LABELS } from "../../utils/labels";

/** Sentinel for "no filter" inside a Select — Radix forbids an empty value. */
export const ANY_VALUE = "__any__";

export interface IOwnerOption {
  id: ID;
  name: string;
}

export interface IContactsFiltersBarProps {
  scope: ContactScope;
  onScopeChange: (scope: ContactScope) => void;
  /** Server-computed counts for the four chips. */
  counts: IContactScopeCounts;

  owner: ID | typeof UNASSIGNED_OWNER | typeof ANY_VALUE;
  onOwnerChange: (value: ID | typeof UNASSIGNED_OWNER | typeof ANY_VALUE) => void;
  /** Derived from the data, never a hardcoded list. */
  ownerOptions: IOwnerOption[];

  tag: string;
  onTagChange: (value: string) => void;
  tagOptions: string[];

  cityUf: string;
  onCityUfChange: (value: string) => void;
  cityUfOptions: string[];

  source: ContactSource | typeof ANY_VALUE;
  onSourceChange: (value: ContactSource | typeof ANY_VALUE) => void;

  lastContact: ContactRecencyBucket | typeof ANY_VALUE;
  onLastContactChange: (value: ContactRecencyBucket | typeof ANY_VALUE) => void;

  onClear: () => void;
}

const SCOPES: { id: ContactScope; label: string; countKey: keyof IContactScopeCounts }[] = [
  { id: "todos", label: "Todos", countKey: "todos" },
  { id: "vinculados", label: "Vinculados", countKey: "vinculados" },
  { id: "soltos", label: "Sem cliente", countKey: "soltos" },
  { id: "optout", label: "Opt-out", countKey: "optout" },
];

const SOURCE_LABELS = CONTACT_SOURCE_LABELS;

const RECENCY_LABELS: Record<ContactRecencyBucket, string> = {
  hoje: "Hoje",
  "7d": "7 dias",
  "30d": "30 dias",
  "90d+": "Mais de 90 dias",
  nunca: "Nunca",
};

/** A select shows it is filtering by turning accent — the kit's signal that a
 *  filter is active without needing a separate badge. */
function filterTriggerClass(active: boolean): string {
  return cn(
    "h-8 w-auto min-w-[8rem] gap-1.5 text-xs",
    active && "border-primary/40 bg-primary/10 text-primary",
  );
}

/**
 * Scope chips plus the five filter selects (ux-guidelines §1).
 *
 * The four chip counts come from the server and deliberately do NOT sum to
 * `todos`: vinculados and soltos partition the base, while opt-out cuts across
 * both.
 *
 * Triar sem cliente and the duplicate queue belong to later phases and are
 * absent here on purpose — the "Sem cliente" chip already leads to the same
 * set of contacts.
 */
export function ContactsFiltersBar({
  scope,
  onScopeChange,
  counts,
  owner,
  onOwnerChange,
  ownerOptions,
  tag,
  onTagChange,
  tagOptions,
  cityUf,
  onCityUfChange,
  cityUfOptions,
  source,
  onSourceChange,
  lastContact,
  onLastContactChange,
  onClear,
}: IContactsFiltersBarProps) {
  const hasFilter =
    owner !== ANY_VALUE ||
    tag !== ANY_VALUE ||
    cityUf !== ANY_VALUE ||
    source !== ANY_VALUE ||
    lastContact !== ANY_VALUE;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2">
      <div
        role="group"
        aria-label="Escopo"
        className="flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5"
      >
        {SCOPES.map((option) => {
          const active = scope === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onScopeChange(option.id)}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors",
                active
                  ? "bg-background font-semibold text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
              <span
                className={cn("tabular-nums", active ? "text-primary" : "text-muted-foreground/70")}
              >
                {counts[option.countKey].toLocaleString("pt-BR")}
              </span>
            </button>
          );
        })}
      </div>

      <div className="h-6 w-px bg-border" aria-hidden />

      <Select value={owner} onValueChange={onOwnerChange}>
        <SelectTrigger className={filterTriggerClass(owner !== ANY_VALUE)} aria-label="Responsável">
          <Icon icon="mdi:account-outline" size={14} />
          <SelectValue placeholder="Responsável" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY_VALUE}>Todos</SelectItem>
          <SelectItem value={UNASSIGNED_OWNER}>Sem responsável</SelectItem>
          {ownerOptions.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={tag} onValueChange={onTagChange}>
        <SelectTrigger className={filterTriggerClass(tag !== ANY_VALUE)} aria-label="Etiqueta">
          <Icon icon="mdi:tag-outline" size={14} />
          <SelectValue placeholder="Etiqueta" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY_VALUE}>Todas</SelectItem>
          {tagOptions.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={cityUf} onValueChange={onCityUfChange}>
        <SelectTrigger
          className={filterTriggerClass(cityUf !== ANY_VALUE)}
          aria-label="Cidade e UF"
        >
          <Icon icon="mdi:map-marker-outline" size={14} />
          <SelectValue placeholder="Cidade/UF" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY_VALUE}>Todas</SelectItem>
          {cityUfOptions.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={source} onValueChange={onSourceChange}>
        <SelectTrigger className={filterTriggerClass(source !== ANY_VALUE)} aria-label="Origem">
          <Icon icon="mdi:source-branch" size={14} />
          <SelectValue placeholder="Origem" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY_VALUE}>Todas</SelectItem>
          {(Object.keys(SOURCE_LABELS) as ContactSource[]).map((key) => (
            <SelectItem key={key} value={key}>
              {SOURCE_LABELS[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={lastContact} onValueChange={onLastContactChange}>
        <SelectTrigger
          className={filterTriggerClass(lastContact !== ANY_VALUE)}
          aria-label="Último contato"
        >
          <Icon icon="mdi:clock-outline" size={14} />
          <SelectValue placeholder="Último contato" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY_VALUE}>Todos</SelectItem>
          {(Object.keys(RECENCY_LABELS) as ContactRecencyBucket[]).map((key) => (
            <SelectItem key={key} value={key}>
              {RECENCY_LABELS[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {(hasFilter || scope !== "todos") && (
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onClear}>
          <Icon icon="mdi:close" size={14} />
          Limpar filtros
        </Button>
      )}

      {/* Triage works the same loose contacts this bar can filter to, one at a
          time — so the way in sits right next to the "Sem cliente" chip. */}
      <Button variant="outline" size="sm" asChild className="ml-auto h-8 shrink-0 text-xs">
        <Link to="/app/agenda/triagem">
          <Icon icon="mdi:filter-check-outline" size={14} />
          Triar sem cliente
          {counts.soltos > 0 && (
            <span className="tabular-nums text-primary">
              {counts.soltos.toLocaleString("pt-BR")}
            </span>
          )}
        </Link>
      </Button>
    </div>
  );
}

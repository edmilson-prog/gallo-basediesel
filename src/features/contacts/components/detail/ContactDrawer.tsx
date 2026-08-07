import { useState } from "react";
import type { IContact } from "@/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { contactInitials } from "../../engine/contactInitials";

/** Which section should draw attention when the drawer opens. */
export type ContactDrawerFocus = "retorno" | undefined;

export interface IContactDrawerProps {
  contact: IContact | null;
  focus?: ContactDrawerFocus;
  onClose: () => void;
  onLink: (contact: IContact) => void;
  onUnlink: (contact: IContact) => void;
  onOpenCustomer: (contact: IContact) => void;
  onAddTag: (contact: IContact) => void;
  onRemoveTag: (contact: IContact, tag: string) => void;
  onTransferOwner: (contact: IContact) => void;
  onToggleOptOut: (contact: IContact, optOut: boolean) => void;
  onScheduleFollowUp: (contact: IContact, at: string, note: string) => void;
  onOpenConversation: (contact: IContact) => void;
  onCall: (contact: IContact) => void;
}

function Section({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: string | null }) {
  return (
    <div className="flex items-center gap-2 border-b border-border py-2 last:border-b-0">
      <Icon icon={icon} size={14} className="shrink-0 text-muted-foreground" />
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 flex-1 truncate text-sm", !value && "text-muted-foreground")}>
        {value || "—"}
      </span>
    </div>
  );
}

function formatCityUf(city: string | null, uf: string | null): string | null {
  if (city && uf) return `${city} / ${uf}`;
  return city ?? uf;
}

/**
 * Detail drawer for a contact.
 *
 * Two rules here are behaviour, not decoration: opening a conversation is
 * disabled while the contact is opted out, and the LGPD switch states plainly
 * that the change is audited — a promise the mutation actually keeps.
 */
export function ContactDrawer({
  contact,
  focus,
  onClose,
  onLink,
  onUnlink,
  onOpenCustomer,
  onAddTag,
  onRemoveTag,
  onTransferOwner,
  onToggleOptOut,
  onScheduleFollowUp,
  onOpenConversation,
  onCall,
}: IContactDrawerProps) {
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");

  if (!contact) return null;
  const optOut = contact.optOut;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[440px]">
        <SheetHeader className="space-y-0 border-b border-border p-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-semibold",
                optOut
                  ? "bg-severity-critical/15 text-severity-critical"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {contactInitials(contact.name)}
            </span>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-left text-lg">{contact.name}</SheetTitle>
              <p className="truncate text-xs text-muted-foreground">{contact.role ?? "—"}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {optOut ? (
                  <Badge
                    variant="outline"
                    className="border-severity-critical text-severity-critical"
                  >
                    Opt-out
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-severity-success text-severity-success"
                  >
                    Ativo
                  </Badge>
                )}
                <Badge variant="outline">{contact.source}</Badge>
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="flex gap-2 border-b border-border p-3">
          <Button
            size="sm"
            className="flex-1"
            disabled={optOut}
            title={optOut ? "Contato em opt-out" : undefined}
            onClick={() => onOpenConversation(contact)}
          >
            <Icon icon="mdi:message-text-outline" size={15} />
            Abrir conversa
          </Button>
          <Button variant="outline" size="sm" onClick={() => onCall(contact)}>
            <Icon icon="mdi:phone-outline" size={15} />
            Ligar
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <Section title="Contato">
            <div className="rounded-md border border-border px-3">
              <Row icon="mdi:whatsapp" label="WhatsApp" value={contact.phone} />
              <Row icon="mdi:email-outline" label="E-mail" value={contact.email} />
              <Row
                icon="mdi:map-marker-outline"
                label="Cidade/UF"
                value={formatCityUf(contact.city, contact.uf)}
              />
            </div>
          </Section>

          <Section title="Vínculo">
            {contact.customerId ? (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-3">
                <Icon icon="mdi:office-building-outline" size={16} className="text-primary" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary">
                  {contact.customerName ?? "Cliente vinculado"}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Abrir ficha do cliente"
                  onClick={() => onOpenCustomer(contact)}
                >
                  <Icon icon="mdi:open-in-new" size={15} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Desvincular"
                  onClick={() => onUnlink(contact)}
                >
                  <Icon icon="mdi:link-off" size={15} />
                </Button>
              </div>
            ) : (
              <div className="space-y-2 rounded-md border border-dashed border-severity-info/50 bg-severity-info/5 p-3">
                <div className="flex items-center gap-2">
                  <Icon icon="mdi:link-off" size={15} className="text-severity-info" />
                  <span className="text-sm font-medium text-severity-info">Contato solto</span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Sem cliente vinculado. Enquanto estiver solto, o histórico não entra na carteira
                  nem na positivação.
                </p>
                <Button variant="outline" size="sm" onClick={() => onLink(contact)}>
                  <Icon icon="mdi:link-variant" size={15} />
                  Vincular a cliente
                </Button>
              </div>
            )}
          </Section>

          <Section
            title="Etiquetas"
            action={
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => onAddTag(contact)}
              >
                <Icon icon="mdi:plus" size={13} />
                Etiqueta
              </Button>
            }
          >
            {contact.tags.length ? (
              <div className="flex flex-wrap gap-1.5">
                {contact.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded border border-border bg-muted/50 py-0.5 pl-2 pr-1 text-xs"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => onRemoveTag(contact, tag)}
                      aria-label={`Remover ${tag}`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Icon icon="mdi:close" size={12} />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhuma etiqueta</p>
            )}
          </Section>

          <Section
            title="Responsável"
            action={
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => onTransferOwner(contact)}
              >
                <Icon icon="mdi:account-switch-outline" size={13} />
                Transferir
              </Button>
            }
          >
            {contact.ownerName ? (
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="flex h-7 w-7 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground"
                >
                  {contactInitials(contact.ownerName)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm">{contact.ownerName}</p>
                  <p className="text-xs text-muted-foreground">
                    último contato {contact.lastContactAt ?? "—"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon icon="mdi:account-outline" size={14} />
                Não atribuído — entra na fila de rodízio
              </p>
            )}
          </Section>

          <Section title="Agendar retorno">
            <div
              className={cn(
                "space-y-2 rounded-md border p-3",
                focus === "retorno" ? "border-primary/50 bg-primary/5" : "border-border",
              )}
            >
              {contact.nextContactAt ? (
                <div className="flex items-center gap-2">
                  <Icon
                    icon="mdi:calendar-check-outline"
                    size={16}
                    className="text-severity-success"
                  />
                  <div>
                    <p className="text-sm font-medium">
                      {contact.nextContactAt} · {contact.nextContactNote || "sem observação"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Cai na sua fila e na timeline do cliente
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <div className="w-36 shrink-0 space-y-1">
                      <Label htmlFor="contact-followup-date" className="text-xs">
                        Data
                      </Label>
                      <Input
                        id="contact-followup-date"
                        type="date"
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <Label htmlFor="contact-followup-note" className="text-xs">
                        Motivo
                      </Label>
                      <Input
                        id="contact-followup-note"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Motivo do retorno"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!date}
                    onClick={() => onScheduleFollowUp(contact, date, note)}
                  >
                    <Icon icon="mdi:calendar-plus" size={15} />
                    Agendar retorno
                  </Button>
                </>
              )}
            </div>
          </Section>

          <Separator />

          <Section title="LGPD">
            <div
              className={cn(
                "flex items-center gap-3 rounded-md border p-3",
                optOut
                  ? "border-severity-critical/40 bg-severity-critical/10"
                  : "border-border bg-muted/20",
              )}
            >
              <Icon
                icon="mdi:shield-off-outline"
                size={18}
                className={cn(
                  "shrink-0",
                  optOut ? "text-severity-critical" : "text-muted-foreground",
                )}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm font-medium",
                    optOut ? "text-severity-critical" : "text-foreground",
                  )}
                >
                  {optOut ? "Contato em opt-out" : "Aceita contato comercial"}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Bloqueia envio em massa e disparos automáticos. A mudança fica registrada na
                  auditoria.
                </p>
              </div>
              <Switch
                checked={optOut}
                onCheckedChange={(checked) => onToggleOptOut(contact, checked)}
                aria-label="Alternar opt-out"
              />
            </div>
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

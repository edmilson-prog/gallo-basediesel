import { Icon } from "@/components/Icon";

/** Empty state shown when the current scope/filters/search match no contact. */
export function ContactsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <Icon icon="mdi:account-search-outline" size={32} className="text-muted-foreground" />
      </div>
      <h2 className="font-display text-lg font-bold uppercase tracking-wide text-foreground">
        Nenhum contato neste filtro
      </h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Ajuste os filtros ou traga contatos de fora: importe um CSV ou sincronize a agenda do
        WhatsApp.
      </p>
    </div>
  );
}

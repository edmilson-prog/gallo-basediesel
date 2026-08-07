import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { ContactScope, ContactSource, IContact, ID } from "@/shared/types";
import type { ContactRecencyBucket, IListContactsParams } from "@/providers/data";
import { ScrollProgressBar } from "@/features/shell/components/ScrollProgressBar";
import { UNASSIGNED_OWNER } from "../engine/contactFilters";
import { useContactsList } from "../hooks/useContactsList";
import { OPTIONAL_CONTACT_COLUMNS, type OptionalContactColumn } from "../utils/columns";
import { ContactsFiltersBar, ANY_VALUE } from "../components/list/ContactsFiltersBar";
import { ContactsGrid } from "../components/list/ContactsGrid";
import { ContactsHeader, type ContactsView } from "../components/list/ContactsHeader";
import { ContactsPagination } from "../components/list/ContactsPagination";
import { ContactsTable, type IContactsSort } from "../components/list/ContactsTable";

const DEFAULT_COLUMNS: OptionalContactColumn[] = [
  "phone",
  "customer",
  "role",
  "owner",
  "tags",
  "last",
  "status",
];

/**
 * Agenda de contatos.
 *
 * O bloco superior fica fixo; a área abaixo tem scroll própria. `min-h-0` na
 * coluna e na região de scroll não é decorativo: sem ele o filho trava no
 * `min-content` do bloco fixo e empurra o conteúdo para fora da tela.
 *
 * Ações em massa (Task 16) e gaveta de detalhe (Task 17) ainda não estão
 * ligadas.
 */
export function ContactsPage() {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [view, setView] = useState<ContactsView>("grid");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<ContactScope>("todos");
  const [owner, setOwner] = useState<string>(ANY_VALUE);
  const [tag, setTag] = useState<string>(ANY_VALUE);
  const [cityUf, setCityUf] = useState<string>(ANY_VALUE);
  const [source, setSource] = useState<ContactSource | typeof ANY_VALUE>(ANY_VALUE);
  const [lastContact, setLastContact] = useState<ContactRecencyBucket | typeof ANY_VALUE>(
    ANY_VALUE,
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selectedIds, setSelectedIds] = useState<Set<ID>>(() => new Set());
  const [visibleColumns, setVisibleColumns] = useState<OptionalContactColumn[]>(DEFAULT_COLUMNS);
  const [sort, setSort] = useState<IContactsSort>({ orderBy: "name", orderDir: "asc" });

  const params = useMemo<IListContactsParams>(() => {
    const [city, uf] = cityUf === ANY_VALUE ? [undefined, undefined] : cityUf.split(" / ");
    return {
      scope,
      search: search.trim() || undefined,
      ownerSellerIds: owner !== ANY_VALUE && owner !== UNASSIGNED_OWNER ? [owner] : undefined,
      unassignedOwner: owner === UNASSIGNED_OWNER ? true : undefined,
      tags: tag !== ANY_VALUE ? [tag] : undefined,
      city,
      uf,
      sources: source !== ANY_VALUE ? [source] : undefined,
      lastContactBucket: lastContact !== ANY_VALUE ? lastContact : undefined,
      orderBy: sort.orderBy,
      orderDir: sort.orderDir,
      page,
      pageSize,
    };
  }, [scope, search, owner, tag, cityUf, source, lastContact, sort, page, pageSize]);

  const { data: contacts, total, counts, isError } = useContactsList(params);

  // Filter options come from the loaded page rather than a hardcoded list, so
  // they always reflect what this store actually has.
  const ownerOptions = useMemo(() => {
    const seen = new Map<ID, string>();
    for (const contact of contacts) {
      if (contact.ownerSellerId && contact.ownerName) {
        seen.set(contact.ownerSellerId, contact.ownerName);
      }
    }
    return [...seen]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [contacts]);

  const tagOptions = useMemo(
    () => [...new Set(contacts.flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [contacts],
  );

  const cityUfOptions = useMemo(() => {
    const labels = contacts
      .filter((c) => c.city)
      .map((c) => (c.uf ? `${c.city} / ${c.uf}` : (c.city as string)));
    return [...new Set(labels)].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [contacts]);

  /** Any filter change resets to page 1 — otherwise the user lands on a page
   *  that no longer exists and sees an empty list. */
  function resetPage<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  function clearFilters() {
    setScope("todos");
    setOwner(ANY_VALUE);
    setTag(ANY_VALUE);
    setCityUf(ANY_VALUE);
    setSource(ANY_VALUE);
    setLastContact(ANY_VALUE);
    setSearch("");
    setPage(1);
  }

  function toggleSelected(contact: IContact, selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(contact.id);
      else next.delete(contact.id);
      return next;
    });
  }

  function toggleAllInPage(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const contact of contacts) {
        if (checked) next.add(contact.id);
        else next.delete(contact.id);
      }
      return next;
    });
  }

  function toggleColumn(id: OptionalContactColumn) {
    setVisibleColumns((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  function handleOpen(contact: IContact) {
    // Task 17 replaces this with the detail drawer.
    toast.info(`Ficha de ${contact.name} — em breve`);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="relative shrink-0">
        <ContactsHeader
          total={total}
          searchValue={search}
          onSearchChange={resetPage(setSearch)}
          view={view}
          onViewChange={setView}
          canCreate={false}
          onCreate={() => {}}
          onExport={() => toast.info("Exportação — em breve")}
        />
        <ContactsFiltersBar
          scope={scope}
          onScopeChange={resetPage(setScope)}
          counts={counts}
          owner={owner}
          onOwnerChange={resetPage(setOwner)}
          ownerOptions={ownerOptions}
          tag={tag}
          onTagChange={resetPage(setTag)}
          tagOptions={tagOptions}
          cityUf={cityUf}
          onCityUfChange={resetPage(setCityUf)}
          cityUfOptions={cityUfOptions}
          source={source}
          onSourceChange={resetPage(setSource)}
          lastContact={lastContact}
          onLastContactChange={resetPage(setLastContact)}
          onClear={clearFilters}
        />
        <ScrollProgressBar container={scrollEl} />
      </div>

      <div ref={setScrollEl} className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <p className="p-6 text-sm text-severity-critical">
            Não foi possível carregar a agenda. Tente novamente.
          </p>
        ) : view === "grid" ? (
          <ContactsGrid
            contacts={contacts}
            selectedIds={selectedIds}
            onSelect={toggleSelected}
            onOpen={handleOpen}
            onQuickAction={(contact, action) => toast.info(`${action} — ${contact.name}`)}
            onLink={(contact) => toast.info(`Vincular ${contact.name} — em breve`)}
          />
        ) : (
          <ContactsTable
            contacts={contacts}
            visibleColumns={visibleColumns}
            selectedIds={selectedIds}
            sort={sort}
            onSortChange={(next) => {
              setSort(next);
              setPage(1);
            }}
            onSelect={toggleSelected}
            onToggleAllInPage={toggleAllInPage}
            onOpen={handleOpen}
            onToggleColumn={toggleColumn}
            onShowAllColumns={() => setVisibleColumns([...OPTIONAL_CONTACT_COLUMNS])}
          />
        )}
      </div>

      <ContactsPagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </div>
  );
}

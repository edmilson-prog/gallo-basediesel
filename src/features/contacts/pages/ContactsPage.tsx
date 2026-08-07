import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { ContactScope, ContactSource, IContact, ID } from "@/shared/types";
import type { ContactRecencyBucket, IListContactsParams } from "@/providers/data";
import { ScrollProgressBar } from "@/features/shell/components/ScrollProgressBar";
import { FETCH_ALL_PAGE_SIZE, useContactsProvider } from "@/providers/data";
import { UNASSIGNED_OWNER } from "../engine/contactFilters";
import { useContactsList } from "../hooks/useContactsList";
import { OPTIONAL_CONTACT_COLUMNS, type OptionalContactColumn } from "../utils/columns";
import { ContactsFiltersBar, ANY_VALUE } from "../components/list/ContactsFiltersBar";
import { ContactsGrid } from "../components/list/ContactsGrid";
import { ContactsHeader, type ContactsView } from "../components/list/ContactsHeader";
import { ContactsPagination } from "../components/list/ContactsPagination";
import { ContactsTable, type IContactsSort } from "../components/list/ContactsTable";
import { ContactsBulkBar } from "../components/list/ContactsBulkBar";
import {
  ContactBulkActionDialog,
  type ContactBulkAction,
} from "../components/modals/ContactBulkActionDialog";
import { useContactsBulkActions } from "../hooks/useContactsBulkActions";
import { useContactActions } from "../hooks/useContactActions";
import { ContactDrawer, type ContactDrawerFocus } from "../components/detail/ContactDrawer";
import { LinkCustomerDialog } from "../components/modals/LinkCustomerDialog";

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
  const [bulkAction, setBulkAction] = useState<ContactBulkAction | null>(null);
  const [drawer, setDrawer] = useState<{ contact: IContact; focus?: ContactDrawerFocus } | null>(
    null,
  );
  const [linkTarget, setLinkTarget] = useState<IContact | null>(null);

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

  const provider = useContactsProvider();
  const { data: contacts, total, counts, isError } = useContactsList(params);
  const bulk = useContactsBulkActions(() => setSelectedIds(new Set()));
  const actions = useContactActions();

  // The drawer holds its own copy of the contact, so a refetch after a
  // mutation would leave it showing stale values. Re-read it from the fresh
  // page whenever the list changes.
  const drawerContact = drawer
    ? (contacts.find((c) => c.id === drawer.contact.id) ?? drawer.contact)
    : null;

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

  /**
   * Extends the selection to the whole filtered set, not just the loaded page.
   * Fetches the ids with the same filters at the full page size — the provider
   * chunks that read internally, so the 1000-row PostgREST cap does not
   * silently truncate it.
   */
  async function selectAllFiltered() {
    try {
      const all = await provider.list({ ...params, page: 1, pageSize: FETCH_ALL_PAGE_SIZE });
      setSelectedIds(new Set(all.data.map((c) => c.id)));
      toast.info(`Seleção estendida aos ${all.total.toLocaleString("pt-BR")} contatos filtrados`);
    } catch {
      toast.error("Não foi possível estender a seleção");
    }
  }

  function toggleColumn(id: OptionalContactColumn) {
    setVisibleColumns((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  function handleOpen(contact: IContact, focus?: ContactDrawerFocus) {
    setDrawer({ contact, focus });
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
          onExport={() => setBulkAction("export")}
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
        <ContactsBulkBar
          selectedCount={selectedIds.size}
          totalFiltered={total}
          onClearSelection={() => setSelectedIds(new Set())}
          onSelectAllFiltered={selectAllFiltered}
          onAddTag={() => setBulkAction("addTag")}
          onRemoveTag={() => setBulkAction("removeTag")}
          onTransferOwner={() => setBulkAction("transferOwner")}
          onExport={() => setBulkAction("export")}
          onOptOut={() => setBulkAction("optOut")}
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
            onQuickAction={(contact, action) => {
              if (action === "schedule") handleOpen(contact, "retorno");
              else toast.info(`${action} — ${contact.name}`);
            }}
            onLink={setLinkTarget}
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

      <ContactDrawer
        contact={drawerContact}
        focus={drawer?.focus}
        onClose={() => setDrawer(null)}
        onLink={setLinkTarget}
        onUnlink={(contact) => void actions.linkToCustomer(contact, null)}
        onOpenCustomer={(contact) => toast.info(`Ficha de ${contact.customerName}`)}
        onAddTag={() => setBulkAction("addTag")}
        onRemoveTag={(contact, tag) => void actions.removeTag(contact, tag)}
        onTransferOwner={() => setBulkAction("transferOwner")}
        onToggleOptOut={(contact, optOut) => void actions.setOptOut(contact, optOut)}
        onScheduleFollowUp={(contact, at, note) => void actions.scheduleFollowUp(contact, at, note)}
        onOpenConversation={(contact) => toast.info(`Conversa de ${contact.name} — em breve`)}
        onCall={(contact) => toast.info(`Ligar para ${contact.name} — em breve`)}
      />

      <LinkCustomerDialog
        contact={linkTarget}
        onClose={() => setLinkTarget(null)}
        onConfirm={(contact, customerId) => {
          setLinkTarget(null);
          void actions.linkToCustomer(contact, customerId);
        }}
      />

      <ContactBulkActionDialog
        action={bulkAction}
        selectedCount={selectedIds.size}
        tagOptions={tagOptions}
        ownerOptions={ownerOptions}
        onClose={() => setBulkAction(null)}
        onConfirm={(action, value) => {
          setBulkAction(null);
          void bulk.run(action, [...selectedIds], value);
        }}
      />

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

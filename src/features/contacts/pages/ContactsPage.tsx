import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ContactScope, ContactSource, IContact, ID } from "@/shared/types";
import type { ContactRecencyBucket, IListContactsParams } from "@/providers/data";
import { ScrollProgressBar } from "@/features/shell/components/ScrollProgressBar";
import { FETCH_ALL_PAGE_SIZE, useContactsProvider, useSellersProvider } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore";
import { UNASSIGNED_OWNER } from "../engine/contactFilters";
import { useContactsList } from "../hooks/useContactsList";
import { OPTIONAL_CONTACT_COLUMNS, type OptionalContactColumn } from "../utils/columns";
import { ContactsFiltersBar, ANY_VALUE } from "../components/list/ContactsFiltersBar";
import { ContactsGrid } from "../components/list/ContactsGrid";
import type { ContactAction } from "../components/list/ContactCard";
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
 * Alvo de uma ação que passa pelo diálogo de confirmação.
 *
 * `ids` é explícito de propósito. Antes o diálogo lia sempre a seleção corrente,
 * então "adicionar etiqueta" a partir da gaveta de um contato não selecionado
 * rodava com zero ids — e o hook devolvia sem fazer nada, sem erro nenhum.
 */
interface IActionTarget {
  action: ContactBulkAction;
  ids: ID[];
  label: string;
}

/**
 * Agenda de contatos.
 *
 * O bloco superior fica fixo; a área abaixo tem scroll própria. `min-h-0` na
 * coluna e na região de scroll não é decorativo: sem ele o filho trava no
 * `min-content` do bloco fixo e empurra o conteúdo para fora da tela.
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
  const [actionTarget, setActionTarget] = useState<IActionTarget | null>(null);
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
  const sellersProvider = useSellersProvider();
  const navigate = useNavigate();
  const { currentStoreId } = useCurrentStore();
  const { data: contacts, total, counts, isError } = useContactsList(params);
  const bulk = useContactsBulkActions(() => setSelectedIds(new Set()));
  const actions = useContactActions();

  // The drawer holds its own copy of the contact, so a refetch after a
  // mutation would leave it showing stale values. Re-read it from the fresh
  // page whenever the list changes.
  const drawerContact = drawer
    ? (contacts.find((c) => c.id === drawer.contact.id) ?? drawer.contact)
    : null;

  /**
   * Responsáveis vêm dos vendedores da loja, não dos contatos carregados.
   *
   * Derivar da página era um beco: com 15 contatos por página, só apareciam os
   * donos daquela página — não dava para filtrar por um vendedor ausente dali,
   * nem transferir um contato para ele.
   */
  const { data: sellers = [] } = useQuery({
    queryKey: ["contacts-owner-options", currentStoreId] as const,
    queryFn: () => sellersProvider.list({ storeId: currentStoreId ?? undefined, active: true }),
    staleTime: 5 * 60_000,
  });

  const ownerOptions = useMemo(
    () =>
      sellers
        .map((seller) => ({ id: seller.id, name: seller.fullName }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [sellers],
  );

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

  /** Ação em massa disparada pela barra de seleção. */
  function openForSelection(action: ContactBulkAction) {
    const ids = [...selectedIds];
    setActionTarget({
      action,
      ids,
      label: `${ids.length} ${ids.length === 1 ? "contato selecionado" : "contatos selecionados"}`,
    });
  }

  /** Mesma ação, mas mirada num contato só — do menu do card ou da gaveta. */
  function openForContact(action: ContactBulkAction, contact: IContact) {
    setActionTarget({ action, ids: [contact.id], label: contact.name });
  }

  /**
   * Leva o contato para o Atendimento com o telefone na busca.
   *
   * A busca do Inbox descarta os demais filtros e reconcilia o 9º dígito, então
   * a conversa aparece mesmo sendo de outro atendente. Sem telefone, cai no nome.
   */
  function openConversation(contact: IContact) {
    const digits = contact.phone?.replace(/\D/g, "") ?? "";
    void navigate({ to: "/app/atendimento", search: { q: digits || contact.name } });
  }

  /**
   * Entrega o número: aciona o discador e copia para a área de transferência.
   *
   * As duas coisas porque `tel:` só faz algo em máquina com discador
   * registrado — no desktop sem um, o clique seria silencioso. A cópia garante
   * que o usuário sempre saia daqui com o número em mãos.
   */
  async function callContact(contact: IContact) {
    if (!contact.phone) {
      toast.error("Contato sem telefone cadastrado");
      return;
    }

    // Âncora temporária em vez de `location.href`: o protocolo externo não
    // chega perto do router.
    const anchor = document.createElement("a");
    anchor.href = `tel:${contact.phone.replace(/[^\d+]/g, "")}`;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    try {
      await navigator.clipboard.writeText(contact.phone);
      toast.success(`Telefone copiado: ${contact.phone}`);
    } catch {
      toast.info(`Telefone: ${contact.phone}`);
    }
  }

  function openCustomer(contact: IContact) {
    if (!contact.customerId) {
      toast.error("Contato sem cliente vinculado");
      return;
    }
    void navigate({ to: "/app/clientes/$id", params: { id: contact.customerId } });
  }

  /**
   * Resposta única para tudo que o card pede — botões do rodapé e menu "…".
   *
   * O `switch` é exaustivo de propósito: o `never` no default quebra a
   * compilação se alguém adicionar uma ação ao menu sem tratá-la aqui. O que
   * havia antes era um `toast.info` com o id cru da ação, e era isso que
   * aparecia na tela ao clicar em "…".
   */
  function handleAction(contact: IContact, action: ContactAction) {
    switch (action) {
      case "conversation":
        return openConversation(contact);
      case "call":
        return callContact(contact);
      case "schedule":
        return handleOpen(contact, "retorno");
      case "open":
        return handleOpen(contact);
      case "openCustomer":
        return openCustomer(contact);
      case "unlink":
        return void actions.linkToCustomer(contact, null);
      case "addTag":
        return openForContact("addTag", contact);
      case "transferOwner":
        return openForContact("transferOwner", contact);
      case "toggleOptOut":
        return void actions.setOptOut(contact, !contact.optOut);
      default: {
        const exhaustive: never = action;
        return exhaustive;
      }
    }
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
          onExport={() => openForSelection("export")}
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
          onAddTag={() => openForSelection("addTag")}
          onRemoveTag={() => openForSelection("removeTag")}
          onTransferOwner={() => openForSelection("transferOwner")}
          onExport={() => openForSelection("export")}
          onOptOut={() => openForSelection("optOut")}
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
            onAction={handleAction}
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
        onOpenCustomer={openCustomer}
        onAddTag={(contact) => openForContact("addTag", contact)}
        onRemoveTag={(contact, tag) => void actions.removeTag(contact, tag)}
        onTransferOwner={(contact) => openForContact("transferOwner", contact)}
        onToggleOptOut={(contact, optOut) => void actions.setOptOut(contact, optOut)}
        onScheduleFollowUp={(contact, at, note) => void actions.scheduleFollowUp(contact, at, note)}
        onOpenConversation={openConversation}
        onCall={callContact}
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
        action={actionTarget?.action ?? null}
        targetLabel={actionTarget?.label ?? ""}
        tagOptions={tagOptions}
        ownerOptions={ownerOptions}
        onClose={() => setActionTarget(null)}
        onConfirm={(action, value) => {
          const ids = actionTarget?.ids ?? [];
          setActionTarget(null);
          void bulk.run(action, ids, value);
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

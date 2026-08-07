import { useState } from "react";
import { ScrollProgressBar } from "@/features/shell/components/ScrollProgressBar";
import { ContactsHeader, type ContactsView } from "../components/list/ContactsHeader";

/**
 * Agenda de contatos — casco navegável.
 *
 * O bloco superior (header, filtros, barra de ações em massa) fica fixo; a
 * área abaixo dele tem scroll própria. `min-h-0` na coluna e na área de
 * scroll não é decorativo: sem ele o filho trava no `min-content` do bloco
 * fixo e empurra o conteúdo para fora da tela.
 *
 * As tarefas 13-17 preenchem os blocos comentados abaixo; a 18 liga a tela ao
 * provider e substitui o `total` provisório.
 */
export function ContactsPage() {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [view, setView] = useState<ContactsView>("grid");
  const [search, setSearch] = useState("");

  // Provisório até a Task 18 ligar `useContacts`. O total precisa vir do
  // servidor, nunca do tamanho da página carregada — é assim que o
  // truncamento silencioso se instala.
  const total = 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="relative shrink-0">
        <ContactsHeader
          total={total}
          searchValue={search}
          onSearchChange={setSearch}
          view={view}
          onViewChange={setView}
          canCreate={false}
          onCreate={() => {}}
          onExport={() => {}}
        />
        {/* Task 13: ContactsFiltersBar · Task 16: ContactsBulkBar */}
        <ScrollProgressBar container={scrollEl} />
      </div>

      <div ref={setScrollEl} className="min-h-0 flex-1 overflow-y-auto">
        {/* Task 11 (pronta): ContactsGrid · Task 14: ContactsTable */}
      </div>

      {/* Task 15: ContactsPagination */}
    </div>
  );
}

import { useState } from "react";

/**
 * Agenda de contatos — casco navegável.
 *
 * O bloco superior (header, filtros, barra de ações em massa) fica fixo; a
 * área abaixo dele tem scroll própria. `min-h-0` na coluna e na área de
 * scroll não é decorativo: sem ele o filho trava no `min-content` do bloco
 * fixo e empurra o conteúdo para fora da tela.
 *
 * As tarefas 11-17 preenchem os blocos comentados abaixo.
 */
export function ContactsPage() {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Task 12: ContactsHeader  ·  Task 13: ContactsFiltersBar  ·  Task 16: ContactsBulkBar */}
      <div ref={setScrollEl} className="min-h-0 flex-1 overflow-y-auto">
        {/* Task 11: ContactsGrid  ·  Task 14: ContactsTable */}
      </div>
      {/* Task 15: ContactsPagination */}
    </div>
  );
}

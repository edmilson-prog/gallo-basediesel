import type { IServiceKit } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { kitUsageMock } from "../utils/kitUsageMock";

export interface IKitsTableProps {
  kits: IServiceKit[];
  onEdit: (kit: IServiceKit) => void;
  onDuplicate: (kit: IServiceKit) => void;
  onDelete: (kit: IServiceKit) => void;
}

export function KitsTable({ kits, onEdit, onDuplicate, onDelete }: IKitsTableProps) {
  if (kits.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">Nenhum kit cadastrado ainda.</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Kit</th>
            <th className="px-3 py-2 text-left">Veículo</th>
            <th className="px-3 py-2 text-left">Categoria</th>
            <th className="w-20 px-3 py-2 text-right">Peças</th>
            <th className="w-24 px-3 py-2 text-right">Uso</th>
            <th className="w-28 px-3 py-2 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {kits.map((kit) => (
            <tr key={kit.id} className="border-t border-border">
              <td className="px-3 py-2">
                <p className="font-medium text-foreground">{kit.name}</p>
                {kit.description && (
                  <p className="text-xs text-muted-foreground">{kit.description}</p>
                )}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {kit.vehicleApplication
                  ? `${kit.vehicleApplication.brand} ${kit.vehicleApplication.model}`
                  : "—"}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{kit.category ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{kit.items.length}</td>
              <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
                {kitUsageMock(kit.id)} orç.
              </td>
              <td className="px-3 py-2">
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => onEdit(kit)}
                    aria-label={`Editar ${kit.name}`}
                    className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:text-foreground"
                  >
                    <Icon icon="mdi:pencil-outline" size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDuplicate(kit)}
                    aria-label={`Duplicar ${kit.name}`}
                    className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:text-foreground"
                  >
                    <Icon icon="mdi:content-copy" size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(kit)}
                    aria-label={`Excluir ${kit.name}`}
                    className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:text-destructive"
                  >
                    <Icon icon="mdi:trash-can-outline" size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

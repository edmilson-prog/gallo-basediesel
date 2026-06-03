import type { ID, IServiceKit } from "@/shared/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ICreateServiceKitInput } from "@/providers/data";
import { KitForm } from "./KitForm";

export interface IKitFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: ID;
  initial?: IServiceKit;
  saving?: boolean;
  onSubmit: (input: ICreateServiceKitInput) => void;
}

export function KitFormDrawer({
  open,
  onOpenChange,
  storeId,
  initial,
  saving,
  onSubmit,
}: IKitFormDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{initial ? "Editar kit" : "Novo kit de revisão"}</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <KitForm
            storeId={storeId}
            initial={initial}
            saving={saving}
            onSubmit={onSubmit}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

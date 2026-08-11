import { Icon } from "@/components/Icon";
import { PwaSheet } from "../ui/PwaSheet";
import { PWA_ATENDIMENTO_STRINGS as S } from "../../i18n/pt-BR";

export type PwaAttachChoice = "photo" | "camera" | "document" | "product";

const OPTIONS: {
  id: PwaAttachChoice;
  icon: string;
  label: string;
  hint: string;
  gold?: boolean;
}[] = [
  { id: "photo", icon: "mdi:image-outline", label: S.attach.photo, hint: S.attach.photoHint },
  { id: "camera", icon: "mdi:camera-outline", label: S.attach.camera, hint: S.attach.cameraHint },
  {
    id: "document",
    icon: "mdi:file-document-outline",
    label: S.attach.document,
    hint: S.attach.documentHint,
  },
  {
    id: "product",
    icon: "mdi:package-variant",
    label: S.attach.product,
    hint: S.attach.productHint,
    gold: true,
  },
];

interface IPwaAttachSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (choice: PwaAttachChoice) => void;
}

export function PwaAttachSheet({ open, onOpenChange, onPick }: IPwaAttachSheetProps) {
  return (
    <PwaSheet open={open} onOpenChange={onOpenChange} title={S.attach.title}>
      <div className="flex flex-col">
        {OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onPick(option.id)}
            className="flex min-h-[56px] w-full items-center gap-3.5 border-b border-border px-0.5 py-3.5 text-left"
          >
            <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded bg-foreground/[0.06] ring-1 ring-inset ring-border">
              <Icon
                icon={option.icon}
                size={18}
                className={option.gold ? "text-primary" : "text-muted-foreground"}
              />
            </span>
            <span className="min-w-0">
              <span className="block text-[14.5px] font-bold text-foreground">{option.label}</span>
              <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                {option.hint}
              </span>
            </span>
          </button>
        ))}
      </div>
    </PwaSheet>
  );
}

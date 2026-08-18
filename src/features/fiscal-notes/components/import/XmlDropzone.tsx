import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { FISCAL_NOTES_STRINGS } from "../../i18n/pt-BR";

export interface IXmlDropzoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

/** Só `.xml`: `.zip` com vários XML fica para quando houver demanda real. */
function onlyXml(list: FileList | null): File[] {
  if (!list) return [];
  return Array.from(list).filter((file) => file.name.toLowerCase().endsWith(".xml"));
}

export function XmlDropzone({ onFiles, disabled }: IXmlDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  const s = FISCAL_NOTES_STRINGS.import;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (disabled) return;
        onFiles(onlyXml(e.dataTransfer.files));
      }}
      className={cn(
        "rounded-xl border-[1.5px] border-dashed px-5 py-7 text-center transition-colors motion-reduce:transition-none",
        over ? "border-primary bg-primary/5" : "border-border bg-muted/20",
        disabled && "opacity-60",
      )}
    >
      <span className="inline-grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon icon="mdi:file-upload-outline" size={21} aria-hidden />
      </span>
      <div className="mt-2.5 font-display text-lg font-extrabold uppercase text-foreground">
        {s.dropTitle}
      </div>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        {s.dropHintPrefix}
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed"
        >
          {s.chooseFiles}
        </button>
        {` · ${s.dropAccept}`}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".xml,text/xml,application/xml"
        multiple
        className="hidden"
        aria-label={s.chooseFiles}
        onChange={(e) => {
          onFiles(onlyXml(e.target.files));
          // Zera para o mesmo arquivo poder ser escolhido de novo após um erro.
          e.target.value = "";
        }}
      />
    </div>
  );
}

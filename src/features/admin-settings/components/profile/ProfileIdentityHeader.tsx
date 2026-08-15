import { useRef } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AVATAR_ACCEPT_ATTRIBUTE, AVATAR_SIZE_LABEL } from "../../engine/avatarFile";

interface IProfileIdentityHeaderProps {
  fullName: string;
  initials: string;
  role: string | null;
  email: string;
  storeName: string | null;
  /** Pre-formatted "março de 2024". */
  memberSince: string | null;
  /** Pre-formatted "hoje, 08:42". */
  lastAccess: string | null;
  avatarUrl: string | null;
  uploading: boolean;
  onPickFile: (file: File) => void;
  onRemovePhoto: () => void;
}

/**
 * Identity banner at the top of "Meu perfil": photo (click to replace), name,
 * role chip, contact line and the membership/last-access line.
 */
export function ProfileIdentityHeader({
  fullName,
  initials,
  role,
  email,
  storeName,
  memberSince,
  lastAccess,
  avatarUrl,
  uploading,
  onPickFile,
  onRemovePhoto,
}: IProfileIdentityHeaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handlePick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset first so picking the same file twice still fires onChange.
    event.target.value = "";
    if (file) onPickFile(file);
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(620px_200px_at_8%_-40%,var(--color-primary),transparent_70%)] opacity-15"
      />

      <div className="relative flex flex-wrap items-center gap-5 p-6">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label={avatarUrl ? "Alterar foto de perfil" : "Enviar foto de perfil"}
          className="group relative size-22 shrink-0 rounded-full bg-gradient-to-br from-primary via-primary/50 to-border p-[3px] shadow-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-wait"
        >
          <span className="grid size-full place-items-center overflow-hidden rounded-full bg-muted">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="text-2xl font-bold tracking-wide text-primary">{initials}</span>
            )}
          </span>
          <span
            className={cn(
              "pointer-events-none absolute inset-[3px] grid place-items-center gap-0.5 rounded-full bg-background/75 backdrop-blur-[1px] transition-opacity",
              uploading
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
            )}
          >
            <Icon
              icon={uploading ? "lucide:loader-circle" : "lucide:camera"}
              className={uploading ? "size-5 animate-spin" : "size-5"}
            />
            <span className="text-[10px] font-bold uppercase tracking-[0.08em]">
              {uploading ? "Enviando" : "Alterar"}
            </span>
          </span>
          <input
            ref={inputRef}
            type="file"
            accept={AVATAR_ACCEPT_ATTRIBUTE}
            onChange={handlePick}
            className="hidden"
          />
        </button>

        <div className="min-w-55 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
            <h2 className="text-2xl font-bold leading-none tracking-tight text-foreground">
              {fullName}
            </h2>
            {role && (
              <Badge variant="secondary" className="gap-1">
                <Icon icon="lucide:crown" className="size-3" />
                {role}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Icon icon="lucide:mail" className="size-3.5" />
              {email}
            </span>
            {storeName && (
              <span className="inline-flex items-center gap-1.5">
                <Icon icon="lucide:building-2" className="size-3.5" />
                {storeName}
              </span>
            )}
          </div>
          {(memberSince || lastAccess) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground/80">
              {memberSince && (
                <span className="inline-flex items-center gap-1.5">
                  <Icon icon="lucide:calendar" className="size-3.5" />
                  Na equipe desde {memberSince}
                </span>
              )}
              {lastAccess && (
                <span className="inline-flex items-center gap-1.5">
                  <Icon icon="lucide:clock" className="size-3.5" />
                  Último acesso {lastAccess}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            <Icon icon="lucide:upload" className="size-3.5" />
            {uploading ? "Enviando…" : "Enviar foto"}
          </Button>
          {avatarUrl && (
            <Button variant="ghost" size="sm" onClick={onRemovePhoto} disabled={uploading}>
              <Icon icon="lucide:trash-2" className="size-3.5" />
              Remover
            </Button>
          )}
          <p className="max-w-38 text-center text-[11px] leading-snug text-muted-foreground">
            JPG ou PNG, até {AVATAR_SIZE_LABEL}
          </p>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

interface IPwaAvatarProps {
  initials: string;
  /**
   * Foto de perfil do WhatsApp já sincronizada (`customers.avatar_url` /
   * `leads.avatar_url`, bucket público). Ausente ou quebrada → monograma.
   */
  src?: string | null;
  /**
   * O "nome" do contato é só o telefone — WhatsApp não salvo. Aí o monograma
   * sairia como um "+5" que não identifica ninguém, e o ícone genérico diz mais.
   */
  isPhoneName?: boolean;
  size?: number;
  /** Draws the gold hairline used on the account button. */
  accent?: boolean;
  /** Slightly lifted background — marks a row with unread messages. */
  highlighted?: boolean;
  className?: string;
}

/**
 * Square monogram, radius 4 — the kit deliberately avoids circles so the avatar
 * echoes the brand's rectangular marks. A foto entra no mesmo recorte quadrado;
 * o app é monocromático, então o fundo continua neutro em vez de ganhar a matiz
 * por contato que o desktop usa.
 */
export function PwaAvatar({
  initials,
  src,
  isPhoneName = false,
  size = 44,
  accent = false,
  highlighted = false,
  className,
}: IPwaAvatarProps) {
  // Uma URL que falhou (objeto removido, rede caindo no meio) precisa cair no
  // monograma; e uma URL NOVA precisa rearmar a tentativa — a linha da lista é
  // reciclada entre conversas conforme a inbox se reordena.
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  const showPhoto = Boolean(src) && !failed;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded font-display font-extrabold tracking-[0.02em] text-foreground",
        highlighted ? "bg-muted" : "bg-muted/60",
        accent ? "ring-1 ring-inset ring-primary/60" : "ring-1 ring-inset ring-border",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {showPhoto ? (
        <img
          src={src ?? undefined}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : isPhoneName ? (
        <Icon icon="mdi:account" size={Math.round(size * 0.45)} className="text-muted-foreground" />
      ) : (
        initials
      )}
    </div>
  );
}

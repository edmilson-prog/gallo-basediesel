import { Icon as IconifyIcon } from "@iconify/react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface IIconProps {
  /** Ex: "mdi:cog", "lucide:user", "phosphor:car" */
  icon: string;
  className?: string;
  size?: number | string;
  ariaLabel?: string;
}

/**
 * Wrapper sobre @iconify/react com fallback discreto se o ícone falhar.
 * Ícones são carregados sob demanda da Iconify API/CDN.
 */
export function Icon({ icon, className, size, ariaLabel }: IIconProps) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <span
        aria-label={ariaLabel}
        className={cn("inline-block border border-border bg-muted", className)}
        style={{
          width: size ?? "1em",
          height: size ?? "1em",
        }}
      />
    );
  }

  return (
    <IconifyIcon
      icon={icon}
      width={size}
      height={size}
      className={className}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      onError={() => {
        console.warn(`[Icon] failed to load: ${icon}`);
        setErrored(true);
      }}
    />
  );
}

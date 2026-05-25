import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

export type LogoVariant = "horizontal" | "vertical" | "mark";

interface ILogoProps {
  variant?: LogoVariant;
  /** força uma cor; por padrão adapta ao modo (preto no light, branco no dark) */
  color?: string;
  className?: string;
  title?: string;
}

/**
 * Logo GALLO BASE DIESEL — placeholder tipográfica.
 * Substitua os SVGs em `public/logo/` pelos arquivos oficiais.
 */
export function Logo({
  variant = "horizontal",
  color,
  className,
  title = "GALLO BASE DIESEL",
}: ILogoProps) {
  const { resolvedMode } = useTheme();
  const fill = color ?? (resolvedMode === "dark" ? "#fafafa" : "#0e0e0e");

  if (variant === "mark") {
    return (
      <svg
        viewBox="0 0 64 64"
        role="img"
        aria-label={title}
        className={cn("inline-block", className)}
      >
        <title>{title}</title>
        <rect x="2" y="2" width="60" height="60" rx="8" fill={fill} />
        <text
          x="32"
          y="44"
          textAnchor="middle"
          fontFamily="'Saira Condensed', Inter, sans-serif"
          fontWeight="700"
          fontSize="38"
          fill={resolvedMode === "dark" ? "#0e0e0e" : "#fafafa"}
        >
          G
        </text>
      </svg>
    );
  }

  if (variant === "vertical") {
    return (
      <svg
        viewBox="0 0 220 180"
        role="img"
        aria-label={title}
        className={cn("inline-block", className)}
      >
        <title>{title}</title>
        <text
          x="110"
          y="78"
          textAnchor="middle"
          fontFamily="'Saira Condensed', Inter, sans-serif"
          fontWeight="700"
          fontSize="72"
          fill={fill}
          letterSpacing="2"
        >
          GALLO
        </text>
        <line x1="40" y1="96" x2="180" y2="96" stroke={fill} strokeWidth="2" />
        <text
          x="110"
          y="130"
          textAnchor="middle"
          fontFamily="'Saira Condensed', Inter, sans-serif"
          fontWeight="600"
          fontSize="22"
          fill={fill}
          letterSpacing="6"
        >
          BASE
        </text>
        <text
          x="110"
          y="158"
          textAnchor="middle"
          fontFamily="'Saira Condensed', Inter, sans-serif"
          fontWeight="600"
          fontSize="22"
          fill={fill}
          letterSpacing="6"
        >
          DIESEL
        </text>
      </svg>
    );
  }

  // horizontal (default)
  return (
    <svg
      viewBox="0 0 360 64"
      role="img"
      aria-label={title}
      className={cn("inline-block", className)}
    >
      <title>{title}</title>
      <text
        x="0"
        y="46"
        fontFamily="'Saira Condensed', Inter, sans-serif"
        fontWeight="700"
        fontSize="52"
        fill={fill}
        letterSpacing="2"
      >
        GALLO
      </text>
      <text
        x="170"
        y="30"
        fontFamily="'Saira Condensed', Inter, sans-serif"
        fontWeight="600"
        fontSize="14"
        fill={fill}
        letterSpacing="4"
      >
        BASE
      </text>
      <text
        x="170"
        y="50"
        fontFamily="'Saira Condensed', Inter, sans-serif"
        fontWeight="600"
        fontSize="14"
        fill={fill}
        letterSpacing="4"
      >
        DIESEL
      </text>
    </svg>
  );
}

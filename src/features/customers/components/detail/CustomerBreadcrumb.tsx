import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";

/** Clientes › <nome>, shared by both header directions. */
export function CustomerBreadcrumb({ name }: { name: string }) {
  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground" aria-label="breadcrumb">
      <Link
        to="/app/clientes"
        className="rounded transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {CUSTOMER_STRINGS.detail.breadcrumb}
      </Link>
      <span aria-hidden>
        <Icon icon="mdi:chevron-right" size={14} />
      </span>
      <span className="truncate text-foreground">{name}</span>
    </nav>
  );
}

import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

const CATEGORIES = ["Aplicações", "Marcas", "Categorias", "Lançamentos"];

export function LojaHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-20 max-w-7xl items-center gap-6 px-4">
        <Link to="/loja" className="shrink-0">
          <Logo variant="horizontal" className="h-8" />
        </Link>

        <nav className="hidden lg:flex items-center gap-5 text-sm text-muted-foreground">
          {CATEGORIES.map((cat) => (
            <span key={cat} className="cursor-pointer hover:text-foreground">
              {cat}
            </span>
          ))}
        </nav>

        <div className="flex-1 max-w-xl">
          <div className="relative">
            <Icon
              icon="mdi:magnify"
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              placeholder="OEM, aplicação, marca…"
              className="pl-9"
              aria-label="Buscar peças"
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <ThemeSwitcher />
          <Button variant="ghost" size="icon" aria-label="Carrinho" className="relative" asChild>
            <Link to="/loja/carrinho">
              <Icon icon="mdi:cart-outline" size={22} />
              <Badge
                variant="default"
                className="absolute -right-0.5 -top-0.5 h-4 min-w-4 px-1 text-[10px]"
              >
                0
              </Badge>
            </Link>
          </Button>
          <Button variant="ghost" size="icon" aria-label="Minha conta" asChild>
            <Link to="/loja/conta">
              <Icon icon="mdi:account-outline" size={22} />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

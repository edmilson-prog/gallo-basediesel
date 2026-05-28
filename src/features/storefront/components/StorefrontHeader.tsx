import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { IStorefrontBrand } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PART_CATEGORY_DESCRIPTORS } from "@/features/catalog";
import { CartMiniPreview } from "@/features/storefront-cart/components/CartMiniPreview";
import { CustomerAccountMenu } from "@/features/storefront-account/components/CustomerAccountMenu";
import { selectCartCount, useCartStore } from "../store/cartStore";
import { STOREFRONT_STRINGS as S } from "../i18n/pt-BR";

export interface IStorefrontHeaderProps {
  brands: IStorefrontBrand[];
}

/**
 * Custom DOM event dispatched by the hero (or any other page section) to
 * request focus on the storefront header search input.
 */
export const STOREFRONT_FOCUS_SEARCH_EVENT = "storefront:focus-search";

export function dispatchFocusSearch(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(STOREFRONT_FOCUS_SEARCH_EVENT));
}

/**
 * Sticky public-storefront header (PRD-060 RF-005/006).
 *
 * Slots: logo · search · categories dropdown · brands dropdown · session ·
 * cart. On mobile, the search bar collapses to a bottom-fixed bar and the
 * categories / brands menus open via a hamburger Sheet.
 *
 * The component exposes an imperative handle so the hero "Buscar peça" CTA
 * can move focus into the search input without a global ref.
 */
export function StorefrontHeader({ brands }: IStorefrontHeaderProps) {
  const navigate = useNavigate();
  const cartCount = useCartStore(selectCartCount);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handler = () => {
      const target = searchInputRef.current ?? mobileSearchInputRef.current;
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.focus();
      }
    };
    window.addEventListener(STOREFRONT_FOCUS_SEARCH_EVENT, handler);
    return () => window.removeEventListener(STOREFRONT_FOCUS_SEARCH_EVENT, handler);
  }, []);

  const submitSearch = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length === 0) {
        void navigate({ to: "/loja/busca" });
      } else {
        void navigate({ to: "/loja/busca", search: { q: trimmed } });
      }
    },
    [navigate],
  );

  return (
    <>
      <header
        className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        role="banner"
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:h-20 sm:gap-6">
          {/* Mobile menu trigger */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={S.headerOpenMenu}
                className="lg:hidden"
              >
                <Icon icon="mdi:menu" size={22} />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b border-border p-4">
                <SheetTitle className="text-left">
                  <Logo variant="horizontal" className="h-7" />
                </SheetTitle>
              </SheetHeader>
              <MobileMenu brands={brands} onNavigate={() => setMobileMenuOpen(false)} />
            </SheetContent>
          </Sheet>

          <Link to="/loja" className="shrink-0" aria-label="Início — GALLO PARTS">
            <Logo variant="horizontal" className="h-7 sm:h-8" />
          </Link>

          {/* Desktop nav */}
          <nav
            className="hidden items-center gap-1 text-sm text-muted-foreground lg:flex"
            aria-label="Navegação principal"
          >
            <CategoriesDropdown />
            <BrandsDropdown brands={brands} />
          </nav>

          {/* Desktop search */}
          <form
            role="search"
            className="hidden flex-1 lg:block"
            onSubmit={(e) => {
              e.preventDefault();
              submitSearch(searchTerm);
            }}
          >
            <div className="relative max-w-xl">
              <Icon
                icon="mdi:magnify"
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                ref={searchInputRef}
                type="search"
                placeholder={S.headerSearchPlaceholder}
                className="pl-9"
                aria-label={S.headerSearchAriaLabel}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </form>

          <div className="ml-auto flex items-center gap-1">
            <CustomerAccountMenu />
            <CartHeaderButton cartCount={cartCount} />
          </div>
        </div>
      </header>

      {/* Mobile bottom search bar (fixed) */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 p-3 backdrop-blur lg:hidden">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch(searchTerm);
          }}
        >
          <div className="relative">
            <Icon
              icon="mdi:magnify"
              size={18}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              ref={mobileSearchInputRef}
              type="search"
              placeholder={S.headerSearchPlaceholder}
              className="pl-9"
              aria-label={S.headerSearchAriaLabel}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </form>
      </div>
    </>
  );
}

function CartHeaderButton({ cartCount }: { cartCount: number }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`${S.headerCart} (${cartCount})`}
          className="relative"
        >
          <Icon icon="mdi:cart-outline" size={22} />
          {cartCount > 0 && (
            <Badge
              variant="default"
              className="absolute -right-0.5 -top-0.5 h-4 min-w-4 px-1 text-[10px]"
            >
              {cartCount > 99 ? "99+" : cartCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <CartMiniPreview onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function CategoriesDropdown() {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-sm text-foreground hover:text-primary"
        >
          {S.headerCategories}
          <Icon icon="mdi:chevron-down" size={16} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[18rem]">
        <DropdownMenuLabel>{S.headerCategories}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PART_CATEGORY_DESCRIPTORS.map((cat) => (
          <DropdownMenuItem
            key={cat.value}
            onSelect={() =>
              void navigate({
                to: "/loja/categoria/$slug",
                params: { slug: cat.value },
              })
            }
            className="gap-2"
          >
            <Icon icon={cat.icon} size={16} className="text-primary" aria-hidden />
            {cat.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BrandsDropdown({ brands }: { brands: IStorefrontBrand[] }) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-sm text-foreground hover:text-primary"
        >
          {S.headerBrands}
          <Icon icon="mdi:chevron-down" size={16} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[14rem]">
        <DropdownMenuLabel>{S.headerBrands}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {brands.map((brand) => (
          <DropdownMenuItem
            key={brand.slug}
            onSelect={() =>
              void navigate({
                to: "/loja/busca",
                search: { marca: brand.slug },
              })
            }
            className="gap-2"
          >
            <Icon icon={brand.icon} size={16} className="text-primary" aria-hidden />
            {brand.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileMenu({
  brands,
  onNavigate,
}: {
  brands: IStorefrontBrand[];
  onNavigate: () => void;
}) {
  const navigate = useNavigate();
  return (
    <nav className="flex flex-col gap-1 p-2" aria-label="Menu mobile">
      <Link
        to="/loja"
        onClick={onNavigate}
        className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-muted/60"
      >
        <Icon icon="mdi:home-variant" size={18} aria-hidden />
        {S.headerHome}
      </Link>
      <p className="mt-4 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {S.headerCategories}
      </p>
      {PART_CATEGORY_DESCRIPTORS.map((cat) => (
        <button
          key={cat.value}
          type="button"
          onClick={() => {
            void navigate({
              to: "/loja/categoria/$slug",
              params: { slug: cat.value },
            });
            onNavigate();
          }}
          className="flex items-center gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-muted/60"
        >
          <Icon icon={cat.icon} size={16} className="text-primary" aria-hidden />
          {cat.label}
        </button>
      ))}
      <p className="mt-4 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {S.headerBrands}
      </p>
      {brands.map((brand) => (
        <button
          key={brand.slug}
          type="button"
          onClick={() => {
            void navigate({ to: "/loja/busca", search: { marca: brand.slug } });
            onNavigate();
          }}
          className="flex items-center gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-muted/60"
        >
          <Icon icon={brand.icon} size={16} className="text-primary" aria-hidden />
          {brand.label}
        </button>
      ))}
      <div className="mt-4 border-t border-border pt-3">
        <Link
          to="/loja/conta"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-muted/60"
        >
          <Icon icon="mdi:account-circle-outline" size={18} aria-hidden />
          {S.headerAccount}
        </Link>
      </div>
    </nav>
  );
}

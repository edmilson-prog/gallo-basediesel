import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";

export function LojaFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-card">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-4">
        <div className="md:col-span-1">
          <Logo variant="horizontal" className="h-8" />
          <p className="mt-3 text-xs text-muted-foreground">
            Distribuidora de peças pesadas — Frederico Westphalen / RS.
          </p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-foreground">Sobre</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>A empresa</li>
            <li>Nossa história</li>
            <li>Compromissos</li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-foreground">Atendimento</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>Contato</li>
            <li>Frete e entrega</li>
            <li>Trocas e devoluções</li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-foreground">Políticas</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>Privacidade</li>
            <li>Termos de uso</li>
            <li>Cookies</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-4 text-xs text-muted-foreground sm:flex-row">
          <p>© GALLO BASE DIESEL — Todos os direitos reservados</p>
          <div className="flex items-center gap-3">
            <Icon icon="mdi:instagram" size={18} />
            <Icon icon="mdi:facebook" size={18} />
            <Icon icon="mdi:whatsapp" size={18} />
            <Icon icon="mdi:linkedin" size={18} />
          </div>
        </div>
      </div>
    </footer>
  );
}

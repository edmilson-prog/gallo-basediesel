import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { PortalBanner } from "../components/PortalBanner";
import { PORTAL_STRINGS as S } from "../i18n/pt-BR";

const WHATSAPP_NUMBER = "5555999990000";
const CONSULTANT_PHONE = "(55) 3333-0000";

const FAQ = [
  "Como solicitar um orçamento corporativo?",
  "Como funciona o limite de crédito da minha empresa?",
  "Como adicionar veículos à minha frota?",
  "Como gerenciar usuários e permissões?",
];

export function PortalSupportPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-display text-2xl font-semibold text-foreground">{S.supportTitle}</h1>

      <Button
        asChild
        className="h-14 w-full bg-emerald-600 text-base hover:bg-emerald-700"
      >
        <a
          href={`https://wa.me/${WHATSAPP_NUMBER}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon icon="mdi:whatsapp" size={22} className="mr-2" aria-hidden />
          {S.supportWhatsApp}
        </a>
      </Button>

      <Card className="flex items-center gap-3 p-4">
        <Icon icon="mdi:phone-in-talk" size={20} className="text-primary" aria-hidden />
        <div>
          <p className="text-sm font-medium text-foreground">{S.supportPhone}</p>
          <p className="text-sm text-muted-foreground">{CONSULTANT_PHONE}</p>
        </div>
      </Card>

      <Card className="space-y-2 p-5">
        <h2 className="text-sm font-semibold text-foreground">{S.supportFaq}</h2>
        <ul className="space-y-2">
          {FAQ.map((q) => (
            <li key={q} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Icon icon="mdi:help-circle-outline" size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
              {q}
            </li>
          ))}
        </ul>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">{S.supportTickets}</h2>
        <PortalBanner text="Abertura e acompanhamento de chamados disponível na Fase 2." />
      </div>
    </div>
  );
}

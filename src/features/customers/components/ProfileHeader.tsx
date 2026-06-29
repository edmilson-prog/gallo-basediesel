import { Link, useNavigate } from "@tanstack/react-router";
import type { IConversation, ICustomer } from "@/shared/types";
import { CustomerAvatar } from "./CustomerAvatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Icon } from "@/components/Icon";
import { AvatarLightbox } from "@/components/AvatarLightbox";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/shared/utils/format";
import { CUSTOMER_STRINGS } from "../i18n/pt-BR";
import { getCustomerDisplay } from "../utils/customerDisplay";
import { ProfileBadges } from "./ProfileBadges";
import { PreConversionBadge } from "./PreConversionBadge";
import { ProfileMenu } from "./ProfileMenu";
import { CoverageBanner } from "@/features/carteira/components/CoverageBanner";
import { PendingContactBanner } from "@/features/contact-review";

export interface IProfileHeaderProps {
  customer: ICustomer;
  conversation?: IConversation | null;
  variant: "column" | "page";
}

export function ProfileHeader({ customer, conversation, variant }: IProfileHeaderProps) {
  const display = getCustomerDisplay(customer);
  const navigate = useNavigate();

  const handleCreateQuote = () => {
    const params = new URLSearchParams({ customerId: customer.id });
    if (conversation) params.set("conversationId", conversation.id);
    void navigate({ to: `/app/orcamentos/novo?${params.toString()}` as never });
  };

  return (
    <header
      className={cn(
        "shrink-0 space-y-3 border-b border-border bg-card",
        variant === "page" ? "px-6 py-5" : "px-4 py-4",
      )}
    >
      <div className="flex items-start gap-3">
        <AvatarLightbox src={display.avatarUrl} name={display.name} className="shrink-0">
          <CustomerAvatar
            display={display}
            className={cn(
              "shrink-0",
              variant === "page" ? "h-16 w-16 text-lg" : "h-12 w-12 text-base",
            )}
            iconSize={variant === "page" ? 30 : 24}
          />
        </AvatarLightbox>
        <div className="min-w-0 flex-1 space-y-1.5">
          <h2
            className={cn(
              "font-semibold uppercase leading-tight text-foreground",
              variant === "page" ? "text-xl" : "text-base",
            )}
            title={display.name}
          >
            <span className="line-clamp-2">{display.name}</span>
          </h2>
          <ProfileBadges
            customer={customer}
            preConversionSlot={<PreConversionBadge customer={customer} />}
          />
        </div>
      </div>

      <ProfileContactRow customer={customer} />

      {customer.tags.includes("pending_review") && (
        <PendingContactBanner customer={customer} conversation={conversation} />
      )}

      <CoverageBanner customer={customer} />

      <div className="flex items-center gap-1.5">
        <Button
          variant="default"
          size="sm"
          className="flex-1 gap-1.5 sm:flex-none"
          onClick={handleCreateQuote}
        >
          <Icon icon="mdi:file-document-plus-outline" size={14} />
          {CUSTOMER_STRINGS.header.createQuote}
        </Button>
        {variant === "column" && (
          <Button
            asChild
            variant="outline"
            size="sm"
            className="px-2"
            title={CUSTOMER_STRINGS.detail.openFullPage}
          >
            <Link
              to="/app/clientes/$id"
              params={{ id: customer.id }}
              aria-label={CUSTOMER_STRINGS.detail.openFullPage}
            >
              <Icon icon="mdi:arrow-expand" size={14} />
            </Link>
          </Button>
        )}
        <ProfileMenu customer={customer} />
      </div>
    </header>
  );
}

function ProfileContactRow({ customer }: { customer: ICustomer }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={`tel:${customer.phone.replace(/\D/g, "")}`}
            className="inline-flex items-center gap-1 rounded transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <Icon icon="mdi:phone-outline" size={12} />
            <span className="truncate">{formatPhone(customer.phone)}</span>
          </a>
        </TooltipTrigger>
        <TooltipContent>{CUSTOMER_STRINGS.header.callPhone}</TooltipContent>
      </Tooltip>

      {customer.email ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={`mailto:${customer.email}`}
              className="inline-flex max-w-[180px] items-center gap-1 truncate rounded transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <Icon icon="mdi:email-outline" size={12} />
              <span className="truncate">{customer.email}</span>
            </a>
          </TooltipTrigger>
          <TooltipContent>{CUSTOMER_STRINGS.header.sendEmail}</TooltipContent>
        </Tooltip>
      ) : (
        <span className="inline-flex items-center gap-1 italic opacity-60">
          <Icon icon="mdi:email-off-outline" size={12} />
          {CUSTOMER_STRINGS.header.noEmail}
        </span>
      )}
    </div>
  );
}

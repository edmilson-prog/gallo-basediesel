import { Icon } from "@/components/Icon";
import { ABOUT_I18N } from "../i18n/pt-BR";

interface IProps {
  /** Total de releases — alimentado pela página, usado no card de documentação. */
  releaseCount: number;
}

export function AboutFooterCards({ releaseCount }: IProps) {
  const docsDescription = ABOUT_I18N.footer.docs.descriptionTemplate.replace(
    "{{count}}",
    String(releaseCount),
  );

  return (
    <section className="mt-8 grid gap-3 sm:grid-cols-3">
      <FooterCard
        icon="mdi:layers-triple-outline"
        title={ABOUT_I18N.footer.stack.title}
        description={ABOUT_I18N.footer.stack.description}
      />
      <FooterCard
        icon="mdi:email-outline"
        title={ABOUT_I18N.footer.support.title}
        description={
          <>
            <a
              href={`mailto:${ABOUT_I18N.identity.maintainerEmail}`}
              className="text-foreground hover:underline"
            >
              {ABOUT_I18N.identity.maintainerEmail}
            </a>
            <br />
            {ABOUT_I18N.footer.support.description}
          </>
        }
      />
      <FooterCard
        icon="mdi:book-open-variant"
        title={ABOUT_I18N.footer.docs.title}
        description={docsDescription}
      />
    </section>
  );
}

interface IFooterCardProps {
  icon: string;
  title: string;
  description: React.ReactNode;
}

function FooterCard({ icon, title, description }: IFooterCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-success/10 text-success">
          <Icon icon={icon} size={14} />
        </span>
        {title}
      </h4>
      <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

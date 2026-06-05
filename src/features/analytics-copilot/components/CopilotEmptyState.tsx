import { Icon } from "@/components/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentRole } from "@/features/rbac";
import { categorizedSuggestionsForRole } from "../i18n/suggestions";

interface ICopilotEmptyStateProps {
  onPick: (question: string) => void;
}

function greeting(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

/** Premium empty state: contextual greeting + category-grouped suggestion cards.
 *  Never shows demo numbers (RNF-001). */
export function CopilotEmptyState({ onPick }: ICopilotEmptyStateProps) {
  const { currentUser } = useAuth();
  const role = useCurrentRole();
  const groups = categorizedSuggestionsForRole(role);
  const firstName = currentUser?.displayName?.split(" ")[0] ?? "";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <div className="flex flex-col items-center text-center">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <div
            aria-hidden
            className="absolute inset-0 rounded-full bg-primary/10 motion-reduce:hidden"
          />
          <Icon icon="mdi:robot-happy-outline" size={32} />
        </div>
        {/* Not an <h1>: the page's single heading is the CopilotHeader title.
            This greeting is decorative copy, so it stays a <p> for a11y. */}
        <p className="mt-5 text-3xl font-semibold tracking-tight text-foreground">
          {greeting(new Date().getHours())}
          {firstName ? `, ${firstName}` : ""} 👋
        </p>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Sou seu copiloto analítico. Pergunte sobre seus números — respondo com o valor, a
          comparação e a fonte oficial.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <section key={group.label} className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {group.items.map((item) => (
                <button
                  key={item.question}
                  type="button"
                  onClick={() => onPick(item.question)}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-border hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon icon={item.icon} size={18} />
                  </span>
                  <span className="text-sm text-foreground">{item.question}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

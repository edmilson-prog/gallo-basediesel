import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { PwaButton } from "../components/ui/PwaButton";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import { INSTALL_SEEN_KEY } from "../engine/installGate";
import { shouldWarnAboutIosBrowser } from "../engine/iosBrowser";
import { PWA_ATENDIMENTO_STRINGS as S } from "../i18n/pt-BR";

const STEP_ICONS = ["mdi:export-variant", "mdi:plus-box-outline", "mdi:cellphone"];

export function InstallPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { canPrompt, isInstalled, prompt } = useInstallPrompt();
  // On iOS the Push API only exists for a Home Screen web app, and the flow that
  // reliably creates one lives in Safari's share sheet. Installing from Chrome
  // or Firefox there can produce an icon that opens a tab — it looks installed
  // and never rings.
  const warnIosBrowser =
    typeof navigator !== "undefined" && shouldWarnAboutIosBrowser(navigator.userAgent);

  const goOn = () => {
    // Remember the nudge happened, so the next launch goes straight to login.
    try {
      window.localStorage.setItem(INSTALL_SEEN_KEY, "1");
    } catch {
      /* no storage — the screen shows again, which is merely mildly annoying */
    }
    // Reached from the account sheet by someone already signed in: send them
    // back to the list, not to a login form they do not need.
    void navigate({ to: isAuthenticated ? "/atendimento/conversas" : "/atendimento/entrar" });
  };

  const install = async () => {
    const outcome = await prompt();
    // Whatever the user chose, the app keeps working in the browser tab.
    if (outcome !== "dismissed") goOn();
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden px-5 pb-[max(1.375rem,env(safe-area-inset-bottom))] pt-[max(1.75rem,env(safe-area-inset-top))]">
      <img
        src="/logos/logo-horizontal-white.png"
        alt="GALLO BASE DIESEL"
        className="h-6 w-auto self-start opacity-90"
      />

      <div className="flex flex-1 flex-col justify-center gap-6 py-8">
        <h1 className="font-display text-[40px] font-extrabold uppercase leading-[0.92] tracking-[0.01em] text-foreground">
          {S.install.title[0]}
          <br />
          {S.install.title[1]}
          <br />
          {S.install.title[2]}
        </h1>
        <p className="max-w-[300px] text-[15px] leading-relaxed text-muted-foreground">
          {S.install.description}
        </p>

        {isInstalled ? (
          <p className="flex items-center gap-2 rounded bg-severity-success/10 px-3 py-3 text-[13.5px] font-semibold text-severity-success ring-1 ring-inset ring-severity-success/30">
            <Icon icon="mdi:check-circle-outline" size={17} />
            {S.install.installed}
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {warnIosBrowser && (
              <div className="flex gap-2.5 rounded bg-severity-warning/10 px-3.5 py-3 ring-1 ring-inset ring-severity-warning/30">
                <Icon
                  icon="mdi:alert-outline"
                  size={17}
                  className="mt-0.5 shrink-0 text-severity-warning"
                />
                <div>
                  <p className="text-[13px] font-bold text-severity-warning">
                    {S.install.iosSafariOnlyTitle}
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                    {S.install.iosSafariOnlyBody}
                  </p>
                </div>
              </div>
            )}
            {S.install.steps.map((step, index) => (
              <div
                key={step}
                className="flex items-center gap-3 rounded bg-card px-3.5 py-3 ring-1 ring-inset ring-border"
              >
                <span className="w-3.5 font-display text-base font-extrabold text-primary">
                  {index + 1}
                </span>
                <Icon
                  icon={STEP_ICONS[index] ?? "mdi:circle-small"}
                  size={17}
                  className="text-muted-foreground"
                />
                <span className="text-[13.5px] font-medium text-foreground">{step}</span>
              </div>
            ))}
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              {S.install.iosNote}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {canPrompt && !isInstalled && (
          <PwaButton variant="gold" full onClick={() => void install()}>
            <Icon icon="mdi:plus" size={17} />
            {S.install.primary}
          </PwaButton>
        )}
        <PwaButton variant={canPrompt && !isInstalled ? "plain" : "gold"} full onClick={goOn}>
          {canPrompt && !isInstalled
            ? S.install.secondary
            : isAuthenticated
              ? S.install.backToApp
              : S.login.submit}
        </PwaButton>
      </div>
    </div>
  );
}

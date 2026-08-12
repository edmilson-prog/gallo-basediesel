import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearch } from "@tanstack/react-router";
import { classifyScore } from "../engine";
import { fetchSurveyContext, submitSurvey, type INpsSurveyState } from "../api/surveyApi";

/**
 * Public NPS landing at /pesquisa/:token — no auth, no session, no app shell.
 *
 * The customer opens this on a phone, in a yard, on 4G. Everything is sized for
 * a thumb and reads without a second tap.
 *
 * Privacy: the page shows a first name and nothing else. States that reveal
 * whether a token ever existed are collapsed into a single neutral screen, and
 * the meta tags below keep the token out of search engines and referrers.
 */

type IPageState = INpsSurveyState | "loading" | "thanks" | "error";

/** Bands mirror classifyScore: 0-6 critical, 7-8 warning, 9-10 success. */
function scoreTone(score: number): string {
  const npsClass = classifyScore(score);
  if (npsClass === "promoter")
    return "bg-severity-success/15 text-severity-success border-severity-success/40";
  if (npsClass === "passive")
    return "bg-severity-warning/15 text-severity-warning border-severity-warning/40";
  return "bg-severity-critical/15 text-severity-critical border-severity-critical/40";
}

function selectedTone(score: number): string {
  const npsClass = classifyScore(score);
  if (npsClass === "promoter") return "bg-severity-success text-background border-severity-success";
  if (npsClass === "passive") return "bg-severity-warning text-background border-severity-warning";
  return "bg-severity-critical text-background border-severity-critical";
}

/**
 * Keeps the survey token out of search results and out of the Referer header
 * of any link the customer might follow afterwards.
 */
function useNoIndexMeta(): void {
  useEffect(() => {
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    const referrer = document.createElement("meta");
    referrer.name = "referrer";
    referrer.content = "no-referrer";
    document.head.append(robots, referrer);
    return () => {
      robots.remove();
      referrer.remove();
    };
  }, []);
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold text-card-foreground">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{body}</p>
      </div>
    </Shell>
  );
}

export function NpsSurveyPublicPage() {
  const { token } = useParams({ from: "/pesquisa/$token" });
  const search = useSearch({ strict: false }) as { score?: string };

  const [pageState, setPageState] = useState<IPageState>("loading");
  const [firstName, setFirstName] = useState("");
  const [contextLabel, setContextLabel] = useState("seu atendimento");
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [wasDetractor, setWasDetractor] = useState(false);

  useNoIndexMeta();

  /** ?score=N pre-selects the button but never submits on its own. */
  const preselected = useMemo(() => {
    const raw = Number(search?.score);
    return Number.isInteger(raw) && raw >= 0 && raw <= 10 ? raw : null;
  }, [search?.score]);

  useEffect(() => {
    let cancelled = false;
    fetchSurveyContext(token)
      .then((context) => {
        if (cancelled) return;
        setPageState(context.state);
        setFirstName(context.recipientFirstName ?? "");
        if (context.contextLabel) setContextLabel(context.contextLabel);
        if (context.state === "valid" && preselected !== null) setScore(preselected);
      })
      .catch(() => {
        if (!cancelled) setPageState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token, preselected]);

  const handleSubmit = useCallback(async () => {
    if (score === null || sending) return;
    setSending(true);
    const result = await submitSurvey(token, score, comment.trim() || null);
    setSending(false);

    if (result.status === "ok") {
      setWasDetractor(result.detractor);
      setPageState("thanks");
      return;
    }
    if (result.status === "responded") setPageState("responded");
    else if (result.status === "expired") setPageState("expired");
    else setPageState("error");
  }, [score, sending, token, comment]);

  if (pageState === "loading") {
    return (
      <Shell>
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Carregando…</p>
        </div>
      </Shell>
    );
  }

  if (pageState === "thanks") {
    return (
      <Message
        title="Obrigado pela sua resposta!"
        body={
          wasDetractor
            ? "Sentimos muito que a experiência não tenha sido boa. Nosso time vai entrar em contato com você."
            : "Sua opinião ajuda a GALLO Base Diesel a melhorar o atendimento."
        }
      />
    );
  }

  if (pageState === "responded") {
    return (
      <Message
        title="Você já respondeu"
        body="Esta pesquisa já foi respondida. Obrigado pela sua participação!"
      />
    );
  }

  if (pageState === "expired") {
    return (
      <Message
        title="Pesquisa expirada"
        body="O prazo para responder esta pesquisa terminou. Obrigado pelo interesse!"
      />
    );
  }

  if (pageState === "invalid" || pageState === "error") {
    return (
      <Message
        title="Link indisponível"
        body="Não foi possível abrir esta pesquisa. Se você recebeu o link por WhatsApp, verifique se ele veio completo."
      />
    );
  }

  const greeting = firstName ? `Oi, ${firstName}!` : "Oi!";

  return (
    <Shell>
      <div className="rounded-xl border border-border bg-card p-6">
        <h1 className="text-lg font-semibold text-card-foreground">{greeting}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Como foi <span className="font-medium text-card-foreground">{contextLabel}</span> com a
          GALLO Base Diesel?
        </p>

        <p className="mt-6 text-base font-medium text-card-foreground">
          De 0 a 10, qual a chance de você nos recomendar para um colega ou amigo?
        </p>

        <div role="radiogroup" aria-label="Nota de 0 a 10" className="mt-4 grid grid-cols-6 gap-2">
          {Array.from({ length: 11 }, (_, value) => {
            const isSelected = score === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`Nota ${value}`}
                onClick={() => setScore(value)}
                className={`min-h-12 rounded-lg border text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  isSelected ? selectedTone(value) : scoreTone(value)
                }`}
              >
                {value}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>Nada provável</span>
          <span>Muito provável</span>
        </div>

        {score !== null && (
          <div className="mt-6">
            <label htmlFor="nps-comment" className="text-sm font-medium text-card-foreground">
              Quer contar o motivo? (opcional)
            </label>
            <textarea
              id="nps-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value.slice(0, 1000))}
              rows={3}
              maxLength={1000}
              placeholder="O que fez você dar essa nota?"
              className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />

            <button
              type="button"
              onClick={handleSubmit}
              disabled={sending}
              className="mt-4 min-h-12 w-full rounded-lg bg-primary px-4 text-base font-semibold text-primary-foreground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {sending ? "Enviando…" : "Enviar resposta"}
            </button>
          </div>
        )}
      </div>
    </Shell>
  );
}

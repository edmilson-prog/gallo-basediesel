import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearch } from "@tanstack/react-router";
import { classifyScore } from "../engine";
import { fetchSurveyContext, submitSurvey, type INpsSurveyState } from "../api/surveyApi";

/**
 * Public NPS survey at /pesquisa/:token, from `ui_kits/nps/pesquisa.html`.
 *
 * Deliberately light-themed and self-contained: this is the only screen in the
 * product a customer ever sees, opened from a WhatsApp link on a phone, in a
 * yard, on 4G. It carries no app shell, no session, and none of the dark chrome
 * the internal app uses — so it also does not read the theme tokens, which are
 * built for the logged-in product.
 *
 * Two steps and a confirmation, as the kit specifies: the score, then the
 * reasons as chips whose question changes with the category, then the closing.
 * A detractor is promised a call; everyone else gets the brand signature.
 */

type IPageState = INpsSurveyState | "loading" | "thanks" | "error";

/** The kit's light palette. Not theme tokens — see the note above. */
const C = {
  bg: "#F6F6F7",
  card: "#FFFFFF",
  line: "#D7D8DA",
  line2: "#ECEDEE",
  t1: "#231F20",
  t2: "#565658",
  t3: "#767678",
  t4: "#9A9B9D",
  gold: "#C79C2C",
  goldDeep: "#9A7820",
  green: "#337648",
  red: "#C4151C",
} as const;

const REASONS = {
  promoter: {
    question: "O que fez a diferença?",
    options: [
      "Diagnóstico certo",
      "Prazo cumprido",
      "Atendimento",
      "Qualidade da peça",
      "Preço justo",
      "Entrega",
    ],
  },
  passive: {
    question: "O que faltou?",
    options: [
      "Prazo",
      "Preço",
      "Comunicação",
      "Qualidade da peça",
      "Limpeza / acabamento",
      "Atendimento",
    ],
  },
  detractor: {
    question: "O que deu errado?",
    options: [
      "Prazo não cumprido",
      "Falta de retorno",
      "Preço",
      "Peça com defeito",
      "Serviço refeito",
      "Garantia",
    ],
  },
} as const;

function scoreColor(score: number): string {
  const npsClass = classifyScore(score);
  if (npsClass === "promoter") return C.green;
  if (npsClass === "passive") return C.gold;
  return C.red;
}

function scoreLabel(score: number): string {
  const npsClass = classifyScore(score);
  if (npsClass === "promoter") return "Você indicaria a GALLO";
  if (npsClass === "passive") return "Atendeu, mas dá para melhorar";
  return "Não foi como devia ser";
}

/** Keeps the token out of search results and out of any outgoing Referer. */
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
    <main
      className="flex min-h-dvh justify-center"
      style={{ background: C.bg, fontFamily: "var(--font-body)" }}
    >
      <div
        className="flex w-full max-w-[440px] flex-col"
        style={{ background: C.card, minHeight: "100dvh" }}
      >
        <header
          className="shrink-0 px-5 pb-3.5 pt-4"
          style={{ borderBottom: `1px solid ${C.line2}` }}
        >
          <span
            className="font-display text-lg font-extrabold uppercase tracking-[0.04em]"
            style={{ color: C.t1 }}
          >
            GALLO <span style={{ color: C.goldDeep }}>Base Diesel</span>
          </span>
        </header>
        {children}
      </div>
    </main>
  );
}

function StepMark({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2].map((index) => (
        <span
          key={index}
          className="h-1.5 rounded-full transition-all"
          style={{
            width: index === step ? 18 : 6,
            background: index <= step ? C.gold : C.line,
          }}
        />
      ))}
      <span className="ml-1 text-[11.5px] font-semibold" style={{ color: C.t4 }}>
        {step} de 2 · 20 segundos
      </span>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  variant = "dark",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "dark" | "ghost";
}) {
  const style =
    variant === "dark"
      ? { background: disabled ? C.line : C.t1, color: "#fff", border: "none" }
      : { background: "transparent", color: C.t3, border: `1px solid ${C.line}` };
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-lg text-[15px] font-bold transition-colors"
      style={style}
    >
      {children}
    </button>
  );
}

function Message({ title, body, tone }: { title: string; body: string; tone: "ok" | "alert" }) {
  return (
    <Shell>
      <div className="flex flex-1 flex-col justify-center px-5 pb-7 pt-5">
        <span
          className="grid size-11 place-items-center rounded-full text-xl text-white"
          style={{ background: tone === "alert" ? C.red : C.green }}
        >
          {tone === "alert" ? "!" : "✓"}
        </span>
        <h2
          className="mt-5 font-display text-[34px] font-extrabold uppercase leading-[0.94]"
          style={{ color: C.t1 }}
        >
          {title}
        </h2>
        <p className="mt-3.5 text-[15px] leading-relaxed" style={{ color: C.t2 }}>
          {body}
        </p>
        <div className="mt-6 pt-5" style={{ borderTop: `1px solid ${C.line2}` }}>
          <div
            className="font-display text-[15px] font-extrabold uppercase leading-tight tracking-[0.02em]"
            style={{ color: C.goldDeep }}
          >
            Base forte para quem
            <br />
            não pode parar.
          </div>
        </div>
      </div>
    </Shell>
  );
}

export function NpsSurveyPublicPage() {
  const { token } = useParams({ from: "/pesquisa/$token" });
  const search = useSearch({ strict: false }) as { score?: string };

  const [pageState, setPageState] = useState<IPageState>("loading");
  const [step, setStep] = useState<1 | 2>(1);
  const [firstName, setFirstName] = useState("");
  const [contextLabel, setContextLabel] = useState("seu atendimento");
  const [score, setScore] = useState<number | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [wasDetractor, setWasDetractor] = useState(false);

  useNoIndexMeta();

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

  const toggleReason = useCallback((reason: string) => {
    setReasons((current) =>
      current.includes(reason) ? current.filter((item) => item !== reason) : [...current, reason],
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (score === null || sending) return;
    setSending(true);
    const result = await submitSurvey(token, score, comment.trim() || null, reasons);
    setSending(false);

    if (result.status === "ok") {
      setWasDetractor(result.detractor);
      setPageState("thanks");
      return;
    }
    if (result.status === "responded") setPageState("responded");
    else if (result.status === "expired") setPageState("expired");
    else setPageState("error");
  }, [score, sending, token, comment, reasons]);

  if (pageState === "loading") {
    return (
      <Shell>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm" style={{ color: C.t3 }}>
            Carregando…
          </p>
        </div>
      </Shell>
    );
  }

  if (pageState === "thanks") {
    return (
      <Message
        tone={wasDetractor ? "alert" : "ok"}
        title="Resposta registrada"
        body={
          wasDetractor
            ? "Um responsável da loja vai te ligar em até 24 horas para resolver isso. Sua nota já está com o gerente."
            : "A gente lê todas as respostas. Obrigado pelo tempo."
        }
      />
    );
  }

  if (pageState === "responded") {
    return (
      <Message
        tone="ok"
        title="Você já respondeu"
        body="Esta pesquisa já foi respondida. Obrigado pela sua participação!"
      />
    );
  }

  if (pageState === "expired") {
    return (
      <Message
        tone="ok"
        title="Pesquisa expirada"
        body="O prazo para responder esta pesquisa terminou. Obrigado pelo interesse!"
      />
    );
  }

  if (pageState === "invalid" || pageState === "error") {
    return (
      <Message
        tone="ok"
        title="Link indisponível"
        body="Não foi possível abrir esta pesquisa. Se você recebeu o link por WhatsApp, verifique se ele veio completo."
      />
    );
  }

  const category = score === null ? null : classifyScore(score);

  return (
    <Shell>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6 pt-4">
        <StepMark step={step} />

        {step === 1 ? (
          <>
            <div>
              <h2
                className="font-display text-[28px] font-extrabold uppercase leading-[0.95]"
                style={{ color: C.t1 }}
              >
                De 0 a 10,
                <br />
                quanto você
                <br />
                indicaria a GALLO?
              </h2>
              <p className="mt-2.5 text-[13.5px] leading-relaxed" style={{ color: C.t3 }}>
                {firstName ? `${firstName}, pensando ` : "Pensando "}
                neste atendimento, para outro frotista ou mecânico.
              </p>
            </div>

            <div
              className="rounded-lg px-3.5 py-3"
              style={{ background: C.bg, border: `1px solid ${C.line2}` }}
            >
              <div
                className="font-display text-[11.5px] font-bold uppercase italic tracking-[0.06em]"
                style={{ color: C.goldDeep }}
              >
                {contextLabel}
              </div>
              <div className="mt-1 text-[12px]" style={{ color: C.t3 }}>
                GALLO Base Diesel · Frederico Westphalen
              </div>
            </div>

            {/* 11 alvos de 52px. O 10 ocupa a linha inteira, como no kit. */}
            <div>
              <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label="Nota de 0 a 10">
                {Array.from({ length: 11 }, (_, value) => {
                  const selected = score === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`Nota ${value}`}
                      onClick={() => setScore(value)}
                      className="h-[52px] rounded-lg font-display text-[22px] font-extrabold transition-all"
                      style={{
                        gridColumn: value === 10 ? "span 6" : "span 1",
                        background: selected ? scoreColor(value) : C.bg,
                        color: selected ? "#fff" : C.t2,
                        border: selected ? "none" : `1px solid ${C.line}`,
                      }}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
              <div
                className="mt-2.5 flex justify-between font-display text-[11px] font-bold uppercase tracking-[0.06em]"
                style={{ color: C.t4 }}
              >
                <span>Não indicaria</span>
                <span>Indicaria com certeza</span>
              </div>
            </div>

            {score !== null ? (
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ background: scoreColor(score) }} />
                <span className="text-[13px] font-semibold" style={{ color: C.t2 }}>
                  {scoreLabel(score)}
                </span>
              </div>
            ) : null}

            <div className="mt-auto pt-2">
              <PrimaryButton onClick={() => setStep(2)} disabled={score === null}>
                {score === null ? "Escolha uma nota" : "Continuar"}
              </PrimaryButton>
            </div>
          </>
        ) : (
          <>
            <div>
              <h2
                className="font-display text-[26px] font-extrabold uppercase leading-[0.95]"
                style={{ color: C.t1 }}
              >
                {category ? REASONS[category].question : ""}
              </h2>
              <p className="mt-2.5 text-[13.5px]" style={{ color: C.t3 }}>
                Marque o que valer. Pode ser mais de um.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {(category ? REASONS[category].options : []).map((option) => {
                const on = reasons.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleReason(option)}
                    className="min-h-[44px] rounded-full px-4 py-2.5 text-[13.5px] font-semibold transition-all"
                    style={{
                      background: on ? C.t1 : C.bg,
                      color: on ? "#fff" : C.t2,
                      border: on ? "none" : `1px solid ${C.line}`,
                    }}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            <div>
              <label
                htmlFor="nps-comment"
                className="mb-2 block text-[13px] font-semibold"
                style={{ color: C.t1 }}
              >
                Quer contar mais?{" "}
                <span className="font-normal" style={{ color: C.t4 }}>
                  (opcional)
                </span>
              </label>
              <textarea
                id="nps-comment"
                value={comment}
                onChange={(event) => setComment(event.target.value.slice(0, 1000))}
                rows={4}
                maxLength={1000}
                placeholder={
                  category === "detractor"
                    ? "O que precisa ser resolvido?"
                    : "O que a gente deve manter?"
                }
                className="w-full resize-none rounded-lg px-3.5 py-3 text-sm leading-relaxed outline-none"
                style={{ background: C.bg, border: `1px solid ${C.line}`, color: C.t1 }}
              />
            </div>

            <div className="mt-auto flex flex-col gap-2 pt-2">
              <PrimaryButton onClick={() => void handleSubmit()} disabled={sending}>
                {sending ? "Enviando…" : "Enviar resposta"}
              </PrimaryButton>
              <PrimaryButton variant="ghost" onClick={() => setStep(1)}>
                Voltar
              </PrimaryButton>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

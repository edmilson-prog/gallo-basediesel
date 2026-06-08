import { HowItWorks } from "@/components/HowItWorks";

/**
 * Inline "Como funciona?" explainer for the closing forecast (PRD-056).
 *
 * Methodology note shown right under the page title. Mirrors the breakdown
 * colors (realized / weighted pipeline / run-rate) used by {@link ForecastBreakdown}.
 */
export function ForecastHowItWorks() {
  return (
    <HowItWorks>
      <p>O forecast projeta onde o mês vai fechar somando três partes:</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        <li className="flex gap-2">
          <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
          <span>
            <strong className="font-medium text-foreground">Realizado</strong> — o que já foi
            faturado (ou o número de pedidos) até hoje.
          </span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/45" />
          <span>
            <strong className="font-medium text-foreground">Pipeline ponderado</strong> — os
            orçamentos em aberto multiplicados pela chance de fechar: quanto mais quente o cliente,
            maior o peso.
          </span>
        </li>
        <li className="flex gap-2">
          <span
            aria-hidden
            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/40"
          />
          <span>
            <strong className="font-medium text-foreground">Ritmo</strong> — uma estimativa do que
            ainda deve entrar no restante do mês, com base na média diária até agora (sem contar de
            novo o que já está no pipeline).
          </span>
        </li>
      </ul>
      <p className="mt-3">
        A soma das três forma o cenário{" "}
        <strong className="font-medium text-foreground">Provável</strong>. O{" "}
        <strong className="font-medium text-foreground">Pessimista</strong> e o{" "}
        <strong className="font-medium text-foreground">Otimista</strong> aplicam uma margem para
        baixo e para cima.
      </p>
      <p className="mt-2">
        Nos primeiros dias do mês a projeção aparece como pouco confiável — ela fica mais precisa
        conforme o mês avança.
      </p>
    </HowItWorks>
  );
}

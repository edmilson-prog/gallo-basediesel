import { HowItWorks } from "@/components/HowItWorks";

/**
 * Inline "Como funciona?" explainer for the positivation page (PRD-044).
 *
 * Methodology note shown right under the page title: how the eligible base,
 * positivated customers, rate, projection and at-risk list are derived.
 */
export function PositivationHowItWorks() {
  return (
    <HowItWorks>
      <p>A positivação mostra quantos clientes da carteira voltaram a comprar no período:</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        <li className="flex gap-2">
          <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
          <span>
            <strong className="font-medium text-foreground">Base elegível</strong> — os clientes
            ativos no escopo selecionado (loja e vendedor).
          </span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/45" />
          <span>
            <strong className="font-medium text-foreground">Positivados</strong> — quantos desses
            clientes fizeram pelo menos uma compra (pedido pago) no período.
          </span>
        </li>
        <li className="flex gap-2">
          <span
            aria-hidden
            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/40"
          />
          <span>
            <strong className="font-medium text-foreground">Taxa de positivação</strong> — os
            positivados divididos pela base elegível.
          </span>
        </li>
      </ul>
      <p className="mt-3">
        A <strong className="font-medium text-foreground">projeção</strong> estima onde a
        positivação deve fechar no fim do período, mantendo o ritmo atual. Os clientes{" "}
        <strong className="font-medium text-foreground">em risco</strong> são os ativos que estão a
        poucos dias de virarem dormentes — uma chance de contato antes de esfriarem.
      </p>
    </HowItWorks>
  );
}

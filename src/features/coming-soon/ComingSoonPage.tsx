// src/features/coming-soon/ComingSoonPage.tsx
import { useEffect, useRef, useState } from "react";
import { COMING_SOON } from "./config";
import { useBrandCycle } from "./useBrandCycle";
import { AuroraLayer } from "./AuroraLayer";
import { GridLayer } from "./GridLayer";
import { ParticleNetwork } from "./ParticleNetwork";
import { EmberField } from "./EmberField";
import { Countdown } from "./Countdown";
import "./coming-soon.css";

export function ComingSoonPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const rgbRef = useBrandCycle(rootRef);

  // anima a barra de progresso do 0 ao alvo após montar
  const [fill, setFill] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setFill(COMING_SOON.progressPercent));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div ref={rootRef} className="cs-root">
      <AuroraLayer />
      <GridLayer />
      <ParticleNetwork rgbRef={rgbRef} />
      <EmberField rgbRef={rgbRef} />

      <main className="cs-content">
        <img src="/logos/logo-horizontal-white.png" alt="GALLO Base Diesel" className="cs-logo" />

        <span className="cs-badge">Inteligência comercial · em construção</span>

        <h1 className="cs-headline">
          GALLO <span>BASE DIESEL</span>
        </h1>

        <p className="cs-sub">
          Estamos construindo a plataforma que vai operar acima do ERP como cérebro comercial. Em
          breve no ar.
        </p>

        <div className="cs-progress">
          <div className="cs-progress-meta">
            <span>Progresso da plataforma</span>
            <span>{COMING_SOON.progressPercent}%</span>
          </div>
          <div className="cs-progress-track">
            <div className="cs-progress-fill" style={{ width: `${fill}%` }} />
          </div>
        </div>

        <Countdown target={COMING_SOON.launchDate} />
      </main>

      <div className="cs-bottom">
        <nav className="cs-social" aria-label="Contato">
          <a href={COMING_SOON.contacts.whatsapp} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
          <a href={`mailto:${COMING_SOON.contacts.email}`}>E-mail</a>
          <a href={`tel:${COMING_SOON.contacts.phone.replace(/\D/g, "")}`}>
            {COMING_SOON.contacts.phone}
          </a>
        </nav>
        <footer className="cs-footer">GALLO Base Diesel · Frederico Westphalen/RS</footer>
      </div>
    </div>
  );
}

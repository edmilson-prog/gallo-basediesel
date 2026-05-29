// src/features/coming-soon/Countdown.tsx
import { useEffect, useState } from "react";

interface ICountdownProps {
  /** Data-alvo em ISO 8601. */
  target: string;
}

interface ITimeLeft {
  d: number;
  h: number;
  m: number;
  s: number;
}

function computeLeft(target: number): ITimeLeft {
  let diff = Math.max(0, target - Date.now());
  const d = Math.floor(diff / 86_400_000);
  diff -= d * 86_400_000;
  const h = Math.floor(diff / 3_600_000);
  diff -= h * 3_600_000;
  const m = Math.floor(diff / 60_000);
  diff -= m * 60_000;
  const s = Math.floor(diff / 1000);
  return { d, h, m, s };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Contagem regressiva ao vivo até a data de lançamento. */
export function Countdown({ target }: ICountdownProps) {
  const targetMs = new Date(target).getTime();
  const [left, setLeft] = useState<ITimeLeft>(() => computeLeft(targetMs));

  useEffect(() => {
    const id = window.setInterval(() => setLeft(computeLeft(targetMs)), 1000);
    return () => window.clearInterval(id);
  }, [targetMs]);

  const cells: Array<[number, string]> = [
    [left.d, "dias"],
    [left.h, "horas"],
    [left.m, "min"],
    [left.s, "seg"],
  ];

  return (
    <div className="cs-countdown" aria-live="off" aria-label="Tempo restante para o lançamento">
      {cells.map(([value, label]) => (
        <div key={label} className="cs-cd-cell">
          <div className="cs-cd-num">{pad(value)}</div>
          <div className="cs-cd-lbl">{label}</div>
        </div>
      ))}
    </div>
  );
}

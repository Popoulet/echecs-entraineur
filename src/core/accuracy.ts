// Précision d'une partie — reprise de la formule de Lichess (lila, AccuracyPercent.scala).
import { winPercent } from './eval';
import type { PosEval } from '../data/types';

/** Précision d'un coup (0-100) selon la perte de % de gain du joueur qui l'a joué. */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  if (winAfter >= winBefore) return 100;
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * (winBefore - winAfter)) - 3.166924740191411;
  return clamp(raw + 1, 0, 100); // +1 : bonus d'incertitude, comme Lichess
}

/**
 * Précision des Blancs et des Noirs : moyenne pondérée par la volatilité (écart-type du % de gain
 * sur une fenêtre glissante) et moyenne harmonique, puis moyenne des deux.
 * @param evals une évaluation par position (coups + 1), point de vue des Blancs
 * @param whiteFirst false si la partie commence par un coup noir (position FEN)
 */
export function gameAccuracy(evals: PosEval[], whiteFirst = true): { w: number; b: number } {
  const wins = evals.map(winPercent);
  const n = wins.length;
  if (n < 2) return { w: 100, b: 100 };
  const size = clamp(Math.floor(n / 10), 2, 8);
  const windows: number[][] = [];
  for (let i = 0; i < Math.min(size, n) - 2; i++) windows.push(wins.slice(0, size));
  for (let i = 0; i + size <= n; i++) windows.push(wins.slice(i, i + size));
  const weights = windows.map((w) => clamp(stdev(w), 0.5, 12));

  const acc: Record<'w' | 'b', { a: number; w: number }[]> = { w: [], b: [] };
  for (let i = 0; i < n - 1; i++) {
    const white = (i % 2 === 0) === whiteFirst;
    const before = white ? wins[i] : 100 - wins[i];
    const after = white ? wins[i + 1] : 100 - wins[i + 1];
    acc[white ? 'w' : 'b'].push({ a: moveAccuracy(before, after), w: weights[i] ?? 0.5 });
  }
  const score = (xs: { a: number; w: number }[]) => {
    if (!xs.length) return 100;
    const wMean = xs.reduce((s, x) => s + x.a * x.w, 0) / xs.reduce((s, x) => s + x.w, 0);
    const hMean = xs.length / xs.reduce((s, x) => s + 1 / Math.max(x.a, 1), 0);
    return (wMean + hMean) / 2;
  };
  return { w: score(acc.w), b: score(acc.b) };
}

function stdev(xs: number[]): number {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

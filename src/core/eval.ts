// Fonctions pures autour de l'évaluation du moteur (sans DOM).
import { Chess } from 'chess.js';
import type { EngineLine } from '../engine/engine';

/** Probabilité de gain des Blancs (0-100) à partir des centipions — formule Lichess. */
export function winPercent(line: Pick<EngineLine, 'cp' | 'mate'>): number {
  if (line.mate !== undefined) return line.mate > 0 ? 100 : 0;
  const cp = Math.max(-1000, Math.min(1000, line.cp ?? 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Texte court de l'évaluation, ex. "+1.3" ou "M3" (point de vue des Blancs). */
export function formatScore(line: Pick<EngineLine, 'cp' | 'mate'>): string {
  if (line.mate !== undefined) return `${line.mate > 0 ? '' : '-'}M${Math.abs(line.mate)}`;
  const v = (line.cp ?? 0) / 100;
  return (v > 0 ? '+' : '') + v.toFixed(1);
}

/** Convertit une variante UCI en notation française lisible (SAN), limitée à n coups. */
export function pvToSan(fen: string, pv: string[], n = 8): string {
  const g = new Chess(fen);
  const out: string[] = [];
  for (const uci of pv.slice(0, n)) {
    const num = g.moveNumber();
    const white = g.turn() === 'w';
    try {
      const m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      out.push((white ? `${num}. ` : out.length === 0 ? `${num}… ` : '') + toFrench(m.san));
    } catch {
      break;
    }
  }
  return out.join(' ');
}

/** Lettres de pièces en français : K→R, Q→D, R→T, B→F, N→C. */
export function toFrench(san: string): string {
  return san.replace(/[KQRBN]/g, (c) => ({ K: 'R', Q: 'D', R: 'T', B: 'F', N: 'C' })[c]!);
}

// Puzzles créés à partir de mes erreurs (erreur, gaffe, coup manqué) dans les parties analysées.
import { Chess } from 'chess.js';
import { buildReview } from '../core/review';
import { db } from './db';
import type { GameRec } from './types';

export interface Puzzle {
  id: string; // "<gameId>:<ply>"
  gameId: string;
  fen: string; // position à résoudre (avant mon erreur)
  color: 'w' | 'b'; // camp qui joue (moi)
  solution: string[]; // coups UCI : moi, réponse adverse, moi…
  themes: string[];
  played: string; // le coup joué dans la partie (français)
  bestSan: string; // la solution (français)
  explanation: string[]; // pourquoi mon coup était mauvais
  category: string;
  opponent: string;
  date: number;
  attempts: number;
  fails: number;
}

/** Crée les puzzles d'une partie analysée (une seule fois par partie). Renvoie le nombre créé. */
export async function puzzlesFromGame(g: GameRec): Promise<number> {
  if (!g.evals || g.puzzled) return 0;
  const review = buildReview(g);
  let n = 0;
  for (const m of review?.moves ?? []) {
    if (m.color !== g.myColor || !['erreur', 'gaffe', 'manque'].includes(m.category)) continue;
    if (!m.best || !m.bestSan || m.winBefore < 30) continue; // position déjà perdue : pas d'intérêt
    const pv = g.evals[m.ply].pv ?? [m.best];
    // 1 coup à trouver, ou 2 (coup, réponse, coup) si le premier est un échec ou une prise
    const first = new Chess(m.move.before).move({ from: pv[0].slice(0, 2), to: pv[0].slice(2, 4), promotion: pv[0][4] });
    const long = pv.length >= 3 && (first.san.includes('+') || first.captured) && m.themes.some((t) => t !== 'Positionnel');
    const id = `${g.id}:${m.ply}`;
    if (await db.get('puzzles', id)) continue;
    const p: Puzzle = {
      id,
      gameId: g.id,
      fen: m.move.before,
      color: g.myColor,
      solution: long ? pv.slice(0, 3) : [pv[0]],
      themes: m.themes,
      played: m.san,
      bestSan: m.bestSan,
      explanation: m.explanation,
      category: m.category,
      opponent: g.myColor === 'w' ? g.black : g.white,
      date: g.date,
      attempts: 0,
      fails: 0,
    };
    await db.put('puzzles', id, p);
    n++;
  }
  g.puzzled = true;
  await db.put('games', g.id, g);
  return n;
}

/** Crée les puzzles de toutes les parties analysées qui n'en ont pas encore. */
export async function generateAllPuzzles(): Promise<number> {
  // nettoyage : anciens puzzles créés à tort sur un coup qui donnait mat (bug corrigé en v0.1.8)
  for (const p of await db.getAll<Puzzle>('puzzles')) if (p.played.includes('#')) await db.del('puzzles', p.id);
  let n = 0;
  for (const g of await db.getAll<GameRec>('games')) if (g.evals && !g.puzzled) n += await puzzlesFromGame(g);
  return n;
}

export interface ThemeStat {
  theme: string;
  inGames: number; // nombre d'erreurs de ce thème dans mes parties
  attempts: number;
  fails: number;
}

/** Statistiques par thème, triées : les thèmes les plus ratés d'abord. */
export function themeStats(puzzles: Puzzle[]): ThemeStat[] {
  const map = new Map<string, ThemeStat>();
  for (const p of puzzles) {
    for (const t of p.themes) {
      const s = map.get(t) ?? { theme: t, inGames: 0, attempts: 0, fails: 0 };
      s.inGames++;
      s.attempts += p.attempts;
      s.fails += p.fails;
      map.set(t, s);
    }
  }
  return [...map.values()].sort((a, b) => b.fails - a.fails || b.inGames - a.inGames);
}

// Statistiques du profil (fonctions pures, sans DOM).
import type { Color, GameRec } from '../data/types';

export const TIME_CLASS_FR: Record<string, string> = {
  ultraBullet: 'Ultra-bullet',
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapide',
  classical: 'Classique',
  daily: 'Quotidien',
  correspondence: 'Correspondance',
  pgn: 'Import PGN',
};

const myElo = (g: GameRec) => (g.myColor === 'w' ? g.whiteElo : g.blackElo);
export const myAccuracy = (g: GameRec) => g.accuracy?.[g.myColor];

/** Classement actuel par cadence (dernière partie) et évolution sur 30 jours. */
export function ratings(games: GameRec[]) {
  const byClass = new Map<string, GameRec[]>();
  for (const g of games) if (myElo(g) && g.site !== 'pgn') byClass.set(g.timeClass, [...(byClass.get(g.timeClass) ?? []), g]);
  const monthAgo = Date.now() - 30 * 86400e3;
  return [...byClass.entries()]
    .map(([tc, gs]) => {
      gs.sort((a, b) => a.date - b.date);
      const last = gs[gs.length - 1];
      const ref = gs.find((g) => g.date >= monthAgo) ?? last;
      return { timeClass: tc, label: TIME_CLASS_FR[tc] ?? tc, rating: myElo(last)!, diff: myElo(last)! - myElo(ref)!, count: gs.length, site: last.site };
    })
    .sort((a, b) => b.count - a.count);
}

/** Précision par partie analysée (ordre chronologique) + moyennes. */
export function accuracyStats(games: GameRec[]) {
  const series = games
    .filter((g) => myAccuracy(g) !== undefined)
    .sort((a, b) => a.date - b.date)
    .map((g) => ({ date: g.date, acc: myAccuracy(g)! }));
  const avg = (xs: { acc: number }[]) => (xs.length ? xs.reduce((s, x) => s + x.acc, 0) / xs.length : undefined);
  return {
    series,
    average: avg(series),
    recent: avg(series.slice(-10)), // 10 dernières parties
    previous: avg(series.slice(-20, -10)), // les 10 d'avant
  };
}

/** Famille d'ouverture : "Italian Game: Two Knights" → "Italian Game". */
export function openingFamily(name: string): string {
  if (name.includes(':')) return name.split(':')[0].trim();
  // noms Chess.com sans ":" : on coupe après le premier mot-clé
  const words = name.split(' ').filter((w) => w && !/\d/.test(w));
  const i = words.findIndex((w) => /^(Game|Defense|Defence|Opening|Gambit|Attack|System)$/.test(w));
  return (i >= 0 ? words.slice(0, i + 1) : words.slice(0, 3)).join(' ') || '?';
}

export interface OpeningStat {
  name: string;
  color: Color;
  n: number;
  win: number;
  draw: number;
  loss: number;
  winRate: number; // % de victoires
}

/** Ouvertures jouées, par couleur, triées par nombre de parties. */
export function openingStats(games: GameRec[]): OpeningStat[] {
  const map = new Map<string, OpeningStat>();
  for (const g of games) {
    const name = openingFamily(g.opening);
    const key = g.myColor + name;
    const s = map.get(key) ?? { name, color: g.myColor, n: 0, win: 0, draw: 0, loss: 0, winRate: 0 };
    s.n++;
    s[g.result]++;
    s.winRate = (100 * s.win) / s.n;
    map.set(key, s);
  }
  return [...map.values()].sort((a, b) => b.n - a.n);
}

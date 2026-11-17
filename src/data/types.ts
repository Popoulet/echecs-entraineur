// Types des données stockées dans IndexedDB.

export type Site = 'chesscom' | 'lichess' | 'pgn';
export type Color = 'w' | 'b';

export interface Account {
  id: string; // "lichess:pseudo" (en minuscules)
  site: Site;
  username: string; // casse d'origine
  lastSync?: number; // ms : date de la dernière partie récupérée
}

/** Évaluation d'une position par Stockfish (point de vue des Blancs). */
export interface PosEval {
  cp?: number;
  mate?: number;
  best?: string; // meilleur coup UCI
  pv?: string[]; // début de la meilleure variante (UCI)
}

export interface GameRec {
  id: string; // "lichess:abc123", "chesscom:97872578329", "pgn:…"
  accountId: string;
  site: Site;
  url?: string;
  white: string;
  black: string;
  whiteElo?: number;
  blackElo?: number;
  myColor: Color;
  result: 'win' | 'loss' | 'draw'; // de mon point de vue
  date: number; // ms
  timeClass: string; // bullet, blitz, rapid, classical, daily…
  opening: string; // nom complet (anglais, fourni par le site)
  eco?: string;
  startFen?: string; // si la partie ne part pas de la position initiale
  moves: string[]; // coups SAN
  evals?: PosEval[]; // une par position (moves.length + 1), remplie par l'analyse
  accuracy?: { w: number; b: number };
}

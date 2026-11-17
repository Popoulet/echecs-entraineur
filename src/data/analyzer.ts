// Analyse en arrière-plan des parties pas encore analysées (les plus récentes d'abord).
// Priorité "background" : cède la place à l'analyse live, se met en pause hors de l'appli.
import { Chess } from 'chess.js';
import { engine } from '../engine/engine';
import { gameAccuracy } from '../core/accuracy';
import { db, notifyChange } from './db';
import type { GameRec, PosEval } from './types';

const DEPTH = 12; // compromis vitesse / batterie / fiabilité
const MAX_PER_LAUNCH = 50; // nombre max de parties analysées par ouverture de l'appli

let running = false;

/** État affiché dans la barre de statut. */
export const progress = { done: 0, total: 0 };

/** Lance l'analyse de fond (sans effet si elle tourne déjà). */
export async function runBackgroundAnalysis(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const games = (await db.getAll<GameRec>('games'))
      .filter((g) => !g.evals)
      .sort((a, b) => b.date - a.date)
      .slice(0, MAX_PER_LAUNCH);
    progress.done = 0;
    progress.total = games.length;
    status();
    for (const g of games) {
      await analyseGame(g);
      progress.done++;
      status();
      notifyChange();
    }
  } finally {
    running = false;
    progress.total = 0;
    status();
  }
}

/** Analyse toutes les positions d'une partie, calcule la précision et enregistre. */
export async function analyseGame(g: GameRec): Promise<GameRec> {
  const chess = new Chess(g.startFen);
  const fens = [chess.fen()];
  for (const san of g.moves) {
    chess.move(san);
    fens.push(chess.fen());
  }
  const evals: PosEval[] = [];
  for (const fen of fens) evals.push(await evalPosition(fen));
  g.evals = evals;
  g.accuracy = gameAccuracy(evals, fens[0].split(' ')[1] === 'w');
  await db.put('games', g.id, g);
  return g;
}

/** Évalue une position ; les fins de partie sont traitées sans moteur. */
async function evalPosition(fen: string): Promise<PosEval> {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { cp: c.turn() === 'w' ? -10000 : 10000 };
  if (c.isGameOver()) return { cp: 0 };
  const a = await engine.analyse(fen, { depth: DEPTH, priority: 'background' });
  const l = a.lines[0];
  return { cp: l?.cp, mate: l?.mate, best: a.bestmove, pv: l?.pv.slice(0, 8) };
}

/** Prévient l'interface que la progression a changé. */
function status(): void {
  dispatchEvent(new Event('analysis-progress'));
}

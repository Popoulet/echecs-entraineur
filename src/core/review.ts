// Revue de partie (style "Game Review") : classement des coups, explications par règles, résumé.
// Tout est calculé à partir des évaluations stockées (game.evals), sans relancer le moteur.
import { Chess, type Color, type Move, type Square } from 'chess.js';
import { moveAccuracy } from './accuracy';
import { toFrench, winPercent } from './eval';
import { PIECE_FR, VALUE, forkTargets, ton, un, hangingPieces, materialBalance, nonPawnMaterial } from './material';
import type { GameRec, PosEval } from '../data/types';

export type Category = 'brillant' | 'meilleur' | 'excellent' | 'bon' | 'imprecision' | 'erreur' | 'gaffe' | 'manque';
export type Phase = 'ouverture' | 'milieu' | 'finale';

/** Libellé, symbole et couleur de chaque catégorie (affichage). */
export const CATEGORIES: Record<Category, { label: string; icon: string; color: string }> = {
  brillant: { label: 'Brillant', icon: '!!', color: '#1baca6' },
  meilleur: { label: 'Meilleur', icon: '★', color: '#81b64c' },
  excellent: { label: 'Excellent', icon: '👍', color: '#96bc4b' },
  bon: { label: 'Bon', icon: '✓', color: '#97af8b' },
  imprecision: { label: 'Imprécision', icon: '?!', color: '#f7c045' },
  erreur: { label: 'Erreur', icon: '?', color: '#e58f2a' },
  gaffe: { label: 'Gaffe', icon: '??', color: '#ca3431' },
  manque: { label: 'Coup manqué', icon: '✗', color: '#ff7769' },
};
export const PHASE_FR: Record<Phase, string> = { ouverture: 'Ouverture', milieu: 'Milieu de partie', finale: 'Finale' };

export interface MoveReview {
  ply: number; // 0 = premier coup
  label: string; // "12." ou "12…"
  color: Color;
  san: string; // notation française
  move: Move; // coup chess.js (from, to, before, after…)
  winBefore: number; // % de gain du joueur qui joue, avant / après
  winAfter: number;
  loss: number;
  accuracy: number;
  category: Category;
  best?: string; // meilleur coup UCI
  bestSan?: string;
  reply?: string; // meilleure réponse adverse (UCI) après le coup joué
  explanation: string[];
  phase: Phase;
}

export interface Review {
  moves: MoveReview[];
  counts: Record<Color, Record<Category, number>>;
  keyMoments: MoveReview[];
  phaseAccuracy: Partial<Record<Phase, number>>; // mes coups uniquement
  weakestPhase?: Phase;
}

// ---------- Aides ----------
const opp = (c: Color): Color => (c === 'w' ? 'b' : 'w');
/** % de gain du point de vue de `c`. */
const win = (e: PosEval, c: Color) => (c === 'w' ? winPercent(e) : 100 - winPercent(e));
/** Mat en N pour `c` (positif) ou undefined. */
const mateFor = (e: PosEval, c: Color) => (e.mate !== undefined && (c === 'w' ? e.mate > 0 : e.mate < 0) ? Math.abs(e.mate) : undefined);

function uciToMove(fen: string, uci?: string): Move | undefined {
  if (!uci || uci.length < 4) return undefined;
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return undefined;
  }
}

function phaseOf(ply: number, chess: Chess): Phase {
  if (nonPawnMaterial(chess) <= 26) return 'finale'; // ex. tour + fou chacun, ou moins
  return ply < 20 ? 'ouverture' : 'milieu';
}

// ---------- Revue complète ----------
export function buildReview(g: GameRec): Review | null {
  const evals = g.evals;
  if (!evals || evals.length !== g.moves.length + 1) return null;
  const chess = new Chess(g.startFen);
  const moves: MoveReview[] = [];

  g.moves.forEach((san, i) => {
    const before = chess.fen();
    const phase = phaseOf(i, chess);
    const move = chess.move(san);
    const color = move.color;
    const e0 = evals[i];
    const e1 = evals[i + 1];
    const winBefore = win(e0, color);
    const winAfter = win(e1, color);
    const loss = Math.max(0, winBefore - winAfter);
    const uci = move.from + move.to + (move.promotion ?? '');
    const bestMove = uciToMove(before, e0.best);
    const prev = moves[i - 1];

    const m: MoveReview = {
      ply: i,
      label: `${before.split(' ')[5]}${color === 'w' ? '.' : '…'}`, // numéro de coup lu dans la FEN
      color,
      san: toFrench(san),
      move,
      winBefore,
      winAfter,
      loss,
      accuracy: moveAccuracy(winBefore, winAfter),
      category: 'bon',
      best: e0.best,
      bestSan: bestMove ? toFrench(bestMove.san) : undefined,
      reply: e1.best,
      explanation: [],
      phase,
    };

    // --- Classement selon la perte de % de gain ---
    const missedMate = mateFor(e0, color) !== undefined && mateFor(e1, color) === undefined;
    if (prev && prev.color !== color && prev.loss >= 10 && loss >= 10) m.category = 'manque'; // erreur adverse non punie
    else if (missedMate && (mateFor(e0, color) ?? 9) <= 3) m.category = 'manque';
    else if (e0.best === uci || loss < 1) m.category = 'meilleur';
    else if (loss < 2) m.category = 'excellent';
    else if (loss < 5) m.category = 'bon';
    else if (loss < 10) m.category = 'imprecision';
    else if (loss < 20) m.category = 'erreur';
    else m.category = 'gaffe';

    if ((m.category === 'meilleur' || m.category === 'excellent') && winAfter >= 50 && winBefore < 97 && isSacrifice(before, chess, move))
      m.category = 'brillant';

    m.explanation = explain(m, before, chess, e0, e1, bestMove);
    moves.push(m);
  });

  return { moves, ...summarize(moves, g.myColor) };
}

/** Le coup laisse-t-il volontairement une pièce en prise (plus chère que ce qu'il prend) ? */
function isSacrifice(before: string, after: Chess, move: Move): boolean {
  if (move.piece === 'k' || new Chess(before).inCheck()) return false; // coup de roi ou forcé : pas un sacrifice
  const taken = move.captured ? VALUE[move.captured] : 0;
  const hangBefore = new Set(hangingPieces(new Chess(before), move.color).map((p) => p.sq));
  return hangingPieces(after, move.color).some((p) => VALUE[p.type] > taken + 1 && (!hangBefore.has(p.sq) || p.sq === move.to));
}

// ---------- Explications par règles (français simple) ----------
function explain(m: MoveReview, before: string, after: Chess, e0: PosEval, e1: PosEval, bestMove?: Move): string[] {
  const c = m.color;
  const out: string[] = [];
  const replyMove = uciToMove(after.fen(), e1.best);
  const replySan = replyMove ? toFrench(replyMove.san) : undefined;

  if (m.category === 'brillant') return ['Sacrifice ! Tu offres du matériel, mais la position reste excellente.'];
  if (m.category === 'meilleur') return ['C\'est le meilleur coup.'];
  if (m.category === 'excellent' || m.category === 'bon') {
    return [`Bon coup. ${m.bestSan ? `Le moteur préférait ${m.bestSan}.` : ''}`.trim()];
  }

  if (m.category === 'manque' && !(mateFor(e0, c) !== undefined)) out.push("L'adversaire venait de se tromper, mais ce coup ne le punit pas.");

  // 1. Mat manqué
  const mate0 = mateFor(e0, c);
  if (mate0 !== undefined && mateFor(e1, c) === undefined) out.push(`Mat manqué : il y avait un mat en ${mate0}${m.bestSan ? ` en commençant par ${m.bestSan}` : ''}.`);

  // 2. Le coup permet un mat
  const mateOpp = mateFor(e1, opp(c));
  if (mateOpp !== undefined) out.push(`Ce coup permet à l'adversaire de mater en ${mateOpp}${replySan ? ` (${replySan})` : ''}.`);

  // 3. Pièce laissée en prise
  const hangBefore = new Set(hangingPieces(new Chess(before), c).map((p) => p.sq));
  // un échange égal (ex. fou prend cavalier) n'est pas une pièce "en prise"
  const fairTrade = m.move.captured && VALUE[m.move.captured] >= VALUE[m.move.piece] - 1;
  const hanging = hangingPieces(after, c).filter(
    (p) => (!hangBefore.has(p.sq) || p.sq === m.move.to) && !(fairTrade && p.sq === m.move.to),
  );
  if (hanging.length && mateOpp === undefined) {
    const p = hanging.sort((a, b) => VALUE[b.type] - VALUE[a.type])[0];
    const takes = replyMove && replyMove.to === p.sq;
    out.push(`${cap(ton(p.type))} en ${p.sq} est en prise${takes ? ` : ${replySan} le gagne` : ''}.`);
  }

  // 4. Échange perdant
  if (m.move.captured && VALUE[m.move.piece] > VALUE[m.move.captured] + 1 && after.attackers(m.move.to as Square, opp(c)).length)
    out.push(`Échange perdant : ${ton(m.move.piece)} contre ${un(m.move.captured)}.`);

  // 5. Tactique manquée (fourchette, gain de matériel)
  if (bestMove && !out.some((s) => s.startsWith('Mat manqué'))) {
    const afterBest = new Chess(bestMove.after);
    const targets = forkTargets(afterBest, bestMove.to as Square);
    const gain = pvMaterialGain(before, e0.pv ?? [], c);
    if (targets.length >= 2)
      out.push(`Tactique manquée : ${m.bestSan} faisait une fourchette sur ${targets.map((t) => `${PIECE_FR[t.type]} (${t.sq})`).join(' et ')}.`);
    else if (gain >= 2) out.push(`Tactique manquée : ${m.bestSan} gagnait du matériel (${gain >= 9 ? 'la dame' : gain >= 5 ? 'une tour' : gain >= 3 ? 'une pièce' : 'des pions'}).`);
  }

  // 6. Roi exposé
  if (kingWeakened(before, m.move) && out.length < 2) out.push('Ce coup affaiblit la protection de ton roi.');

  // 7. La meilleure réponse adverse (si elle n'a pas déjà été citée)
  if (replySan && !out.some((t) => t.includes(replySan)))
    out.push(out.length ? `Réponse forte de l'adversaire : ${replySan}.` : `Après ce coup, l'adversaire a ${replySan}, qui améliore nettement sa position.`);
  if (m.bestSan) out.push(`Le meilleur coup était ${m.bestSan}.`);
  return out;
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Matériel gagné par `c` en suivant les 4 premiers demi-coups de la variante du moteur. */
function pvMaterialGain(fen: string, pv: string[], c: Color): number {
  const g = new Chess(fen);
  const start = materialBalance(g);
  for (const uci of pv.slice(0, 4)) {
    try {
      g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      break;
    }
  }
  const d = materialBalance(g) - start;
  return c === 'w' ? d : -d;
}

/** Poussée de pion devant le roi roqué, ou roi qui bouge (hors roque) avec les dames sur l'échiquier. */
function kingWeakened(before: string, move: Move): boolean {
  const g = new Chess(before);
  const king = g.findPiece({ type: 'k', color: move.color })[0];
  const queensOn = g.findPiece({ type: 'q', color: move.color === 'w' ? 'b' : 'w' }).length > 0;
  if (!king || !queensOn) return false;
  if (move.piece === 'k' && !move.isKingsideCastle() && !move.isQueensideCastle()) return true;
  if (move.piece !== 'p') return false;
  const kFile = king.charCodeAt(0);
  const pFile = move.from.charCodeAt(0);
  const homeRank = move.color === 'w' ? '1' : '8';
  return king[1] === homeRank && Math.abs(kFile - pFile) <= 1 && (king[0] <= 'c' || king[0] >= 'f');
}

// ---------- Résumé ----------
function summarize(moves: MoveReview[], me: Color): Omit<Review, 'moves'> {
  const empty = () => Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, 0])) as Record<Category, number>;
  const counts = { w: empty(), b: empty() };
  for (const m of moves) counts[m.color][m.category]++;

  // moments clés : les plus gros basculements de la partie (+ coups brillants), dans l'ordre
  const keyMoments = moves
    .filter((m) => m.category === 'brillant' || m.loss >= 10)
    .sort((a, b) => (b.category === 'brillant' ? 100 : b.loss) - (a.category === 'brillant' ? 100 : a.loss))
    .slice(0, 5)
    .sort((a, b) => a.ply - b.ply);

  // précision moyenne par phase (mes coups), la phase la plus faible = la plus basse (≥ 3 coups)
  const phaseAccuracy: Partial<Record<Phase, number>> = {};
  let weakestPhase: Phase | undefined;
  for (const p of ['ouverture', 'milieu', 'finale'] as Phase[]) {
    const mine = moves.filter((m) => m.color === me && m.phase === p);
    if (mine.length < 3) continue;
    phaseAccuracy[p] = mine.reduce((s, m) => s + m.accuracy, 0) / mine.length;
    if (weakestPhase === undefined || phaseAccuracy[p]! < phaseAccuracy[weakestPhase]!) weakestPhase = p;
  }
  return { counts, keyMoments, phaseAccuracy, weakestPhase };
}

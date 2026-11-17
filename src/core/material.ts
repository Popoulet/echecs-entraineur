// Outils tactiques simples sur une position chess.js : valeur des pièces, pièces en prise, fourchettes.
import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';

export const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

export const PIECE_FR: Record<PieceSymbol, string> = { p: 'pion', n: 'cavalier', b: 'fou', r: 'tour', q: 'dame', k: 'roi' };

/** "ton cavalier" / "ta tour" ; "un pion" / "une dame". */
export const ton = (t: PieceSymbol) => `${t === 'r' || t === 'q' ? 'ta' : 'ton'} ${PIECE_FR[t]}`;
export const un = (t: PieceSymbol) => `${t === 'r' || t === 'q' ? 'une' : 'un'} ${PIECE_FR[t]}`;

const opp = (c: Color): Color => (c === 'w' ? 'b' : 'w');

/** Toutes les cases occupées par une couleur. */
export function pieces(chess: Chess, color: Color): { sq: Square; type: PieceSymbol }[] {
  const out: { sq: Square; type: PieceSymbol }[] = [];
  for (const row of chess.board()) for (const p of row) if (p && p.color === color) out.push({ sq: p.square, type: p.type });
  return out;
}

/** Valeur du plus petit attaquant d'une case (Infinity si aucun). */
function cheapestAttacker(chess: Chess, sq: Square, by: Color): number {
  const a = chess.attackers(sq, by);
  return a.length ? Math.min(...a.map((s) => VALUE[chess.get(s)!.type])) : Infinity;
}

/**
 * Pièces (cavalier ou plus) d'une couleur qui sont "en prise" : attaquées et non défendues,
 * ou attaquées par une pièce de moindre valeur.
 */
export function hangingPieces(chess: Chess, color: Color): { sq: Square; type: PieceSymbol }[] {
  return pieces(chess, color).filter(({ sq, type }) => {
    if (type === 'k' || type === 'p') return false;
    const att = cheapestAttacker(chess, sq, opp(color));
    if (att === Infinity) return false;
    const defended = chess.attackers(sq, color).length > 0;
    return !defended || att < VALUE[type];
  });
}

/** Cibles d'une fourchette : pièces adverses (≥ cavalier, ou roi) attaquées par la pièce en `sq`. */
export function forkTargets(chess: Chess, sq: Square): { sq: Square; type: PieceSymbol }[] {
  const me = chess.get(sq);
  if (!me) return [];
  return pieces(chess, opp(me.color)).filter(
    (p) =>
      p.type !== 'p' &&
      chess.attackers(p.sq, me.color).includes(sq) &&
      // le roi compte toujours ; sinon pièce plus chère que l'attaquant, ou non défendue
      (p.type === 'k' || VALUE[p.type] > VALUE[me.type] || chess.attackers(p.sq, opp(me.color)).length === 0),
  );
}

/** Bilan matériel (Blancs − Noirs) en points de pions. */
export function materialBalance(chess: Chess): number {
  let s = 0;
  for (const row of chess.board()) for (const p of row) if (p && p.type !== 'k') s += (p.color === 'w' ? 1 : -1) * VALUE[p.type];
  return s;
}

/** Matériel hors pions des deux camps (sert à détecter la finale). */
export function nonPawnMaterial(chess: Chess): number {
  let s = 0;
  for (const row of chess.board()) for (const p of row) if (p && p.type !== 'k' && p.type !== 'p') s += VALUE[p.type];
  return s;
}

// Ouvertures : format des fichiers JSON (src/openings/*.json) et outils (lignes, répertoire).
import { Chess } from 'chess.js';

/** Un demi-coup d'une leçon. `san` en notation anglaise (Nf3), comme dans les PGN. */
export interface LessonMove {
  san: string;
  text?: string; // explication niveau débutant
  arrows?: string[]; // flèches en plus du coup, ex. ["d1h5", "f3e5:red"] (couleur : green, red, blue, yellow)
  squares?: string[]; // cases surlignées, ex. ["e4", "d5"]
}

export interface LessonLine {
  id: string;
  name: string;
  /** Ligne de base dont on reprend les `branchAt` premiers demi-coups (évite de tout réécrire). */
  base?: string;
  branchAt?: number;
  moves: LessonMove[];
  trap?: boolean; // ligne "piège" (montrée dans la leçon)
  train?: boolean; // false = ne pas l'entraîner (ex. piège où l'on tombe soi-même)
  user?: boolean; // ligne ajoutée par l'utilisateur
}

export interface OpeningFile {
  id: string;
  name: string;
  color: 'w' | 'b'; // camp de l'utilisateur
  description: string;
  plans: string[];
  lines: LessonLine[];
}

/** Lignes complètes (préfixe hérité de `base` recopié). */
export function resolveLines(op: OpeningFile): LessonLine[] {
  const byId = new Map(op.lines.map((l) => [l.id, l]));
  const full = (l: LessonLine): LessonMove[] => {
    if (!l.base) return l.moves;
    const b = byId.get(l.base);
    return b ? [...full(b).slice(0, l.branchAt ?? 0), ...l.moves] : l.moves;
  };
  return op.lines.map((l) => ({ ...l, moves: full(l) }));
}

/** Lignes à entraîner / réviser. */
export const trainable = (op: OpeningFile) => resolveLines(op).filter((l) => l.train !== false);

/** Clé de position sans compteurs de coups (pour reconnaître les transpositions). */
export const posKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

export interface RepertoireNode {
  moves: Map<string, { openingId: string; lineId: string }>; // SAN attendu → leçon
}

/** Index position → coups du répertoire, pour un camp donné. */
export function buildRepertoire(ops: OpeningFile[], color: 'w' | 'b'): Map<string, RepertoireNode> {
  const map = new Map<string, RepertoireNode>();
  for (const op of ops.filter((o) => o.color === color)) {
    for (const line of resolveLines(op)) {
      if (line.train === false) continue;
      const c = new Chess();
      for (const m of line.moves) {
        const k = posKey(c.fen());
        const node = map.get(k) ?? { moves: new Map() };
        try {
          const mv = c.move(m.san);
          if (!node.moves.has(mv.san)) node.moves.set(mv.san, { openingId: op.id, lineId: line.id });
        } catch {
          break;
        }
        map.set(k, node);
      }
    }
  }
  return map;
}

export interface Deviation {
  ply: number; // index du coup qui sort du répertoire
  byMe: boolean;
  expected: string[]; // coups du répertoire (SAN anglais)
  openingId: string;
  lineId: string;
}

/** Premier coup d'une partie qui sort du répertoire (null si la partie n'y entre jamais ou y reste). */
export function findDeviation(moves: string[], myColor: 'w' | 'b', rep: Map<string, RepertoireNode>, startFen?: string): Deviation | null {
  if (startFen) return null;
  const c = new Chess();
  let last: { openingId: string; lineId: string } | undefined;
  for (let i = 0; i < moves.length; i++) {
    const node = rep.get(posKey(c.fen()));
    if (!node) return null; // plus de répertoire ici (fin de ligne)
    const mv = c.move(moves[i]);
    const hit = node.moves.get(mv.san);
    if (!hit) {
      const ref = last ?? node.moves.values().next().value!;
      return { ply: i, byMe: mv.color === myColor, expected: [...node.moves.keys()], openingId: ref.openingId, lineId: ref.lineId };
    }
    last = hit;
  }
  return null;
}

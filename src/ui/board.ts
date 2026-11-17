// Échiquier tactile : chessground (affichage, glisser-déposer, toucher-toucher, flèches)
// + chess.js (règles). Une instance = un échiquier et sa partie.
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Key } from 'chessground/types';
import type { DrawShape } from 'chessground/draw';
import { Chess, type Move, type Square } from 'chess.js';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import { askPromotion } from './promotion';

export type Side = 'white' | 'black';

export interface BoardOptions {
  fen?: string;
  orientation?: Side;
  /** Quelles pièces l'utilisateur peut déplacer ('none' = lecture seule). */
  movable?: Side | 'both' | 'none';
  /** Appelé après chaque coup joué par l'utilisateur. */
  onMove?: (move: Move) => void;
}

export class Board {
  readonly game: Chess;
  readonly cg: Api;
  private opts: BoardOptions;

  constructor(private el: HTMLElement, opts: BoardOptions = {}) {
    this.opts = opts;
    this.game = new Chess(opts.fen);
    this.cg = Chessground(el, {
      orientation: opts.orientation ?? 'white',
      coordinates: true,
      blockTouchScroll: true, // pas de défilement de page en glissant une pièce
      premovable: { enabled: false },
      animation: { enabled: true, duration: 180 },
      draggable: { enabled: true, showGhost: true },
      drawable: { enabled: false }, // les flèches sont posées par le code uniquement
      movable: { free: false, showDests: true, events: { after: (o, d) => this.userMove(o, d) } },
    });
    this.sync();
  }

  /** Recharge une position. */
  load(fen: string): void {
    this.game.load(fen);
    this.sync();
  }

  /** Joue un coup par le code (SAN "Cf3"/"Nf3" anglais, ou {from,to}). */
  play(move: string | { from: string; to: string; promotion?: string }): Move | null {
    try {
      const m = this.game.move(move);
      this.sync(m);
      return m;
    } catch {
      return null;
    }
  }

  /** Affiche une position (mode lecture, ex. revue de partie) avec le dernier coup surligné. */
  setPosition(fen: string, last?: { from: string; to: string }): void {
    this.game.load(fen);
    this.sync(last as Move | undefined);
  }

  undo(): void {
    this.game.undo();
    const h = this.game.history({ verbose: true });
    this.sync(h[h.length - 1]);
  }

  flip(): void {
    this.cg.toggleOrientation();
  }

  setMovable(m: BoardOptions['movable']): void {
    this.opts.movable = m;
    this.sync();
  }

  /** Flèches/cercles : [{orig:'e2', dest:'e4', brush:'green'}]. Brosses : green, red, blue, yellow, paleBlue… */
  setShapes(shapes: DrawShape[]): void {
    this.cg.setAutoShapes(shapes);
  }

  /** Cases surlignées : {e4: 'hl-good'} (classes CSS définies dans style.css). */
  setSquares(classes: Record<string, string>): void {
    this.cg.set({ highlight: { custom: new Map(Object.entries(classes) as [Key, string][]) } });
  }

  destroy(): void {
    this.cg.destroy();
  }

  /** Coup joué au doigt/stylet : promotion éventuelle, validation par chess.js. */
  private async userMove(from: Key, to: Key): Promise<void> {
    const piece = this.game.get(from as Square);
    let promotion: string | undefined;
    if (piece?.type === 'p' && (to[1] === '8' || to[1] === '1')) {
      promotion = await askPromotion(this.el, piece.color === 'w' ? 'white' : 'black');
    }
    const m = this.play({ from, to, promotion });
    if (!m) return this.sync(); // coup refusé : on remet la position
    this.opts.onMove?.(m);
  }

  /** Synchronise l'affichage avec la partie chess.js (position, coups légaux, échec). */
  private sync(last?: Move): void {
    const turn: Side = this.game.turn() === 'w' ? 'white' : 'black';
    const mv = this.opts.movable ?? 'both';
    const canMove = mv === 'both' || mv === turn;
    const dests = new Map<Key, Key[]>();
    if (canMove) {
      for (const m of this.game.moves({ verbose: true })) {
        const k = m.from as Key;
        dests.set(k, [...(dests.get(k) ?? []), m.to as Key]);
      }
    }
    this.cg.set({
      fen: this.game.fen(),
      turnColor: turn,
      check: this.game.inCheck(),
      lastMove: last ? [last.from as Key, last.to as Key] : undefined,
      movable: { color: canMove ? turn : undefined, dests },
    });
  }
}

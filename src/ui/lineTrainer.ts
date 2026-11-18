// Entraînement sur une ligne d'ouverture : l'appli joue les coups adverses, l'utilisateur joue les siens.
// Mode "hints" (entraînement) : explications + indice en cas d'erreur. Sinon (révision) : sans aide.
import type { Key } from 'chessground/types';
import type { DrawShape } from 'chessground/draw';
import { Chess } from 'chess.js';
import { Board } from './board';
import { toFrench } from '../core/eval';
import { PIECE_FR } from '../core/material';
import type { LessonLine } from '../core/openings';

export interface TrainerOptions {
  line: LessonLine;
  color: 'w' | 'b';
  hints: boolean;
  onMessage: (html: string, kind: 'info' | 'ok' | 'bad') => void;
  /** errors = mauvais coups au total ; revealed = la solution a dû être montrée au moins une fois */
  onDone: (errors: number, revealed: boolean) => void;
}

const strip = (san: string) => san.replace(/[+#!?]/g, '');

/** Lance l'entraînement dans `el` ; renvoie une fonction d'arrêt. */
export function runTrainer(el: HTMLElement, o: TrainerOptions): () => void {
  let ply = 0;
  let errors = 0;
  let missesHere = 0; // erreurs sur le coup courant
  let revealed = false;
  const MAX_TRIES = 3; // essais par coup avant de montrer la solution
  let stopped = false;
  let fenBefore = ''; // position avant le coup de l'utilisateur (le coup attendu se calcule depuis là)
  const board = new Board(el, { orientation: o.color === 'w' ? 'white' : 'black', movable: 'none', onMove: (m) => onUserMove(m.san) });

  /** Coup attendu au demi-coup courant (avec ses cases from/to). */
  const expected = () => {
    const san = o.line.moves[ply].san;
    const m = new Chess(fenBefore).move(san);
    return { san, m };
  };

  function step(): void {
    if (stopped) return;
    if (ply >= o.line.moves.length) {
      board.setMovable('none');
      return o.onDone(errors, revealed);
    }
    const myTurn = board.game.turn() === o.color;
    if (!myTurn) {
      board.setMovable('none');
      setTimeout(() => {
        if (stopped) return;
        const lm = o.line.moves[ply];
        board.play(lm.san);
        if (o.hints && lm.text) o.onMessage(`<b>${toFrench(strip(lm.san))}</b> : ${lm.text}`, 'info');
        ply++;
        step();
      }, 550);
    } else {
      missesHere = 0;
      fenBefore = board.game.fen();
      board.setShapes([]);
      board.setSquares({});
      board.setMovable(o.color === 'w' ? 'white' : 'black');
    }
  }

  function onUserMove(san: string): void {
    const exp = expected();
    if (strip(san) === strip(exp.m.san)) {
      const lm = o.line.moves[ply];
      board.setShapes([]);
      board.setSquares({});
      o.onMessage(`✓ <b>${toFrench(strip(lm.san))}</b>${o.hints && lm.text ? ` : ${lm.text}` : ''}`, 'ok');
      ply++;
      return step();
    }
    // mauvais coup : on l'annule
    errors++;
    missesHere++;
    setTimeout(() => board.undo(), 300);
    const lm = o.line.moves[ply];
    const left = MAX_TRIES - missesHere;
    const leftTxt = `${left} essai${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}`;
    if (!o.hints) {
      // révision : plusieurs essais de mémoire, puis la solution (la ligne reviendra bientôt)
      if (missesHere < MAX_TRIES) return o.onMessage(`✗ Ce n'est pas le coup de la leçon. Réessaie de mémoire (${leftTxt}).`, 'bad');
      revealed = true;
      board.setShapes([{ orig: exp.m.from as Key, dest: exp.m.to as Key, brush: 'green' }]);
      o.onMessage(`✗ Le coup de la leçon était <b>${toFrench(exp.m.san)}</b>. Joue-le pour continuer.`, 'bad');
      return;
    }
    const piece = PIECE_FR[exp.m.piece];
    if (missesHere === 1) {
      // 1re erreur : on laisse simplement réessayer
      o.onMessage(`✗ Pas tout à fait, réessaie (${leftTxt} avant la solution).`, 'bad');
    } else if (missesHere === 2) {
      // 2e erreur : explication + indice (la pièce à jouer)
      board.setSquares({ [exp.m.from]: 'hl-info' });
      o.onMessage(`✗ Indice : joue ton <b>${piece}</b> (case surlignée).${lm.text ? `<br><small>${lm.text}</small>` : ''}`, 'bad');
    } else {
      revealed = true;
      const shapes: DrawShape[] = [{ orig: exp.m.from as Key, dest: exp.m.to as Key, brush: 'green' }];
      board.setShapes(shapes);
      o.onMessage(`✗ Le coup est <b>${toFrench(exp.m.san)}</b> (flèche verte).${lm.text ? `<br><small>${lm.text}</small>` : ''}`, 'bad');
    }
  }

  o.onMessage(o.hints ? 'Rejoue la ligne. Je joue les coups adverses.' : 'Révision sans aide : joue la ligne de mémoire.', 'info');
  step();
  return () => {
    stopped = true;
    board.destroy();
  };
}

// Page "Analyse" : échiquier libre + évaluation Stockfish en direct.
// Sert aussi de page de test de l'échiquier tactile et du moteur.
import type { Key } from 'chessground/types';
import { Board } from '../ui/board';
import { engine, type Analysis } from '../engine/engine';
import { formatScore, pvToSan, winPercent } from '../core/eval';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="play">
      <div class="board-zone">
        <div class="evalbar"><div class="evalbar-fill"></div></div>
        <div class="board"></div>
      </div>
      <div class="side">
        <h2>Analyse</h2>
        <div class="eval-big">…</div>
        <p class="pv muted"></p>
        <p class="status muted"></p>
        <div class="btn-row">
          <button class="btn" data-a="undo">◀ Annuler</button>
          <button class="btn" data-a="flip">⇅ Retourner</button>
          <button class="btn" data-a="reset">↺ Nouvelle</button>
          <button class="btn" data-a="engine">Moteur : oui</button>
        </div>
      </div>
    </div>`;

  const $ = (s: string) => root.querySelector<HTMLElement>(s)!;
  let engineOn = true;
  const board = new Board($('.board'), { onMove: () => analyse() });

  /** Affiche une analyse : barre, score, meilleure variante, flèche. */
  function show(a: Analysis): void {
    const best = a.lines[0];
    if (!best || a.fen !== board.game.fen()) return; // résultat d'une ancienne position
    $('.evalbar-fill').style.height = `${winPercent(best)}%`;
    $('.eval-big').textContent = formatScore(best);
    $('.pv').textContent = pvToSan(a.fen, best.pv);
    $('.status').textContent = `Profondeur ${a.depth}`;
    const m = best.pv[0];
    board.setShapes(m ? [{ orig: m.slice(0, 2) as Key, dest: m.slice(2, 4) as Key, brush: 'green' }] : []);
  }

  /** Relance l'analyse sur la position courante. */
  function analyse(): void {
    board.setShapes([]);
    const g = board.game;
    if (g.isGameOver()) {
      $('.eval-big').textContent = g.isCheckmate() ? 'Mat' : 'Nulle';
      $('.pv').textContent = '';
      $('.status').textContent = '';
      return engine.stopLive();
    }
    if (!engineOn) {
      $('.status').textContent = 'Moteur arrêté';
      return engine.stopLive();
    }
    $('.status').textContent = 'Analyse…';
    engine.analyse(g.fen(), { depth: 18, priority: 'live', onInfo: show }).then(show);
  }

  $('.btn-row').addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('button')?.dataset.a;
    if (a === 'undo') board.undo();
    if (a === 'flip') return board.flip();
    if (a === 'reset') board.load(START);
    if (a === 'engine') {
      engineOn = !engineOn;
      $('[data-a=engine]').textContent = `Moteur : ${engineOn ? 'oui' : 'non'}`;
    }
    analyse();
  });

  analyse();
  // nettoyage quand on quitte la page
  return () => {
    engine.stopLive();
    board.destroy();
  };
}

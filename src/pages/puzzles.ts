// Page Puzzles : positions tirées de mes erreurs, en répétition espacée, avec stats par thème.
import type { Key } from 'chessground/types';
import { Chess } from 'chess.js';
import { db } from '../data/db';
import { generateAllPuzzles, themeStats, type Puzzle } from '../data/puzzles';
import { getCard, saveCard } from '../data/openingsData';
import { engine } from '../engine/engine';
import { winPercent } from '../core/eval';
import { CATEGORIES, type Category } from '../core/review';
import { dueLabel, grade, isDue, type Card } from '../core/srs';
import { Board } from '../ui/board';

const SESSION = 10; // puzzles par série

export function render(root: HTMLElement): () => void {
  let stop: (() => void) | undefined;

  async function home(): Promise<void> {
    stop?.();
    stop = undefined;
    root.innerHTML = '<div class="center"><p class="muted">Préparation des puzzles…</p></div>';
    await generateAllPuzzles();
    const puzzles = await db.getAll<Puzzle>('puzzles');
    const cards = new Map((await db.getAll<Card>('srs')).filter((c) => c.kind === 'puzzle').map((c) => [c.id, c]));
    const due = puzzles.filter((p) => !cards.has(`puzzle:${p.id}`) || isDue(cards.get(`puzzle:${p.id}`)!));
    const attempts = puzzles.reduce((s, p) => s + p.attempts, 0);
    const fails = puzzles.reduce((s, p) => s + p.fails, 0);
    const themes = themeStats(puzzles);
    const next = [...cards.values()].filter((c) => !isDue(c)).sort((a, b) => a.due - b.due)[0];

    root.innerHTML = `
      <div class="page">
        <div class="op-top"><h2>Puzzles tirés de mes parties</h2>
          <button class="btn primary" data-a="start" ${due.length ? '' : 'disabled'}>Commencer (${Math.min(SESSION, due.length)})</button></div>
        <div class="cards">
          <section class="card"><h3>À faire</h3><div class="big">${due.length}</div>
            <p class="muted">${puzzles.length} puzzles au total${!due.length && next ? ` · prochain ${dueLabel(next)}` : ''}</p></section>
          <section class="card"><h3>Réussite</h3><div class="big">${attempts ? Math.round((100 * (attempts - fails)) / attempts) : '–'} %</div>
            <p class="muted">${attempts} essais</p></section>
          <section class="card wide">
            <h3>Thèmes ratés</h3>
            ${themes.length ? `<table class="rv-table">
              <tr><th>Thème</th><th>Erreurs en partie</th><th>Ratés en puzzle</th><th></th></tr>
              ${themes.map((t) => `<tr><td>${t.theme}</td><td>${t.inGames}</td>
                <td>${t.attempts ? `${t.fails}/${t.attempts} (${Math.round((100 * t.fails) / t.attempts)} %)` : '–'}</td>
                <td><button class="btn" data-theme="${t.theme}">S'entraîner</button></td></tr>`).join('')}
            </table>` : '<p class="muted">Pas encore de puzzles : ils apparaissent quand tes parties sont analysées (onglet Profil).</p>'}
          </section>
        </div>
      </div>`;

    root.querySelector('[data-a=start]')?.addEventListener('click', () => session(order(due, cards).slice(0, SESSION)));
    root.querySelectorAll<HTMLElement>('[data-theme]').forEach((b) =>
      b.addEventListener('click', () => {
        const list = puzzles.filter((p) => p.themes.includes(b.dataset.theme!));
        session(order(list, cards).slice(0, SESSION));
      }),
    );
  }

  /** Les puzzles en retard d'abord, puis les nouveaux (les plus récents d'abord). */
  function order(list: Puzzle[], cards: Map<string, Card>): Puzzle[] {
    return list.slice().sort((a, b) => {
      const ca = cards.get(`puzzle:${a.id}`), cb = cards.get(`puzzle:${b.id}`);
      if (ca && cb) return ca.due - cb.due;
      if (ca || cb) return ca ? -1 : 1;
      return b.date - a.date;
    });
  }

  /** Une série de puzzles. */
  function session(list: Puzzle[]): void {
    let i = 0;
    let solved = 0;
    const nextPuzzle = (): void => {
      stop?.();
      if (i >= list.length) {
        root.innerHTML = `<div class="center"><h2>Série terminée</h2><p class="muted">${solved}/${list.length} réussis.</p>
          <button class="btn primary" data-a="home">Retour</button></div>`;
        root.querySelector('[data-a=home]')!.addEventListener('click', home);
        return;
      }
      stop = solve(root, list[i], i + 1, list.length, (ok) => {
        if (ok) solved++;
        i++;
      }, nextPuzzle, home);
    };
    nextPuzzle();
  }

  home();
  return () => {
    stop?.();
    engine.stopLive();
  };
}

/** Résolution d'un puzzle. `onResult` est appelé une fois ; `next` passe au suivant. */
function solve(root: HTMLElement, p: Puzzle, n: number, total: number, onResult: (ok: boolean) => void, next: () => void, quit: () => void): () => void {
  const side = p.color === 'w' ? 'Blancs' : 'Noirs';
  root.innerHTML = `
    <div class="play">
      <div class="board-zone"><div class="board"></div></div>
      <div class="side">
        <div class="rv-head"><button class="btn" data-a="quit">←</button><h3>Puzzle ${n}/${total}</h3></div>
        <div class="rv-card">
          <p><b>Trouve le meilleur coup pour les ${side}.</b></p>
          <p class="muted">Contre ${p.opponent}, le ${new Date(p.date).toLocaleDateString('fr-FR')}.
            Thème${p.themes.length > 1 ? 's' : ''} : ${p.themes.join(', ')}</p>
        </div>
        <div class="rv-card trainer-msg info">À toi de jouer.</div>
        <div class="btn-row">
          <button class="btn" data-a="hint">💡 Indice</button>
          <button class="btn" data-a="show">Solution</button>
          <button class="btn primary" data-a="next" hidden>Suivant ▶</button>
        </div>
      </div>
    </div>`;
  const $ = (s: string) => root.querySelector<HTMLElement>(s)!;
  const msg = (html: string, kind: 'info' | 'ok' | 'bad') => {
    $('.trainer-msg').innerHTML = html;
    $('.trainer-msg').className = `rv-card trainer-msg ${kind}`;
  };
  let step = 0; // index dans la solution
  let helped = false; // indice utilisé
  let finished = false;
  const board = new Board($('.board'), { fen: p.fen, orientation: p.color === 'w' ? 'white' : 'black', movable: p.color === 'w' ? 'white' : 'black', onMove: (m) => onMove(m.from + m.to + (m.promotion ?? '')) });

  const arrow = (uci: string) => board.setShapes([{ orig: uci.slice(0, 2) as Key, dest: uci.slice(2, 4) as Key, brush: 'green' }]);

  /** Fin du puzzle : enregistre le résultat (SRS + stats) une seule fois. */
  async function finish(ok: boolean, html: string): Promise<void> {
    if (finished) return;
    finished = true;
    board.setMovable('none');
    msg(html, ok ? 'ok' : 'bad');
    $('[data-a=next]').hidden = false;
    $('[data-a=hint]').hidden = true;
    $('[data-a=show]').hidden = true;
    p.attempts++;
    if (!ok) p.fails++;
    await db.put('puzzles', p.id, p);
    const card = await getCard(`puzzle:${p.id}`, 'puzzle');
    await saveCard(grade(card, ok));
    onResult(ok);
  }

  const cat = CATEGORIES[p.category as Category];
  const why = `<br><small>Dans la partie tu avais joué <b>${p.played}</b> (<span style="color:${cat?.color}">${cat?.label ?? ''}</span>). ${p.explanation.join(' ')}</small>`;

  async function onMove(uci: string): Promise<void> {
    if (finished) return;
    const expected = p.solution[step];
    if (uci === expected || (await acceptable(board.game.fen()))) {
      step += 2;
      if (step >= p.solution.length || uci !== expected) {
        // résolu (ou coup alternatif jugé aussi bon par le moteur)
        return finish(!helped, `${uci === expected ? '✓ Bravo !' : '✓ Bon coup aussi (validé par le moteur).'}${helped ? ' (avec indice)' : ''}${why}`);
      }
      // l'adversaire répond, puis on cherche le coup suivant
      board.setMovable('none');
      msg('✓ Bien ! Continue…', 'ok');
      setTimeout(() => {
        const r = p.solution[step - 1];
        board.play({ from: r.slice(0, 2), to: r.slice(2, 4), promotion: r[4] });
        board.setMovable(p.color === 'w' ? 'white' : 'black');
      }, 500);
      return;
    }
    setTimeout(() => board.undo(), 300);
    arrow(expected);
    finish(false, `✗ Raté. La solution était la flèche verte${step === 0 ? ` : <b>${p.bestSan}</b>` : ''}.${why}`);
  }

  /**
   * Un coup différent de la solution peut être aussi bon : on demande au moteur.
   * `fenAfter` = position après le coup de l'utilisateur. Accepté si on perd moins de 5 % de gain.
   */
  async function acceptable(fenAfter: string): Promise<boolean> {
    const c = new Chess(fenAfter);
    if (c.isCheckmate()) return true;
    msg('Vérification du coup…', 'info');
    const ref = new Chess(p.fen);
    // éval de référence : la position après le coup de la solution
    for (let k = 0; k <= step; k++) {
      const u = p.solution[k];
      ref.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    }
    const [a, b] = [await engine.analyse(fenAfter, { depth: 12, priority: 'live' }), await engine.analyse(ref.fen(), { depth: 12, priority: 'live' })];
    if (!a.lines[0] || !b.lines[0]) return false;
    const me = (x: number) => (p.color === 'w' ? x : 100 - x);
    return me(winPercent(a.lines[0])) >= me(winPercent(b.lines[0])) - 5;
  }

  root.querySelector('.side')!.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    const u = p.solution[step];
    if (a === 'hint' && u) {
      helped = true;
      board.setSquares({ [u.slice(0, 2)]: 'hl-info' });
      msg('💡 La pièce à jouer est surlignée.', 'info');
    }
    if (a === 'show' && u) {
      arrow(u);
      finish(false, `Solution : la flèche verte.${why}`);
    }
    if (a === 'next') next();
    if (a === 'quit') quit();
  });

  return () => board.destroy();
}

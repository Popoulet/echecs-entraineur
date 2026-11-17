// Page Parties : liste des parties (toucher une ligne → revue de la partie).
import { db } from '../data/db';
import { myAccuracy, openingFamily, TIME_CLASS_FR } from '../core/stats';
import { renderReview } from './review';
import type { GameRec } from '../data/types';

const RESULT_FR = { win: 'Victoire', loss: 'Défaite', draw: 'Nulle' };
type Filter = 'all' | 'win' | 'loss' | 'draw';

export function render(root: HTMLElement, param?: string): void | (() => void) {
  if (param) return renderReview(root, param);
  let filter: Filter = 'all';

  async function draw(): Promise<void> {
    const games = (await db.getAll<GameRec>('games'))
      .filter((g) => filter === 'all' || g.result === filter)
      .sort((a, b) => b.date - a.date)
      .slice(0, 300);
    root.innerHTML = `
      <div class="page">
        <div class="chips">
          ${(['all', 'win', 'loss', 'draw'] as Filter[])
            .map((f) => `<button class="chip ${f === filter ? 'on' : ''}" data-f="${f}">${f === 'all' ? 'Toutes' : RESULT_FR[f]}s</button>`)
            .join('')}
        </div>
        <div class="list">
          ${games.map(row).join('') || '<p class="muted">Aucune partie. Ajoute un compte dans Profil.</p>'}
        </div>
      </div>`;
  }

  root.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const f = el.closest<HTMLElement>('[data-f]')?.dataset.f;
    if (f) {
      filter = f as Filter;
      return draw();
    }
    const id = el.closest<HTMLElement>('[data-id]')?.dataset.id;
    if (id) location.hash = `#/parties/${encodeURIComponent(id)}`;
  });

  const refresh = () => draw();
  addEventListener('data-changed', refresh);
  draw();
  return () => removeEventListener('data-changed', refresh);
}

/** Une ligne de la liste. */
function row(g: GameRec): string {
  const opp = g.myColor === 'w' ? `${g.black} (${g.blackElo ?? '?'})` : `${g.white} (${g.whiteElo ?? '?'})`;
  const a = myAccuracy(g);
  return `
    <button class="game-item res-border-${g.result}" data-id="${g.id}">
      <span class="gi-main">${g.myColor === 'w' ? '⚪' : '⚫'} contre ${opp}<br>
        <small class="muted">${openingFamily(g.opening)}</small></span>
      <span class="res-${g.result}">${RESULT_FR[g.result]}</span>
      <span class="gi-acc">${a !== undefined ? `${a.toFixed(0)} %` : '<small class="muted">non analysée</small>'}</span>
      <small class="muted">${TIME_CLASS_FR[g.timeClass] ?? g.timeClass}<br>${new Date(g.date).toLocaleDateString('fr-FR')}</small>
    </button>`;
}

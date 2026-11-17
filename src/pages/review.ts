// Revue d'une partie : échiquier, barre et graphique d'éval, classement des coups, explications, résumé.
import type { Key } from 'chessground/types';
import type { DrawShape } from 'chessground/draw';
import { Chess } from 'chess.js';
import { db } from '../data/db';
import { analyseGame } from '../data/analyzer';
import { engine } from '../engine/engine';
import { formatScore, toFrench, winPercent } from '../core/eval';
import { buildReview, CATEGORIES, PHASE_FR, type Category, type Review } from '../core/review';
import { Board } from '../ui/board';
import { lineChart } from '../ui/chart';
import { loadOpenings } from '../data/openingsData';
import { buildRepertoire, findDeviation, type Deviation } from '../core/openings';
import type { GameRec } from '../data/types';

/** Sortie de répertoire + noms pour l'affichage. */
interface RepInfo extends Deviation {
  openingName: string;
  lineName: string;
}

export function renderReview(root: HTMLElement, id: string): () => void {
  let cancelled = false;
  root.innerHTML = `<div class="center"><h2>Chargement…</h2><p class="muted progress"></p></div>`;

  (async () => {
    let g = await db.get<GameRec>('games', id);
    if (!g) {
      root.innerHTML = '<div class="center"><h2>Partie introuvable</h2></div>';
      return;
    }
    if (!g.evals) {
      // pas encore analysée : on l'analyse tout de suite, en priorité
      const p = root.querySelector('.progress')!;
      root.querySelector('h2')!.textContent = 'Analyse de la partie…';
      try {
        g = await analyseGame(g, {
          live: true,
          cancelled: () => cancelled,
          onProgress: (d, t) => (p.textContent = `Position ${d} / ${t}`),
        });
      } catch {
        return; // page quittée
      }
    }
    const review = buildReview(g);
    if (!review || cancelled) return;
    // où la partie sort-elle de mon répertoire d'ouvertures ?
    const ops = await loadOpenings();
    const dev = findDeviation(g.moves, g.myColor, buildRepertoire(ops, g.myColor), g.startFen);
    const op = dev && ops.find((o) => o.id === dev.openingId);
    const rep: RepInfo | null = dev && op
      ? { ...dev, openingName: op.name, lineName: op.lines.find((l) => l.id === dev.lineId)?.name ?? '' }
      : null;
    show(root, g, review, rep);
  })();

  return () => {
    cancelled = true;
    engine.stopLive();
  };
}

function show(root: HTMLElement, g: GameRec, review: Review, rep: RepInfo | null): void {
  const { moves } = review;
  const evals = g.evals!;
  const startFen = g.startFen ?? new Chess().fen();
  let cur = 0; // index de position affichée (0 = départ, i = après le coup i-1)
  let tab: 'coups' | 'resume' = 'coups';

  root.innerHTML = `
    <div class="play">
      <div class="board-zone">
        <div class="evalbar"><div class="evalbar-fill"></div></div>
        <div class="board"></div>
      </div>
      <div class="side">
        <div class="rv-head">
          <button class="btn" data-a="back">←</button>
          <div class="rv-players">
            <div>⚪ ${g.white} <small class="muted">${g.whiteElo ?? ''}</small> <b>${g.accuracy!.w.toFixed(1)} %</b></div>
            <div>⚫ ${g.black} <small class="muted">${g.blackElo ?? ''}</small> <b>${g.accuracy!.b.toFixed(1)} %</b></div>
          </div>
        </div>
        <div class="rv-chart"></div>
        <div class="seg rv-tabs">
          <button class="chip on" data-tab="coups">Coups</button>
          <button class="chip" data-tab="resume">Résumé</button>
        </div>
        <div class="rv-body"></div>
        <div class="btn-row four">
          <button class="btn" data-a="first">⏮</button><button class="btn" data-a="prev">◀</button>
          <button class="btn" data-a="next">▶</button><button class="btn" data-a="last">⏭</button>
        </div>
      </div>
    </div>`;

  const $ = (s: string) => root.querySelector<HTMLElement>(s)!;
  const board = new Board($('.board'), { fen: startFen, orientation: g.myColor === 'w' ? 'white' : 'black', movable: 'none' });

  // graphique d'évaluation (toucher/glisser pour aller au coup)
  const drawChart = () => {
    $('.rv-chart').replaceChildren(
      lineChart(evals.map(winPercent), { min: 0, max: 100, mid: 50, area: true, height: 110, marker: cur, onPick: go }),
    );
  };

  /** Va à la position `i` et met tout à jour. */
  function go(i: number): void {
    cur = Math.max(0, Math.min(moves.length, i));
    const m = moves[cur - 1];
    board.setPosition(cur ? m.move.after : startFen, m ? m.move : undefined);
    const shapes: DrawShape[] = [];
    if (m) {
      const cat = CATEGORIES[m.category];
      shapes.push({ orig: m.move.to as Key, label: { text: cat.icon, fill: cat.color } });
      // flèche verte : le meilleur coup qu'il fallait jouer (si ce n'est pas celui joué)
      if (m.best && m.category !== 'meilleur' && m.category !== 'brillant')
        shapes.push({ orig: m.best.slice(0, 2) as Key, dest: m.best.slice(2, 4) as Key, brush: 'green' });
      board.setSquares({ [m.move.to]: `cat-${m.category}`, [m.move.from]: `cat-${m.category}` });
    } else board.setSquares({});
    board.setShapes(shapes);
    $('.evalbar-fill').style.height = `${winPercent(evals[cur])}%`;
    drawChart();
    drawBody();
  }

  function drawBody(): void {
    const body = $('.rv-body');
    if (tab === 'resume') return void (body.innerHTML = (rep ? `<div class="rv-card">${repHtml(rep)}</div>` : '') + summaryHtml(g, review));
    const m = moves[cur - 1];
    const cat = m && CATEGORIES[m.category];
    body.innerHTML = `
      <div class="rv-card">
        ${m ? `
          <div class="rv-title"><span class="badge" style="background:${cat.color}">${cat.icon}</span>
            <b>${m.label} ${m.san}</b> <span style="color:${cat.color}">${cat.label}</span>
            <span class="muted rv-score">${formatScore(evals[cur])}</span></div>
          ${m.explanation.map((t) => `<p>${t}</p>`).join('')}
          ${rep && rep.ply === cur - 1 ? repHtml(rep) : ''}`
        : '<p class="muted">Position de départ. Utilise ▶ ou touche un coup / le graphique.</p>'}
      </div>
      <div class="movelist">${moveListHtml()}</div>`;
    body.querySelector('.mv.on')?.scrollIntoView({ block: 'nearest' });
  }

  function moveListHtml(): string {
    let html = '';
    moves.forEach((m, i) => {
      if (m.color === 'w' || i === 0) html += `<span class="mv-num">${m.label.replace('…', '.')}</span>`;
      if (i === 0 && m.color === 'b') html += '<span></span>';
      const cat = CATEGORIES[m.category];
      const mark = ['brillant', 'imprecision', 'erreur', 'gaffe', 'manque'].includes(m.category)
        ? `<i style="color:${cat.color}">${cat.icon}</i>` : '';
      const book = rep && rep.ply === i ? '<i title="sortie du répertoire">📖</i>' : '';
      html += `<button class="mv ${cur === i + 1 ? 'on' : ''}" data-ply="${i + 1}">${m.san}${mark}${book}</button>`;
    });
    return html;
  }

  root.querySelector('.side')!.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const ply = el.closest<HTMLElement>('[data-ply]')?.dataset.ply;
    if (ply) {
      tab = 'coups';
      setTab();
      return go(Number(ply));
    }
    const t = el.closest<HTMLElement>('[data-tab]')?.dataset.tab;
    if (t) {
      tab = t as typeof tab;
      setTab();
      return drawBody();
    }
    const a = el.closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'back') history.back();
    if (a === 'first') go(0);
    if (a === 'prev') go(cur - 1);
    if (a === 'next') go(cur + 1);
    if (a === 'last') go(moves.length);
  });
  const setTab = () => root.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));

  // aller au premier moment clé de mes coups, sinon au départ
  go(0);
}

/** Message "sortie du répertoire" avec lien vers la leçon. */
function repHtml(r: RepInfo): string {
  const exp = r.expected.map(toFrench).join(' ou ');
  const who = r.byMe ? 'Tu es sorti' : "L'adversaire est sorti";
  return `<p class="rep">📖 <b>${who} du répertoire</b> (${r.openingName} – ${r.lineName}) : la leçon jouait <b>${exp}</b>.
    <a href="#/ouvertures/${r.openingId}/lecon">Revoir la leçon →</a></p>`;
}

/** Onglet Résumé : nombre de coups par catégorie, moments clés, phases. */
function summaryHtml(g: GameRec, r: Review): string {
  const cats = Object.keys(CATEGORIES) as Category[];
  const me = g.myColor;
  return `
    <div class="rv-card">
      <table class="rv-table">
        <tr><th></th><th>⚪</th><th>⚫</th></tr>
        ${cats.map((c) => `<tr><td><span class="badge" style="background:${CATEGORIES[c].color}">${CATEGORIES[c].icon}</span> ${CATEGORIES[c].label}</td>
          <td>${r.counts.w[c]}</td><td>${r.counts.b[c]}</td></tr>`).join('')}
      </table>
    </div>
    <div class="rv-card">
      <h4>Moments clés</h4>
      ${r.keyMoments.map((m) => `
        <button class="km" data-ply="${m.ply + 1}">
          <span class="badge" style="background:${CATEGORIES[m.category].color}">${CATEGORIES[m.category].icon}</span>
          <span><b>${m.label} ${m.san}</b> ${m.color === me ? '(toi)' : '(adversaire)'}<br>
          <small class="muted">${m.explanation[0] ?? ''}</small></span>
        </button>`).join('') || '<p class="muted">Partie sans grosse erreur.</p>'}
    </div>
    <div class="rv-card">
      <h4>Ta précision par phase</h4>
      ${(['ouverture', 'milieu', 'finale'] as const).filter((p) => r.phaseAccuracy[p] !== undefined).map((p) => `
        <div class="stat-row"><span>${PHASE_FR[p]} ${p === r.weakestPhase ? '<b class="down">← phase la plus faible</b>' : ''}</span>
          <b>${r.phaseAccuracy[p]!.toFixed(1)} %</b></div>`).join('')}
    </div>`;
}

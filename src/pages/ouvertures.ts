// Page Ouvertures : liste (progression), puis par ouverture : Leçon → Entraînement → Révision, et Mes lignes.
// Routes : #/ouvertures, #/ouvertures/<id>, #/ouvertures/<id>/<onglet>, #/ouvertures/revision (toutes)
import type { Key } from 'chessground/types';
import type { DrawShape } from 'chessground/draw';
import { Chess } from 'chess.js';
import { db } from '../data/db';
import { getCard, getNote, lineCardId, loadOpenings, saveCard, saveNote, type UserLine } from '../data/openingsData';
import { resolveLines, trainable, type LessonLine, type OpeningFile } from '../core/openings';
import { dueLabel, grade, isDue, isMastered, type Card } from '../core/srs';
import { toFrench } from '../core/eval';
import { Board } from '../ui/board';
import { runTrainer } from '../ui/lineTrainer';

type Tab = 'lecon' | 'entrainement' | 'revision' | 'perso';
const TABS: [Tab, string][] = [['lecon', 'Leçon'], ['entrainement', 'Entraînement'], ['revision', 'Révision'], ['perso', 'Mes lignes']];

export function render(root: HTMLElement, param?: string): () => void {
  const cleanups: (() => void)[] = [];
  const [id, tabParam] = (param ?? '').split('/');
  (async () => {
    const ops = await loadOpenings();
    if (!id) return drawList(root, ops);
    if (id === 'revision') return cleanups.push(drawReview(root, ops, ops));
    const op = ops.find((o) => o.id === id);
    if (!op) return void (root.innerHTML = '<div class="center"><h2>Ouverture introuvable</h2></div>');
    drawOpening(root, op, ops, (tabParam as Tab) || 'lecon', cleanups);
  })();
  return () => cleanups.forEach((c) => c());
}

// ---------- Liste des ouvertures ----------
async function drawList(root: HTMLElement, ops: OpeningFile[]): Promise<void> {
  const stats = await Promise.all(ops.map(openingStats));
  const totalDue = stats.reduce((s, x) => s + x.due, 0);
  root.innerHTML = `
    <div class="page">
      <div class="op-top">
        <h2>Mon répertoire</h2>
        <a class="btn primary" href="#/ouvertures/revision">Réviser tout (${totalDue})</a>
      </div>
      <div class="cards">
        ${ops.map((op, i) => {
          const s = stats[i];
          return `<section class="card">
            <h3>${op.color === 'w' ? '⚪' : '⚫'} ${op.name}</h3>
            <p class="muted">${op.description}</p>
            <div class="progress"><i style="width:${s.total ? (100 * s.mastered) / s.total : 0}%"></i></div>
            <p class="muted">${s.mastered}/${s.total} lignes maîtrisées · ${s.learned - s.mastered} en cours · ${s.total - s.learned} nouvelles
              ${s.due ? `· <b class="up">${s.due} à réviser</b>` : ''}</p>
            <div class="btn-row three">
              <a class="btn" href="#/ouvertures/${op.id}/lecon">Leçon</a>
              <a class="btn" href="#/ouvertures/${op.id}/entrainement">S'entraîner</a>
              <a class="btn ${s.due ? 'primary' : ''}" href="#/ouvertures/${op.id}/revision">Réviser${s.due ? ` (${s.due})` : ''}</a>
            </div>
          </section>`;
        }).join('')}
      </div>
    </div>`;
}

/** Progression d'une ouverture : lignes apprises (carte créée), maîtrisées, à réviser. */
async function openingStats(op: OpeningFile) {
  const lines = trainable(op);
  const cards = (await Promise.all(lines.map((l) => db.get<Card>('srs', lineCardId(op.id, l.id))))).filter(Boolean) as Card[];
  return { total: lines.length, learned: cards.length, mastered: cards.filter(isMastered).length, due: cards.filter(isDue).length };
}

// ---------- Page d'une ouverture ----------
function drawOpening(root: HTMLElement, op: OpeningFile, ops: OpeningFile[], tab: Tab, cleanups: (() => void)[]): void {
  root.innerHTML = `
    <div class="op-page">
      <div class="op-header">
        <a class="btn" href="#/ouvertures">←</a>
        <h2>${op.color === 'w' ? '⚪' : '⚫'} ${op.name}</h2>
        <div class="seg">${TABS.map(([t, l]) => `<a class="chip ${t === tab ? 'on' : ''}" href="#/ouvertures/${op.id}/${t}">${l}</a>`).join('')}</div>
      </div>
      <div class="op-body"></div>
    </div>`;
  const body = root.querySelector<HTMLElement>('.op-body')!;
  if (tab === 'lecon') cleanups.push(drawLesson(body, op));
  if (tab === 'entrainement') cleanups.push(drawTraining(body, op));
  if (tab === 'revision') cleanups.push(drawReview(body, [op], ops));
  if (tab === 'perso') cleanups.push(drawPerso(body, op));
}

/** Gabarit commun : échiquier + panneau latéral. */
function playLayout(el: HTMLElement, side: string): { boardEl: HTMLElement; side: HTMLElement } {
  el.innerHTML = `<div class="play"><div class="board-zone"><div class="board"></div></div><div class="side">${side}</div></div>`;
  return { boardEl: el.querySelector('.board')!, side: el.querySelector('.side')! };
}

const lineChips = (lines: LessonLine[], cur: string) =>
  `<div class="chips">${lines.map((l) => `<button class="chip ${l.id === cur ? 'on' : ''}" data-line="${l.id}">${l.trap ? '🪤 ' : l.user ? '✏️ ' : ''}${l.name}</button>`).join('')}</div>`;

/** Flèches et cases d'un coup de leçon. */
function lessonShapes(arrows?: string[]): DrawShape[] {
  return (arrows ?? []).map((a) => {
    const [sq, brush = 'green'] = a.split(':');
    return { orig: sq.slice(0, 2) as Key, dest: sq.slice(2, 4) as Key, brush };
  });
}

// ---------- a) Leçon ----------
function drawLesson(el: HTMLElement, op: OpeningFile): () => void {
  const lines = resolveLines(op);
  let line = lines[0];
  let cur = 0;
  const { boardEl, side } = playLayout(el, '');
  const board = new Board(boardEl, { orientation: op.color === 'w' ? 'white' : 'black', movable: 'none' });

  function go(i: number): void {
    cur = Math.max(0, Math.min(line.moves.length, i));
    const c = new Chess();
    let last;
    for (const m of line.moves.slice(0, cur)) last = c.move(m.san);
    board.setPosition(c.fen(), last);
    const lm = line.moves[cur - 1];
    board.setShapes(lessonShapes(lm?.arrows));
    board.setSquares(Object.fromEntries((lm?.squares ?? []).map((s) => [s, 'hl-info'])));
    const moveLabel = lm && last ? `${Math.ceil(cur / 2)}${last.color === 'w' ? '.' : '…'} ${toFrench(last.san)}` : '';
    side.innerHTML = `
      ${lineChips(lines, line.id)}
      <div class="rv-card lesson-text">
        ${cur === 0
          ? `<p>${op.description}</p><h4>Plans typiques</h4><ul>${op.plans.map((p) => `<li>${p}</li>`).join('')}</ul>`
          : `<h4>${moveLabel} ${last && last.color === op.color ? '<small class="muted">(ton coup)</small>' : ''}</h4><p>${lm.text ?? ''}</p>`}
        ${cur === line.moves.length ? `<p class="up"><b>Fin de la ligne.</b> ${line.train === false ? 'Ce piège est à connaître, pas à jouer.' : 'Passe à l\'entraînement pour la mémoriser !'}</p>` : ''}
      </div>
      <p class="muted">${line.name} · coup ${Math.ceil(cur / 2)}/${Math.ceil(line.moves.length / 2)}</p>
      <div class="btn-row four">
        <button class="btn" data-a="first">⏮</button><button class="btn" data-a="prev">◀</button>
        <button class="btn primary" data-a="next">▶</button><button class="btn" data-a="last">⏭</button>
      </div>`;
  }

  side.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const lid = t.closest<HTMLElement>('[data-line]')?.dataset.line;
    if (lid) {
      line = lines.find((l) => l.id === lid)!;
      return go(0);
    }
    const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'first') go(0);
    if (a === 'prev') go(cur - 1);
    if (a === 'next') go(cur + 1);
    if (a === 'last') go(line.moves.length);
  });
  go(0);
  return () => board.destroy();
}

// ---------- b) Entraînement (avec aide) ----------
function drawTraining(el: HTMLElement, op: OpeningFile): () => void {
  const lines = trainable(op);
  let stop: (() => void) | undefined;

  function start(line: LessonLine): void {
    stop?.();
    const { boardEl, side } = playLayout(el, `
      ${lineChips(lines, line.id)}
      <div class="rv-card trainer-msg"></div>
      <div class="btn-row"><button class="btn" data-a="restart">↺ Recommencer</button></div>`);
    const msg = side.querySelector<HTMLElement>('.trainer-msg')!;
    side.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const lid = t.closest<HTMLElement>('[data-line]')?.dataset.line;
      if (lid) start(lines.find((l) => l.id === lid)!);
      if (t.closest('[data-a=restart]')) start(line);
    });
    stop = runTrainer(boardEl, {
      line,
      color: op.color,
      hints: true,
      onMessage: (html, kind) => {
        msg.innerHTML = html;
        msg.className = `rv-card trainer-msg ${kind}`;
      },
      onDone: async (errors) => {
        // ligne réussie avec au plus 1 erreur : elle entre dans les révisions
        let extra = '';
        if (errors <= 1) {
          const card = await getCard(lineCardId(op.id, line.id), 'line');
          if (!card.last) {
            grade(card, true);
            await saveCard(card);
            extra = ' Elle est ajoutée à tes révisions.';
          }
        }
        msg.innerHTML = `<b>Ligne terminée</b> avec ${errors} erreur(s).${extra}${errors > 1 ? ' Recommence pour la mémoriser.' : ''}`;
        msg.className = `rv-card trainer-msg ${errors <= 1 ? 'ok' : 'bad'}`;
      },
    });
  }
  start(lines[0]);
  return () => stop?.();
}

// ---------- c) Révision (répétition espacée, sans aide) ----------
function drawReview(el: HTMLElement, ops: OpeningFile[], _all: OpeningFile[]): () => void {
  let stop: (() => void) | undefined;
  let done = 0;
  let failed = 0;
  (async () => {
    // cartes dues pour les ouvertures demandées
    const queue: { op: OpeningFile; line: LessonLine; card: Card }[] = [];
    let next: Card | undefined;
    for (const op of ops) {
      for (const line of trainable(op)) {
        const card = await db.get<Card>('srs', lineCardId(op.id, line.id));
        if (!card) continue;
        if (isDue(card)) queue.push({ op, line, card });
        else if (!next || card.due < next.due) next = card;
      }
    }
    const nextOne = (): void => {
      stop?.();
      const item = queue.shift();
      if (!item) {
        el.innerHTML = `<div class="center"><h2>${done ? 'Révision terminée !' : 'Rien à réviser 🎉'}</h2>
          <p class="muted">${done ? `${done - failed}/${done} lignes réussies.` : 'Entraîne de nouvelles lignes pour les ajouter aux révisions.'}
          ${next ? `<br>Prochaine révision : ${dueLabel(next)}.` : ''}</p>
          <a class="btn" href="#/ouvertures">Retour au répertoire</a></div>`;
        return;
      }
      const { boardEl, side } = playLayout(el, `
        <h3>${item.op.color === 'w' ? '⚪' : '⚫'} ${item.op.name}</h3>
        <p class="muted">${item.line.name} · encore ${queue.length} après celle-ci</p>
        <div class="rv-card trainer-msg"></div>
        <div class="btn-row"><button class="btn primary" data-a="next" hidden>Suivante ▶</button></div>`);
      const msg = side.querySelector<HTMLElement>('.trainer-msg')!;
      const btn = side.querySelector<HTMLElement>('[data-a=next]')!;
      btn.onclick = nextOne;
      stop = runTrainer(boardEl, {
        line: item.line,
        color: item.op.color,
        hints: false,
        onMessage: (html, kind) => {
          msg.innerHTML = html;
          msg.className = `rv-card trainer-msg ${kind}`;
        },
        onDone: async (errors) => {
          const ok = errors === 0;
          done++;
          if (!ok) failed++;
          await saveCard(grade(item.card, ok));
          msg.innerHTML = ok ? `<b>Parfait !</b> Prochaine révision ${dueLabel(item.card)}.` : `<b>${errors} erreur(s)</b> : la ligne reviendra bientôt.`;
          msg.className = `rv-card trainer-msg ${ok ? 'ok' : 'bad'}`;
          btn.hidden = false;
        },
      });
    };
    nextOne();
  })();
  return () => stop?.();
}

// ---------- Mes lignes et notes ----------
function drawPerso(el: HTMLElement, op: OpeningFile): () => void {
  let board: Board | undefined;

  async function list(): Promise<void> {
    board?.destroy();
    board = undefined;
    const mine = (await db.getAll<UserLine>('userLines')).filter((u) => u.openingId === op.id);
    el.innerHTML = `
      <div class="page">
        <div class="cards">
          <section class="card wide">
            <h3>Mes notes sur cette ouverture</h3>
            <textarea class="input notes" placeholder="Idées, plans, erreurs à ne plus faire…">${escapeHtml(await getNote(op.id))}</textarea>
          </section>
          <section class="card wide">
            <h3>Mes lignes</h3>
            ${mine.map((u) => `<div class="stat-row"><span><b>${escapeHtml(u.line.name)}</b><br><small class="muted">${u.line.moves.map((m) => toFrench(m.san)).join(' ')}</small></span>
              <button class="btn danger" data-del="${u.id}">Supprimer</button></div>`).join('') || '<p class="muted">Aucune ligne perso.</p>'}
            <div class="btn-row"><button class="btn primary" data-a="new">＋ Nouvelle ligne</button></div>
          </section>
        </div>
      </div>`;
    const ta = el.querySelector<HTMLTextAreaElement>('.notes')!;
    let t: number | undefined;
    ta.addEventListener('input', () => {
      clearTimeout(t);
      t = window.setTimeout(() => saveNote(op.id, ta.value), 500);
    });
    el.querySelector('[data-a=new]')!.addEventListener('click', editor);
    el.querySelectorAll<HTMLElement>('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('Supprimer cette ligne ?')) return;
        await db.del('userLines', b.dataset.del!);
        await db.del('srs', lineCardId(op.id, b.dataset.del!));
        list();
      }),
    );
  }

  /** Éditeur : on joue les coups des deux camps, avec une note facultative par coup. */
  function editor(): void {
    const moves: { san: string; text?: string }[] = [];
    const { boardEl, side } = playLayout(el, `
      <h3>Nouvelle ligne</h3>
      <input class="input" name="name" placeholder="Nom de la ligne" autocomplete="off">
      <p class="muted">Joue les coups des deux camps sur l'échiquier.</p>
      <div class="rv-card edit-moves"></div>
      <input class="input" name="note" placeholder="Note sur le dernier coup (facultatif)" autocomplete="off">
      <div class="btn-row">
        <button class="btn" data-a="undo">◀ Annuler le coup</button>
        <button class="btn" data-a="cancel">Abandonner</button>
        <button class="btn primary" data-a="save">Enregistrer</button>
      </div>
      <p class="msg"></p>`);
    const note = side.querySelector<HTMLInputElement>('[name=note]')!;
    const show = () => {
      side.querySelector('.edit-moves')!.innerHTML = moves.map((m) => toFrench(m.san)).join(' ') || '<span class="muted">Aucun coup</span>';
      note.value = moves[moves.length - 1]?.text ?? '';
    };
    board = new Board(boardEl, {
      orientation: op.color === 'w' ? 'white' : 'black',
      onMove: (m) => {
        moves.push({ san: m.san });
        show();
      },
    });
    // la note s'applique au dernier coup joué
    note.addEventListener('input', () => {
      if (moves.length) moves[moves.length - 1].text = note.value || undefined;
    });
    side.addEventListener('click', async (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (a === 'undo' && moves.length) {
        moves.pop();
        board!.undo();
        show();
      }
      if (a === 'cancel') list();
      if (a === 'save') {
        const name = side.querySelector<HTMLInputElement>('[name=name]')!.value.trim();
        if (!name || moves.length < 2) return void (side.querySelector('.msg')!.textContent = 'Donne un nom et joue au moins 2 coups.');
        const id = `u${Date.now()}`;
        const rec: UserLine = { id, openingId: op.id, line: { id, name, moves, user: true } };
        await db.put('userLines', id, rec);
        op.lines.push({ ...rec.line }); // visible tout de suite dans la leçon et l'entraînement
        list();
      }
    });
    show();
  }

  list();
  return () => board?.destroy();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

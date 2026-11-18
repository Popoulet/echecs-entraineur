// Page Profil : 1er lancement (choix du site + pseudo), comptes, classements, précision, ouvertures.
import { db } from '../data/db';
import { accountId, checkUser, importPgn } from '../data/sync';
import { syncAllAndAnalyse } from '../data/startup';
import { exportBackup, importBackup } from '../data/backup';
import { accuracyStats, myAccuracy, openingStats, ratings, TIME_CLASS_FR } from '../core/stats';
import { lineChart } from '../ui/chart';
import type { Account, GameRec, Site } from '../data/types';

const SITE_FR: Record<Site, string> = { chesscom: 'Chess.com', lichess: 'Lichess', pgn: 'PGN' };
const RESULT_FR = { win: 'Victoire', loss: 'Défaite', draw: 'Nulle' };

export function render(root: HTMLElement): () => void {
  let selected = 'all'; // compte affiché ('all' = tous)
  let adding = false; // formulaire d'ajout de compte ouvert

  async function draw(): Promise<void> {
    const accounts = await db.getAll<Account>('accounts');
    if (!accounts.length || adding) return drawSetup(root, accounts.length > 0, () => ((adding = false), draw()));
    const all = await db.getAll<GameRec>('games');
    const games = selected === 'all' ? all : all.filter((g) => g.accountId === selected);
    drawProfile(accounts, games);
  }

  function drawProfile(accounts: Account[], games: GameRec[]): void {
    const r = ratings(games);
    const acc = accuracyStats(games);
    const ops = openingStats(games);
    const trend = acc.recent !== undefined && acc.previous !== undefined ? acc.recent - acc.previous : undefined;
    const recentGames = games.slice().sort((a, b) => b.date - a.date).slice(0, 10);

    root.innerHTML = `
      <div class="page">
        <div class="chips">
          ${[{ id: 'all', label: 'Tous' }, ...accounts.map((a) => ({ id: a.id, label: `${a.username} · ${SITE_FR[a.site]}` }))]
            .map((c) => `<button class="chip ${c.id === selected ? 'on' : ''}" data-acc="${c.id}">${c.label}</button>`)
            .join('')}
          <button class="chip" data-a="add">＋ Compte</button>
        </div>

        ${accounts.filter((a) => a.lastError && (selected === 'all' || selected === a.id)).map((a) => `
          <div class="card warn">⚠ Synchro ${SITE_FR[a.site]} impossible pour <b>${a.username}</b> (${a.lastError}).
            ${a.site === 'lichess' ? 'Lichess refuse parfois temporairement les téléchargements : réessaie plus tard avec « Synchroniser ». ' : ''}
            Tes parties déjà récupérées restent disponibles.</div>`).join('')}
        <div class="cards">
          <section class="card">
            <h3>Classement</h3>
            ${r.length ? r.map((x) => `
              <div class="stat-row"><span>${x.label} <small class="muted">${SITE_FR[x.site]}</small></span>
                <b>${x.rating} <small class="${x.diff >= 0 ? 'up' : 'down'}">${x.diff >= 0 ? '+' : ''}${x.diff}</small></b></div>`).join('')
              : '<p class="muted">Aucune partie.</p>'}
          </section>

          <section class="card">
            <h3>Précision moyenne</h3>
            ${acc.average !== undefined ? `
              <div class="big">${acc.average.toFixed(1)} %</div>
              <p class="muted">10 dernières : ${acc.recent!.toFixed(1)} %
                ${trend !== undefined ? `<span class="${trend >= 0 ? 'up' : 'down'}">(${trend >= 0 ? '+' : ''}${trend.toFixed(1)})</span>` : ''}
                · ${acc.series.length} parties analysées</p>
              <div class="acc-chart"></div>` : '<p class="muted">Analyse en cours… les résultats apparaîtront ici.</p>'}
          </section>

          <section class="card wide">
            <h3>Ouvertures</h3>
            <div class="op-cols">
              ${(['w', 'b'] as const).map((c) => `
                <div><h4>${c === 'w' ? '⚪ Avec les Blancs' : '⚫ Avec les Noirs'}</h4>
                  ${ops.filter((o) => o.color === c).slice(0, 8).map((o) => `
                    <div class="op-row"><span>${o.name}</span><small class="muted">${o.n} p.</small>
                      <div class="wdl" title="${o.win}V ${o.draw}N ${o.loss}D">
                        <i style="flex:${o.win}" class="w"></i><i style="flex:${o.draw}" class="d"></i><i style="flex:${o.loss}" class="l"></i>
                      </div><b>${o.winRate.toFixed(0)} %</b></div>`).join('') || '<p class="muted">—</p>'}
                </div>`).join('')}
            </div>
          </section>

          <section class="card wide">
            <h3>Dernières parties</h3>
            ${recentGames.map((g) => {
              const opp = g.myColor === 'w' ? `${g.black} (${g.blackElo ?? '?'})` : `${g.white} (${g.whiteElo ?? '?'})`;
              const a = myAccuracy(g);
              return `<div class="game-row" data-id="${g.id}">
                <span>${g.myColor === 'w' ? '⚪' : '⚫'} ${opp}</span>
                <span class="res-${g.result}">${RESULT_FR[g.result]}</span>
                <span>${a !== undefined ? a.toFixed(0) + ' %' : '<small class="muted">…</small>'}</span>
                <small class="muted">${TIME_CLASS_FR[g.timeClass] ?? g.timeClass} · ${new Date(g.date).toLocaleDateString('fr-FR')}</small>
              </div>`;
            }).join('') || '<p class="muted">Aucune partie.</p>'}
          </section>

          <section class="card wide">
            <h3>Données</h3>
            <div class="btn-row">
              <button class="btn" data-a="sync">⟳ Synchroniser</button>
              <button class="btn" data-a="pgn">Importer un PGN</button>
              <button class="btn" data-a="export">Exporter la sauvegarde</button>
              <button class="btn" data-a="restore">Importer une sauvegarde</button>
              ${selected !== 'all' ? '<button class="btn danger" data-a="remove">Retirer ce compte</button>' : ''}
            </div>
            <p class="msg muted"></p>
          </section>
        </div>
      </div>`;

    const chartBox = root.querySelector('.acc-chart');
    if (chartBox && acc.series.length > 1) {
      const vals = acc.series.slice(-40).map((s) => s.acc);
      chartBox.append(lineChart(vals, { min: Math.max(0, Math.floor(Math.min(...vals) / 10) * 10), max: 100, height: 140 }));
    }
  }

  // ---------- Actions (délégation d'événements) ----------
  const msg = (t: string) => {
    const el = root.querySelector('.msg');
    if (el) el.textContent = t;
  };

  root.addEventListener('click', async (e) => {
    const gameId = (e.target as HTMLElement).closest<HTMLElement>('.game-row')?.dataset.id;
    if (gameId) location.hash = `#/parties/${encodeURIComponent(gameId)}`;
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.acc) {
      selected = b.dataset.acc;
      return draw();
    }
    switch (b.dataset.a) {
      case 'add':
        adding = true;
        return draw();
      case 'sync':
        msg('Synchronisation…');
        return syncAllAndAnalyse().then(() => msg('Synchro terminée.'));
      case 'pgn': {
        const text = await pickFile('.pgn,text/plain,application/x-chess-pgn');
        if (text) msg(`${await importPgn(text)} partie(s) importée(s).`);
        if (text) syncAllAndAnalyse();
        return;
      }
      case 'export':
        return exportBackup().catch((err) => msg(`Échec de l'export : ${err.message ?? err}`));
      case 'restore': {
        const text = await pickFile('.json,application/json');
        if (!text) return;
        try {
          msg(`${await importBackup(text)} éléments restaurés.`);
        } catch (err) {
          msg(String((err as Error).message));
        }
        return;
      }
      case 'remove':
        if (!confirm('Retirer ce compte et ses parties de la tablette ?')) return;
        for (const g of await db.getAll<GameRec>('games')) if (g.accountId === selected) await db.del('games', g.id);
        await db.del('accounts', selected);
        selected = 'all';
        return draw();
    }
  });

  const refresh = () => draw();
  addEventListener('data-changed', refresh);
  draw();
  return () => removeEventListener('data-changed', refresh);
}

/** Formulaire du 1er lancement / ajout de compte. */
function drawSetup(root: HTMLElement, canCancel: boolean, done: () => void): void {
  let choice: 'chesscom' | 'lichess' | 'both' = 'both';
  root.innerHTML = `
    <div class="page setup">
      <h2>${canCancel ? 'Ajouter un compte' : 'Bienvenue ! Où joues-tu ?'}</h2>
      <div class="seg">
        <button class="chip" data-c="chesscom">Chess.com</button>
        <button class="chip" data-c="lichess">Lichess</button>
        <button class="chip on" data-c="both">Les deux</button>
      </div>
      <label class="f-chesscom">Pseudo Chess.com<input class="input" name="chesscom" autocomplete="off" autocapitalize="off"></label>
      <label class="f-lichess">Pseudo Lichess<input class="input" name="lichess" autocomplete="off" autocapitalize="off"></label>
      <p class="muted">Pas de mot de passe : seules les parties publiques sont lues.</p>
      <div class="btn-row">
        ${canCancel ? '<button class="btn" data-a="cancel">Annuler</button>' : '<button class="btn" data-a="pgn">J\'ai seulement un PGN</button>'}
        <button class="btn primary" data-a="ok">Commencer</button>
      </div>
      <p class="msg"></p>
    </div>`;

  const show = () => {
    root.querySelectorAll<HTMLElement>('[data-c]').forEach((b) => b.classList.toggle('on', b.dataset.c === choice));
    root.querySelector<HTMLElement>('.f-chesscom')!.hidden = choice === 'lichess';
    root.querySelector<HTMLElement>('.f-lichess')!.hidden = choice === 'chesscom';
  };
  const msg = (t: string) => (root.querySelector('.msg')!.textContent = t);

  root.querySelector('.setup')!.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    e.stopPropagation(); // ne pas déclencher les actions de la page profil
    if (b.dataset.c) {
      choice = b.dataset.c as typeof choice;
      return show();
    }
    if (b.dataset.a === 'cancel') return done();
    if (b.dataset.a === 'pgn') {
      const text = await pickFile('.pgn,text/plain,application/x-chess-pgn');
      if (!text) return;
      const n = await importPgn(text);
      if (!n) return msg('Aucune partie lisible dans ce fichier.');
      syncAllAndAnalyse();
      return done();
    }
    if (b.dataset.a !== 'ok') return;
    const sites: Site[] = choice === 'both' ? ['chesscom', 'lichess'] : [choice];
    msg('Vérification…');
    const accounts: Account[] = [];
    for (const site of sites) {
      const name = root.querySelector<HTMLInputElement>(`input[name=${site}]`)!.value.trim();
      if (!name) return msg(`Indique ton pseudo ${SITE_FR[site]}.`);
      let real: string | null;
      try {
        real = await checkUser(site, name);
      } catch {
        return msg('Pas de connexion Internet.');
      }
      if (!real) return msg(`Pseudo « ${name} » introuvable sur ${SITE_FR[site]}.`);
      accounts.push({ id: accountId(site, real), site, username: real });
    }
    for (const a of accounts) await db.put('accounts', a.id, a);
    syncAllAndAnalyse(); // en arrière-plan
    done();
  });
  show();
}

/** Ouvre le sélecteur de fichiers Android et renvoie le contenu texte (ou null). */
function pickFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) f.text().then(resolve);
      else resolve(null);
    };
    input.click();
  });
}

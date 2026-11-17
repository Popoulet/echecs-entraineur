// Point d'entrée : barre de navigation + routeur par hash (#/analyse, #/profil…).
// Ajouter une page : créer src/pages/xxx.ts avec render(root) puis l'ajouter à ROUTES.
import './style.css';
import { render as analyse } from './pages/analyse';
import { render as profil } from './pages/profil';
import { render as parties } from './pages/parties';
import { placeholder } from './pages/placeholder';
import { db } from './data/db';
import { progress } from './data/analyzer';
import { syncAllAndAnalyse, syncMessage } from './data/startup';

/** Une page reçoit son conteneur et peut renvoyer une fonction de nettoyage. */
type Page = (root: HTMLElement, param?: string) => void | (() => void);

const ROUTES: { path: string; icon: string; label: string; page: Page }[] = [
  { path: 'profil', icon: '👤', label: 'Profil', page: profil },
  { path: 'parties', icon: '📋', label: 'Parties', page: parties },
  { path: 'ouvertures', icon: '📖', label: 'Ouvertures', page: placeholder('Ouvertures') },
  { path: 'puzzles', icon: '🧩', label: 'Puzzles', page: placeholder('Puzzles') },
  { path: 'analyse', icon: '🔍', label: 'Analyse', page: analyse },
];

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <nav class="nav">
    ${ROUTES.map((r) => `<a href="#/${r.path}"><span>${r.icon}</span>${r.label}</a>`).join('')}
    <small class="muted">v${__APP_VERSION__}</small>
  </nav>
  <main class="main"></main>
  <div class="statusbar" hidden></div>`;
const main = app.querySelector<HTMLElement>('.main')!;
let cleanup: void | (() => void);

/** Affiche la page correspondant au hash courant. */
function route(): void {
  // "#/parties/lichess:abc" → page "parties", paramètre "lichess:abc"
  const [path, ...rest] = (location.hash.replace('#/', '') || 'profil').split('/');
  const param = rest.length ? decodeURIComponent(rest.join('/')) : undefined;
  const r = ROUTES.find((x) => x.path === path) ?? ROUTES[0];
  if (typeof cleanup === 'function') cleanup();
  app.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#/${r.path}`));
  // conteneur neuf à chaque page : les écouteurs de l'ancienne page disparaissent avec lui
  const page = document.createElement('div');
  page.className = 'page-root';
  main.replaceChildren(page);
  cleanup = r.page(page, param);
}

addEventListener('hashchange', route);
route();

// Barre de statut en bas à droite : synchro et progression de l'analyse de fond
const bar = app.querySelector<HTMLElement>('.statusbar')!;
addEventListener('analysis-progress', () => {
  const t = syncMessage || (progress.total ? `Analyse des parties : ${progress.done}/${progress.total}` : '');
  bar.textContent = t;
  bar.hidden = !t;
});

// À chaque ouverture : synchro + analyse (si au moins un compte existe)
db.getAll('accounts').then((a) => {
  if (a.length) syncAllAndAnalyse();
});

// Point d'entrée : barre de navigation + routeur par hash (#/analyse, #/profil…).
// Ajouter une page : créer src/pages/xxx.ts avec render(root) puis l'ajouter à ROUTES.
import './style.css';
import { render as analyse } from './pages/analyse';
import { placeholder } from './pages/placeholder';

/** Une page reçoit son conteneur et peut renvoyer une fonction de nettoyage. */
type Page = (root: HTMLElement) => void | (() => void);

const ROUTES: { path: string; icon: string; label: string; page: Page }[] = [
  { path: 'profil', icon: '👤', label: 'Profil', page: placeholder('Profil') },
  { path: 'parties', icon: '📋', label: 'Parties', page: placeholder('Revue de partie') },
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
  <main class="main"></main>`;
const main = app.querySelector<HTMLElement>('.main')!;
let cleanup: void | (() => void);

/** Affiche la page correspondant au hash courant. */
function route(): void {
  const path = location.hash.replace('#/', '') || 'analyse';
  const r = ROUTES.find((x) => x.path === path) ?? ROUTES[ROUTES.length - 1];
  if (typeof cleanup === 'function') cleanup();
  app.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#/${r.path}`));
  main.innerHTML = '';
  cleanup = r.page(main);
}

addEventListener('hashchange', route);
route();

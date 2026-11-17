// Point d'entrée de l'appli. Pour l'instant : écran d'accueil minimal (squelette).
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;

/** Affiche l'écran d'accueil avec l'orientation courante (test paysage/portrait). */
function render(): void {
  const orientation = innerWidth > innerHeight ? 'paysage' : 'portrait';
  app.innerHTML = `
    <h1>♞ Échecs Entraîneur</h1>
    <p class="muted">Squelette v${__APP_VERSION__} — ${innerWidth}×${innerHeight} (${orientation})</p>
    <button class="btn" id="tap">Toucher pour tester</button>
    <p id="out" class="muted"></p>`;
  let n = 0;
  app.querySelector('#tap')!.addEventListener('pointerup', (e) => {
    const type = (e as PointerEvent).pointerType; // "touch", "pen" (stylet) ou "mouse"
    app.querySelector('#out')!.textContent = `Touché ${++n} fois (${type})`;
  });
}

addEventListener('resize', render);
render();

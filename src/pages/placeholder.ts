// Page provisoire pour les sections pas encore développées.
export function placeholder(title: string) {
  return (root: HTMLElement): void => {
    root.innerHTML = `<div class="center"><h2>${title}</h2><p class="muted">Bientôt disponible.</p></div>`;
  };
}

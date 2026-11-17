// Choix de la pièce de promotion : 4 gros boutons par-dessus l'échiquier.
type Promo = 'q' | 'r' | 'b' | 'n';

export function askPromotion(boardEl: HTMLElement, color: 'white' | 'black'): Promise<Promo> {
  return new Promise((resolve) => {
    const o = document.createElement('div');
    o.className = 'promo';
    const pieces: [Promo, string][] = [['q', 'queen'], ['r', 'rook'], ['b', 'bishop'], ['n', 'knight']];
    for (const [p, role] of pieces) {
      const b = document.createElement('button');
      // réutilise les images de pièces de chessground (classes CSS)
      b.innerHTML = `<piece class="${role} ${color}"></piece>`;
      b.onclick = () => {
        o.remove();
        resolve(p);
      };
      o.append(b);
    }
    boardEl.append(o);
  });
}

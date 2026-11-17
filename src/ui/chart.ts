// Graphique en courbe minimal (SVG), cliquable au doigt. Réutilisé pour le graphique d'évaluation.

export interface ChartOptions {
  min: number;
  max: number;
  height?: number; // px
  mid?: number; // ligne horizontale de référence (ex. 50 %)
  area?: boolean; // remplissage sous la courbe (style graphique d'éval)
  onPick?: (index: number) => void; // toucher → index du point le plus proche
  marker?: number; // index du point mis en évidence
}

export function lineChart(values: number[], o: ChartOptions): SVGSVGElement {
  const W = 1000;
  const H = o.height ?? 160;
  const n = values.length;
  const x = (i: number) => (n <= 1 ? W / 2 : (i * W) / (n - 1));
  const y = (v: number) => H - ((Math.max(o.min, Math.min(o.max, v)) - o.min) / (o.max - o.min)) * H;
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.classList.add('chart');
  svg.style.height = `${H}px`;
  svg.innerHTML = `
    ${o.area ? `<polygon points="0,${H} ${pts} ${W},${H}" fill="#f0f0f0"/>` : ''}
    ${o.mid !== undefined ? `<line x1="0" x2="${W}" y1="${y(o.mid)}" y2="${y(o.mid)}" stroke="#777" stroke-dasharray="6 6" vector-effect="non-scaling-stroke"/>` : ''}
    ${o.area ? '' : `<polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="3" vector-effect="non-scaling-stroke"/>`}
    ${o.marker !== undefined ? `<line x1="${x(o.marker)}" x2="${x(o.marker)}" y1="0" y2="${H}" stroke="var(--accent)" stroke-width="3" vector-effect="non-scaling-stroke"/>` : ''}`;

  if (o.onPick && n) {
    // le doigt peut glisser sur le graphique pour parcourir les coups
    const pick = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      o.onPick!(Math.round(((e.clientX - r.left) / r.width) * (n - 1)));
    };
    svg.addEventListener('pointerdown', (e) => {
      svg.setPointerCapture(e.pointerId);
      pick(e);
    });
    svg.addEventListener('pointermove', (e) => e.buttons && pick(e));
  }
  return svg;
}

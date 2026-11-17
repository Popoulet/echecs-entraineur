// Usage (Node 20+) : npx esbuild scripts/review-test.ts --bundle --platform=node --format=esm --outfile=rt.mjs && node rt.mjs <pseudo_lichess>
// Test hors appli : analyse une vraie partie Lichess avec Stockfish (processus Node) puis affiche la revue.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { Chess } from 'chess.js';
import { buildReview, CATEGORIES } from '../src/core/review';
import { gameAccuracy } from '../src/core/accuracy';
import type { GameRec, PosEval } from '../src/data/types';

const sf = spawn(process.execPath, ['node_modules/stockfish/bin/stockfish-18-lite-single.js']);
const rl = createInterface({ input: sf.stdout });
const lines: string[] = [];
rl.on("line", (l: string) => { lines.push(l); });
const send = (c: string) => sf.stdin.write(c + '\n');
async function waitFor(prefix: string): Promise<void> {
  while (!lines.some((l) => l.startsWith(prefix))) await new Promise((r) => setTimeout(r, 10));
}
async function evalFen(fen: string): Promise<PosEval> {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { cp: c.turn() === 'w' ? -10000 : 10000 };
  if (c.isGameOver()) return { cp: 0 };
  lines.length = 0;
  send(`position fen ${fen}`); send('go depth 12');
  await waitFor('bestmove');
  const info = lines.filter((l) => l.includes(' pv ') && !l.includes('bound')).pop()!;
  const t = info.split(' '); const sign = fen.split(' ')[1] === 'w' ? 1 : -1;
  const kind = t[t.indexOf('score') + 1]; const v = Number(t[t.indexOf('score') + 2]) * sign;
  return { cp: kind === 'cp' ? v : undefined, mate: kind === 'mate' ? v : undefined,
    best: lines.find((l) => l.startsWith('bestmove'))!.split(' ')[1], pv: t.slice(t.indexOf('pv') + 1, t.indexOf('pv') + 9) };
}
send('uci'); send('isready'); await waitFor('readyok');
const user = process.argv[2] ?? 'thibault';
const r = await fetch(`https://lichess.org/api/games/user/${user}?max=1&opening=true&perfType=blitz,rapid`, { headers: { Accept: 'application/x-ndjson' } });
const j = JSON.parse((await r.text()).split('\n')[0]);
const moves = j.moves.split(' ');
const g: GameRec = { id: 'x', accountId: 'x', site: 'lichess', white: j.players.white.user.name, black: j.players.black.user.name,
  myColor: j.players.white.user.name.toLowerCase() === user.toLowerCase() ? 'w' : 'b', result: 'draw', date: 0, timeClass: j.speed,
  opening: j.opening?.name ?? '?', moves };
const c = new Chess(); const evals = [await evalFen(c.fen())];
for (const m of moves) { c.move(m); evals.push(await evalFen(c.fen())); }
g.evals = evals; g.accuracy = gameAccuracy(evals);
const rv = buildReview(g)!;
console.log(`${g.white} - ${g.black} | ${g.opening} | précision B ${g.accuracy.w.toFixed(1)} / N ${g.accuracy.b.toFixed(1)}`);
for (const m of rv.moves) if (!['meilleur', 'excellent', 'bon'].includes(m.category))
  console.log(`${m.label} ${m.san} [${CATEGORIES[m.category].label}] perte ${m.loss.toFixed(1)} {${m.themes.join(", ")}} — ${m.explanation.join(" ")}`);
console.log('Moments clés :', rv.keyMoments.map((m) => m.label + ' ' + m.san).join(', '));
console.log('Phases :', JSON.stringify(rv.phaseAccuracy), '→ plus faible :', rv.weakestPhase);
send('quit'); sf.kill();

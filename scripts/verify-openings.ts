// Vérifie les lignes d'ouvertures avec Stockfish (Node 20+) : légalité + perte de chaque coup.
// Usage : npx esbuild scripts/verify-openings.ts --bundle --platform=node --format=esm --outfile=vo.mjs && node vo.mjs [fichier.json]
// Sans argument : vérifie src/openings/*.json. Coups "à moi" perdant > 60 cp signalés ⚠.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readdirSync, readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { resolveLines, type OpeningFile } from '../src/core/openings';

const DEPTH = Number(process.env.DEPTH ?? 16);
const sf = spawn(process.execPath, ['node_modules/stockfish/bin/stockfish-18-lite-single.js']);
const out: string[] = [];
createInterface({ input: sf.stdout }).on('line', (l: string) => out.push(l));
const send = (c: string) => sf.stdin.write(c + '\n');
const wait = async (p: string) => { while (!out.some((l) => l.startsWith(p))) await new Promise((r) => setTimeout(r, 5)); };

/** Évaluation (cp, point de vue du camp au trait) ; mat = ±10000. */
async function evalCp(fen: string): Promise<{ cp: number; best: string }> {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { cp: -10000, best: '' };
  if (c.isGameOver()) return { cp: 0, best: '' };
  out.length = 0;
  send(`position fen ${fen}`); send(`go depth ${DEPTH}`);
  await wait('bestmove');
  const info = out.filter((l) => l.includes(' pv ') && !l.includes('bound')).pop()!;
  const t = info.split(' ');
  const kind = t[t.indexOf('score') + 1]; const v = Number(t[t.indexOf('score') + 2]);
  return { cp: kind === 'mate' ? (v > 0 ? 10000 : -10000) : v, best: out.find((l) => l.startsWith('bestmove'))!.split(' ')[1] };
}

send('uci'); send('isready'); await wait('readyok');
const files = process.argv[2] ? [process.argv[2]] : readdirSync('src/openings').filter((f) => f.endsWith('.json')).map((f) => `src/openings/${f}`);
let problems = 0;
for (const f of files) {
  const op: OpeningFile = JSON.parse(readFileSync(f, 'utf8'));
  console.log(`\n=== ${op.name} (${op.color === 'w' ? 'Blancs' : 'Noirs'})`);
  for (const line of resolveLines(op)) {
    const c = new Chess();
    const notes: string[] = [];
    for (const [i, m] of line.moves.entries()) {
      const before = c.fen();
      const mine = c.turn() === op.color;
      const e0 = await evalCp(before);
      let mv;
      try { mv = c.move(m.san); } catch { notes.push(`❌ coup illégal ${i + 1}: ${m.san}`); problems++; break; }
      const e1 = await evalCp(c.fen());
      const loss = e0.cp + e1.cp; // e1 est du point de vue adverse
      if (mine && loss > 60) { notes.push(`⚠ ${i + 1}.${mv.san} perd ${loss} cp (meilleur ${e0.best})`); if (!line.trap) problems++; }
      else if (!mine && loss > 120) notes.push(`· adv ${i + 1}.${mv.san} perd ${loss} cp`);
    }
    const fin = await evalCp(c.fen());
    const finW = c.turn() === 'w' ? fin.cp : -fin.cp;
    console.log(`- ${line.name}${line.trap ? ' [piège]' : ''} : ${line.moves.length} demi-coups, éval finale ${(finW / 100).toFixed(2)} (Blancs)`);
    for (const n of notes) console.log('   ' + n);
  }
}
console.log(`\n${problems} problème(s).`);
send('quit'); sf.kill();

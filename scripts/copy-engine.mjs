// Copie Stockfish (version légère mono-thread, ~7 Mo) de node_modules vers public/stockfish/
// pour qu'il soit servi tel quel par Vite et embarqué dans l'APK. Lancé avant dev/build.
import { mkdirSync, copyFileSync } from 'node:fs';

const src = 'node_modules/stockfish/bin/';
const dst = 'public/stockfish/';
mkdirSync(dst, { recursive: true });
for (const f of ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm']) copyFileSync(src + f, dst + f);
console.log('Stockfish copié dans', dst);

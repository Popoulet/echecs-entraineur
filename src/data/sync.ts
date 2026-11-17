// Synchronisation des parties via les API publiques (sans mot de passe) + import PGN.
import { Chess } from 'chess.js';
import { db, notifyChange } from './db';
import type { Account, Color, GameRec, Site } from './types';

const FIRST_SYNC_MAX = 100; // nombre de parties récupérées au premier lancement

export function accountId(site: Site, username: string): string {
  return `${site}:${username.toLowerCase()}`;
}

/** Vérifie qu'un pseudo existe ; renvoie la casse officielle ou null. */
export async function checkUser(site: Site, username: string): Promise<string | null> {
  const url =
    site === 'lichess'
      ? `https://lichess.org/api/user/${encodeURIComponent(username)}`
      : `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  return site === 'lichess' ? j.username : (j.url?.split('/').pop() ?? username);
}

/** Récupère les nouvelles parties d'un compte. Renvoie le nombre de parties ajoutées. */
export async function syncAccount(acc: Account): Promise<number> {
  const games = acc.site === 'lichess' ? await fetchLichess(acc) : await fetchChessCom(acc);
  const known = new Set(await db.keys('games'));
  let added = 0;
  for (const g of games) {
    if (known.has(g.id)) continue;
    await db.put('games', g.id, g);
    added++;
  }
  if (games.length) acc.lastSync = Math.max(acc.lastSync ?? 0, ...games.map((g) => g.date));
  await db.put('accounts', acc.id, acc);
  if (added) notifyChange();
  return added;
}

// ---------- Lichess : un flux NDJSON (une partie JSON par ligne) ----------
async function fetchLichess(acc: Account): Promise<GameRec[]> {
  const p = new URLSearchParams({ pgnInJson: 'false', opening: 'true', clocks: 'false', evals: 'false' });
  p.set('perfType', 'ultraBullet,bullet,blitz,rapid,classical,correspondence'); // échecs standard uniquement
  if (acc.lastSync) p.set('since', String(acc.lastSync + 1));
  else p.set('max', String(FIRST_SYNC_MAX));
  const r = await fetch(`https://lichess.org/api/games/user/${acc.username}?${p}`, {
    headers: { Accept: 'application/x-ndjson' },
  });
  if (!r.ok) throw new Error(`Lichess : erreur ${r.status}`);
  const lines = (await r.text()).split('\n').filter(Boolean);
  const out: GameRec[] = [];
  for (const l of lines) {
    const j = JSON.parse(l);
    if (j.variant !== 'standard' && j.variant !== 'fromPosition') continue;
    const white = j.players.white.user?.name ?? 'IA';
    const black = j.players.black.user?.name ?? 'IA';
    const myColor: Color = white.toLowerCase() === acc.username.toLowerCase() ? 'w' : 'b';
    out.push({
      id: `lichess:${j.id}`,
      accountId: acc.id,
      site: 'lichess',
      url: `https://lichess.org/${j.id}`,
      white,
      black,
      whiteElo: j.players.white.rating,
      blackElo: j.players.black.rating,
      myColor,
      result: !j.winner ? 'draw' : j.winner[0] === myColor ? 'win' : 'loss',
      date: j.lastMoveAt ?? j.createdAt,
      timeClass: j.speed,
      opening: j.opening?.name ?? '?',
      eco: j.opening?.eco,
      startFen: j.initialFen,
      moves: (j.moves ?? '').split(' ').filter(Boolean),
    });
  }
  return out;
}

// ---------- Chess.com : archives mensuelles ----------
async function fetchChessCom(acc: Account): Promise<GameRec[]> {
  const user = acc.username.toLowerCase();
  const r = await fetch(`https://api.chess.com/pub/player/${user}/games/archives`);
  if (!r.ok) throw new Error(`Chess.com : erreur ${r.status}`);
  const archives: string[] = (await r.json()).archives ?? [];
  // archives de la plus récente à la plus ancienne, jusqu'à avoir assez de parties
  const out: GameRec[] = [];
  for (const url of archives.slice().reverse()) {
    const month = await (await fetch(url)).json();
    const games = (month.games ?? []).filter((g: any) => g.rules === 'chess');
    let older = false;
    for (const g of games.reverse()) {
      if (acc.lastSync && g.end_time * 1000 <= acc.lastSync) {
        older = true;
        continue;
      }
      const rec = chessComGame(g, acc);
      if (rec) out.push(rec);
    }
    if (older || (!acc.lastSync && out.length >= FIRST_SYNC_MAX) || out.length >= 500) break;
  }
  return acc.lastSync ? out : out.slice(0, FIRST_SYNC_MAX);
}

const CC_DRAWS = ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'];

function chessComGame(g: any, acc: Account): GameRec | null {
  const parsed = parsePgn(g.pgn);
  if (!parsed) return null;
  const myColor: Color = g.white.username.toLowerCase() === acc.username.toLowerCase() ? 'w' : 'b';
  const me = myColor === 'w' ? g.white : g.black;
  const ecoUrl: string = parsed.headers.ECOUrl ?? '';
  return {
    id: `chesscom:${g.url.split('/').pop()}`,
    accountId: acc.id,
    site: 'chesscom',
    url: g.url,
    white: g.white.username,
    black: g.black.username,
    whiteElo: g.white.rating,
    blackElo: g.black.rating,
    myColor,
    result: me.result === 'win' ? 'win' : CC_DRAWS.includes(me.result) ? 'draw' : 'loss',
    date: g.end_time * 1000,
    timeClass: g.time_class,
    // "https://www.chess.com/openings/Italian-Game-Two-Knights…" → "Italian Game Two Knights…"
    opening: ecoUrl ? decodeURIComponent(ecoUrl.split('/').pop()!).replace(/-/g, ' ') : '?',
    eco: parsed.headers.ECO,
    startFen: parsed.headers.FEN,
    moves: parsed.moves,
  };
}

// ---------- PGN ----------
/** Lit un PGN (une partie) : en-têtes + coups SAN. */
export function parsePgn(pgn: string): { headers: Record<string, string>; moves: string[] } | null {
  try {
    const g = new Chess();
    g.loadPgn(pgn);
    return { headers: g.getHeaders() as Record<string, string>, moves: g.history() };
  } catch {
    return null;
  }
}

/** Import manuel d'un fichier PGN (une ou plusieurs parties). Renvoie le nombre de parties ajoutées. */
export async function importPgn(text: string): Promise<number> {
  const accounts = await db.getAll<Account>('accounts');
  const names = accounts.map((a) => a.username.toLowerCase());
  // une partie = en-têtes, ligne vide, coups ; la suivante commence après une ligne vide par "["
  // (entre en-têtes et coups, la ligne vide est suivie de "1." et non de "[", donc pas de coupure)
  const pgns = text.replace(/\r/g, '').split(/\n\s*\n(?=\s*\[)/).filter((c) => c.trim());
  let added = 0;
  for (const pgn of pgns) {
    const p = parsePgn(pgn);
    if (!p || !p.moves.length) continue;
    const h = p.headers;
    const myColor: Color = names.includes((h.Black ?? '').toLowerCase()) ? 'b' : 'w';
    const res = h.Result === '1/2-1/2' ? 'draw' : (h.Result === '1-0') === (myColor === 'w') ? 'win' : 'loss';
    const id = `pgn:${hash(pgn)}`;
    const rec: GameRec = {
      id,
      accountId: 'pgn',
      site: 'pgn',
      white: h.White ?? '?',
      black: h.Black ?? '?',
      whiteElo: Number(h.WhiteElo) || undefined,
      blackElo: Number(h.BlackElo) || undefined,
      myColor,
      result: h.Result === '*' ? 'draw' : res,
      date: Date.parse((h.UTCDate ?? h.Date ?? '').replace(/\./g, '-')) || Date.now(),
      timeClass: 'pgn',
      opening: h.Opening ?? h.ECOUrl?.split('/').pop()?.replace(/-/g, ' ') ?? '?',
      eco: h.ECO,
      startFen: h.FEN,
      moves: p.moves,
    };
    if (!(await db.get('games', id))) {
      await db.put('games', id, rec);
      added++;
    }
  }
  if (added && !accounts.some((a) => a.id === 'pgn')) {
    // compte fictif pour regrouper les parties importées dans le profil
    await db.put('accounts', 'pgn', { id: 'pgn', site: 'pgn', username: 'Import PGN' } satisfies Account);
  }
  if (added) notifyChange();
  return added;
}

/** Petit hachage de chaîne (identifiant stable pour les PGN importés). */
function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

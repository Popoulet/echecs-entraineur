// Moteur Stockfish (WASM mono-thread) dans un Web Worker.
// - Une seule instance pour toute l'appli, analyses mises en file d'attente.
// - Priorité "live" (ce que l'utilisateur regarde) > "background" (analyse des parties).
// - Mise en pause quand l'appli passe en arrière-plan (économie de batterie).

export interface EngineLine {
  multipv: number;
  cp?: number; // centipions, point de vue des Blancs
  mate?: number; // mat en N (positif = les Blancs matent), point de vue des Blancs
  pv: string[]; // coups UCI, ex. "e2e4"
}

export interface Analysis {
  fen: string;
  depth: number;
  lines: EngineLine[]; // triées par multipv
  bestmove?: string;
}

export interface AnalyseOptions {
  depth?: number; // profondeur max (défaut 14)
  movetime?: number; // ou temps max en ms
  multiPv?: number; // nombre de variantes (défaut 1)
  priority?: 'live' | 'background';
  onInfo?: (a: Analysis) => void; // appelé à chaque profondeur terminée
}

interface Job {
  fen: string;
  opts: AnalyseOptions;
  resolve: (a: Analysis) => void;
  partial: Analysis;
  aborted?: boolean;
}

const ENGINE_URL = 'stockfish/stockfish-18-lite-single.js';

class Engine {
  private worker?: Worker;
  private ready?: Promise<void>;
  private queue: Job[] = [];
  private current?: Job;
  private paused = false;
  private searching = false; // une commande "go" est en cours
  private lastOutput = 0; // dernière ligne de recherche (info/bestmove) reçue du moteur (ms)
  private poke?: number; // relance de la file de commandes de Stockfish.js

  constructor() {
    // Pause/reprise : "pause"/"resume" sont émis par Capacitor, visibilitychange par le navigateur
    const pause = () => this.setPaused(true);
    const resume = () => this.setPaused(false);
    document.addEventListener('pause', pause);
    document.addEventListener('resume', resume);
    document.addEventListener('visibilitychange', () => (document.hidden ? pause() : resume()));
    // chien de garde : une recherche sans aucune sortie pendant 8 s = moteur bloqué → redémarrage
    window.setInterval(() => {
      if (this.searching && Date.now() - this.lastOutput > 8000) this.restart();
    }, 3000);
  }

  /** Redémarre le worker (bloqué ou tué par Android) et relance l'analyse en cours. */
  private restart(): void {
    console.warn('Moteur bloqué : redémarrage');
    this.worker?.terminate();
    this.worker = undefined;
    this.ready = undefined;
    this.searching = false;
    clearInterval(this.poke);
    const job = this.current;
    this.current = undefined;
    if (job) {
      if (job.aborted) job.resolve(job.partial);
      else this.queue.unshift({ ...job, partial: { fen: job.fen, depth: 0, lines: [] } });
    }
    this.pump();
  }

  /** Démarre le worker au premier besoin (chargement ~7 Mo). */
  private start(): Promise<void> {
    if (this.ready) return this.ready;
    this.worker = new Worker(new URL(ENGINE_URL, document.baseURI));
    this.worker.onmessage = (e) => this.onLine(String(e.data));
    this.worker.onerror = (e) => {
      console.warn('Erreur du moteur', e.message);
      this.restart();
    };
    this.ready = new Promise((res) => {
      const wait = (e: MessageEvent) => {
        if (String(e.data) === 'readyok') {
          this.worker!.removeEventListener('message', wait);
          res();
        }
      };
      this.worker!.addEventListener('message', wait);
    });
    this.send('uci');
    this.send('setoption name Threads value 1');
    this.send('setoption name Hash value 32');
    this.send('isready');
    return this.ready;
  }

  private send(cmd: string): void {
    this.worker?.postMessage(cmd);
  }

  /** Analyse une position. La promesse renvoie le résultat final (ou partiel si interrompu). */
  analyse(fen: string, opts: AnalyseOptions = {}): Promise<Analysis> {
    return new Promise((resolve) => {
      const job: Job = { fen, opts, resolve, partial: { fen, depth: 0, lines: [] } };
      if (opts.priority === 'live') {
        // l'utilisateur interagit : l'appli est forcément visible (au cas où "resume" n'aurait pas été reçu)
        if (!document.hidden) this.paused = false;
        // une nouvelle analyse "live" remplace la précédente
        this.queue = this.queue.filter((j) => {
          if (j.opts.priority !== 'live') return true;
          j.resolve(j.partial);
          return false;
        });
        if (this.current?.opts.priority === 'live') this.abortCurrent();
        else if (this.current) this.interruptCurrent(); // l'analyse de fond reprendra après
        this.queue.unshift(job);
      } else {
        this.queue.push(job);
      }
      this.pump();
    });
  }

  /** Annule les analyses "live" (ex. on quitte la page). */
  stopLive(): void {
    this.queue = this.queue.filter((j) => j.opts.priority !== 'live' || (j.resolve(j.partial), false));
    if (this.current?.opts.priority === 'live') this.abortCurrent();
  }

  /** Nombre d'analyses en attente (pour afficher la progression). */
  get pending(): number {
    return this.queue.length + (this.current ? 1 : 0);
  }

  private abortCurrent(): void {
    if (!this.current) return;
    this.current.aborted = true;
    // si la recherche a démarré, le "bestmove" qui suit "stop" terminera le job ;
    // sinon (moteur en chargement) pump() le terminera après le chargement
    if (this.searching) this.send('stop');
  }

  private finish(job: Job): void {
    job.resolve(job.partial);
    this.current = undefined;
    this.searching = false;
    clearInterval(this.poke);
    // petit délai : laisse Stockfish.js finir sa recherche avant de recevoir la suivante
    setTimeout(() => this.pump(), 20);
  }

  /** Interrompt le job courant et le remet en tête de file (il sera relancé de zéro). */
  private interruptCurrent(): void {
    const job = this.current;
    if (!job) return;
    this.abortCurrent();
    const copy: Job = { ...job, aborted: false, partial: { fen: job.fen, depth: 0, lines: [] } };
    job.resolve = () => {}; // l'ancien job ne doit pas résoudre la promesse
    this.queue.unshift(copy);
  }

  private setPaused(p: boolean): void {
    if (this.paused === p) return;
    this.paused = p;
    if (p) this.interruptCurrent();
    else this.pump();
  }

  private async pump(): Promise<void> {
    if (this.current || this.paused || !this.queue.length) return;
    const job = this.queue.shift()!;
    this.current = job;
    await this.start();
    if (job.aborted) return this.finish(job); // annulé pendant le chargement
    const { depth = 14, movetime, multiPv = 1 } = job.opts;
    this.send(`setoption name MultiPV value ${multiPv}`);
    this.send(`position fen ${job.fen}`);
    this.send(movetime ? `go movetime ${movetime}` : `go depth ${depth}`);
    this.searching = true;
    this.lastOutput = Date.now();
    // Stockfish.js garde "go" en file d'attente s'il se croit encore occupé, et ne vide cette file
    // qu'à la fin d'une recherche : sur appareil lent, le "go" peut rester bloqué. Toute commande
    // reçue relance la file, donc on envoie "isready" (sans effet) tant que la recherche n'a pas démarré.
    let started = false;
    const first = this.lastOutput;
    clearInterval(this.poke);
    this.poke = window.setInterval(() => {
      if (this.current !== job || started) return clearInterval(this.poke);
      if (this.lastOutput > first) started = true;
      else this.send('isready');
    }, 300);
  }

  /** Traite une ligne envoyée par Stockfish. */
  private onLine(line: string): void {
    if (line.startsWith('info') || line.startsWith('bestmove')) this.lastOutput = Date.now(); // pas "readyok"
    const job = this.current;
    if (!job) return;
    if (line.startsWith('info') && line.includes(' pv ') && !line.includes('bound')) {
      const l = parseInfo(line, job.fen);
      if (!l) return;
      const a = job.partial;
      a.lines[l.multipv - 1] = l.line;
      // une profondeur est "terminée" quand la dernière variante multipv arrive
      if (l.multipv === (job.opts.multiPv ?? 1)) {
        a.depth = l.depth;
        if (!job.aborted) job.opts.onInfo?.({ ...a, lines: a.lines.slice() });
      }
    } else if (line.startsWith('bestmove')) {
      job.partial.bestmove = line.split(' ')[1];
      this.finish(job);
    }
  }
}

/** Extrait profondeur, score et variante d'une ligne "info". Score converti au point de vue des Blancs. */
function parseInfo(line: string, fen: string): { depth: number; multipv: number; line: EngineLine } | null {
  const t = line.split(' ');
  const get = (k: string) => t[t.indexOf(k) + 1];
  if (!t.includes('score')) return null;
  const sign = fen.split(' ')[1] === 'w' ? 1 : -1;
  const multipv = t.includes('multipv') ? Number(get('multipv')) : 1;
  const kind = t[t.indexOf('score') + 1];
  const val = Number(t[t.indexOf('score') + 2]) * sign;
  return {
    depth: Number(get('depth')),
    multipv,
    line: {
      multipv,
      cp: kind === 'cp' ? val : undefined,
      mate: kind === 'mate' ? val : undefined,
      pv: t.slice(t.indexOf('pv') + 1),
    },
  };
}

export const engine = new Engine();

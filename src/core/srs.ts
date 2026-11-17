// Répétition espacée (version simplifiée de SM-2), commune aux ouvertures et aux puzzles.

export interface Card {
  id: string; // "line:italienne:pianissimo", "puzzle:lichess:abc:23"
  kind: 'line' | 'puzzle';
  due: number; // ms : prochaine révision
  interval: number; // jours
  ease: number; // multiplicateur d'intervalle
  reps: number; // réussites d'affilée
  lapses: number; // échecs au total
  last?: number; // dernière révision (ms)
}

const DAY = 86400e3;

export function newCard(id: string, kind: Card['kind']): Card {
  return { id, kind, due: Date.now(), interval: 0, ease: 2.5, reps: 0, lapses: 0 };
}

/** Met à jour une carte après une révision réussie (ok) ou ratée. */
export function grade(c: Card, ok: boolean): Card {
  const now = Date.now();
  if (ok) {
    c.reps++;
    c.interval = c.reps === 1 ? 1 : c.reps === 2 ? 3 : Math.round(c.interval * c.ease);
    c.ease = Math.min(3, c.ease + 0.05);
    c.due = now + c.interval * DAY;
  } else {
    c.reps = 0;
    c.lapses++;
    c.interval = 0;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.due = now + 10 * 60e3; // à revoir dans 10 minutes
  }
  c.last = now;
  return c;
}

export const isDue = (c: Card) => c.due <= Date.now();
export const isMastered = (c: Card) => c.interval >= 7; // intervalle d'au moins une semaine

/** "aujourd'hui", "demain", "dans 5 j" */
export function dueLabel(c: Card): string {
  const d = Math.ceil((c.due - Date.now()) / DAY);
  return d <= 0 ? "aujourd'hui" : d === 1 ? 'demain' : `dans ${d} j`;
}

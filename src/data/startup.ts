// À chaque ouverture : synchro de tous les comptes puis analyse en arrière-plan.
import { db } from './db';
import { syncAccount } from './sync';
import { runBackgroundAnalysis } from './analyzer';
import type { Account } from './types';

/** Message de synchro affiché dans la barre de statut ('' = rien). */
export let syncMessage = '';

function setMessage(m: string): void {
  syncMessage = m;
  dispatchEvent(new Event('analysis-progress'));
}

export async function syncAllAndAnalyse(): Promise<void> {
  const accounts = (await db.getAll<Account>('accounts')).filter((a) => a.site !== 'pgn'); // le compte "Import PGN" ne se synchronise pas
  let added = 0;
  for (const acc of accounts) {
    setMessage(`Synchro ${acc.username}…`);
    try {
      added += await syncAccount(acc);
    } catch (e) {
      console.warn(e);
      setMessage(navigator.onLine ? `Erreur de synchro (${acc.username})` : 'Hors ligne : pas de synchro');
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  setMessage(added ? `${added} nouvelle(s) partie(s)` : '');
  if (added) setTimeout(() => setMessage(''), 4000);
  runBackgroundAnalysis();
}

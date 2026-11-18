// À chaque ouverture : synchro de tous les comptes puis analyse en arrière-plan.
import { db, notifyChange } from './db';
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
  const failed: string[] = [];
  for (const acc of accounts) {
    setMessage(`Synchro ${acc.username}…`);
    try {
      added += await syncAccount(acc);
    } catch (e) {
      console.warn(e);
      // l'erreur reste affichée dans le profil jusqu'à la prochaine synchro réussie
      acc.lastError = navigator.onLine ? `${(e as Error).message ?? e}` : 'hors ligne';
      await db.put('accounts', acc.id, acc);
      failed.push(acc.username);
      notifyChange();
    }
  }
  setMessage(failed.length ? `⚠ Synchro impossible : ${failed.join(', ')}` : added ? `${added} nouvelle(s) partie(s)` : '');
  if (added || failed.length) setTimeout(() => setMessage(''), 6000);
  runBackgroundAnalysis();
}

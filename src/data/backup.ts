// Sauvegarde : export de toute la base en JSON (feuille de partage Android) et réimport.
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { STORES, db, notifyChange } from './db';

/** Exporte toutes les données dans un fichier JSON et ouvre le menu de partage. */
export async function exportBackup(): Promise<void> {
  const data: Record<string, Record<string, unknown>> = {};
  for (const s of STORES) {
    const keys = await db.keys(s);
    data[s] = {};
    for (const k of keys) data[s][k] = await db.get(s, k);
  }
  const json = JSON.stringify({ app: 'echecs', version: 1, date: Date.now(), data });
  const name = `echecs-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;

  if (Capacitor.isNativePlatform()) {
    // Android : fichier temporaire puis partage (Drive, Fichiers, e-mail…)
    const f = await Filesystem.writeFile({ path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: 'Sauvegarde échecs', files: [f.uri] });
  } else {
    // navigateur (développement) : téléchargement classique
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = name;
    a.click();
  }
}

/** Réimporte une sauvegarde (fusion : écrase les éléments de même clé). Renvoie le nombre d'éléments. */
export async function importBackup(text: string): Promise<number> {
  const j = JSON.parse(text);
  if (j.app !== 'echecs' || !j.data) throw new Error('Fichier de sauvegarde invalide');
  let n = 0;
  for (const s of STORES) {
    for (const [k, v] of Object.entries(j.data[s] ?? {})) {
      await db.put(s, k, v);
      n++;
    }
  }
  notifyChange();
  return n;
}

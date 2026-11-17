// Chargement des ouvertures : fichiers JSON intégrés + lignes et notes ajoutées par l'utilisateur.
import { db } from './db';
import { newCard, type Card } from '../core/srs';
import type { LessonLine, OpeningFile } from '../core/openings';

// Tous les fichiers src/openings/*.json sont inclus automatiquement dans l'appli
const FILES = import.meta.glob('../openings/*.json', { eager: true, import: 'default' }) as Record<string, OpeningFile>;

export interface UserLine {
  id: string;
  openingId: string;
  line: LessonLine;
}

/** Ouvertures avec les lignes de l'utilisateur ajoutées à la fin. */
export async function loadOpenings(): Promise<OpeningFile[]> {
  const user = await db.getAll<UserLine>('userLines');
  return Object.values(FILES)
    .map((op) => ({ ...op, lines: [...op.lines, ...user.filter((u) => u.openingId === op.id).map((u) => ({ ...u.line, user: true }))] }))
    .sort((a, b) => (a.color === b.color ? a.name.localeCompare(b.name) : a.color === 'w' ? -1 : 1));
}

export const lineCardId = (openingId: string, lineId: string) => `line:${openingId}:${lineId}`;

export async function getCard(id: string, kind: Card['kind']): Promise<Card> {
  return (await db.get<Card>('srs', id)) ?? newCard(id, kind);
}

export const saveCard = (c: Card) => db.put('srs', c.id, c);

export const getNote = async (openingId: string) => (await db.get<string>('kv', `note:${openingId}`)) ?? '';
export const saveNote = (openingId: string, text: string) => db.put('kv', `note:${openingId}`, text);

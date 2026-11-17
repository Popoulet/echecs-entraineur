# CLAUDE.md

Appli Android d'entraînement aux échecs pour OnePlus Pad 3. Cahier des charges : `SPEC.md`.

## Stack
Vite + TypeScript (sans framework), Capacitor (Android), chess.js, échiquier chessground,
Stockfish 18 lite mono-thread (npm stockfish, copié dans public/ par scripts/copy-engine.mjs) en Web Worker, IndexedDB. APK compilé et signé par GitHub Actions.

## Structure (prévue)
- `src/main.ts` — démarrage, routeur simple
- `src/ui/` — composants (échiquier, graphique, boutons)
- `src/pages/` — une page par écran (profil, revue, ouvertures, puzzles)
- `src/engine/` — worker Stockfish + file d'analyse
- `src/core/` — logique pure (classement des coups, précision, explications, SRS)
- `src/data/` — IndexedDB, synchro Chess.com/Lichess, import/export
- `src/openings/*.json` — leçons d'ouvertures modifiables
- `.github/workflows/android.yml` — build + release APK

## Conventions
- Interface et commentaires en français ; identifiants en anglais.
- Pas de nouvelle dépendance sans raison forte.
- Cibles tactiles ≥ 48 px, thème sombre via variables CSS.
- Logique pure séparée de l'UI (testable).
- Réponses courtes, pas de récapitulatif.

## Avancement
- [x] SPEC.md / CLAUDE.md
- [x] Squelette + GitHub Action + APK installé sur la tablette (v0.1.1)
- [x] Échiquier tactile (chessground) + Stockfish 18 lite mono-thread + page Analyse
- [~] 1. Profil (sync Chess.com/Lichess, import PGN, analyse de fond prof. 12, précision Lichess, stats, sauvegarde JSON) — à tester sur tablette
- [ ] 2. Revue de partie
- [ ] 3. Ouvertures
- [ ] 4. Puzzles

# CLAUDE.md

Appli Android d'entraînement aux échecs pour OnePlus Pad 3. Cahier des charges : `SPEC.md`.

## Stack
Vite + TypeScript (sans framework), Capacitor (Android), chess.js, échiquier maison (SVG, pointer events),
Stockfish WASM mono-thread dans un Web Worker, IndexedDB. APK compilé et signé par GitHub Actions.

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
- [~] Squelette + GitHub Action (fait) — reste : vérifier l'installation de l'APK sur la tablette
- [ ] 1. Profil
- [ ] 2. Revue de partie
- [ ] 3. Ouvertures
- [ ] 4. Puzzles

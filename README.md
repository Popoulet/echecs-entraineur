# Échecs Entraîneur (OnePlus Pad 3)

Appli Android d'entraînement aux échecs : appli web (Vite + TypeScript) empaquetée avec Capacitor.
Cahier des charges : `SPEC.md`. Conventions et avancement : `CLAUDE.md`.

## Structure
```
src/main.ts              navigation + routeur (#/page/paramètre)
src/style.css            thème sombre (variables CSS), mises en page paysage/portrait
src/pages/               un fichier par écran : profil, parties (+ review), ouvertures, puzzles, analyse
src/ui/                  échiquier (chessground + chess.js), graphique, entraîneur de lignes, promotion
src/engine/engine.ts     Stockfish dans un Web Worker (file d'attente, priorités, pause en arrière-plan)
src/core/                logique pure : éval, précision (Lichess), revue des coups, tactique, ouvertures, SRS, stats
src/data/                IndexedDB, synchro Chess.com/Lichess, import PGN, analyse de fond, puzzles, sauvegarde
src/openings/*.json      leçons d'ouvertures (modifiables, ajoutées automatiquement)
scripts/                 copie de Stockfish, vérification des ouvertures et de la revue (Node 20)
.github/workflows/       build + publication de l'APK
```

## Développer
`npm install` puis `npm run dev` (ouvrir l'adresse affichée, dans un navigateur ou sur la tablette en Wi-Fi).
`npm run build` vérifie les types et produit `dist/`. Le dossier `android/` est généré par la CI, pas versionné.

## Obtenir l'APK
Push sur `main` → onglet Actions → l'APK apparaît dans **Releases**.
Lien fixe à garder en favori sur la tablette : `https://github.com/Popoulet/echecs-entraineur/releases/latest/download/echecs-entraineur.apk`.

## Ajouter une ouverture
Copier un fichier de `src/openings/`, changer `id`, `name`, `color` et les lignes (coups en notation anglaise : `Nf3`, `O-O`).
`base` + `branchAt` reprennent le début d'une autre ligne. Vérifier ensuite avec Stockfish :
`npx esbuild scripts/verify-openings.ts --bundle --platform=node --format=esm --outfile=vo.mjs && node vo.mjs` (Node 20+).

## Ajouter une fonctionnalité
1. Logique pure dans `src/core/` (sans DOM), données dans `src/data/`.
2. Écran dans `src/pages/maPage.ts` exportant `render(root: HTMLElement)`, puis l'ajouter au routeur de `src/main.ts`.
3. `npm run build` sans erreur, commit, push : l'APK se recompile tout seul.

# Échecs Entraîneur (OnePlus Pad 3)

Appli Android d'entraînement aux échecs : appli web (Vite + TypeScript) empaquetée avec Capacitor.
Cahier des charges : `SPEC.md`. Conventions et avancement : `CLAUDE.md`.

## Structure
```
src/main.ts          démarrage + routeur
src/style.css        thème sombre (variables CSS)
src/pages/           un fichier par écran
src/ui/              composants (échiquier, graphique…)
src/engine/          Stockfish (Web Worker)
src/core/            logique pure (classement des coups, précision, SRS…)
src/data/            IndexedDB, synchro Chess.com / Lichess, import/export
src/openings/*.json  leçons d'ouvertures (modifiables)
.github/workflows/   build + publication de l'APK
```

## Développer
`npm install` puis `npm run dev` (ouvrir l'adresse affichée, dans un navigateur ou sur la tablette en Wi-Fi).
`npm run build` vérifie les types et produit `dist/`. Le dossier `android/` est généré par la CI, pas versionné.

## Obtenir l'APK
Push sur `main` → onglet Actions → l'APK apparaît dans **Releases**.
Lien fixe à garder en favori sur la tablette : `https://github.com/<compte>/<dépôt>/releases/latest/download/echecs-entraineur.apk`.

## Ajouter une fonctionnalité
1. Logique pure dans `src/core/` (sans DOM), données dans `src/data/`.
2. Écran dans `src/pages/maPage.ts` exportant `render(root: HTMLElement)`, puis l'ajouter au routeur de `src/main.ts`.
3. `npm run build` sans erreur, commit, push : l'APK se recompile tout seul.

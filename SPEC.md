# Cahier des charges — Entraîneur d'échecs (OnePlus Pad 3)

## Cible
- Android uniquement, tablette OnePlus Pad 3 (~13", stylet), paysage **et** portrait.
- Interface 100 % tactile : grand échiquier, gros boutons, glisser-déposer et toucher-toucher des pièces, navigation au doigt/stylet.
- Français, thème sombre.
- 100 % hors ligne, sauf la synchronisation des parties (API publiques Chess.com / Lichess, sans mot de passe).

## Stack
- Vite + TypeScript (pas de framework UI), Capacitor (APK Android).
- chess.js (règles), composant d'échiquier léger et tactile (fait maison, SVG/CSS).
- Stockfish WASM **mono-thread** (compatible WebView Android) dans un Web Worker ; analyse en arrière-plan, profondeur/temps limités, mise en pause quand l'appli est en arrière-plan (économie de batterie).
- IndexedDB (stockage), export/import JSON.
- Peu de dépendances.

## Compilation / distribution
- Pas d'Android Studio en local.
- GitHub Action : à chaque push sur `main`, build web → `cap sync` → Gradle `assembleRelease` → APK signé → publié dans les Releases GitHub (téléchargeable depuis la tablette).
- Clé de signature fournie via secrets GitHub (keystore en base64 + mots de passe + alias).

## Fonctionnalités

### 1. Profil
- 1er lancement : choisir Chess.com / Lichess / les deux + pseudo.
- Plusieurs comptes possibles.
- À chaque ouverture : synchro des nouvelles parties, puis analyse en arrière-plan.
- Page profil : classement, précision moyenne et son évolution, ouvertures jouées avec taux de victoire.
- Secours : import PGN (fichier ou collé).

### 2. Revue de partie (type « Game Review »)
- Classement des coups selon la perte de probabilité de gain : brillant, meilleur, excellent, bon, imprécision, erreur, gaffe, coup manqué.
- Précision % (formule Lichess).
- Graphique d'évaluation cliquable (aller au coup).
- Flèche du meilleur coup.
- Explications simples en français par règles : pièce en prise, tactique manquée, mat manqué, échange perdant, roi exposé…
- Résumé : moments clés, phase la plus faible (ouverture / milieu / finale).

### 3. Ouvertures (cours → entraînement → révision)
- a) Leçon : la ligne coup par coup, chaque coup expliqué niveau débutant (centre, développement, roque, menaces), flèches et cases surlignées, plans typiques, pièges classiques.
- b) Entraînement : je rejoue la ligne ; en cas d'erreur → explication + indice.
- c) Révision : répétition espacée sans aide, progression par ouverture.
- Contenu en JSON modifiable : Italienne et Londres (Blancs), Caro-Kann et Gambit Dame refusé (Noirs) ; ligne principale + 2-3 réponses adverses fréquentes, ~10 coups, vérifiées avec Stockfish.
- Je peux ajouter mes propres lignes et notes.
- Dans mes parties : signaler où je sors du répertoire, avec lien vers la leçon.

### 4. Puzzles
- Générés à partir de mes erreurs (positions avant gaffe/erreur/coup manqué).
- Répétition espacée.
- Statistiques des thèmes ratés.

## Méthode
1. SPEC.md + CLAUDE.md, plan, accord.
2. Squelette minimal + GitHub Action ; vérifier l'installation de l'APK sur la tablette.
3. Une fonctionnalité à la fois, dans l'ordre. Après chacune : build sans erreur, commit, avancement dans CLAUDE.md, 2-3 lignes de test sur tablette.
4. Code simple et commenté, README court (structure + ajouter une fonctionnalité).

# DI'ART by ARIZONA

V1 local-first d'un gestionnaire de répertoire musical personnel.

## Fonctionnalités V1
- Bibliothèque de morceaux, CRUD complet
- Artistes, auteurs, favoris, récents
- Recherche instantanée et filtres combinables
- Fiche morceau orientée scène/répétition
- Import Excel/CSV avec analyse et mapping des colonnes
- Détection prudente des doublons
- Export JSON/CSV et restauration JSON
- Données de démonstration supprimables
- IndexedDB (Dexie) pour la persistance locale
- PWA de base, responsive mobile/desktop, thème clair/sombre

## Lancer localement
```bash
npm install
npm run dev
```

## Vérifier
```bash
npm test
npm run build
```

## Données Excel
Le classeur source réel `Carnet de note Tonalité.xlsx` a été inspecté :

- **Carnet de note Tonalité** — plage A1:E503, colonnes utiles `Artiste`, `Titre`, `Tonalité`, `Tempo`.
- **Playlist** — plage A1:C33, colonnes `Auteur`, `Titre`, `Tonalité`.

L'importateur conserve un mapping dynamique mais reconnaît automatiquement ces colonnes. `Tonalité` est proposée comme tonalité habituelle/personnelle et `Tempo` comme BPM. Le mapping reste modifiable avant import.

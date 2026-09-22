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
Le fichier Excel réel n'étant pas encore fourni, l'importateur ne suppose aucune structure fixe. Il propose un auto-mapping prudent, que l'utilisateur peut corriger avant import.

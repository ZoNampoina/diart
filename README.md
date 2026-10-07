# DI'ART by ARIZONA

V1 local-first d'un gestionnaire de répertoire musical personnel.

## Scénographie et présentation client — 3.7.0

Dans **Inventaire → Programme → Installation avancée**, utilisez **Ajouter un objet visuel** pour ouvrir la galerie. Choisissez un objet puis son emplacement, ou glissez-le sur le plan depuis un ordinateur. Les illustrations, variantes, couleurs, labels et dimensions se règlent dans les propriétés de l’objet. Un élément visuel reste hors stock tant qu’il n’est pas associé à un matériel.

Sélectionnez plusieurs objets avec **Maj + clic**, puis **Grouper**. **Dupliquer en série** dispose une sélection en ligne, colonne, grille, arc ou cercle. **Enregistrer dans Mes objets** conserve un objet ou un bloc et ses liaisons internes pour un autre événement. **Importer une illustration** accepte SVG, PNG, WebP et JPEG. Dans les paramètres de scène, **Importer plan / photo** puis **Calibrer une distance connue** met un fond de salle à l’échelle.

Les modes **Technique**, **Hybride** et **Présentation client** utilisent une seule installation. **Aperçu client** prépare une fiche avec logo et cartouche, ou un plan seul, en PNG haute définition et PDF. Les câbles et informations internes sont masqués par défaut dans la présentation client ; les options permettent de les afficher explicitement. Vérifiez l’aperçu avant téléchargement.

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

## Import Excel
L'importateur reconnaît automatiquement les colonnes courantes `Artiste`, `Auteur`, `Titre`, `Tonalité` et `Tempo`. `Tonalité` est proposée comme tonalité habituelle/personnelle et `Tempo` comme BPM. Le mapping reste modifiable avant import.

Les classeurs personnels utilisés pour valider l'import ne sont pas conservés dans le dépôt : les comportements attendus sont couverts par les tests automatisés.

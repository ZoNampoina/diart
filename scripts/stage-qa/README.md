# Validation de l’éditeur de scène — DI’ART 3.7.0

L’entrée `scripts/stage-qa/index.html` charge la vraie page de programme avec une installation au format 3.5.7 dans la base locale du navigateur de test. Vite ne l’inclut pas dans le build de production. Utiliser uniquement un profil de navigateur de test : le paramètre `?reset=1` réinitialise les programmes de cette origine locale.

## Exécution

1. `npm install`, puis `npm run dev -- --host 127.0.0.1 --port 4173`.
2. Installer Playwright dans l’environnement de test (`npm install --no-save playwright`) et son navigateur (`npx playwright install chromium`), ou définir `STAGE_QA_CHROME` avec le chemin d’un Chrome disponible.
3. `node scripts/stage-qa/smoke.mjs`, `node scripts/stage-qa/commands.mjs`, puis `node scripts/stage-qa/scenography.mjs`.
4. `npm test` et `npm run build`.

Les scripts utilisent le Playwright du runtime lorsqu’il est indiqué par `CODEX_PRIMARY_RUNTIME_NODE_MODULES`, sinon le paquet Playwright local. Les captures temporaires et comptes rendus vont dans `/tmp/diart-stage-results` (`STAGE_QA_OUTPUT` peut modifier le dossier du smoke test).

## Parcours de vérification

Écran PC 1440 × 1050, viewport tablette 1024 × 768 et téléphone 390 × 844. Le workflow `Stage editor browser checks` exécute ces parcours avec Chromium et conserve les captures et exports en artefacts.

- Installation ancienne : dimensions, routes, calques et versions conservés.
- Déplacement groupé, annulation en une étape, rétablissement ; aucune écriture pendant le drag.
- Création et annulation d’un câble, duplication d’équipement sans modifier le stock physique.
- Adapter le plan et changer seulement la mesure ; coordonnées et routes conservées dans le second cas.
- Calques visibles/masqués, verrouillage, isolation, ajout et duplication.
- Rotation et redimensionnement via poignées, copier-coller, suppression et magnétisme.
- Points de câble, déplacement d’un segment, trajet droit/90°/courbe et estimation métrique.
- Versions durables, restauration d’une version ancienne puis annulation.
- Création d’un modèle, nouveau programme depuis ce modèle et indépendance de la copie.
- PNG : aperçu identique au fichier téléchargé, export séparé des calques ; inspection visuelle des lignes et icônes, sans polygones noirs.
- Plein écran, Échap, panneaux tablette, absence de débordement mobile, persistance après rechargement et absence d’erreurs JavaScript.

Les tests unitaires couvrent également la copie profonde, les identifiants du graphe, l’historique borné, les objets verrouillés, les distances de courbes et l’alignement/distribution.

### Scénographie

- Passage Technique / Hybride / Présentation client sans modifier les coordonnées ni les liaisons.
- Représentation d’un micro indépendante de son stock et de son câblage.
- Objet visuel hors stock, puis association à une référence et une quantité, sans modifier le stock physique.
- Redimensionnement avec proportions verrouillées et série de 12 chaises sur 4 colonnes × 3 lignes, annulable en une action.
- Groupe nommé, déplacement, verrouillage et réutilisation indépendante d’un bloc dans Mes objets.
- Import SVG neutralisé et autonome, sans exécution de scripts ni chargement d’images externes ; dépôt depuis la galerie.
- Plan de salle, calibration sur deux points, conservation après rechargement.
- Scène de 5 × 4 m avec piano, batterie, micros, chanteurs, wedges, enceintes, écran LED et plantes.
- PNG et PDF issus du même aperçu, fiche de présentation et plan seul ; détails techniques masqués par défaut.
- Bibliothèque lisible en thème clair, tablette et téléphone, sans débordement horizontal.

Les résultats scénographiques vont dans `/tmp/diart-scenography-results`. Le workflow ouvre le PDF avec Poppler et produit une planche visuelle pour contrôler sa composition.

La validation utilise des données de test locales : elle ne modifie aucun événement de production. Le format JSON des programmes et le mécanisme de synchronisation existant sont conservés ; aucune migration Supabase n’est nécessaire.

## Limites

Le PDF contient la même image haute définition que le PNG ; ce n’est pas un dessin vectoriel éditable. Les dimensions du catalogue sont indicatives, à ajuster au matériel réel. La marge de câble est une estimation en deux dimensions ; les hauteurs et détours réels doivent être pris en compte avant de choisir une longueur. Les imports sont convertis en images autonomes, avec un côté maximal de 2 400 pixels. Une mini-carte et les sauts graphiques aux croisements restent des améliorations possibles.

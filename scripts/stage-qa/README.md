# Validation de l’éditeur de scène — DI’ART 3.6.0

L’entrée `scripts/stage-qa/index.html` charge la vraie page de programme avec une installation au format 3.5.7 dans la base locale du navigateur de test. Vite ne l’inclut pas dans le build de production. Utiliser uniquement un profil de navigateur de test : le paramètre `?reset=1` réinitialise les programmes de cette origine locale.

## Exécution

1. `npm install`, puis `npm run dev -- --host 127.0.0.1 --port 4173`.
2. Installer Playwright dans l’environnement de test (`npm install --no-save playwright`) et son navigateur (`npx playwright install chromium`), ou définir `STAGE_QA_CHROME` avec le chemin d’un Chrome disponible.
3. `node scripts/stage-qa/smoke.mjs` puis `node scripts/stage-qa/commands.mjs`.
4. `npm test` et `npm run build`.

Les scripts utilisent le Playwright du runtime lorsqu’il est indiqué par `CODEX_PRIMARY_RUNTIME_NODE_MODULES`, sinon le paquet Playwright local. Les captures temporaires et comptes rendus vont dans `/tmp/diart-stage-results` (`STAGE_QA_OUTPUT` peut modifier le dossier du smoke test).

## Vérifications effectuées

Chrome 154, écran PC 1440 × 1050, viewport tablette 1024 × 768 et téléphone 390 × 844.

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

La validation utilise des données de test locales : elle ne modifie aucun événement de production. Le format JSON des programmes et le mécanisme de synchronisation existant sont conservés ; aucune migration Supabase n’est nécessaire.

## Limites

L’export livré est le PNG. Le PDF, une mini-carte et les sauts graphiques aux croisements restent des améliorations possibles. La marge de câble est une estimation en deux dimensions ; les hauteurs et détours réels doivent être pris en compte avant de choisir une longueur.

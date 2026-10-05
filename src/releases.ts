export interface DiartRelease {
  version:string
  date:string
  title:string
  summary:string
  highlights:string[]
}

export const DIART_RELEASES:DiartRelease[]=[
  {
    version:'4.0.0',
    date:'5 octobre 2026',
    title:'Inventory Workspace',
    summary:'L’ensemble du module Inventaire devient un workspace unifié, plus compact et plus professionnel, tout en conservant les stocks, programmes, installations, exports et historiques existants.',
    highlights:[
      'Navigation locale Vue d’ensemble, Programmes, Stock, Installation et Mouvements, avec dashboard global des disponibilités, alertes et prochains événements.',
      'Stock restructuré avec recherche étendue aux connectiques, filtres par emplacement et stock faible, tris supplémentaires, vues Compacte / Cartes / Tableau et actions groupées.',
      'Actions groupées : état, maintenance, emplacement, stockage, ajout direct à un Programme ou à un kit, export CSV et retrait de la sélection.',
      'Fiche matériel ouverte en drawer contextuel sur ordinateur et en vue plein écran sur mobile, avec actions rapides, historique et suivi optionnel par unité avec état propre à chaque exemplaire.',
      'Données essentielles structurées pour câbles, instruments, micros, consoles, multiprises et enceintes ; les accessoires habituels sont proposés lors de l’ajout au Programme.',
      'Programme réorganisé autour de sections Aperçu, Matériel, Check-list, Installation, Besoins et Export, avec groupes visuels renommables, repliables et déplaçables.',
      'Check-list opérationnelle à cinq états — à préparer, chargé, sur place, retourné, problème — avec progression, actions globales et compatibilité avec les anciens états chargé/retourné.',
      'Kits éditables, duplicables et ajoutables en quantité ×N, avec aperçu des manques avant affectation au Programme.',
      'Vue Besoins enrichie avec synthèse des manquants et proposition d’optimisation des sources visant à réduire le nombre de prestataires, toujours soumise à validation.',
      'Historique Mouvements filtrable par recherche, date, stockage et type d’opération, avec alertes de maintenance prolongée sur le dashboard.',
      'Design system Inventaire responsive pour PC, tablette et mobile, appliqué sans modifier les clés de données historiques ni l’identité visuelle DI’ART.'
    ]
  },
  {
    version:'3.9.0',
    date:'5 octobre 2026',
    title:'Stock Workspace',
    summary:'Le Stock devient un espace de gestion plus rapide et plus lisible, avec recherche, filtres, vues adaptées, actions groupées et suivi physique du matériel.',
    highlights:[
      'Recherche plein texte sur le nom, la classe, les notes, l’emplacement et les caractéristiques techniques.',
      'Filtres par classe et état, tri par nom, quantité ou emplacement, avec vues Compacte, Cartes et Tableau.',
      'Tableau de bord instantané : total, disponibles, réservés, utilisés, indisponibles et alertes de stock faible.',
      'Sélection multiple avec changement d’état, affectation d’un emplacement commun et retrait groupé.',
      'Fiche matériel enrichie avec emplacement physique, seuil de stock faible et matériels/accessoires associés.',
      'Interface responsive pour PC, tablette et mobile, sans casser les données ni les Programmes existants.'
    ]
  },
  {
    version:'3.8.1',
    date:'5 octobre 2026',
    title:'Ordre personnalisé de l’inventaire',
    summary:'Le matériel d’un Programme peut désormais être réorganisé librement pour placer côte à côte les éléments qui doivent fonctionner ensemble.',
    highlights:[
      'Ordre transversal indépendant des catégories : micro, pied, câble et accessoires peuvent être regroupés dans la même séquence.',
      'Glisser-déposer sur ordinateur, boutons haut / bas et choix direct du numéro de position pour mobile et tablette.',
      'Ordre enregistré dans chaque Programme sans modifier l’organisation générale du stock.',
      'Aperçu, check-list et export de fiche technique reprennent automatiquement cet ordre personnalisé.'
    ]
  },
  {
    version:'3.8.0',
    date:'5 octobre 2026',
    title:'Inventaire personnalisé & matériel structuré',
    summary:'Les fiches techniques s’adaptent désormais au destinataire, tandis que les matériels utilisent des caractéristiques structurées réutilisées dans l’installation avancée.',
    highlights:[
      'Profils d’export Propriétaire, Technicien, Prestataire / musiciens et Personnalisé avec sections affichables et réordonnables.',
      'Schéma de scène, liste du matériel, note saisissable et matériel manquant intégrables dans la même fiche, avec contenu modifiable avant export.',
      'Export de l’aperçu final en image PNG haute résolution et en PDF.',
      'Champs dédiés pour câbles, instruments et multiprises, dont longueur, couleur, IN / OUT inversables, accessoires, alimentation et nombre de sorties.',
      'Création d’un nouveau matériel directement depuis Installation avancée, ajout au stock puis placement sur le plan.'
    ]
  },
  {
    version:'3.7.0',
    date:'4 octobre 2026',
    title:'Scénographie & présentation client',
    summary:'Une seule installation pour le plan technique, la maquette visuelle et la présentation client, avec une bibliothèque de silhouettes vue du dessus.',
    highlights:[
      'Galerie d’éléments de scène : instruments, audio, mobilier, lumière, vidéo, structures, décorations, personnes, zones et annotations.',
      'Apparence indépendante du matériel : variantes, couleurs, opacité, rotation, labels, proportions verrouillées et dimensions réelles indicatives.',
      'Objets scénographiques sans réservation, associables ensuite au stock et à une quantité représentée.',
      'Groupes nommés et verrouillables, duplication en ligne, colonne, grille, arc ou cercle, blocs réutilisables dans Mes objets.',
      'Import SVG, PNG et WebP, logos, plans de salle et calibration sur une distance connue.',
      'Vues Technique, Hybride et Présentation client sur les mêmes positions ; informations internes masquées par défaut pour le client.',
      'Aperçu exact et téléchargement PNG haute définition ou PDF : plan seul ou fiche avec événement, client, date, lieu, logo, dimensions, légende et version.'
    ]
  },
  {
    version:'3.6.0',
    date:'3 octobre 2026',
    title:'Éditeur de plan de scène',
    summary:'Le mode Installation devient un espace de conception centré sur le plan, avec outils latéraux, propriétés contextuelles et travail en plein écran.',
    highlights:[
      'Annuler / rétablir sur 80 actions, sélection multiple, copier-coller, duplication, alignement et distribution.',
      'Zoom et déplacement de la vue, mesures, magnétisme métrique, rotation et redimensionnement avec poignées.',
      'Calques réordonnables et verrouillables, isolation, annotations et zones.',
      'Câbles droits, à 90° ou courbes, points et segments manipulables, distances calculées et marge de longueur.',
      'Versions complètes du plan et modèles réutilisables pour créer des événements indépendants sans modifier le stock physique.',
      'Export PNG avec aperçu exact, calques combinés ou séparés, grille et légende ; câbles rasterisés sans surfaces noires.',
      'Installations antérieures conservées, sauvegarde après les gestes et panneaux rétractables sur tablette et mobile.'
    ]
  },
  {
    version:'3.5.6',
    date:'2 octobre 2026',
    title:'Setlists partagées en temps réel',
    summary:'Les setlists publiques et partagées deviennent collaboratives : une modification synchronisée par un membre est répercutée aux autres comptes liés et reçue en direct quand ils sont connectés.',
    highlights:[
      'Propagation serveur des modifications de setlist vers le propriétaire et tous les destinataires liés.',
      'Mise à jour bidirectionnelle : un destinataire d’un partage peut modifier la setlist et les autres membres reçoivent la nouvelle version.',
      'Écoute Supabase Realtime des setlists personnelles pour actualiser l’interface sans réimport ni réouverture.',
      'Actualisation en direct des setlists visibles dans le Mode public.',
      'Les nouveaux morceaux ajoutés à une setlist partagée sont synchronisés avant la setlist afin d’éviter les références manquantes.'
    ]
  },
  {
    version:'3.5.3',
    date:'2 octobre 2026',
    title:'Partage public et codes robustes',
    summary:'Le partage entre comptes DI’ART devient directement exploitable : les setlists publiques peuvent être ouvertes par un autre utilisateur et les erreurs de code sont désormais explicites.',
    highlights:[
      'Ouverture d’une setlist publique avec import automatique de la setlist et de ses morceaux dans l’espace personnel.',
      'Actualisation de la même copie lors d’un nouvel accès, sans création de doublons de setlist.',
      'Codes de partage acceptés avec ou sans préfixe et avec une saisie tolérante aux espaces et variantes de tirets.',
      'Distinction claire entre code de partage direct et code d’activation du catalogue public.',
      'Affichage du vrai message renvoyé par l’Edge Function au lieu de l’erreur technique générique non-2xx.'
    ]
  },
  {
    version:'3.5.1',
    date:'30 septembre 2026',
    title:'Playlist après import de liste',
    summary:'Après un import intelligent de morceaux, DI’ART propose maintenant de ranger immédiatement la liste dans une playlist existante ou d’en créer une nouvelle.',
    highlights:[
      'Étape finale après import avec choix entre playlist existante, nouvelle playlist ou fin sans playlist.',
      'Conservation stricte de l’ordre original des morceaux importés et réutilisés.',
      'Ajout direct à une playlist existante sans modifier les morceaux déjà présents dans la bibliothèque.',
      'Création d’une nouvelle playlist en un seul flux, puis ouverture automatique de la liste créée.'
    ]
  },
  {
    version:'3.5.0',
    date:'30 septembre 2026',
    title:'Import intelligent de listes',
    summary:'DI’ART transforme une liste texte en setlist exploitable en réutilisant la bibliothèque locale et en recherchant automatiquement les morceaux absents.',
    highlights:[
      'Analyse tolérante des listes WhatsApp, Messenger, Notes et SMS avec conservation stricte de l’ordre initial.',
      'Rapprochement intelligent avec les morceaux DI’ART existants et confirmation limitée aux cas réellement ambigus.',
      'Hiérarchie malgache DI’ART → AcousticGasy → Tononkira et internationale DI’ART → Ultimate Guitar, avec priorité aux versions avec accords.',
      'Import express, création minimale si aucune source fiable n’est trouvée et complétion des morceaux existants sans doublon.',
      'Import disponible depuis Setlists, une setlist ouverte et le menu de création des morceaux, avec restauration depuis l’historique.'
    ]
  },
  {
    version:'3.4.5',
    date:'30 septembre 2026',
    title:'Synchronisation cloud et ergonomie scène/stock',
    summary:'La synchronisation privilégie désormais le cloud en cas de concurrence et les écrans de scène, de connexion et de stock gagnent en lisibilité.',
    highlights:[
      'Synchronisation automatique déclenchée après chaque modification et priorité cloud lors d’une modification concurrente.',
      'Animation visible pendant la connexion et la synchronisation initiale du compte.',
      'Sélecteur Piano, Sax et autres rôles rendu lisible en Répétition, Live et plein écran.',
      'Statuts de stock représentés par des points colorés, avec affichage compact sur Android.',
      'Import public compact par icône sur Android et accès direct à la modification des autres spécifications d’un morceau.'
    ]
  },
  {
    version:'3.1.1',
    date:'29 septembre 2026',
    title:'Partage direct par code fixe',
    summary:'Un même code peut maintenant être partagé avec plusieurs membres d’un groupe sans régénération.',
    highlights:[
      'Code fixe et réutilisable pour un morceau, un artiste, une setlist ou un inventaire.',
      'Le même code peut être transmis à plusieurs comptes DI’ART.',
      'Une nouvelle utilisation par le même destinataire actualise sa copie au lieu de créer un doublon.',
      'Les setlists et inventaires incluent automatiquement les dépendances nécessaires lors du transfert.'
    ]
  },
  {
    version:'3.0.1',
    date:'29 septembre 2026',
    title:'Partage et administration affinés',
    summary:'Les fonctions communautaires deviennent plus souples et mieux intégrées au flux musical.',
    highlights:[
      'Durée des codes d’import définie par l’administrateur en jours, mois ou années.',
      'Affichage ou masquage du mot de passe à la connexion.',
      'Recherche Recueils accessible directement depuis l’ajout de morceaux d’une setlist.',
      'Page À propos enrichie avec l’historique des grandes évolutions de DI’ART.'
    ]
  },
  {
    version:'3.0.0',
    date:'29 septembre 2026',
    title:'Comptes, mode public et administration',
    summary:'DI’ART devient multi-utilisateur avec un espace personnel séparé d’un catalogue musical partagé.',
    highlights:[
      'Comptes DI’ART et association des appareils.',
      'Séparation entre mode personnel et mode public avec synchronisation multi-appareils.',
      'Catalogue public de morceaux avec attribution du contributeur.',
      'Publication volontaire de setlists et inventaires, codes d’import, gestion des utilisateurs, appareils et historique administrateur.'
    ]
  },
  {
    version:'2.16',
    date:'septembre 2026',
    title:'Inventaire technique et installation',
    summary:'L’inventaire évolue vers la préparation technique complète des prestations.',
    highlights:[
      'Caractéristiques techniques du matériel, ports, canaux et longueurs de câbles.',
      'Programmes événementiels et préparation des besoins matériels.',
      'Schémas d’installation, compatibilités et aide à la sélection du matériel.'
    ]
  },
  {
    version:'2.9',
    date:'septembre 2026',
    title:'Setlists, répétition et Live',
    summary:'La setlist devient un véritable espace de préparation, de répétition et de scène.',
    highlights:[
      'Ordre des morceaux, tonalités et transpositions propres aux setlists.',
      'Transitions, notes de répétition et points à revoir.',
      'Modes Répétition et Live avec défilement, gestes tactiles et affichage plein écran.'
    ]
  },
  {
    version:'2.4',
    date:'septembre 2026',
    title:'Cloud, PWA et recherche unifiée',
    summary:'DI’ART se structure comme une application installable et synchronisée.',
    highlights:[
      'Synchronisation cloud et gestion des conflits.',
      'PWA adaptée à l’ordinateur, la tablette et le téléphone.',
      'Recherche, imports, exports et sauvegardes renforcés.'
    ]
  },
  {
    version:'1.x',
    date:'2026',
    title:'Fondations de DI’ART',
    summary:'Création de la bibliothèque musicale personnelle qui constitue le cœur de l’application.',
    highlights:[
      'Fiches morceaux, artistes, auteurs, tonalités, BPM, paroles et accords.',
      'Favoris, récents, setlists et outils de transposition.',
      'Recueils et premiers outils d’import de données musicales.'
    ]
  }
]

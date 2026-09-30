export interface DiartRelease {
  version:string
  date:string
  title:string
  summary:string
  highlights:string[]
}

export const DIART_RELEASES:DiartRelease[]=[
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

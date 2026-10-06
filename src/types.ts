export type SongSource = 'demo' | 'manual' | 'import'
export type FavoriteStatus = ''|'favorite'|'learn'|'rehearse'|'mastered'|'review'
export type StageRole = 'normal'|'chef'|'musicien'

export interface LyricVersion {
  id: string
  lyrics: string
  createdAt: string
  source: 'manual'|'import'|'recueil'|'restore'|'sync'
  label?: string
}

export interface RehearsalIssue {
  id: string
  text: string
  createdAt: string
  resolvedAt?: string | null
}

export interface SetlistTransition {
  fromSongId: string
  toSongId: string
  notes: string
  bars?: number | null
  chords?: string
  updatedAt: string
}

export interface Song {
  id: string
  title: string
  artist: string
  authorComposer: string
  originalKey: string
  personalKey: string
  bpm: number | null
  timeSignature: string
  style: string
  durationSeconds: number | null
  tags: string[]
  notes: string
  referenceUrl: string
  capo?: number | null
  structure?: string
  chords?: string
  chordLyrics?: string
  instrumentNotes?: string
  musicianNotes?: Record<string,string>
  lyrics?: string
  lyricVersions?: LyricVersion[]
  favorite: boolean
  favoriteStatus?: FavoriteStatus
  createdAt: string
  updatedAt: string
  lastViewedAt: string | null
  source: SongSource
  deletedAt: string | null
}

export type SongDraft = Omit<Song, 'id' | 'createdAt' | 'updatedAt' | 'lastViewedAt' | 'deletedAt'>

export interface AppSetting {
  key: string
  value: string
}

export interface BackupFile {
  schemaVersion: 1
  exportedAt: string
  app: "DI'ART by ARIZONA"
  songs: Song[]
  settings: Record<string, string>
}

export type ImportField =
  | 'title'
  | 'artist'
  | 'authorComposer'
  | 'originalKey'
  | 'personalKey'
  | 'bpm'
  | 'timeSignature'
  | 'style'
  | 'duration'
  | 'tags'
  | 'notes'
  | 'referenceUrl'
  | 'capo'
  | 'structure'
  | 'chords'
  | 'chordLyrics'
  | 'instrumentNotes'
  | 'lyrics'

export type ImportMapping = Record<string, ImportField | ''>

export interface ImportRowPreview {
  sourceIndex: number
  raw: Record<string, unknown>
  draft: SongDraft
  duplicateId?: string
  duplicateLabel?: string
  valid: boolean
  error?: string
}

export interface Setlist {
  id: string
  name: string
  songIds: string[]
  notes: string
  rehearsalNotes?: Record<string,string>
  rehearsalIssues?: Record<string,RehearsalIssue[]>
  transitions?: Record<string,SetlistTransition>
  isPublic?: boolean
  songOverrides?: Record<string,{key?:string;bpm?:number|null;notes?:string;transpose?:number;structure?:string;chords?:string;chordLyrics?:string;instrumentNotes?:string;musicianNotes?:Record<string,string>;lyrics?:string}>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type InventoryCategory = string
export type InventoryStockStatus = 'available'|'reserved'|'in_use'|'repair'|'maintenance'|'unavailable'
export type InventoryPortDirection = 'input'|'output'|'bidirectional'|'power'
export type InventorySignalLevel = 'mic'|'line'|'instrument'|'speaker'|'digital'|'midi'|'power'|'unknown'
export type InventoryTechnicalIcon = 'auto'|'guitar'|'acoustic-guitar'|'electric-guitar'|'bass'|'ukulele'|'keyboard'|'drums'|'microphone'|'mixer'|'speaker'|'saxophone'|'trumpet'|'flute'|'violin'|'cello'|'amplifier'|'pedal'|'headphones'|'inear'|'stand'|'tripod'|'musicstand'|'dibox'|'patchbay'|'stagebox'|'rack'|'case'|'laptop'|'tablet'|'phone'|'camera'|'projector'|'jack'|'trs'|'ts'|'minijack'|'xlr'|'rca'|'speakon'|'rj45'|'usb'|'usbc'|'hdmi'|'optical'|'lightning'|'midi'|'power'|'powerstrip'|'ups'|'charger'|'battery'|'cable'|'adapter'|'network'|'router'|'switch'|'wifi'|'bluetooth'|'sdcard'|'harddrive'|'generic'
export type InventoryPhantomMode = 'none'|'required'|'supported'|'blocked'

export interface InventoryCharacteristic {
  id: string
  label: string
  value: string
  icon?: InventoryTechnicalIcon
}

export interface InventoryPort {
  id: string
  label: string
  connector: string
  direction: InventoryPortDirection
  count: number
  signalLevel?: InventorySignalLevel
  balanced?: boolean
  stereo?: boolean
  phantom?: InventoryPhantomMode
  icon?: InventoryTechnicalIcon
}

export type InventoryChecklistState = 'prepare'|'loaded'|'onsite'|'returned'|'problem'

export interface InventoryMaterial {
  id: string
  name: string
  quantity: number
  category: InventoryCategory
  stockItemId?: string
  loaded?: boolean
  returned?: boolean
  /** État opérationnel de la check-list. Les booléens loaded/returned restent conservés pour rétrocompatibilité. */
  checkState?: InventoryChecklistState
  /** Groupe visuel propre au programme, sans modifier la catégorie technique réelle. */
  visualGroup?: string
  /** Position personnalisée dans la liste du programme (indépendante de la catégorie). */
  listOrder?: number
}

export interface InventoryTrackedUnit {
  id: string
  label: string
  status: InventoryStockStatus
  notes?: string
}

export interface InventoryStockItem {
  id: string
  name: string
  category: InventoryCategory
  quantity: number
  provider?: string
  status?: InventoryStockStatus
  characteristics?: InventoryCharacteristic[]
  ports?: InventoryPort[]
  notes?: string
  /** Emplacement physique précis : flight-case, rack, étagère, local, véhicule… */
  storageLocation?: string
  /** Seuil à partir duquel l’interface signale un stock faible. */
  lowStockThreshold?: number
  /** Matériels généralement utilisés avec cet élément. */
  associatedItemIds?: string[]
  /** Active le suivi par exemplaire pour les matériels qui le nécessitent. */
  trackUnits?: boolean
  /** Exemplaires suivis individuellement. Ignoré tant que trackUnits est désactivé. */
  units?: InventoryTrackedUnit[]
  representationIcon?: InventoryTechnicalIcon
  /** Famille logique pour regrouper plusieurs variantes d’un même matériel (ex. JACK-JACK). */
  familyName?: string
  /** Libellé de variante facultatif. À défaut, DI'ART le dérive de caractéristiques comme Longueur et Couleur. */
  variantLabel?: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface InventoryKitItem {
  name: string
  quantity: number
  category: InventoryCategory
  stockItemId?: string
}

export interface InventoryKit {
  id: string
  name: string
  items: InventoryKitItem[]
  createdAt: string
  updatedAt: string
}

export type StageViewMode = 'technical'|'client'|'hybrid'
export interface StageAppearance {
  illustration?: string
  imageId?: string
  color?: string
  stroke?: string
  opacity?: number
  labelMode?: 'auto'|'none'|'short'|'full'|'material'|'role'|'custom'
  shortLabel?: string
  roleLabel?: string
  customLabel?: string
  labelHorizontal?: boolean
  labelSize?: number
  lockAspect?: boolean
  shadow?: boolean
}
export interface StageImage {
  id: string
  name: string
  dataUrl: string
  width: number
  height: number
}
export interface StageGroup { id:string; name:string; nodeIds:string[]; locked?:boolean }
export interface StageBackground {
  imageId:string
  x:number
  y:number
  width:number
  height:number
  opacity:number
  locked:boolean
}
export interface StagePresentation {
  title?:string
  client?:string
  date?:string
  location?:string
  version?:string
  logoId?:string
}

export interface InstallationNode {
  id: string
  name: string
  stockItemId?: string
  x?: number
  y?: number
  zone?: string
  role?: 'source'|'processing'|'destination'|'power'|'network'|'accessory'
  scale?: number
  rotation?: number
  width?: number
  height?: number
  layerId?: string
  locked?: boolean
  kind?: 'equipment'|'text'|'zone'|'visual'|'shape'
  category?: string
  color?: string
  // Stock identity and the visual representation are deliberately independent.
  visualOnly?: boolean
  quantity?: number
  appearance?: StageAppearance
}

export interface InstallationLink {
  id: string
  fromNodeId: string
  toNodeId: string
  fromPort?: string
  toPort?: string
  label?: string
  lengthMeters?: number
  assignedChannel?: string
  compatibility?: 'ok'|'adapter'|'di'|'phantom'|'warning'
  compatibilityNotes?: string[]
  kind?: 'audio'|'power'|'network'|'midi'|'data'|'accessory'|'unknown'
  route?: Array<{x:number;y:number}>
  routeMode?: 'straight'|'zigzag'|'curve'
  layerId?: string
  locked?: boolean
  color?: string
  opacity?: number
  showLabel?: boolean
  marginPercent?: number
}

export interface InstallationSuggestion {
  id: string
  kind: 'cable'|'adapter'|'power'|'accessory'|'equipment'|'warning'
  name: string
  quantity: number
  reason: string
  category?: InventoryCategory
  matchedStockItemId?: string
  lengthMeters?: number
  channelAssignment?: string
}

export interface InstallationLayer {
  id: string
  name: string
  visible?: boolean
}

export interface InstallationSnapshot {
  id: string
  name: string
  nodes: InstallationNode[]
  links: InstallationLink[]
  layers?: Record<string,boolean|undefined>
  layerOrder?: string[]
  customLayers?: InstallationLayer[]
  createdAt: string
  author?: string
  plan?: Omit<InventoryInstallation,'snapshots'>
}

export interface InventoryInstallation {
  nodes: InstallationNode[]
  links: InstallationLink[]
  suggestions?: InstallationSuggestion[]
  aiSummary?: string
  analyzedAt?: string
  analysisMode?: 'local'|'ai'
  versionName?: string
  zones?: string[]
  snapshots?: InstallationSnapshot[]
  gridVisible?: boolean
  gridStep?: number
  snapStep?: number
  layerLocks?: Record<string,boolean>
  layerNames?: Record<string,string>
  audience?: 'bottom'|'top'
  background?: string
  cableLabels?: boolean
  stageWidth?: number
  stageHeight?: number
  stageWidthMeters?: number
  stageDepthMeters?: number
  stagePixelsPerMeter?: number
  layers?: {
    [layerId:string]: boolean|undefined
    materials?: boolean
    audio?: boolean
    power?: boolean
    connectivity?: boolean
    accessories?: boolean
  }
  layerOrder?: string[]
  customLayers?: InstallationLayer[]
  groups?: StageGroup[]
  assets?: Record<string,StageImage>
  viewMode?: StageViewMode
  clientCables?: 'hidden'|'muted'|'visible'
  clientGrid?: boolean
  backgroundImage?: StageBackground
  presentation?: StagePresentation
}

export type InventoryFrequency = 'once'|'weekly'|'monthly'

export interface InventoryProgram {
  id: string
  name: string
  date: string
  startTime?: string
  endTime?: string
  frequency?: InventoryFrequency
  weekday?: number | null
  location: string
  notes: string
  items: InventoryMaterial[]
  isTemplate?: boolean
  templateFavorite?: boolean
  templateKind?: 'installation'|'object'|'block'
  libraryCategory?: string
  installation?: InventoryInstallation
  isPublic?: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}


export type ActivityKind = 'create'|'update'|'import'|'complete'|'delete'|'restore'|'merge'|'export'|'backup_restore'|'play'

export interface SongFieldActivityRestoreData {
  kind:'song_field'
  field:keyof SongDraft
  value:unknown
  label:string
}

export interface ListImportActivityRestoreData {
  kind:'list_import'
  label:string
  createdSongIds:string[]
  setlistId?:string
  createdSetlist?:boolean
  previousSetlistSongIds?:string[]
}

export type ActivityRestoreData = SongFieldActivityRestoreData | ListImportActivityRestoreData

export interface ActivityEntry {
  id:string
  kind:ActivityKind
  label:string
  details:string
  songId?:string|null
  songTitle?:string
  source?:string
  sessionId?:string
  setlistId?:string
  setlistName?:string
  inventoryStockItemId?:string
  inventoryProgramId?:string
  inventoryProvider?:string
  inventoryDelta?:number
  restoreData?:ActivityRestoreData
  restoredAt?:string|null
  createdAt:string
}

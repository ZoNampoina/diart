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
  songOverrides?: Record<string,{key?:string;bpm?:number|null;notes?:string;transpose?:number;structure?:string;chords?:string;chordLyrics?:string;instrumentNotes?:string;musicianNotes?:Record<string,string>;lyrics?:string}>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type InventoryCategory = string
export type InventoryStockStatus = 'available'|'reserved'|'in_use'|'repair'|'maintenance'|'unavailable'
export type InventoryPortDirection = 'input'|'output'|'bidirectional'|'power'
export type InventorySignalLevel = 'mic'|'line'|'instrument'|'speaker'|'digital'|'midi'|'power'|'unknown'
export type InventoryPhantomMode = 'none'|'required'|'supported'|'blocked'

export interface InventoryCharacteristic {
  id: string
  label: string
  value: string
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
}

export interface InventoryMaterial {
  id: string
  name: string
  quantity: number
  category: InventoryCategory
  stockItemId?: string
  loaded?: boolean
  returned?: boolean
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

export interface InstallationNode {
  id: string
  name: string
  stockItemId?: string
  x?: number
  y?: number
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

export interface InventoryInstallation {
  nodes: InstallationNode[]
  links: InstallationLink[]
  suggestions?: InstallationSuggestion[]
  aiSummary?: string
  analyzedAt?: string
  analysisMode?: 'local'|'ai'
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
  installation?: InventoryInstallation
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}


export type ActivityKind = 'create'|'update'|'import'|'complete'|'delete'|'restore'|'merge'|'export'|'backup_restore'|'play'

export interface ActivityRestoreData {
  kind:'song_field'
  field:keyof SongDraft
  value:unknown
  label:string
}

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

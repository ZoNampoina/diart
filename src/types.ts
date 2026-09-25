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
  songOverrides?: Record<string,{key?:string;bpm?:number|null;notes?:string;transpose?:number;structure?:string;chords?:string;instrumentNotes?:string;musicianNotes?:Record<string,string>;lyrics?:string}>
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
  restoreData?:ActivityRestoreData
  restoredAt?:string|null
  createdAt:string
}

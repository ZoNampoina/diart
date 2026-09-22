export type SongSource = 'demo' | 'manual' | 'import'

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
  favorite: boolean
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

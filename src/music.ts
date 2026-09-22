import type { Song, SongDraft } from './types'

const FLAT_TO_SHARP: Record<string, string> = {
  Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#',
  db: 'C#', eb: 'D#', gb: 'F#', ab: 'G#', bb: 'A#'
}

const SHARP_NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const FLAT_NOTES = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
const NOTE_INDEX: Record<string, number> = {
  C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11
}

export function normalizeText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

export function normalizeKey(value: unknown): string {
  const raw = normalizeText(value)
  if (!raw) return ''
  const compact = raw.replace(/\s+/g, '')
  const m = compact.match(/^([A-Ga-g])([#b♯♭]?)(minor|major|min|maj|m)?(.*)$/)
  if (!m) return raw
  let root = m[1].toUpperCase() + m[2].replace('♯', '#').replace('♭', 'b')
  const quality = (m[3] ?? '').toLowerCase()
  const suffix = m[4] ?? ''
  const q = quality === 'minor' || quality === 'min' || quality === 'm' ? 'm' : quality === 'major' || quality === 'maj' ? '' : ''
  return `${root}${q}${suffix}`
}

export function transposeKey(value: string, semitones: number): string {
  const raw = normalizeText(value)
  if (!raw || semitones === 0) return raw
  const match = raw.match(/^([A-Ga-g])([#b♯♭]?)(.*)$/)
  if (!match) return raw
  const root = match[1].toUpperCase() + match[2].replace('♯','#').replace('♭','b')
  const index = NOTE_INDEX[root]
  if (index === undefined) return raw
  const preferFlats = root.includes('b')
  const notes = preferFlats ? FLAT_NOTES : SHARP_NOTES
  const next = (index + (semitones % 12) + 12) % 12
  return notes[next] + (match[3] ?? '')
}

export function transposeChordText(value: string, semitones: number): string {
  if (!value || semitones === 0) return value
  return value.split(/(\s+|[|,;])/).map(token => {
    const match = token.match(/^([A-Ga-g][#b♯♭]?)([^/]*)(?:\/([A-Ga-g][#b♯♭]?))?(.*)$/)
    if (!match) return token
    const root = transposeKey(match[1], semitones)
    const bass = match[3] ? '/' + transposeKey(match[3], semitones) : ''
    return root + (match[2] ?? '') + bass + (match[4] ?? '')
  }).join('')
}

export function formatSemitoneOffset(value: number): string {
  if (value === 0) return '0'
  return value > 0 ? `+${value}` : String(value)
}

export function parseBpm(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(String(value).replace(',', '.').match(/\d+(?:\.\d+)?/)?.[0])
  if (!Number.isFinite(n)) return null
  return Math.round(n)
}

export function parseDuration(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 0 && value < 1) return Math.round(value * 24 * 60 * 60)
    return Math.round(value)
  }
  const s = normalizeText(value)
  if (!s) return null
  if (/^\d+:\d{1,2}$/.test(s)) {
    const [m, sec] = s.split(':').map(Number)
    return m * 60 + sec
  }
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n) : null
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.map(normalizeText).filter(Boolean))]
  return [...new Set(normalizeText(value).split(/[;,|]/).map((v) => v.trim()).filter(Boolean))]
}

export function normalizeIdentity(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function duplicateKey(title: string, artist: string): string {
  return `${normalizeIdentity(title)}::${normalizeIdentity(artist)}`
}

export function emptySongDraft(): SongDraft {
  return {
    title: '', artist: '', authorComposer: '', originalKey: '', personalKey: '', bpm: null,
    timeSignature: '', style: '', durationSeconds: null, tags: [], notes: '', referenceUrl: '',
    capo: null, structure: '', chords: '', instrumentNotes: '', favorite: false, source: 'manual'
  }
}

export function searchSong(song: Song, query: string): boolean {
  const q = normalizeIdentity(query)
  if (!q) return true
  const haystack = [
    song.title, song.artist, song.authorComposer, song.originalKey, song.personalKey,
    song.bpm ?? '', song.timeSignature, song.style, song.tags.join(' '), song.notes,
    song.structure ?? '', song.chords ?? '', song.instrumentNotes ?? ''
  ].map((v) => normalizeIdentity(String(v))).join(' ')
  return haystack.includes(q)
}

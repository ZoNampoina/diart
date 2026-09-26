import type { Song, SongDraft } from './types'

const CANONICAL_ENHARMONIC: Record<string,string> = {
  'A#':'Bb',
  'D#':'Eb',
  'G#':'Ab'
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
  root = CANONICAL_ENHARMONIC[root] ?? root
  const quality = (m[3] ?? '').toLowerCase()
  const suffix = m[4] ?? ''
  const q = quality === 'minor' || quality === 'min' || quality === 'm' ? 'm' : quality === 'major' || quality === 'maj' ? '' : ''
  return `${root}${q}${suffix}`
}

export function transposeKey(value: string, semitones: number): string {
  const raw = normalizeText(value)
  if (!raw) return raw
  const match = raw.match(/^([A-Ga-g])([#b♯♭]?)(.*)$/)
  if (!match) return raw
  const root = match[1].toUpperCase() + match[2].replace('♯','#').replace('♭','b')
  const index = NOTE_INDEX[root]
  if (index === undefined) return raw
  const preferFlats = root.includes('b')
  const notes = preferFlats ? FLAT_NOTES : SHARP_NOTES
  const next = (index + (semitones % 12) + 12) % 12
  const nextRoot = CANONICAL_ENHARMONIC[notes[next]] ?? notes[next]
  return nextRoot + (match[3] ?? '')
}

export function transposeChordText(value: string, semitones: number): string {
  if (!value) return value
  return value.split(/(\s+|[|,;])/).map(token => {
    const match = token.match(/^([A-Ga-g][#b♯♭]?)([^/]*)(?:\/([A-Ga-g][#b♯♭]?))?(.*)$/)
    if (!match) return token
    const root = transposeKey(match[1], semitones)
    const bass = match[3] ? '/' + transposeKey(match[3], semitones) : ''
    return root + (match[2] ?? '') + bass + (match[4] ?? '')
  }).join('')
}


export type ParsedChordLyrics = {
  lyrics: string
  chords: string
  chordLyrics: string
  chordLineCount: number
}

const CHORD_TOKEN_RE = /^[A-G](?:#|b|♯|♭)?(?:(?:maj|min|dim|aug|sus|add|m|M)?(?:2|4|5|6|7|9|11|13)?(?:[#b](?:5|9|11|13))?(?:\([^)]*\))?)*(?:\/[A-G](?:#|b|♯|♭)?)?$/

function cleanChordToken(token:string):string{
  return token.trim().replace(/^[|:;,]+|[|:;,]+$/g,'')
}

export function isChordLine(line:string):boolean{
  const raw=line.trim()
  if(!raw)return false
  if(/^\[[^\]]+\]$/.test(raw))return false
  const tokens=raw.split(/\s+/).map(cleanChordToken).filter(Boolean)
  if(!tokens.length)return false
  const musical=tokens.filter(token=>CHORD_TOKEN_RE.test(token))
  if(musical.length!==tokens.length)return false
  return musical.length>=1
}

export function parseChordLyricsText(value:string):ParsedChordLyrics{
  const chordLyrics=String(value??'').replace(/\r/g,'').replace(/\u00a0/g,' ')
  const lyricLines:string[]=[]
  const chordLines:string[]=[]
  let chordLineCount=0

  for(const sourceLine of chordLyrics.split('\n')){
    const line=sourceLine.replace(/[ \t]+$/,'')
    const inline=[...line.matchAll(/\[([^\]]+)\]/g)]
    if(inline.length){
      const inlineChords=inline.map(x=>x[1].trim()).filter(Boolean)
      const lyric=line.replace(/\[[^\]]+\]/g,'').trim()
      if(inlineChords.length&&inlineChords.every(chord=>CHORD_TOKEN_RE.test(cleanChordToken(chord)))){
        chordLines.push(inlineChords.join(' '))
        chordLineCount++
        if(lyric)lyricLines.push(lyric)
        else if(lyricLines.length&&lyricLines[lyricLines.length-1]!=='')lyricLines.push('')
        continue
      }
    }
    if(isChordLine(line)){
      chordLines.push(line.trim().replace(/\s+/g,' '))
      chordLineCount++
      continue
    }
    if(line.trim())lyricLines.push(line.trim())
    else if(lyricLines.length&&lyricLines[lyricLines.length-1]!=='')lyricLines.push('')
  }

  return {
    lyrics: lyricLines.join('\n').replace(/\n{3,}/g,'\n\n').trim(),
    chords: chordLines.join('\n').replace(/\n{3,}/g,'\n\n').trim(),
    chordLyrics: chordLyrics.trim(),
    chordLineCount
  }
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
    capo: null, structure: '', chords: '', chordLyrics: '', instrumentNotes: '', musicianNotes: {}, lyrics: '', favorite: false, favoriteStatus: '', source: 'manual'
  }
}

export function searchSong(song: Song, query: string): boolean {
  const raw=String(query??'').trim()
  if(!raw)return true
  let residual=raw

  const withoutLyrics=/\bsans\s+(?:les\s+)?paroles?\b/i.test(residual)
  const withLyrics=/\bavec\s+(?:les\s+)?paroles?\b/i.test(residual)
  const withoutChords=/\bsans\s+(?:les\s+)?accords?\b/i.test(residual)
  const withChords=/\bavec\s+(?:les\s+)?accords?\b/i.test(residual)
  if(withoutLyrics&&song.lyrics?.trim())return false
  if(withLyrics&&!song.lyrics?.trim())return false
  if(withoutChords&&song.chords?.trim())return false
  if(withChords&&!song.chords?.trim())return false
  residual=residual.replace(/\b(?:sans|avec)\s+(?:les\s+)?(?:paroles?|accords?)\b/gi,' ')

  const bpmRange=residual.match(/\b(?:entre\s+)?(\d{2,3})\s*(?:et|a|à|[-–])\s*(\d{2,3})\s*(?:bpm)?\b/i)
  if(bpmRange){
    const lo=Math.min(Number(bpmRange[1]),Number(bpmRange[2])),hi=Math.max(Number(bpmRange[1]),Number(bpmRange[2]))
    if(song.bpm===null||song.bpm<lo||song.bpm>hi)return false
    residual=residual.replace(bpmRange[0],' ')
  }else{
    const bpmExact=residual.match(/\b(?:bpm\s*)?(\d{2,3})\s*bpm\b/i)
    if(bpmExact){if(song.bpm!==Number(bpmExact[1]))return false;residual=residual.replace(bpmExact[0],' ')}
  }

  const signature=residual.match(/\b(2\/4|3\/4|4\/4|5\/4|6\/8|7\/8|9\/8|12\/8)\b/)
  if(signature){if(song.timeSignature!==signature[1])return false;residual=residual.replace(signature[0],' ')}

  const keyMatch=residual.match(/\b(?:en|tonalit[eé]\s*[:=]?)\s*(Ab|A|Bb|B|C#?|D|Eb|E|F#?|G)\b/i)
  if(keyMatch){
    const wanted=normalizeKey(keyMatch[1])
    if(normalizeKey(song.originalKey)!==wanted&&normalizeKey(song.personalKey)!==wanted)return false
    residual=residual.replace(keyMatch[0],' ')
  }

  const haystack = [
    song.title, song.artist, song.authorComposer, song.originalKey, song.personalKey,
    song.bpm ?? '', song.timeSignature, song.style, song.tags.join(' '), song.notes,
    song.structure ?? '', song.chords ?? '', song.chordLyrics ?? '', song.instrumentNotes ?? '',
    Object.entries(song.musicianNotes??{}).map(([role,note])=>role+' '+note).join(' '),song.lyrics ?? ''
  ].map((v) => normalizeIdentity(String(v))).join(' ')
  const terms=normalizeIdentity(residual).split(' ').filter(Boolean)
  return terms.every(term=>haystack.includes(term))
}

import * as XLSX from 'xlsx'
import type { ImportField, ImportMapping, ImportRowPreview, Song, SongDraft } from './types'
import { duplicateKey, normalizeKey, normalizeText, parseBpm, parseDuration, parseTags } from './music'

export interface ParsedWorkbook {
  fileName: string
  sheetNames: string[]
  sheets: Record<string, Record<string, unknown>[]>
}

export async function parseWorkbook(file: File): Promise<ParsedWorkbook> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type:'array', cellDates:true })
  const sheets: Record<string, Record<string, unknown>[]> = {}
  for (const name of wb.SheetNames) {
    sheets[name] = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval:'' })
  }
  return { fileName:file.name, sheetNames:wb.SheetNames, sheets }
}

const aliases: Record<ImportField, string[]> = {
  title:['title','titre','chanson','chant','song','morceau','nom chanson','nom du chant'],
  artist:['artist','artiste','interprete','interprète','singer','groupe'],
  authorComposer:['author','auteur','composer','compositeur','auteur compositeur','songwriter'],
  originalKey:['original key','key original','tonalite originale','tonalité originale','original tone'],
  personalKey:['personal key','key','tonalite','tonalité','tone','cle','clé'],
  bpm:['bpm','tempo','tempo bpm'],
  timeSignature:['signature','time signature','mesure','signature rythmique','meter'],
  style:['style','genre','genre musical'],
  duration:['duration','durée','duree','length'],
  tags:['tags','tag','mots cles','mots-clés','keywords'],
  notes:['notes','note','commentaires','commentaire','remarks'],
  referenceUrl:['url','lien','link','reference','référence'],
  capo:['capo','capodastre'],
  structure:['structure','song structure','plan'],
  chords:['accords','chords','grille','grille accords'],
  chordLyrics:['paroles + accords','lyrics + chords','lyrics chords','chord lyrics','paroles accords'],
  instrumentNotes:['notes instrumentales','instrument notes','repères instrument','reperes instrument'],
  lyrics:['paroles','lyrics','texte','song lyrics']
}

function normHeader(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim()
}

export function suggestMapping(headers: string[]): ImportMapping {
  const mapping: ImportMapping = {}
  const used = new Set<ImportField>()
  for (const header of headers) {
    const h = normHeader(header)
    let found: ImportField | '' = ''
    for (const [field, names] of Object.entries(aliases) as [ImportField,string[]][]) {
      if (used.has(field)) continue
      if (names.map(normHeader).includes(h)) { found = field; break }
    }
    mapping[header] = found
    if (found) used.add(found)
  }
  return mapping
}

export function rowsToPreview(rows: Record<string, unknown>[], mapping: ImportMapping, existing: Song[]): ImportRowPreview[] {
  const existingByKey = new Map(existing.filter(s=>!s.deletedAt).map(s=>[duplicateKey(s.title,s.artist),s]))
  const preview: ImportRowPreview[] = []
  rows.forEach((raw, idx) => {
    const read = (field: ImportField): unknown => {
      const header = Object.keys(mapping).find(k => mapping[k] === field)
      return header ? raw[header] : ''
    }
    const title = normalizeText(read('title'))
    const artist = normalizeText(read('artist'))
    const draft: SongDraft = {
      title,
      artist,
      authorComposer: normalizeText(read('authorComposer')),
      originalKey: normalizeKey(read('originalKey')),
      personalKey: normalizeKey(read('personalKey')),
      bpm: parseBpm(read('bpm')),
      timeSignature: normalizeText(read('timeSignature')),
      style: normalizeText(read('style')),
      durationSeconds: parseDuration(read('duration')),
      tags: parseTags(read('tags')),
      notes: normalizeText(read('notes')),
      referenceUrl: normalizeText(read('referenceUrl')),
      capo: parseBpm(read('capo')),
      structure: normalizeText(read('structure')),
      chords: normalizeText(read('chords')),
      instrumentNotes: normalizeText(read('instrumentNotes')),
      lyrics: String(read('lyrics') ?? '').trim(),
      favorite:false,
      source:'import'
    }
    const duplicate = existingByKey.get(duplicateKey(title, artist))
    preview.push({
      sourceIndex:idx,
      raw,
      draft,
      duplicateId:duplicate?.id,
      duplicateLabel:duplicate ? `${duplicate.title} — ${duplicate.artist || 'Artiste inconnu'}` : undefined,
      valid:Boolean(title),
      error:title ? undefined : 'Titre manquant'
    })
  })
  return preview
}

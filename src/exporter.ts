import * as XLSX from 'xlsx'
import { db } from './db'
import type { BackupFile, Song } from './types'
import { formatDuration } from './music'

function downloadBlob(content: BlobPart, type: string, filename: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(()=>URL.revokeObjectURL(url), 0)
}

export async function exportJson(): Promise<void> {
  const songs = await db.songs.toArray()
  const settingsRows = await db.settings.toArray()
  const settings = Object.fromEntries(settingsRows.map(x=>[x.key,x.value]))
  const payload: BackupFile = { schemaVersion:1, exportedAt:new Date().toISOString(), app:"DI'ART by ARIZONA", songs, settings }
  downloadBlob(JSON.stringify(payload,null,2), 'application/json', `diart-backup-${new Date().toISOString().slice(0,10)}.json`)
}

function flatSong(song: Song) {
  return {
    Titre:song.title, Artiste:song.artist, 'Auteur/Compositeur':song.authorComposer,
    'Tonalité originale':song.originalKey, 'Tonalité personnelle':song.personalKey,
    BPM:song.bpm ?? '', Signature:song.timeSignature, Style:song.style,
    Durée:formatDuration(song.durationSeconds), Capo:song.capo ?? '', Tags:song.tags.join('; '),
    Structure:song.structure ?? '', Accords:song.chords ?? '', 'Notes instrumentales':song.instrumentNotes ?? '', Paroles:song.lyrics ?? '', Notes:song.notes,
    Lien:song.referenceUrl, Favori:song.favorite ? 'Oui':'Non', Source:song.source,
    'Date ajout':song.createdAt, 'Dernière modification':song.updatedAt
  }
}

export async function exportCsv(): Promise<void> {
  const songs = (await db.songs.toArray()).filter(s=>!s.deletedAt)
  const sheet = XLSX.utils.json_to_sheet(songs.map(flatSong))
  const csv = XLSX.utils.sheet_to_csv(sheet)
  downloadBlob('\ufeff'+csv, 'text/csv;charset=utf-8', `diart-bibliotheque-${new Date().toISOString().slice(0,10)}.csv`)
}

export async function exportXlsx(): Promise<void> {
  const songs = (await db.songs.toArray()).filter(s=>!s.deletedAt)
  const sheet = XLSX.utils.json_to_sheet(songs.map(flatSong))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'Bibliothèque')
  XLSX.writeFile(wb, `diart-bibliotheque-${new Date().toISOString().slice(0,10)}.xlsx`)
}

export async function restoreJson(file: File): Promise<{songs:number; settings:number}> {
  const raw = JSON.parse(await file.text()) as BackupFile
  if (raw.schemaVersion !== 1 || raw.app !== "DI'ART by ARIZONA" || !Array.isArray(raw.songs)) throw new Error('Sauvegarde DI\'ART non reconnue.')
  await db.transaction('rw', db.songs, db.settings, async ()=>{
    await db.songs.clear()
    await db.settings.clear()
    await db.songs.bulkPut(raw.songs)
    await db.settings.bulkPut(Object.entries(raw.settings ?? {}).map(([key,value])=>({key,value})))
  })
  return { songs:raw.songs.length, settings:Object.keys(raw.settings ?? {}).length }
}

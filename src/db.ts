import Dexie, { type EntityTable } from 'dexie'
import type { ActivityEntry, ActivityKind, AppSetting, Song, SongDraft, Setlist } from './types'
import { demoSongs } from './demo'

class DiartDB extends Dexie {
  songs!: EntityTable<Song, 'id'>
  settings!: EntityTable<AppSetting, 'key'>
  setlists!: EntityTable<Setlist, 'id'>
  activity!: EntityTable<ActivityEntry, 'id'>

  constructor() {
    super('diart-db')
    this.version(1).stores({
      songs: 'id, title, artist, authorComposer, favorite, createdAt, updatedAt, lastViewedAt, source, deletedAt',
      settings: 'key'
    })
    this.version(2).stores({
      songs: 'id, title, artist, authorComposer, favorite, createdAt, updatedAt, lastViewedAt, source, deletedAt',
      settings: 'key',
      setlists: 'id, name, createdAt, updatedAt, deletedAt'
    })
    this.version(3).stores({
      songs: 'id, title, artist, authorComposer, favorite, createdAt, updatedAt, lastViewedAt, source, deletedAt',
      settings: 'key',
      setlists: 'id, name, createdAt, updatedAt, deletedAt',
      activity: 'id, kind, songId, source, createdAt'
    })
  }
}

export const db = new DiartDB()

const now = () => new Date().toISOString()

export async function ensureDemoSeed(): Promise<void> {
  const seeded = await db.settings.get('demoSeedState')
  if (seeded) return
  const count = await db.songs.count()
  if (count === 0) {
    const t = now()
    await db.songs.bulkAdd(demoSongs.map((draft, i) => ({
      ...draft,
      id: crypto.randomUUID(),
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      updatedAt: t,
      lastViewedAt: null,
      deletedAt: null
    })))
  }
  await db.settings.put({ key:'demoSeedState', value:'seeded' })
}

export async function createSong(draft: SongDraft): Promise<Song> {
  const t = now()
  const song: Song = { ...draft, id: crypto.randomUUID(), createdAt:t, updatedAt:t, lastViewedAt:null, deletedAt:null }
  await db.songs.add(song)
  return song
}

export async function updateSong(id: string, patch: Partial<SongDraft>): Promise<void> {
  await db.songs.update(id, { ...patch, updatedAt: now() })
}

export async function softDeleteSong(id: string): Promise<void> {
  await db.songs.update(id, { deletedAt: now(), updatedAt: now() })
}

export async function restoreSong(id: string): Promise<void> {
  await db.songs.update(id, { deletedAt: null, updatedAt: now() })
}

export async function markViewed(id: string): Promise<void> {
  await db.songs.update(id, { lastViewedAt: now() })
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value })
}

export async function getSetting(key: string, fallback = ''): Promise<string> {
  return (await db.settings.get(key))?.value ?? fallback
}

export async function createSetlist(name: string): Promise<Setlist> {
  const t = now()
  const item: Setlist = { id:crypto.randomUUID(), name:name.trim() || 'Nouvelle setlist', songIds:[], notes:'', rehearsalNotes:{}, createdAt:t, updatedAt:t, deletedAt:null }
  await db.setlists.add(item)
  return item
}

export async function updateSetlist(id:string, patch:Partial<Omit<Setlist,'id'|'createdAt'>>): Promise<void> {
  await db.setlists.update(id,{...patch,updatedAt:now()})
}


export async function logActivity(kind:ActivityKind,label:string,details:string,meta:{songId?:string|null;songTitle?:string;source?:string}={}):Promise<ActivityEntry>{
  const entry:ActivityEntry={id:crypto.randomUUID(),kind,label,details,createdAt:now(),songId:meta.songId??null,songTitle:meta.songTitle??'',source:meta.source??''}
  await db.activity.add(entry)
  return entry
}

export async function listActivity(limit=300):Promise<ActivityEntry[]>{
  return db.activity.orderBy('createdAt').reverse().limit(limit).toArray()
}

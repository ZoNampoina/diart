import Dexie, { type EntityTable } from 'dexie'
import type { AppSetting, Song, SongDraft } from './types'
import { demoSongs } from './demo'

class DiartDB extends Dexie {
  songs!: EntityTable<Song, 'id'>
  settings!: EntityTable<AppSetting, 'key'>

  constructor() {
    super('diart-db')
    this.version(1).stores({
      songs: 'id, title, artist, authorComposer, favorite, createdAt, updatedAt, lastViewedAt, source, deletedAt',
      settings: 'key'
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

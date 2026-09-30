import { describe, expect, it } from 'vitest'
import type { Song } from './types'
import { classifySongOrigin, parseSmartList, scoreSongMatch, stripListNumber } from './smart-list-import'

const song=(id:string,title:string,artist:string):Song=>({
  id,title,artist,authorComposer:'',originalKey:'',personalKey:'',bpm:null,timeSignature:'',style:'',
  durationSeconds:null,tags:[],notes:'',referenceUrl:'',capo:null,structure:'',chords:'',chordLyrics:'',
  instrumentNotes:'',musicianNotes:{},lyrics:'',favorite:false,favoriteStatus:'',createdAt:'2026-01-01T00:00:00.000Z',
  updatedAt:'2026-01-01T00:00:00.000Z',lastViewedAt:null,source:'manual',deletedAt:null
})

describe('Smart list import',()=>{
  it('strips common list numbering without losing the title',()=>{
    expect(stripListNumber('01. Perfect - Ed Sheeran')).toBe('Perfect - Ed Sheeran')
    expect(stripListNumber('3-Titre_Artiste')).toBe('Titre_Artiste')
  })

  it('detects a probable title and artist while leaving title-only lines intact',()=>{
    const rows=parseSmartList('1-Perfect-Ed Sheeran\n2-Je te promets',[])
    expect(rows[0].title).toBe('Perfect')
    expect(rows[0].artist).toBe('Ed Sheeran')
    expect(rows[1].title).toBe('Je te promets')
    expect(rows[1].artist).toBe('')
  })

  it('fuzzy-matches punctuation, accents and partial artist names',()=>{
    const local=song('a','Fly me to moon','Sinatra')
    expect(scoreSongMatch('Fly Me To The Moon','Frank Sinatra',local)).toBeGreaterThanOrEqual(65)
  })

  it('does not classify a short international title from one weak Malagasy token',()=>{
    expect(classifySongOrigin('Ho Hey','The Lumineers',[])).toBe('unknown')
    expect(classifySongOrigin('Fitiavako','',[])).toBe('malagasy')
  })

  it('does not auto-select title-only collisions',()=>{
    const library=[song('a','Hallelujah','Jeff Buckley'),song('b','Hallelujah','Leonard Cohen')]
    const [row]=parseSmartList('Hallelujah',library)
    expect(row.status).toBe('confirm')
    expect(row.chosenSongId).toBeUndefined()
  })

  it('preserves the original line order and original text',()=>{
    const raw='03. Third / Artist C\n1-First_Artist A\n2-Second - Artist B'
    const rows=parseSmartList(raw,[])
    expect(rows.map(r=>r.position)).toEqual([1,2,3])
    expect(rows.map(r=>r.original)).toEqual(['03. Third / Artist C','1-First_Artist A','2-Second - Artist B'])
  })
})

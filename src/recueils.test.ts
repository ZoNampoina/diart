import { describe, expect, it } from 'vitest'
import { parseChordPro } from './recueils'

describe('Recueils V1 ChordPro',()=>{
  it('parses metadata lyrics and chords',()=>{
    const song=parseChordPro(`{title: Test Song}
{artist: Test Artist}
{key: Bb}
{capo: 2}
{tempo: 96}
[C]Hello [G/B]world
[Am]Second line`)
    expect(song.title).toBe('Test Song')
    expect(song.artist).toBe('Test Artist')
    expect(song.originalKey).toBe('Bb')
    expect(song.capo).toBe(2)
    expect(song.bpm).toBe(96)
    expect(song.lyrics).toContain('Hello world')
    expect(song.chords).toContain('C  G/B')
  })
})

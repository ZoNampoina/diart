import { describe, expect, it } from 'vitest'
import { duplicateKey, normalizeKey, parseBpm, parseChordLyricsText, parseDuration, parseTags, transposeKey, transposeChordText } from './music'

describe('music utils', () => {
  it('normalizes keys', () => {
    expect(normalizeKey('g min')).toBe('Gm')
    expect(normalizeKey('Eb')).toBe('Eb')
    expect(normalizeKey('A#')).toBe('Bb')
    expect(normalizeKey('D#')).toBe('Eb')
    expect(normalizeKey('G#')).toBe('Ab')
  })
  it('parses bpm and durations', () => {
    expect(parseBpm('Tempo 72 BPM')).toBe(72)
    expect(parseDuration('4:05')).toBe(245)
  })
  it('transposes keys and chord sheets', () => {
    expect(transposeKey('C', 2)).toBe('D')
    expect(transposeKey('Bb', 2)).toBe('C')
    expect(transposeKey('F#m7', -2)).toBe('Em7')
    expect(transposeChordText('C G/B Am7 F', 2)).toBe('D A/C# Bm7 G')
    expect(transposeKey('G',3)).toBe('Bb')
    expect(transposeKey('C',3)).toBe('Eb')
    expect(transposeKey('F',3)).toBe('Ab')
    expect(transposeChordText('A# D# G#',0)).toBe('Bb Eb Ab')
  })
  it('removes chord placeholders from lyrics and spaces only musical sections', () => {
    const parsed=parseChordLyricsText(`[Verse 1]
Am                Dm
Fly me to the moon

Dm                G
And let me play

[Am]
Among the stars

[Chorus]
F                 C
Let me see what spring is like

G                 Am
On Jupiter and Mars`)
    expect(parsed.lyrics).toBe(`[Verse 1]
Fly me to the moon
And let me play
Among the stars

[Chorus]
Let me see what spring is like
On Jupiter and Mars`)
    expect(parsed.chords).toBe(`Am Dm
Dm G
Am
F C
G Am`)
  })
  it('parses tags and duplicate identity', () => {
    expect(parseTags('Worship; 6/8, Worship')).toEqual(['Worship','6/8'])
    expect(duplicateKey('Grâce infinie','Northline')).toBe(duplicateKey('Grace infinie','northline'))
  })
})

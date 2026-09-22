import { describe, expect, it } from 'vitest'
import { duplicateKey, normalizeKey, parseBpm, parseDuration, parseTags, transposeKey, transposeChordText } from './music'

describe('music utils', () => {
  it('normalizes keys', () => {
    expect(normalizeKey('g min')).toBe('Gm')
    expect(normalizeKey('Eb')).toBe('D#')
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
  })
  it('parses tags and duplicate identity', () => {
    expect(parseTags('Worship; 6/8, Worship')).toEqual(['Worship','6/8'])
    expect(duplicateKey('Grâce infinie','Northline')).toBe(duplicateKey('Grace infinie','northline'))
  })
})

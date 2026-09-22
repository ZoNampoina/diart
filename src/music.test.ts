import { describe, expect, it } from 'vitest'
import { duplicateKey, normalizeKey, parseBpm, parseDuration, parseTags } from './music'

describe('music utils', () => {
  it('normalizes keys', () => {
    expect(normalizeKey('g min')).toBe('Gm')
    expect(normalizeKey('Eb')).toBe('D#')
  })
  it('parses bpm and durations', () => {
    expect(parseBpm('Tempo 72 BPM')).toBe(72)
    expect(parseDuration('4:05')).toBe(245)
  })
  it('parses tags and duplicate identity', () => {
    expect(parseTags('Worship; 6/8, Worship')).toEqual(['Worship','6/8'])
    expect(duplicateKey('Grâce infinie','Northline')).toBe(duplicateKey('Grace infinie','northline'))
  })
})

import { describe, expect, it } from 'vitest'
import { suggestMapping } from './importer'

describe('Excel column mapping', () => {
  it('maps Carnet de note Tonalité headers', () => {
    expect(suggestMapping(['Artiste','Titre','Tonalité','Tempo'])).toEqual({
      Artiste: 'artist',
      Titre: 'title',
      'Tonalité': 'personalKey',
      Tempo: 'bpm'
    })
  })

  it('maps Playlist headers', () => {
    expect(suggestMapping(['Auteur','Titre','Tonalité'])).toEqual({
      Auteur: 'authorComposer',
      Titre: 'title',
      'Tonalité': 'personalKey'
    })
  })
})

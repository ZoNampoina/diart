import type { SongDraft } from './types'
import { emptySongDraft, normalizeKey, parseBpm } from './music'

export type RecueilSource = {
  id:string
  name:string
  description:string
  kind:'external'|'import'
  searchUrl?:(query:string)=>string
  homepage:string
  badge:string
}

export const recueilSources:RecueilSource[]=[
  {
    id:'tononkira',
    name:'Tononkira Malagasy',
    description:'Paroles et accords malgaches. Recherche publique par titre / artiste.',
    kind:'external',
    searchUrl:(query)=>`https://tononkira.serasera.org/tononkira?q=${encodeURIComponent(query)}`,
    homepage:'https://tononkira.serasera.org/',
    badge:'MG'
  },
  {
    id:'ultimate-guitar',
    name:'Ultimate Guitar',
    description:'Tabs et accords internationaux. Le contenu reste consulté sur la source.',
    kind:'external',
    searchUrl:(query)=>`https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(query)}`,
    homepage:'https://www.ultimate-guitar.com/',
    badge:'UG'
  },
  {
    id:'chordify',
    name:'Chordify',
    description:'Recherche d’accords et accompagnement interactif.',
    kind:'external',
    searchUrl:(query)=>`https://chordify.net/search/${encodeURIComponent(query)}`,
    homepage:'https://chordify.net/',
    badge:'CH'
  },
  {
    id:'chordpro',
    name:'ChordPro',
    description:'Import direct d’un fichier .pro, .chopro, .cho, .crd ou .txt dans DI’ART.',
    kind:'import',
    homepage:'https://www.chordpro.org/',
    badge:'CP'
  }
]

const directiveAliases:Record<string,string>={
  t:'title',title:'title',
  artist:'artist',subtitle:'artist',st:'artist',
  key:'key',
  capo:'capo',
  tempo:'tempo',bpm:'tempo'
}

export function parseChordPro(text:string):SongDraft{
  const draft=emptySongDraft()
  draft.source='import'
  const lyrics:string[]=[]
  const chordRows:string[]=[]
  const bodyLines=text.replace(/\r/g,'').split('\n')

  for(const rawLine of bodyLines){
    const line=rawLine.trimEnd()
    const directive=line.match(/^\{\s*([^}:]+)\s*:\s*(.*?)\s*\}$/)
    if(directive){
      const key=directiveAliases[directive[1].trim().toLowerCase()]
      const value=directive[2].trim()
      if(key==='title') draft.title=value
      else if(key==='artist'&&!draft.artist) draft.artist=value
      else if(key==='key') {draft.originalKey=normalizeKey(value);draft.personalKey=normalizeKey(value)}
      else if(key==='capo') {const n=Number(value);draft.capo=Number.isFinite(n)?Math.max(0,Math.min(12,Math.round(n))):null}
      else if(key==='tempo') draft.bpm=parseBpm(value)
      continue
    }
    if(/^\{\s*(comment|c)\s*:/i.test(line)){
      const comment=line.replace(/^\{\s*(?:comment|c)\s*:\s*/i,'').replace(/\}\s*$/,'').trim()
      if(comment) draft.structure = draft.structure ? draft.structure+'\n'+comment : comment
      continue
    }
    if(/^\{\s*(start_of_|end_of_|soc|eoc|sov|eov|sob|eob)/i.test(line)) continue

    const chords=[...line.matchAll(/\[([^\]]+)\]/g)].map(m=>m[1].trim()).filter(Boolean)
    const lyric=line.replace(/\[[^\]]+\]/g,'').trim()
    if(chords.length) chordRows.push(chords.join('  '))
    else if(lyric) chordRows.push('')
    if(lyric) lyrics.push(lyric)
    else if(!line.trim()&&lyrics.length&&lyrics[lyrics.length-1]!=='') lyrics.push('')
  }

  draft.lyrics=lyrics.join('\n').replace(/\n{3,}/g,'\n\n').trim()
  draft.chords=chordRows.join('\n').replace(/\n{3,}/g,'\n\n').trim()
  if(!draft.title) draft.title='Morceau ChordPro'
  return draft
}

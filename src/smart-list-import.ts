import type { Song, SongDraft } from './types'
import { emptySongDraft, normalizeIdentity, parseChordLyricsText } from './music'

export type SmartImportStatus='found'|'confirm'|'new'|'importing'|'imported'|'minimal'|'problem'|'ignored'
export type SmartImportOrigin='malagasy'|'international'|'unknown'

export interface SmartImportCandidate{songId:string;label:string;score:number}
export interface SmartImportLine{
  id:string
  position:number
  original:string
  cleaned:string
  title:string
  artist:string
  parseConfidence:number
  status:SmartImportStatus
  candidates:SmartImportCandidate[]
  chosenSongId?:string
  source?:string
  sourceUrl?:string
  note?:string
  origin?:SmartImportOrigin
  manual?:boolean
}

const VERSION_NOISE=/\b(?:live|acoustic|acoustique|version|cover|remix|remastered|radio edit|official(?: video| audio)?|lyrics?|paroles?|karaoke)\b/gi
const FEAT_RE=/\b(?:feat(?:uring)?|ft)\.?\b/gi
const MALAGASY_WORDS=new Set(['ny','aho','ianao','anao','aminao','aminay','antsika','izy','tsy','aza','mbola','rehefa','fitiavana','fitiavako','malala','fo','tanindrazana','mamiko','misy','ho','izao','hianao','tompoko','zanahary','andriamanitra'])
const MALAGASY_ARTISTS:string[]=['mahaleo','rossy','samoela','poopy','njakatiana','tsiliva','tarika','eric manana','d gary','lolo sy ny tariny','dadah','bodo','tovo j hay','ambondrona','jerry marcoss','shyn','denise','rija ramanantoanina','nanie','mika sy davis'].map(x=>normalizeIdentity(x))

export const SMART_IMPORT_THRESHOLDS={auto:90,confirm:65,external:72}

export function normalizeImportText(value:string):string{
  return String(value??'').replace(/[’‘`´]/g,"'").replace(/[\u00a0\t]+/g,' ').replace(/\s+/g,' ').trim()
}

export function stripListNumber(value:string):string{
  return normalizeImportText(value)
    .replace(/^\s*(?:\(?\d{1,3}\)?\s*(?:[.)\-–—:]|\s)\s*)+/,'')
    .replace(/^\s*[•·▪▫►▶✓✔]+\s*/,'')
    .trim()
}

function compactIdentity(value:string):string{
  return normalizeIdentity(value).replace(VERSION_NOISE,' ').replace(FEAT_RE,' ').replace(/\b(?:and|et)\b/g,' ').replace(/\s+/g,' ').trim()
}

function tokens(value:string):string[]{return compactIdentity(value).split(' ').filter(x=>x.length>1)}
function uniq<T>(items:T[]):T[]{return [...new Set(items)]}

function levenshtein(a:string,b:string):number{
  if(a===b)return 0
  if(!a.length)return b.length
  if(!b.length)return a.length
  const prev=Array.from({length:b.length+1},(_,i)=>i)
  for(let i=1;i<=a.length;i++){
    let diag=prev[0];prev[0]=i
    for(let j=1;j<=b.length;j++){
      const up=prev[j],left=prev[j-1],cost=a[i-1]===b[j-1]?0:1
      prev[j]=Math.min(up+1,left+1,diag+cost);diag=up
    }
  }
  return prev[b.length]
}

function textSimilarity(a:string,b:string):number{
  const aa=compactIdentity(a),bb=compactIdentity(b)
  if(!aa||!bb)return 0
  if(aa===bb)return 1
  const ta=uniq(tokens(a)),tb=uniq(tokens(b))
  const sb=new Set(tb)
  const common=ta.filter(x=>sb.has(x)).length
  const jaccard=common/Math.max(1,new Set([...ta,...tb]).size)
  const containment=common/Math.max(1,Math.min(ta.length,tb.length))
  const edit=1-levenshtein(aa,bb)/Math.max(aa.length,bb.length)
  const substring=aa.includes(bb)||bb.includes(aa)?0.9:0
  return Math.max(substring,0.42*edit+0.36*jaccard+0.22*containment)
}

export function scoreSongMatch(title:string,artist:string,song:Pick<Song,'title'|'artist'>):number{
  const titleScore=textSimilarity(title,song.title)
  if(!artist.trim())return Math.round(titleScore*100)
  const artistScore=textSimilarity(artist,song.artist)
  const score=0.72*titleScore+0.28*artistScore
  return Math.max(0,Math.min(100,Math.round(score*100)))
}

function knownArtistSuffix(line:string,songs:Song[]):{title:string;artist:string;confidence:number}|null{
  const normalized=compactIdentity(line)
  if(!normalized)return null
  const artists=uniq(songs.map(s=>s.artist).filter(Boolean)).sort((a,b)=>b.length-a.length)
  for(const artist of artists){
    const a=compactIdentity(artist)
    if(!a||a.split(' ').length>6)continue
    if(normalized===a||!normalized.endsWith(' '+a))continue
    const rawWords=normalizeImportText(line).split(' ')
    const artistWords=normalizeImportText(artist).split(' ').length
    if(rawWords.length<=artistWords)continue
    return {title:rawWords.slice(0,-artistWords).join(' '),artist,confidence:88}
  }
  return null
}

function splitCandidates(line:string,songs:Song[]):Array<{title:string;artist:string;confidence:number}>{
  const out:Array<{title:string;artist:string;confidence:number}>=[]
  const known=knownArtistSuffix(line,songs);if(known)out.push(known)
  const patterns:[RegExp,number][]=[
    [/\s+[_|/:]\s+|\s*[_|]\s*/g,86],
    [/\s+[–—-]\s+/g,88],
    [/\s*\/\s*/g,82],
    [/\s*:\s+/g,80],
    [/-/g,68]
  ]
  for(const [re,base] of patterns){
    re.lastIndex=0
    let match:RegExpExecArray|null
    while((match=re.exec(line))){
      const left=normalizeImportText(line.slice(0,match.index)),right=normalizeImportText(line.slice(match.index+match[0].length))
      if(!left||!right)continue
      const rw=right.split(' ').length,lw=left.split(' ').length
      if(rw>7||lw>16)continue
      const knownArtist=songs.some(s=>textSimilarity(right,s.artist)>=.92)
      const nameShape=rw<=4&&right.length<=45
      const conf=Math.min(98,base+(knownArtist?18:0)+(nameShape?5:0))
      out.push({title:left,artist:right,confidence:conf})
    }
  }
  return out.sort((a,b)=>b.confidence-a.confidence)
}

export function parseSmartList(raw:string,songs:Song[]):SmartImportLine[]{
  const originals=String(raw??'').replace(/\r/g,'').split('\n').map(x=>x.trim()).filter(Boolean)
  return originals.map((original,index)=>{
    const cleaned=stripListNumber(original)
    const split=splitCandidates(cleaned,songs)[0]
    const title=split?.title||cleaned,artist=split?.artist||''
    const local=matchLocalSongs(title,artist,songs)
    const top=local[0]
    let status:SmartImportStatus='new',chosenSongId:string|undefined
    if(top&&top.score>=SMART_IMPORT_THRESHOLDS.auto){status='found';chosenSongId=top.songId}
    else if(top&&top.score>=SMART_IMPORT_THRESHOLDS.confirm)status='confirm'
    return {id:crypto.randomUUID(),position:index+1,original,cleaned,title,artist,parseConfidence:split?.confidence??70,status,candidates:local.slice(0,5),chosenSongId,origin:classifySongOrigin(title,artist,songs)}
  })
}

export function matchLocalSongs(title:string,artist:string,songs:Song[]):SmartImportCandidate[]{
  return songs.filter(s=>!s.deletedAt).map(song=>({songId:song.id,label:`${song.title} — ${song.artist||'Artiste inconnu'}`,score:scoreSongMatch(title,artist,song)})).filter(x=>x.score>=45).sort((a,b)=>b.score-a.score)
}

export function classifySongOrigin(title:string,artist:string,songs:Song[]):SmartImportOrigin{
  const nArtist=compactIdentity(artist),nTitle=compactIdentity(title)
  if(nArtist&&MALAGASY_ARTISTS.some(a=>a===nArtist||a.includes(nArtist)||nArtist.includes(a)))return 'malagasy'
  const localArtist=songs.find(s=>nArtist&&textSimilarity(artist,s.artist)>=.93)
  if(localArtist){
    const source=compactIdentity(`${localArtist.referenceUrl} ${localArtist.notes}`)
    if(/tononkira|acoustic gasy|acousticgasy/.test(source))return 'malagasy'
  }
  const words=nTitle.split(' ').filter(Boolean),hits=words.filter(w=>MALAGASY_WORDS.has(w)).length
  if(hits>=2||(hits>=1&&words.length<=4))return 'malagasy'
  if(nArtist||words.length>=2)return 'unknown'
  return 'unknown'
}

export function externalQueryVariants(title:string,artist:string):Array<{title:string;artist:string}>{
  const t=normalizeImportText(title),a=normalizeImportText(artist)
  const shortArtist=a.split(/\s+/).slice(0,1).join(' ')
  const stripped=t.replace(/\s*[\[(][^\]\)]+[\]\)]\s*/g,' ').replace(VERSION_NOISE,' ').replace(/\s+/g,' ').trim()
  const variants=[{title:t,artist:a},{title:stripped||t,artist:a},{title:t,artist:shortArtist},{title:t,artist:''}]
  const seen=new Set<string>()
  return variants.filter(v=>v.title.length>=2).filter(v=>{const k=compactIdentity(v.title)+'::'+compactIdentity(v.artist);if(seen.has(k))return false;seen.add(k);return true})
}

export function scoreExternalMatch(title:string,artist:string,result:{title:string;artist:string}):number{
  const pseudo={title:result.title,artist:result.artist} as Pick<Song,'title'|'artist'>
  return scoreSongMatch(title,artist,pseudo)
}

export function draftFromExternal(data:{title?:string;artist?:string;sourceUrl?:string;source?:string;structure?:string;chords?:string;chordLyrics?:string;lyrics?:string;originalKey?:string;bpm?:number|null},fallback:{title:string;artist:string}):SongDraft{
  const draft=emptySongDraft()
  draft.title=normalizeImportText(data.title||fallback.title)||fallback.title
  draft.artist=normalizeImportText(data.artist||fallback.artist)
  draft.referenceUrl=data.sourceUrl||''
  draft.structure=data.structure||''
  draft.chords=data.chords||''
  draft.chordLyrics=data.chordLyrics||''
  draft.lyrics=data.lyrics||''
  draft.originalKey=data.originalKey||''
  draft.bpm=data.bpm??null
  if(draft.chordLyrics&&!draft.lyrics){const parsed=parseChordLyricsText(draft.chordLyrics);draft.lyrics=parsed.lyrics;draft.chords=draft.chords||parsed.chords}
  draft.notes=data.source?`Source : ${data.source}`:'Source : Import liste'
  draft.source='import'
  return draft
}

export function minimalDraft(title:string,artist:string):SongDraft{
  const draft=emptySongDraft();draft.title=title||'Morceau sans titre';draft.artist=artist;draft.source='import';draft.notes='Source : Import liste · À compléter';return draft
}

export function missingFieldsPatch(existing:Song,incoming:SongDraft):Partial<SongDraft>{
  const patch:Partial<SongDraft>={}
  const fields=['artist','authorComposer','originalKey','personalKey','bpm','timeSignature','style','durationSeconds','tags','notes','referenceUrl','capo','structure','chords','chordLyrics','instrumentNotes','musicianNotes','lyrics'] as const
  for(const field of fields){
    const current=existing[field] as unknown,incomingValue=incoming[field] as unknown
    const empty=current==null||current===''||(Array.isArray(current)&&current.length===0)||(typeof current==='object'&&!Array.isArray(current)&&Object.keys(current as object).length===0)
    const useful=incomingValue!=null&&incomingValue!==''&&(!Array.isArray(incomingValue)||incomingValue.length>0)
    if(empty&&useful)(patch as unknown as Record<string,unknown>)[field]=incomingValue
  }
  return patch
}

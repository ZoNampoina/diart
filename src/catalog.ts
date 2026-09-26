import { supabase } from './cloud'
import { emptySongDraft } from './music'
import type { SongDraft } from './types'

const RECUEIL_SEARCH_TIMEOUT_MS=12000
const RECUEIL_IMPORT_TIMEOUT_MS=18000

async function withTimeout<T>(work:Promise<T>,ms:number,label:string):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined
  try{
    return await Promise.race([
      work,
      new Promise<T>((_,reject)=>{
        timer=setTimeout(()=>reject(new Error(`${label} n'a pas répondu dans les délais. Réessayez.`)),ms)
      })
    ])
  }finally{
    if(timer)clearTimeout(timer)
  }
}

export interface CatalogRecording {
  id:string
  title:string
  artist:string
  durationSeconds:number|null
  firstReleaseDate:string
  score:number
  tags:string[]
  isrc:string
  source:string
  sourceUrl:string
}

export async function searchGlobalCatalog(query:string):Promise<CatalogRecording[]>{
  const q=query.trim()
  if(q.length<2)return []
  const {data,error}=await supabase.functions.invoke('diart-catalog-search',{body:{query:q}})
  if(error) throw error
  if(data?.error){
    const e=new Error(String(data.error)) as Error & {retryAfterMs?:number}
    e.retryAfterMs=Number(data.retryAfterMs)||undefined
    throw e
  }
  return Array.isArray(data?.results)?data.results:[]
}

export function catalogRecordingToDraft(item:CatalogRecording):SongDraft{
  const draft=emptySongDraft()
  draft.title=item.title
  draft.artist=item.artist
  draft.durationSeconds=item.durationSeconds
  draft.tags=item.tags??[]
  draft.referenceUrl=item.sourceUrl
  draft.notes=[
    'Source catalogue : '+item.source,
    item.firstReleaseDate?'Première sortie : '+item.firstReleaseDate:'',
    item.isrc?'ISRC : '+item.isrc:''
  ].filter(Boolean).join('\n')
  draft.source='import'
  return draft
}

export interface TononkiraReference {
  title:string
  artist:string
  lyrics:string
  sourceUrl:string
  source:string
}

export async function fetchTononkiraReference(url:string):Promise<TononkiraReference>{
  const {data,error}=await withTimeout(
    supabase.functions.invoke('diart-tononkira-reference',{body:{url:url.trim()}}),
    RECUEIL_IMPORT_TIMEOUT_MS,
    'Tononkira'
  )
  if(error) throw error
  if(data?.error) throw new Error(String(data.error))
  return data as TononkiraReference
}

export interface TononkiraSearchResult {
  title:string
  artist:string
  url:string
  score?:number
}

export async function searchTononkira(title:string,artist=''):Promise<TononkiraSearchResult[]>{
  const cleanTitle=title.trim()
  if(cleanTitle.length<2)return []
  const {data,error}=await withTimeout(
    supabase.functions.invoke('diart-tononkira-search',{body:{title:cleanTitle,artist:artist.trim()}}),
    RECUEIL_SEARCH_TIMEOUT_MS,
    'Tononkira'
  )
  if(error) throw error
  if(data?.error) throw new Error(String(data.error))
  return Array.isArray(data?.results)?data.results:[]
}

export type ExternalRecueilSource = 'ultimate-guitar' | 'chordify' | 'acoustic-gasy'

export interface ExternalRecueilResult {
  title:string
  artist:string
  url:string
  subtitle?:string
}

export interface ExternalRecueilImport {
  title:string
  artist:string
  sourceUrl:string
  source:string
  structure?:string
  chords?:string
  chordLyrics?:string
  lyrics?:string
  originalKey?:string
  bpm?:number|null
}

function sourceLabel(source:ExternalRecueilSource){
  if(source==='ultimate-guitar')return 'Ultimate Guitar'
  if(source==='chordify')return 'Chordify'
  return 'Acoustic Gasy'
}

export async function searchExternalRecueil(source:ExternalRecueilSource,title:string,artist=''):Promise<ExternalRecueilResult[]>{
  const cleanTitle=title.trim()
  if(cleanTitle.length<2)return []
  const {data,error}=await withTimeout(
    supabase.functions.invoke('diart-external-recueil',{body:{action:'search',source,title:cleanTitle,artist:artist.trim()}}),
    RECUEIL_SEARCH_TIMEOUT_MS,
    sourceLabel(source)
  )
  if(error) throw error
  if(data?.error) throw new Error(String(data.error))
  return Array.isArray(data?.results)?data.results:[]
}

export async function importExternalRecueil(source:ExternalRecueilSource,url:string):Promise<ExternalRecueilImport>{
  const cleanUrl=url.trim()
  if(!cleanUrl)throw new Error('Lien de source manquant.')
  const {data,error}=await withTimeout(
    supabase.functions.invoke('diart-external-recueil',{body:{action:'import',source,url:cleanUrl}}),
    RECUEIL_IMPORT_TIMEOUT_MS,
    sourceLabel(source)
  )
  if(error) throw error
  if(data?.error) throw new Error(String(data.error))
  return data as ExternalRecueilImport
}

import { supabase } from './cloud'
import { emptySongDraft } from './music'
import type { SongDraft } from './types'

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
  const {data,error}=await supabase.functions.invoke('diart-tononkira-reference',{body:{url:url.trim()}})
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
  const {data,error}=await supabase.functions.invoke('diart-tononkira-search',{body:{title:title.trim(),artist:artist.trim()}})
  if(error) throw error
  if(data?.error) throw new Error(String(data.error))
  return Array.isArray(data?.results)?data.results:[]
}


export type ExternalRecueilSource = 'ultimate-guitar' | 'chordify'

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
  lyrics?:string
}

export async function searchExternalRecueil(source:ExternalRecueilSource,title:string,artist=''):Promise<ExternalRecueilResult[]>{
  const {data,error}=await supabase.functions.invoke('diart-external-recueil',{body:{action:'search',source,title:title.trim(),artist:artist.trim()}})
  if(error) throw error
  if(data?.error) throw new Error(String(data.error))
  return Array.isArray(data?.results)?data.results:[]
}

export async function importExternalRecueil(source:ExternalRecueilSource,url:string):Promise<ExternalRecueilImport>{
  const {data,error}=await supabase.functions.invoke('diart-external-recueil',{body:{action:'import',source,url}})
  if(error) throw error
  if(data?.error) throw new Error(String(data.error))
  return data as ExternalRecueilImport
}

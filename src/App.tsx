import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject, type FormEvent, type CSSProperties, type PointerEvent, type TouchEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  BookOpen, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Heart, Home, Import,
  Library, Moon, MoreHorizontal, Music2, Plus, Search, Settings, Star, Sun,
  Trash2, Upload, UserRound, UsersRound, Wifi, WifiOff, X, Pencil, Save, RotateCcw,
  Filter, ArrowUpDown, Check, AlertTriangle, Minus, ListMusic, Cloud, LogIn, LogOut,
  Play, Square, Gauge, Maximize2, ChevronUp, ChevronDown, ListPlus, BookMarked, ExternalLink, FileUp, Globe2,
  History, GitMerge, Info, GripVertical, Wrench, BarChart3, Keyboard, Hand, Lock, Unlock, MonitorUp, Tag, ShieldCheck, RefreshCw, Eye
} from 'lucide-react'
import { db, createSong, ensureDemoSeed, getSetting, markViewed, setSetting, softDeleteSong, updateSong, createSetlist, updateSetlist, logActivity, listActivity } from './db'
import type { ActivityEntry, ActivityKind, FavoriteStatus, ImportField, ImportMapping, ImportRowPreview, Song, SongDraft, Setlist, StageRole } from './types'
import { duplicateKey, emptySongDraft, formatDuration, normalizeIdentity, normalizeKey, parseBpm, parseDuration, searchSong, transposeKey, transposeChordText, formatSemitoneOffset } from './music'
import { parseWorkbook, rowsToPreview, suggestMapping, type ParsedWorkbook } from './importer'
import { exportCsv, exportJson, exportXlsx, restoreJson } from './exporter'
import { supabase, syncAll, signIn, signOut, signUp, getCloudStats, pullCloudToLocal, resolveSyncConflict, resolveMergedSyncConflict, type SyncConflict } from './cloud'
import { parseChordPro } from './recueils'
import { fetchTononkiraReference, searchTononkira, searchExternalRecueil, importExternalRecueil, type TononkiraSearchResult, type ExternalRecueilSource, type ExternalRecueilResult } from './catalog'

const APP_VERSION='2.9.18'

const navItems = [
  ['dashboard','Accueil',Home], ['library','Bibliothèque',Library], ['artists','Artistes',UsersRound],
  ['authors','Auteurs',UserRound], ['favorites','Favoris',Heart], ['recent','Récents',BookOpen],
  ['setlists','Setlists',ListMusic], ['recueils','Recueils',BookMarked], ['tools','Outils',Wrench], ['import','Importer',Import], ['backup','Sauvegarde',Download], ['history','Historique',History], ['shortcuts','Raccourcis',Keyboard], ['gestures','Gestes',Hand], ['about','À propos',Info], ['settings','Paramètres',Settings]
] as const

type Page = typeof navItems[number][0] | 'song' | 'edit' | 'new' | 'artist' | 'author' | 'setlist'

const navGroupDefs = [
  {label:'Bibliothèque',ids:['dashboard','library','artists','authors','favorites','recent']},
  {label:'Organisation',ids:['setlists','recueils']},
  {label:'Outils',ids:['tools','import','backup','history','shortcuts','gestures','about','settings']}
] as const
type Toast = { id:number; text:string; action?:{label:string;run:()=>void} }
type SyncMode = 'auto'|'manual'
type SyncInterval = 5|15|30|60
const KEY_OPTIONS=['Ab','A','Bb','B','C','C#','D','Eb','E','F','F#','G'] as const
const SIGNATURE_OPTIONS=['2/4','3/4','4/4','5/4','6/8','7/8','9/8','12/8'] as const
const MUSICIAN_ROLES=['Piano','Clavier','Guitare','Basse','Batterie','Sax','Chœurs','Chef'] as const
const FAVORITE_STATUS_OPTIONS:[FavoriteStatus,string][]=[['','Aucun statut'],['favorite','Favori'],['learn','À apprendre'],['rehearse','À répéter'],['mastered','Maîtrisé'],['review','À revoir']]
const DEFAULT_SHORTCUTS={search:'/',newSong:'n',setlists:'s',favorites:'f'}
const DEFAULT_GESTURES={swipeSongs:true,doubleTapPlay:true,longPressLock:true}

function useSongs() {
  const [songs,setSongs] = useState<Song[]>([])
  const refresh = async () => setSongs((await db.songs.toArray()).filter(s=>!s.deletedAt))
  const patchLocal=(id:string,patch:Partial<Song>)=>setSongs(list=>list.map(s=>s.id===id?{...s,...patch}:s))
  const addLocal=(song:Song)=>setSongs(list=>list.some(s=>s.id===song.id)?list:[...list,song])
  const removeLocal=(id:string)=>setSongs(list=>list.filter(s=>s.id!==id))
  useEffect(()=>{ void ensureDemoSeed().then(refresh) },[])
  return { songs, refresh, patchLocal, addLocal, removeLocal }
}

function Modal({title,children,onClose,className=''}:{title:string;children:ReactNode;onClose:()=>void;className?:string}) {
  return createPortal(<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><h3>{title}</h3><button className="icon-btn" aria-label="Fermer" onClick={onClose}><X/></button></div>{children}</div>
  </div>,document.body)
}

function Toasts({items}:{items:Toast[]}) {
  return <div className="toasts">{items.map(t=><div className="toast" key={t.id}>{t.text}{t.action&&<button onClick={t.action.run}>{t.action.label}</button>}</div>)}</div>
}

function CommandPalette({songs,onClose,onNavigate,onOpenSong,onNewSong}:{songs:Song[];onClose:()=>void;onNavigate:(page:Page)=>void;onOpenSong:(song:Song)=>void;onNewSong:()=>void}){
  const [q,setQ]=useState('')
  const normalized=normalizeIdentity(q)
  const commands=[
    {label:'Nouveau morceau',hint:'Créer une fiche',icon:Plus,run:onNewSong},
    {label:'Bibliothèque',hint:'Tous les morceaux',icon:Library,run:()=>onNavigate('library')},
    {label:'Setlists',hint:'Préparer une prestation',icon:ListMusic,run:()=>onNavigate('setlists')},
    {label:'Favoris',hint:'Morceaux favoris',icon:Heart,run:()=>onNavigate('favorites')},
    {label:'Importer',hint:'Excel / CSV',icon:Import,run:()=>onNavigate('import')},
    {label:'Recueils',hint:'Tononkira et sources externes',icon:BookMarked,run:()=>onNavigate('recueils')},
    {label:'Doublons',hint:'Analyser et fusionner',icon:GitMerge,run:()=>onNavigate('tools')},
    {label:'Historique',hint:'Activité et jeu',icon:History,run:()=>onNavigate('history')}
  ].filter(item=>!normalized||normalizeIdentity(item.label+' '+item.hint).includes(normalized))
  const songResults=q.trim()?songs.filter(song=>searchSong(song,q)).slice(0,8):[]
  const execute=(run:()=>void)=>{onClose();run()}
  return <Modal className="command-palette" title="Commande rapide" onClose={onClose}><div className="command-search"><Search/><input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Commande ou recherche musicale…"/></div><small className="command-help">Ex. « Mahaleo en D entre 70 et 100 bpm », « 6/8 sans paroles »</small>{commands.length>0&&<div className="command-section"><span>Actions</span>{commands.map(item=>{const Icon=item.icon;return <button key={item.label} onClick={()=>execute(item.run)}><Icon/><span><b>{item.label}</b><small>{item.hint}</small></span><ChevronRight/></button>})}</div>}{q.trim()&&<div className="command-section"><span>Morceaux · {songResults.length}</span>{songResults.length?songResults.map(song=><button key={song.id} onClick={()=>execute(()=>onOpenSong(song))}><Music2/><span><b className="song-title-with-mark">{song.title}<SongLyricsMark song={song} compact/></b><small>{song.artist||'Artiste inconnu'}{songListKey(song).value&&<> · <SongListKey song={song}/></>}{song.bpm!==null?' · '+song.bpm+' BPM':''}</small></span><ChevronRight/></button>):<p className="command-empty">Aucun morceau correspondant.</p>}</div>}</Modal>
}

function Metric({label,value}:{label:string;value:string|number}) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>
}

function songListKey(song:Song):{value:string;habitual:boolean}{
  const original=normalizeKey(song.originalKey)
  if(original)return {value:original,habitual:false}
  const habitual=normalizeKey(song.personalKey)
  return {value:habitual,habitual:Boolean(habitual)}
}
function SongListKey({song}:{song:Song}){
  const info=songListKey(song)
  if(!info.value)return null
  return <>{info.value}{info.habitual&&<sup className="habitual-key-mark" title="Tonalité habituelle · tonalité originale non renseignée">★</sup>}</>
}

function SongLyricsMark({song,compact=false}:{song:Song;compact?:boolean}){
  if(!song.lyrics?.trim())return null
  return <span className={'song-lyrics-mark'+(compact?' compact':'')} title="Paroles disponibles" aria-label="Paroles disponibles"><BookOpen size={12}/></span>
}

function SongRow({song,onOpen,onFav,action}:{song:Song;onOpen:()=>void;onFav:()=>void;action?:ReactNode}) {
  const key=songListKey(song)
  const hasMeta=Boolean(key.value||song.bpm!==null||song.timeSignature)
  return <div className={`song-row ${action?'has-action':''} ${hasMeta?'':'no-meta'}`} onClick={onOpen} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')onOpen()}}>
    <button className={`icon-btn fav ${song.favorite?'active':''}`} aria-label={song.favorite?'Retirer des favoris':'Ajouter aux favoris'} onClick={e=>{e.stopPropagation();onFav()}}><Star size={18} fill={song.favorite?'currentColor':'none'}/></button>
    <div className="song-main"><b>{song.title}</b><span>{song.artist || 'Artiste inconnu'}{song.source==='demo'&&<em>DEMO</em>}{song.favoriteStatus&&song.favoriteStatus!=='favorite'&&<em className={'personal-status '+song.favoriteStatus}>{FAVORITE_STATUS_OPTIONS.find(([v])=>v===song.favoriteStatus)?.[1]}</em>}<SongLyricsMark song={song}/></span></div>
    {hasMeta&&<div className="song-meta">{key.value&&<strong className={key.habitual?'habitual-key':''} title={key.habitual?'Tonalité habituelle · originale non renseignée':'Tonalité originale'}><SongListKey song={song}/></strong>}{song.bpm!==null&&<span>{song.bpm} BPM</span>}{song.timeSignature&&<span>{song.timeSignature}</span>}</div>}
    {action&&<div className="song-row-action" onClick={e=>e.stopPropagation()}>{action}</div>}
    <ChevronRight className="song-row-chevron" size={18}/>
  </div>
}


function mergeSongDraft(primary:Song,secondary:Song):SongDraft{
  const pick=(a:string|undefined,b:string|undefined)=>String(a??'').trim()?String(a):String(b??'')
  const combineNotes=(a:string|undefined,b:string|undefined)=>{
    const aa=String(a??'').trim(),bb=String(b??'').trim()
    if(!aa)return bb
    if(!bb||normalizeIdentity(aa)===normalizeIdentity(bb))return aa
    return aa+'\n\n'+bb
  }
  return {
    title:pick(primary.title,secondary.title),
    artist:pick(primary.artist,secondary.artist),
    authorComposer:pick(primary.authorComposer,secondary.authorComposer),
    originalKey:pick(primary.originalKey,secondary.originalKey),
    personalKey:pick(primary.personalKey,secondary.personalKey),
    bpm:primary.bpm??secondary.bpm,
    timeSignature:pick(primary.timeSignature,secondary.timeSignature),
    style:pick(primary.style,secondary.style),
    durationSeconds:primary.durationSeconds??secondary.durationSeconds,
    tags:[...new Set([...(primary.tags??[]),...(secondary.tags??[])])],
    notes:combineNotes(primary.notes,secondary.notes),
    referenceUrl:pick(primary.referenceUrl,secondary.referenceUrl),
    capo:primary.capo??secondary.capo??null,
    structure:pick(primary.structure,secondary.structure),
    chords:hasMeaningfulChordContent(primary.chords??'')?(primary.chords??''):(secondary.chords??''),
    instrumentNotes:combineNotes(primary.instrumentNotes,secondary.instrumentNotes),
    musicianNotes:Object.fromEntries([...new Set([...Object.keys(primary.musicianNotes??{}),...Object.keys(secondary.musicianNotes??{})])].map(role=>[role,combineNotes(primary.musicianNotes?.[role],secondary.musicianNotes?.[role])])),
    lyrics:pick(primary.lyrics,secondary.lyrics),
    favorite:primary.favorite||secondary.favorite,
    favoriteStatus:primary.favoriteStatus||secondary.favoriteStatus||(primary.favorite||secondary.favorite?'favorite':''),
    source:primary.source==='demo'?secondary.source:primary.source
  }
}

function keyOffsetFromOriginal(original:string,target:string):number{
  const from=normalizeKey(original),to=normalizeKey(target)
  if(!from||!to)return 0
  let best=0,bestAbs=99
  for(let n=-11;n<=11;n++){
    if(normalizeKey(transposeKey(from,n))===to&&Math.abs(n)<bestAbs){best=n;bestAbs=Math.abs(n)}
  }
  return best
}
function setlistSongSavedTranspose(list:Setlist,song:Song):number{
  const reference=song.originalKey
  if(!reference)return 0
  const override=list.songOverrides?.[song.id]
  if(!override)return 0
  if(override.key)return keyOffsetFromOriginal(reference,override.key)
  if(Object.prototype.hasOwnProperty.call(override,'transpose')){
    // Legacy overrides were calculated from the habitual key when present.
    const legacyBase=song.personalKey||song.originalKey
    const legacyKey=transposeKey(legacyBase,override.transpose??0)
    return keyOffsetFromOriginal(reference,legacyKey)
  }
  return 0
}
function setlistSongDisplayKey(list:Setlist,song:Song):string{
  const override=list.songOverrides?.[song.id]
  if(override?.key)return normalizeKey(override.key)
  if(!song.originalKey)return normalizeKey(song.personalKey)
  const shift=setlistSongSavedTranspose(list,song)
  return shift?transposeKey(song.originalKey,shift):song.originalKey
}

function transitionKey(fromSongId:string,toSongId:string){return fromSongId+'::'+toSongId}
function transitionHasContent(transition:unknown):boolean{
  if(!transition||typeof transition!=='object')return false
  const t=transition as {bars?:number|null;chords?:string;notes?:string}
  return Boolean(t.bars||t.chords?.trim()||t.notes?.trim())
}

function lyricLineDiff(previous:string,current:string):{kind:'same'|'add'|'remove';text:string}[]{
  const a=previous.replace(/\\r/g,'').split('\\n'),b=current.replace(/\\r/g,'').split('\\n')
  const dp=Array.from({length:a.length+1},()=>Array<number>(b.length+1).fill(0))
  for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1])
  const out:{kind:'same'|'add'|'remove';text:string}[]=[];let i=0,j=0
  while(i<a.length||j<b.length){
    if(i<a.length&&j<b.length&&a[i]===b[j]){out.push({kind:'same',text:a[i]});i++;j++}
    else if(j<b.length&&(i===a.length||dp[i][j+1]>=dp[i+1][j])){out.push({kind:'add',text:b[j++]})}
    else if(i<a.length){out.push({kind:'remove',text:a[i++]})}
  }
  return out
}

function duplicateInsights(a:Song,b:Song):{label:string;detail:string;kind:'same'|'different'|'complement'}[]{
  const out:{label:string;detail:string;kind:'same'|'different'|'complement'}[]=[]
  const sameTitle=normalizeIdentity(a.title)===normalizeIdentity(b.title)
  const sameArtist=normalizeIdentity(a.artist)===normalizeIdentity(b.artist)&&Boolean(a.artist||b.artist)
  out.push({label:'Titre',detail:sameTitle?'identique':'variante détectée',kind:sameTitle?'same':'different'})
  out.push({label:'Artiste',detail:sameArtist?'identique':(!a.artist||!b.artist?'à compléter':'différent'),kind:sameArtist?'same':(!a.artist||!b.artist?'complement':'different')})
  if(a.bpm!==null||b.bpm!==null)out.push({label:'BPM',detail:a.bpm===b.bpm?String(a.bpm??'—'):(a.bpm??'—')+' / '+(b.bpm??'—'),kind:a.bpm===b.bpm?'same':'different'})
  const al=Boolean(a.lyrics?.trim()),bl=Boolean(b.lyrics?.trim())
  if(al||bl)out.push({label:'Paroles',detail:al&&bl?'présentes dans les deux':al?'seulement A':'seulement B',kind:al===bl?'same':'complement'})
  const ac=hasMeaningfulChordContent(a.chords??''),bc=hasMeaningfulChordContent(b.chords??'')
  if(ac||bc)out.push({label:'Accords',detail:ac&&bc?'présents dans les deux':ac?'seulement A':'seulement B',kind:ac===bc?'same':'complement'})
  if(Boolean(a.notes?.trim())!==Boolean(b.notes?.trim()))out.push({label:'Notes',detail:a.notes?.trim()?'seulement A':'seulement B',kind:'complement'})
  return out
}

function conflictValueSummary(value:unknown,field:string):string{
  if(value===null||value===undefined||value==='')return '—'
  if(Array.isArray(value)){
    if(field==='songIds')return value.length?value.length+' morceau'+(value.length>1?'x':'')+' · '+value.slice(0,5).join(', ')+(value.length>5?'…':''):'—'
    return value.length?value.join(', '):'—'
  }
  if(typeof value==='object'){
    const entries=Object.entries(value as Record<string,unknown>)
    if(!entries.length)return '—'
    return entries.map(([k,v])=>k+': '+conflictValueSummary(v,k)).join(' · ')
  }
  const text=String(value)
  if(['lyrics','chords','notes','instrumentNotes'].includes(field)){
    const lines=text.split('\n').filter(Boolean).length
    const preview=text.replace(/\s+/g,' ').trim().slice(0,110)
    return (lines?lines+' ligne'+(lines>1?'s':'')+' · ':'')+preview+(text.length>110?'…':'')
  }
  return text.length>140?text.slice(0,140)+'…':text
}
function conflictDiff(conflict:SyncConflict):{field:string;label:string;local:string;remote:string}[]{
  const songLabels:Record<string,string>={title:'Titre',artist:'Artiste',authorComposer:'Auteur / Compositeur',originalKey:'Tonalité originale',personalKey:'Tonalité habituelle',bpm:'BPM',timeSignature:'Signature',style:'Style',durationSeconds:'Durée',tags:'Tags',notes:'Notes générales',referenceUrl:'Lien source',capo:'Capo',structure:'Structure',chords:'Accords',instrumentNotes:'Notes instrumentales',musicianNotes:'Notes par musicien',lyrics:'Paroles',favorite:'Favori',favoriteStatus:'Statut personnel'}
  const setlistLabels:Record<string,string>={name:'Nom',songIds:'Ordre / morceaux',notes:'Notes',rehearsalNotes:'Notes de répétition',songOverrides:'Réglages propres à la setlist'}
  const labels=conflict.kind==='song'?songLabels:setlistLabels
  const local=conflict.local as any,remote=conflict.remote as any
  return Object.entries(labels).flatMap(([field,label])=>{
    const a=local?.[field],b=remote?.[field]
    if(JSON.stringify(a)===JSON.stringify(b))return []
    return [{field,label,local:conflictValueSummary(a,field),remote:conflictValueSummary(b,field)}]
  })
}

function App() {
  const {songs,refresh,patchLocal,addLocal,removeLocal}=useSongs()
  const [page,setPage]=useState<Page>('dashboard')
  const [selected,setSelected]=useState<Song|null>(null)
  const [songBack,setSongBack]=useState<{page:Page;label:string}>({page:'library',label:'Bibliothèque'})
  const [selectedArtist,setSelectedArtist]=useState('')
  const [selectedAuthor,setSelectedAuthor]=useState('')
  const [artistsScrollY,setArtistsScrollY]=useState(0)
  const [authorsScrollY,setAuthorsScrollY]=useState(0)
  const [libraryScrollY,setLibraryScrollY]=useState(0)
  const [showScrollTop,setShowScrollTop]=useState(false)
  const [selectedSetlistId,setSelectedSetlistId]=useState('')
  const [setlistSongKeyDraft,setSetlistSongKeyDraft]=useState<{listId:string;songId:string;key:string}|null>(null)
  const [presetArtist,setPresetArtist]=useState('')
  const [presetAuthor,setPresetAuthor]=useState('')
  const [createMode,setCreateMode]=useState<'menu'|'artist'|'setlist'|null>(null)
  const [recueilEntry,setRecueilEntry]=useState<'tononkira'|null>(null)
  const [recueilPrefill,setRecueilPrefill]=useState<{title?:string;artist?:string}|null>(null)
  const [createName,setCreateName]=useState('')
  const [sidebar,setSidebar]=useState(false)
  const [theme,setTheme]=useState<'dark'|'light'|'system'>('system')
  const [online,setOnline]=useState(navigator.onLine)
  const [toasts,setToasts]=useState<Toast[]>([])
  const [setlists,setSetlists]=useState<Setlist[]>([])
  const [userId,setUserId]=useState('')
  const [userEmail,setUserEmail]=useState('')
  const [syncing,setSyncing]=useState(false)
  const [cloudStats,setCloudStats]=useState<{songs:number;setlists:number}|null>(null)
  const [lastSyncAt,setLastSyncAt]=useState('')
  const [syncMode,setSyncMode]=useState<SyncMode>('auto')
  const [syncIntervalMinutes,setSyncIntervalMinutes]=useState<SyncInterval>(15)
  const [syncPrefsReady,setSyncPrefsReady]=useState(false)
  const [syncConflicts,setSyncConflicts]=useState<SyncConflict[]>([])
  const [conflictChoices,setConflictChoices]=useState<Record<string,Record<string,'local'|'remote'>>>({})
  const [commandOpen,setCommandOpen]=useState(false)
  const [shortcuts,setShortcuts]=useState<Record<string,string>>(()=>{try{return {...DEFAULT_SHORTCUTS,...JSON.parse(localStorage.getItem('diart-shortcuts')||'{}')}}catch{return DEFAULT_SHORTCUTS}})
  const [gestures,setGestures]=useState(()=>{try{const saved=JSON.parse(localStorage.getItem('diart-gestures')||'{}');return {...DEFAULT_GESTURES,...saved,doubleTapPlay:saved.doubleTapPlay??saved.doubleTapTools??true}}catch{return DEFAULT_GESTURES}})
  const syncLockRef=useRef(false)
  const syncTimerRef=useRef<number|null>(null)
  const searchRef=useRef<HTMLInputElement>(null)

  const refreshSetlists=async()=>setSetlists((await db.setlists.toArray()).filter(x=>!x.deletedAt))

  const toast=(text:string,action?:Toast['action'])=>{
    const id=Date.now()+Math.random()
    setToasts(x=>[...x,{id,text,action}])
    setTimeout(()=>setToasts(x=>x.filter(t=>t.id!==id)),4500)
  }

  const refreshCloudStats=async(id=userId)=>{if(!id)return;try{setCloudStats(await getCloudStats(id))}catch{}}
  const markSynced=()=>{const stamp=new Date().toISOString();setLastSyncAt(stamp);void setSetting('lastSyncAt',stamp)}
  const doSync=async(showToast=true)=>{
    if(!userId||!navigator.onLine||syncLockRef.current)return
    syncLockRef.current=true
    setSyncing(true)
    try{
      const result=await syncAll(userId,lastSyncAt)
      const harmless=result.conflicts.filter(conflict=>conflictDiff(conflict).length===0)
      const realConflicts=result.conflicts.filter(conflict=>conflictDiff(conflict).length>0)
      if(harmless.length){
        await Promise.all(harmless.map(conflict=>resolveSyncConflict(userId,conflict,'local')))
      }
      setSyncConflicts(realConflicts)
      if(result.pulled>0) await Promise.all([refresh(),refreshSetlists()])
      if(showToast||result.pulled>0||result.pushed>0||harmless.length>0) await refreshCloudStats(userId)
      if(!realConflicts.length)markSynced()
      if(showToast)toast(realConflicts.length?`${realConflicts.length} conflit(s) à résoudre.`:harmless.length?`Synchronisation terminée · ${harmless.length} faux conflit(s) résolu(s) automatiquement.`:'Synchronisation cloud terminée.')
    }catch(e){if(showToast)toast(e instanceof Error?e.message:'Synchronisation impossible.')}
    finally{syncLockRef.current=false;setSyncing(false)}
  }
  const conflictChoiceKey=(conflict:SyncConflict)=>conflict.kind+':'+conflict.id
  const chooseConflictField=(conflict:SyncConflict,field:string,choice:'local'|'remote')=>{
    const key=conflictChoiceKey(conflict)
    setConflictChoices(prev=>({...prev,[key]:{...(prev[key]??{}),[field]:choice}}))
  }
  const finishConflictResolution=async(conflict:SyncConflict,message:string)=>{
    const remaining=syncConflicts.filter(c=>c!==conflict)
    setSyncConflicts(remaining)
    setConflictChoices(prev=>{const next={...prev};delete next[conflictChoiceKey(conflict)];return next})
    await Promise.all([refresh(),refreshSetlists(),refreshCloudStats(userId)])
    if(!remaining.length)markSynced()
    toast(message)
  }
  const mergeSyncConflict=async(conflict:SyncConflict)=>{
    const key=conflictChoiceKey(conflict)
    const choices=conflictChoices[key]??{}
    const changes=conflictDiff(conflict)
    const merged={...(conflict.local as any)}
    for(const change of changes){
      if((choices[change.field]??'local')==='remote')merged[change.field]=(conflict.remote as any)[change.field]
    }
    await resolveMergedSyncConflict(userId,conflict,merged)
    await finishConflictResolution(conflict,'Versions fusionnées et synchronisées.')
  }
  const scheduleSync=(delay=250)=>{
    if(syncMode!=='auto')return
    if(syncTimerRef.current!==null)window.clearTimeout(syncTimerRef.current)
    syncTimerRef.current=window.setTimeout(()=>{syncTimerRef.current=null;void doSync(false)},delay)
  }
  const recordActivity=async(kind:ActivityKind,label:string,details:string,meta:{songId?:string|null;songTitle?:string;source?:string;sessionId?:string;setlistId?:string;setlistName?:string}={})=>{
    await logActivity(kind,label,details,meta)
  }
  const forcePull=async()=>{
    if(!userId||!navigator.onLine||syncLockRef.current)return
    syncLockRef.current=true
    setSyncing(true)
    try{const r=await pullCloudToLocal(userId);await Promise.all([refresh(),refreshSetlists(),refreshCloudStats(userId)]);markSynced();toast(`Cloud récupéré : ${r.songs} morceau(x), ${r.setlists} setlist(s).`)}
    catch(e){toast(e instanceof Error?e.message:'Récupération cloud impossible.')}
    finally{syncLockRef.current=false;setSyncing(false)}
  }

  useEffect(()=>{
    void getSetting('theme','system').then(async v=>{let next=(v as typeof theme)||'system';try{if(!localStorage.getItem('diart-theme-system-default-v1')){next='system';localStorage.setItem('diart-theme-system-default-v1','1');await setSetting('theme','system')}}catch{};setTheme(next)})
    void getSetting('lastSyncAt','').then(setLastSyncAt)
    void Promise.all([getSetting('syncMode','auto'),getSetting('syncIntervalMinutes','15')]).then(([mode,interval])=>{
      setSyncMode(mode==='manual'?'manual':'auto')
      const parsed=Number(interval)
      setSyncIntervalMinutes(([5,15,30,60] as number[]).includes(parsed)?parsed as SyncInterval:15)
      setSyncPrefsReady(true)
    })
    void refreshSetlists()
  },[])
  useEffect(()=>{
    void supabase.auth.getSession().then(({data})=>{const u=data.session?.user;setUserId(u?.id??'');setUserEmail(u?.email??'')})
    const {data}=supabase.auth.onAuthStateChange((_event,session)=>{const u=session?.user;setUserId(u?.id??'');setUserEmail(u?.email??'')})
    return()=>data.subscription.unsubscribe()
  },[])
  useEffect(()=>{
    if(userId&&online){
      if(syncPrefsReady&&syncMode==='auto')scheduleSync(80)
      void refreshCloudStats(userId)
    }else if(!userId)setCloudStats(null)
  },[userId,online,syncMode,syncPrefsReady])
  useEffect(()=>{
    if(!userId||!online||!syncPrefsReady||syncMode!=='auto')return
    const timer=window.setInterval(()=>{void doSync(false)},syncIntervalMinutes*60_000)
    return()=>window.clearInterval(timer)
  },[userId,online,syncMode,syncIntervalMinutes,syncPrefsReady])
  useEffect(()=>{
    const media=matchMedia('(prefers-color-scheme: dark)')
    const apply=()=>{document.documentElement.dataset.theme=theme==='system'?(media.matches?'dark':'light'):theme}
    apply()
    if(theme==='system')media.addEventListener?.('change',apply)
    void setSetting('theme',theme)
    return()=>media.removeEventListener?.('change',apply)
  },[theme])
  useEffect(()=>{try{localStorage.setItem('diart-shortcuts',JSON.stringify(shortcuts))}catch{}},[shortcuts])
  useEffect(()=>{try{localStorage.setItem('diart-gestures',JSON.stringify(gestures))}catch{}},[gestures])

  useEffect(()=>{
    const textInputs=document.querySelectorAll<HTMLInputElement>('input:not([type="email"]):not([type="password"]):not([type="file"]):not([type="radio"]):not([type="checkbox"]):not([type="range"])')
    textInputs.forEach(el=>{el.setAttribute('autocomplete','off');el.setAttribute('data-lpignore','true');el.setAttribute('data-1p-ignore','true')})
    document.querySelectorAll<HTMLTextAreaElement>('textarea').forEach(el=>{el.setAttribute('autocomplete','off');el.setAttribute('data-lpignore','true');el.setAttribute('data-1p-ignore','true')})
  })
  useEffect(()=>{
    const onShortcut=(e:KeyboardEvent)=>{
      const target=e.target as HTMLElement|null
      if(target&&['INPUT','TEXTAREA','SELECT'].includes(target.tagName))return
      const key=e.key.toLowerCase()
      if(key===shortcuts.search){e.preventDefault();go('library');setTimeout(()=>searchRef.current?.focus(),50)}
      else if(key===shortcuts.newSong){e.preventDefault();startNewSong()}
      else if(key===shortcuts.setlists){e.preventDefault();go('setlists')}
      else if(key===shortcuts.favorites){e.preventDefault();go('favorites')}
    }
    window.addEventListener('keydown',onShortcut)
    return()=>window.removeEventListener('keydown',onShortcut)
  },[shortcuts,page,selectedArtist,selectedAuthor])

  useEffect(()=>{
    const on=()=>setOnline(true),off=()=>setOnline(false)
    addEventListener('online',on); addEventListener('offline',off)
    return()=>{removeEventListener('online',on);removeEventListener('offline',off)}
  },[])
  useEffect(()=>{
    const onScroll=()=>setShowScrollTop(window.scrollY>420)
    onScroll()
    window.addEventListener('scroll',onScroll,{passive:true})
    return()=>window.removeEventListener('scroll',onScroll)
  },[page])
  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setCommandOpen(true)}}
    addEventListener('keydown',handler); return()=>removeEventListener('keydown',handler)
  },[])

  const go=(p:Page)=>{if(p==='recueils'){setRecueilEntry(null);setRecueilPrefill(null)}setPage(p);setSidebar(false)}
  const openRecueilSearch=(prefill:{title?:string;artist?:string})=>{setRecueilPrefill(prefill);setRecueilEntry('tononkira');setPage('recueils');setSidebar(false)}
  const startNewSong=(artist='',author='')=>{if(!artist)setSelectedArtist('');if(!author)setSelectedAuthor('');setPresetArtist(artist);setPresetAuthor(author);setSelected(null);setCreateMode(null);setCreateName('');setPage('new')}
  const currentScrollY=()=>window.scrollY||document.documentElement.scrollTop||0
  const openArtist=(name:string)=>{setArtistsScrollY(currentScrollY());setSelectedArtist(name);setPage('artist')}
  const openAuthor=(name:string)=>{setAuthorsScrollY(currentScrollY());setSelectedAuthor(name);setPage('author')}
  const openSetlist=(id:string)=>{setSelectedSetlistId(id);setPage('setlist')}
  const changeSyncMode=(mode:SyncMode)=>{setSyncMode(mode);void setSetting('syncMode',mode)}
  const changeSyncInterval=(minutes:SyncInterval)=>{setSyncIntervalMinutes(minutes);void setSetting('syncIntervalMinutes',String(minutes))}
  const createNamedArtist=()=>{const name=createName.trim();if(!name)return;startNewSong(name)}
  const createNamedSetlist=async()=>{const name=createName.trim();if(!name)return;await createSetlist(name);await refreshSetlists();setCreateMode(null);setCreateName('');setPage('setlists');toast(`Setlist « ${name} » créée.`)}
  const deleteSongs=async(items:Song[])=>{
    for(const song of items){await softDeleteSong(song.id);removeLocal(song.id);await recordActivity('delete','Morceau supprimé',song.title,{songId:song.id,songTitle:song.title})}
    toast(items.length>1?`${items.length} morceaux placés dans la corbeille.`:'Morceau placé dans la corbeille.')
  }
  const mergeSongs=async(primary:Song,secondary:Song,override?:SongDraft)=>{
    const draft=override??mergeSongDraft(primary,secondary)
    await updateSong(primary.id,draft)
    await softDeleteSong(secondary.id)
    const updatedAt=new Date().toISOString()
    patchLocal(primary.id,{...draft,updatedAt})
    removeLocal(secondary.id)
    for(const list of setlists){
      if(!list.songIds.includes(secondary.id))continue
      const replaced=list.songIds.map(id=>id===secondary.id?primary.id:id)
      const deduped=replaced.filter((id,i)=>replaced.indexOf(id)===i)
      await updateSetlist(list.id,{songIds:deduped})
    }
    await refreshSetlists()
    if(selected?.id===secondary.id)setSelected({...primary,...draft,updatedAt})
    await recordActivity('merge','Morceaux fusionnés',`« ${secondary.title} » fusionné dans « ${draft.title} »`,{songId:primary.id,songTitle:draft.title})
    toast('Fusion terminée. Le doublon a été placé dans la corbeille.')
  }
  const openSong=(s:Song,origin?:{page:Page;label:string})=>{
    const lastViewedAt=new Date().toISOString()
    const next={...s,lastViewedAt}
    const fallback:Record<string,string>={dashboard:'Accueil',library:'Bibliothèque',artist:selectedArtist||'Artiste',artists:'Artistes',favorites:'Favoris',recent:'Récents',setlist:currentSetlist?.name||'Setlist',setlists:'Setlists',author:selectedAuthor||'Auteur',authors:'Auteurs'}
    const resolvedOrigin=origin??{page,label:fallback[page]||'Retour'}
    if(resolvedOrigin.page==='library')setLibraryScrollY(currentScrollY())
    setSongBack(resolvedOrigin)
    if(resolvedOrigin.page==='setlist'&&currentSetlist){
      setSetlistSongKeyDraft({listId:currentSetlist.id,songId:s.id,key:setlistSongDisplayKey(currentSetlist,s)||s.originalKey||s.personalKey||''})
    }else setSetlistSongKeyDraft(null)
    setSelected(next);patchLocal(s.id,{lastViewedAt});setPage('song');void markViewed(s.id)
  }
  const fav=(s:Song)=>{const favorite=!s.favorite;const favoriteStatus:FavoriteStatus=favorite?(s.favoriteStatus||'favorite'):'';const updatedAt=new Date().toISOString();patchLocal(s.id,{favorite,favoriteStatus,updatedAt});setSelected(prev=>prev?.id===s.id?{...prev,favorite,favoriteStatus,updatedAt}:prev);void updateSong(s.id,{favorite,favoriteStatus}).catch(()=>void refresh())}
  const artistGroups=useMemo(()=>groupPeople(songs,'artist'),[songs])
  const authorGroups=useMemo(()=>groupPeople(songs,'authorComposer'),[songs])
  const favoriteSongs=useMemo(()=>songs.filter(s=>s.favorite),[songs])
  const recentSongs=useMemo(()=>[...songs].sort((a,b)=>(b.lastViewedAt||b.updatedAt).localeCompare(a.lastViewedAt||a.updatedAt)).slice(0,50),[songs])
  const artists=artistGroups.length
  const authors=authorGroups.length
  const currentSetlist=useMemo(()=>setlists.find(s=>s.id===selectedSetlistId)||null,[setlists,selectedSetlistId])
  const returnFromSong=async()=>{
    if(songBack.page==='setlist'&&selected&&currentSetlist&&setlistSongKeyDraft?.listId===currentSetlist.id&&setlistSongKeyDraft.songId===selected.id){
      const song=songs.find(s=>s.id===selected.id)||selected
      const key=normalizeKey(setlistSongKeyDraft.key||song.originalKey||'')
      const transpose=song.originalKey&&key?keyOffsetFromOriginal(song.originalKey,key):0
      const currentOverrides=currentSetlist.songOverrides??{}
      const songOverride={...(currentOverrides[song.id]??{}),key,transpose}
      await updateSetlist(currentSetlist.id,{songOverrides:{...currentOverrides,[song.id]:songOverride}})
      await refreshSetlists()
      setSetlistSongKeyDraft(null)
      setPage('setlist')
      return
    }
    setSetlistSongKeyDraft(null)
    go(songBack.page)
  }
  const sectionMeta=(()=>{
    const parentLabel=(p:Page)=>{
      if(p==='dashboard')return "DI'ART by ARIZONA"
      if(p==='library'||p==='new'||p==='edit')return 'BIBLIOTHÈQUE'
      if(p==='artists'||p==='artist')return 'ARTISTES'
      if(p==='authors'||p==='author')return 'AUTEUR'
      if(p==='favorites')return 'FAVORIS'
      if(p==='recent')return 'RÉCENTS'
      if(p==='setlists'||p==='setlist')return 'SETLISTS'
      if(p==='recueils')return 'RECUEILS'
      if(p==='import')return 'IMPORTER'
      if(p==='backup')return 'SAUVEGARDE'
      if(p==='history')return 'HISTORIQUE'
      if(p==='tools')return 'OUTILS'
      if(p==='shortcuts')return 'RACCOURCIS'
      if(p==='gestures')return 'GESTES'
      if(p==='about')return 'À PROPOS'
      if(p==='settings')return 'PARAMÈTRES'
      return 'DI’ART'
    }
    if(page==='artist')return {label:'ARTISTES',back:()=>go('artists')}
    if(page==='author')return {label:'AUTEUR',back:()=>go('authors')}
    if(page==='setlist')return {label:'SETLISTS',back:()=>go('setlists')}
    if(page==='song')return {label:parentLabel(songBack.page),back:()=>void returnFromSong()}
    if(page==='new'||page==='edit'){
      const backPage:Page=selected?'song':selectedArtist?'artist':selectedAuthor?'author':'library'
      return {label:parentLabel(backPage),back:()=>go(backPage)}
    }
    return {label:parentLabel(page),back:null as null|(()=>void)}
  })()

  useEffect(()=>{
    const compact=window.matchMedia('(max-width:1024px), (pointer:coarse)').matches
    if(!compact)return
    // Une entrée d'historique par niveau DI'ART. Ainsi Android Back peut être pressé
    // plusieurs fois de suite : edit -> morceau -> artiste -> liste des artistes.
    const state=history.state??{}
    if(state.diartPage!==page||state.diartEntity!==(selected?.id||selectedArtist||selectedAuthor||selectedSetlistId||'')){
      history.pushState({...state,diartInternal:true,diartPage:page,diartEntity:selected?.id||selectedArtist||selectedAuthor||selectedSetlistId||''},'')
    }
    const onPop=()=>{
      if(document.querySelector('.modal-backdrop'))return
      if(sidebar){setSidebar(false);return}
      sectionMeta.back?.()
    }
    window.addEventListener('popstate',onPop)
    return()=>window.removeEventListener('popstate',onPop)
  },[page,selected?.id,selectedArtist,selectedAuthor,selectedSetlistId,sidebar])


  useEffect(()=>{
    const onEscape=(e:KeyboardEvent)=>{
      if(e.key!=='Escape')return
      if(window.innerWidth<900||!window.matchMedia('(pointer:fine)').matches)return
      if(document.querySelector('.modal-backdrop')||document.querySelector('.stage-mode'))return
      if(sidebar){e.preventDefault();setSidebar(false);return}
      if(sectionMeta.back){e.preventDefault();sectionMeta.back()}
    }
    window.addEventListener('keydown',onEscape)
    return()=>window.removeEventListener('keydown',onEscape)
  },[sectionMeta.back,sidebar])

  return <div className="app-shell">
    <aside className={`sidebar ${sidebar?'open':''}`}>
      <div className="sidebar-head"><button className="brand" onClick={()=>go('dashboard')} aria-label="Accueil DI'ART"><span className="brand-mark"><img className="brand-logo logo-night" src="./logo-night-v2.png" alt=""/><img className="brand-logo logo-day" src="./logo-day-v2.png" alt=""/></span><div><b>DI'ART</b><small>by ARIZONA <span className="brand-version">v{APP_VERSION}</span></small></div></button><button className="icon-btn sidebar-theme-toggle" title={theme==='system'?'Thème système actif':'Revenir au thème système'} aria-label={theme==='system'?'Thème système actif':'Revenir au thème système'} onClick={()=>setTheme(theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'light':'dark'):'system')}>{theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?<Sun/>:<Moon/>):theme==='dark'?<Sun/>:<Moon/>}</button></div>
      <nav className="grouped-nav">{navGroupDefs.map(group=><div className="nav-group" key={group.label}><span className="nav-group-label">{group.label}</span>{group.ids.map(id=>{const item=navItems.find(x=>x[0]===id)!;const [,label,Icon]=item;return <button key={id} className={page===id?'active':''} onClick={()=>go(id)}><Icon size={19}/>{label}</button>})}</div>)}</nav>
      <div className="sidebar-bottom">{online?<Wifi size={16}/>:<WifiOff size={16}/>} {online?'En ligne':'Hors connexion'}<small>Données locales IndexedDB</small></div>
    </aside>
    {sidebar&&<div className="scrim" onClick={()=>setSidebar(false)}/>}
    <main className="main">
      <header className="topbar">
        <div className="topbar-leading"><button className="icon-btn menu-btn logo-menu-btn" onClick={()=>setSidebar(v=>!v)} aria-label="Ouvrir le menu DI'ART" title="Menu"><img className="menu-logo logo-night" src="./logo-night-v2.png" alt=""/><img className="menu-logo logo-day" src="./logo-day-v2.png" alt=""/></button><button type="button" className={'app-section-title '+(sectionMeta.back?'can-back':'')} onClick={()=>sectionMeta.back?.()} aria-label={sectionMeta.back?'Revenir à '+sectionMeta.label:sectionMeta.label}>{sectionMeta.back&&<ChevronLeft/>}<span>{sectionMeta.label}</span></button></div>
        <div className="top-actions"><button className="primary global-create-btn" aria-label="Créer" title="Créer" onClick={()=>{setCreateMode('menu');setCreateName('')}}><Plus size={22}/></button></div>
      </header>
      <div className={`content page-transition-surface page-${page}`} key={page+':'+selectedArtist+':'+selectedAuthor+':'+selectedSetlistId+':'+(selected?.id??'')}>
        {page==='dashboard'&&<Dashboard songs={songs} artists={artists} authors={authors} setlists={setlists} refreshSetlists={refreshSetlists} toast={toast} onOpen={s=>openSong(s,{page:'dashboard',label:'Accueil'})} onGo={go} onFav={fav} onRecueilSearch={query=>openRecueilSearch({title:query})}/>} 
        {page==='library'&&<LibraryPage songs={songs} setlists={setlists} refreshSetlists={refreshSetlists} toast={toast} searchRef={searchRef} restoreY={libraryScrollY} onOpen={s=>openSong(s,{page:'library',label:'Bibliothèque'})} onFav={fav} onDeleteMany={deleteSongs} onMerge={mergeSongs} onRecueilSearch={query=>openRecueilSearch({title:query})}/>} 
        {page==='artists'&&<ArtistsPage items={artistGroups} restoreY={artistsScrollY} onArtist={openArtist} onRecueilSearch={query=>openRecueilSearch({artist:query})}/>} 
        {page==='artist'&&selectedArtist&&<ArtistDetailPage artist={selectedArtist} songs={songs.filter(s=>s.artist.trim()===selectedArtist)} setlists={setlists} refreshSetlists={refreshSetlists} toast={toast} onBack={()=>go('artists')} onOpen={s=>openSong(s,{page:'artist',label:selectedArtist})} onFav={fav} onAdd={()=>startNewSong(selectedArtist)}/>}
        {page==='authors'&&<AuthorsPage items={authorGroups} restoreY={authorsScrollY} onAuthor={openAuthor}/>}
        {page==='author'&&selectedAuthor&&<AuthorDetailPage author={selectedAuthor} songs={songs.filter(s=>s.authorComposer.trim()===selectedAuthor)} setlists={setlists} refreshSetlists={refreshSetlists} toast={toast} onBack={()=>go('authors')} onOpen={s=>openSong(s,{page:'author',label:selectedAuthor})} onFav={fav} onAdd={()=>startNewSong('',selectedAuthor)}/>} 
        {page==='favorites'&&<SimpleSongs title="Favoris" songs={favoriteSongs} setlists={setlists} refreshSetlists={refreshSetlists} toast={toast} onOpen={s=>openSong(s,{page:'favorites',label:'Favoris'})} onFav={fav}/>} 
        {page==='recent'&&<SimpleSongs title="Récents" songs={recentSongs} setlists={setlists} refreshSetlists={refreshSetlists} toast={toast} onOpen={s=>openSong(s,{page:'recent',label:'Récents'})} onFav={fav}/>} 
        {page==='setlists'&&<SetlistsPage songs={songs} setlists={setlists} refresh={refreshSetlists} toast={toast} onOpenDetail={openSetlist} onOpenSong={s=>openSong(s,{page:'setlists',label:'Setlists'})}/>} 
        {page==='setlist'&&currentSetlist&&<SetlistDetailPage list={currentSetlist} songs={songs} refresh={refreshSetlists} toast={toast} onBack={()=>go('setlists')} onOpenSong={s=>openSong(s,{page:'setlist',label:currentSetlist.name})}/>} 
        {page==='song'&&selected&&<SongDetail song={songs.find(s=>s.id===selected.id)||selected} backLabel={songBack.label} setlists={setlists} refreshSetlists={refreshSetlists} toast={toast} onBack={()=>go(songBack.page)} onEdit={()=>go('edit')} onArtist={name=>{setSelectedArtist(name);setPage('artist')}} onFav={()=>void fav(songs.find(s=>s.id===selected.id)||selected)} setlistKey={songBack.page==='setlist'&&setlistSongKeyDraft?.songId===selected.id?setlistSongKeyDraft.key:undefined} onSetlistKey={key=>{if(currentSetlist&&selected)setSetlistSongKeyDraft({listId:currentSetlist.id,songId:selected.id,key})}} onRecueilSearch={prefill=>openRecueilSearch(prefill)} onLyricsSave={async lyrics=>{const id=selected.id;const updatedAt=new Date().toISOString();patchLocal(id,{lyrics,updatedAt});setSelected(prev=>prev&&prev.id===id?{...prev,lyrics,updatedAt}:prev);await updateSong(id,{lyrics});await recordActivity('update','Paroles modifiées','Paroles mises à jour depuis la fiche morceau',{songId:id,songTitle:selected.title});toast('Paroles enregistrées.')}} onDelete={async()=>{const id=selected.id;const title=selected.title;await softDeleteSong(id);removeLocal(id);await recordActivity('delete','Morceau supprimé',title,{songId:id,songTitle:title});toast('Morceau placé dans la corbeille',{label:'Annuler',run:async()=>{await db.songs.update(id,{deletedAt:null});await recordActivity('restore','Suppression annulée',title,{songId:id,songTitle:title});await refresh()}});go('library')}}/>}
        {(page==='new'||(page==='edit'&&selected))&&<SongForm initial={page==='edit'?selected:null} songs={songs} presetArtist={page==='new'?presetArtist:''} presetAuthor={page==='new'?presetAuthor:''} onCancel={()=>go(selected?'song':selectedArtist?'artist':selectedAuthor?'author':'library')} onSave={async draft=>{if(page==='edit'&&selected){await updateSong(selected.id,draft);const updatedAt=new Date().toISOString();const next={...selected,...draft,updatedAt};patchLocal(selected.id,{...draft,updatedAt});setSelected(next);await recordActivity('update','Morceau modifié',draft.title,{songId:selected.id,songTitle:draft.title});toast('Morceau mis à jour');go('song')}else{const s=await createSong(draft);addLocal(s);setSelected(s);await recordActivity('create','Morceau créé',s.title,{songId:s.id,songTitle:s.title});toast('Morceau ajouté');go('song')}}} onMergeDuplicate={async(draft,duplicate)=>{if(page==='edit'&&selected){const current:Song={...selected,...draft,updatedAt:new Date().toISOString()};await mergeSongs(current,duplicate);go('song')}else{const virtual:Song={...draft,id:'draft',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),lastViewedAt:null,deletedAt:null};const mergedDraft=mergeSongDraft(duplicate,virtual);await updateSong(duplicate.id,mergedDraft);const updatedAt=new Date().toISOString();patchLocal(duplicate.id,{...mergedDraft,updatedAt});setSelected({...duplicate,...mergedDraft,updatedAt});await recordActivity('merge','Doublon fusionné',`Les informations saisies ont été fusionnées dans « ${duplicate.title} »`,{songId:duplicate.id,songTitle:duplicate.title});toast('Fusion effectuée avec le morceau existant.');go('song')}}}/>}
        {page==='recueils'&&<RecueilsPage songs={songs} entryMode={recueilEntry} prefill={recueilPrefill} toast={toast} onImport={async draft=>{const s=await createSong(draft);addLocal(s);await recordActivity('import','Import depuis recueil',draft.title,{songId:s.id,songTitle:s.title,source:draft.referenceUrl||'Recueil'});return s}} onComplete={async(id,patch)=>{const old=songs.find(s=>s.id===id);await updateSong(id,patch);patchLocal(id,{...patch,updatedAt:new Date().toISOString()});await recordActivity('complete','Complétion depuis recueil',Object.keys(patch).join(', '),{songId:id,songTitle:old?.title,source:'Recueil'})}} onViewImported={s=>openSong(s,{page:'recueils',label:'Recueils'})} onEditImported={s=>{setSongBack({page:'recueils',label:'Recueils'});setSelected(s);setPage('edit')}}/>} 
        {page==='import'&&<ImportWizard songs={songs} refresh={refresh} toast={toast} onRecord={recordActivity} onLibrary={()=>go('library')}/>} 
        {page==='backup'&&<BackupPage songs={songs} refresh={refresh} toast={toast} onRecord={recordActivity}/>}
        {page==='tools'&&<ToolsPage songs={songs} onMerge={mergeSongs}/>} 
        {page==='history'&&<HistoryPage songs={songs}/>} 
        {page==='shortcuts'&&<ShortcutsPage value={shortcuts} onChange={setShortcuts}/>} 
        {page==='gestures'&&<GesturesPage value={gestures} onChange={setGestures}/>} 
        {page==='about'&&<AboutPage songs={songs} setlists={setlists} cloudStats={cloudStats}/>}
        {page==='settings'&&<SettingsPage theme={theme} setTheme={setTheme} songs={songs} refresh={refresh} toast={toast} userEmail={userEmail} localCount={songs.filter(s=>s.source!=='demo').length} cloudStats={cloudStats} lastSyncAt={lastSyncAt} syncing={syncing} syncMode={syncMode} syncIntervalMinutes={syncIntervalMinutes} onSyncMode={changeSyncMode} onSyncInterval={changeSyncInterval} onSync={()=>void doSync()} onPull={()=>void forcePull()} onSignedIn={async()=>{const {data}=await supabase.auth.getUser();const u=data.user;setUserId(u?.id??'');setUserEmail(u?.email??'');if(u){setSyncing(true);try{await pullCloudToLocal(u.id);await syncAll(u.id);await Promise.all([refresh(),refreshSetlists(),refreshCloudStats(u.id)]);toast('Cloud DI’ART connecté et récupéré.')}finally{setSyncing(false)}}}}/>}
      </div>
    </main>
    {showScrollTop&&<button type="button" className="global-scroll-top" aria-label="Retour en haut" title="Retour en haut" onClick={()=>window.scrollTo({top:0,behavior:'smooth'})}><ChevronUp/></button>}
    <nav className="bottom-nav">
      <button onClick={()=>go('dashboard')}><Home/><span>Accueil</span></button>
      <button onClick={()=>go('artists')}><UsersRound/><span>Artistes</span></button>
      <button onClick={()=>{go('library');setTimeout(()=>searchRef.current?.focus(),50)}}><Search/><span>Recherche</span></button>
      <button onClick={()=>go('favorites')}><Heart/><span>Favoris</span></button>
      <button onClick={()=>go('setlists')}><ListMusic/><span>Setlists</span></button>
    </nav>
    {commandOpen&&<CommandPalette songs={songs} onClose={()=>setCommandOpen(false)} onNavigate={p=>go(p)} onOpenSong={s=>openSong(s,{page:'library',label:'Bibliothèque'})} onNewSong={()=>startNewSong()}/>} 
    {createMode==='menu'&&<Modal title="Créer" onClose={()=>setCreateMode(null)}><div className="create-choice-grid"><button onClick={()=>startNewSong(page==='artist'?selectedArtist:'',page==='author'?selectedAuthor:'')}><Music2/><span><b>Nouveau morceau</b><small>Créer une nouvelle fiche musicale</small></span></button><button onClick={()=>{setCreateMode('artist');setCreateName('')}}><UsersRound/><span><b>Nouvel artiste</b><small>Créer son premier morceau</small></span></button><button onClick={()=>{setCreateMode('setlist');setCreateName('')}}><ListMusic/><span><b>Nouvelle setlist</b><small>Créer une liste vide</small></span></button><button onClick={()=>{setCreateMode(null);go('import')}}><Import/><span><b>Nouvel import</b><small>Importer Excel ou CSV</small></span></button><button onClick={()=>{setCreateMode(null);setRecueilEntry(null);setRecueilPrefill(null);setPage('recueils')}}><BookMarked/><span><b>Importer depuis recueil</b><small>Choisir Tononkira, Ultimate Guitar, Chordify ou ChordPro</small></span></button></div></Modal>}
    {createMode==='artist'&&<Modal title="Nouvel artiste" onClose={()=>setCreateMode(null)}><div className="create-name-form"><label>Nom de l’artiste<input autoFocus value={createName} onChange={e=>setCreateName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')createNamedArtist()}}/></label><div className="modal-actions"><button className="secondary" onClick={()=>setCreateMode('menu')}>Retour</button><button className="primary" disabled={!createName.trim()} onClick={createNamedArtist}><Plus/>Continuer</button></div></div></Modal>}
    {createMode==='setlist'&&<Modal title="Nouvelle setlist" onClose={()=>setCreateMode(null)}><div className="create-name-form"><label>Nom de la setlist<input className="new-setlist-name-input" autoFocus value={createName} onChange={e=>setCreateName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void createNamedSetlist()}}/></label><div className="modal-actions"><button className="secondary" onClick={()=>setCreateMode('menu')}>Retour</button><button className="primary" disabled={!createName.trim()} onClick={()=>void createNamedSetlist()}><Plus/>Créer</button></div></div></Modal>}
    {syncConflicts.length>0&&<Modal className="sync-conflict-modal sync-conflict-detail-modal" title="Conflits de synchronisation" onClose={()=>setSyncConflicts([])}><div className="sync-conflict-intro"><AlertTriangle/><div><b>{syncConflicts.length} conflit{syncConflicts.length>1?'s':''} réel{syncConflicts.length>1?'s':''} à résoudre</b><p className="muted-copy">Choisissez Local ou Cloud pour chaque champ différent, puis fusionnez. Les champs identiques sont conservés automatiquement.</p></div></div><div className="sync-conflict-list">{syncConflicts.map(conflict=>{const changes=conflictDiff(conflict);const key=conflictChoiceKey(conflict);const localNewer=conflict.localUpdatedAt>=conflict.remoteUpdatedAt;return <article className="sync-conflict-card" key={key}><div className="sync-conflict-head"><div><b>{conflict.kind==='song'?(conflict.local as Song).title:(conflict.local as Setlist).name}</b><small>{changes.length} champ{changes.length>1?'s':''} différent{changes.length>1?'s':''}</small></div><span>{conflict.kind==='song'?'Morceau':'Setlist'}</span></div><div className="sync-conflict-times"><div className={localNewer?'newer':''}><span>LOCAL</span><b>{new Date(conflict.localUpdatedAt).toLocaleString()}</b>{localNewer&&<small>Plus récent</small>}</div><div className={!localNewer?'newer':''}><span>CLOUD</span><b>{new Date(conflict.remoteUpdatedAt).toLocaleString()}</b>{!localNewer&&<small>Plus récent</small>}</div></div><div className="sync-conflict-diff"><div className="sync-conflict-diff-head"><span>Champ</span><b>Local</b><b>Cloud</b></div>{changes.map(change=>{const choice=conflictChoices[key]?.[change.field]??'local';return <div className="sync-conflict-diff-row selectable" key={change.field}><span>{change.label}</span><button type="button" className={choice==='local'?'selected':''} onClick={()=>chooseConflictField(conflict,change.field,'local')}><i>{choice==='local'&&<Check/>}</i><em>{change.local}</em></button><button type="button" className={choice==='remote'?'selected':''} onClick={()=>chooseConflictField(conflict,change.field,'remote')}><i>{choice==='remote'&&<Check/>}</i><em>{change.remote}</em></button></div>})}</div><div className="sync-conflict-actions enhanced"><button className="secondary" onClick={()=>void resolveSyncConflict(userId,conflict,'remote').then(()=>finishConflictResolution(conflict,'Version cloud conservée.'))}>Tout Cloud</button><button className="secondary" onClick={()=>void resolveSyncConflict(userId,conflict,'local').then(()=>finishConflictResolution(conflict,'Version locale conservée.'))}>Tout Local</button><button className="primary" onClick={()=>void mergeSyncConflict(conflict)}><GitMerge/>Fusionner et synchroniser</button></div></article>})}</div></Modal>}
    <Toasts items={toasts}/>
  </div>
}

function Dashboard({songs,artists,authors,setlists,refreshSetlists,toast,onOpen,onGo,onFav,onRecueilSearch}:{songs:Song[];artists:number;authors:number;setlists:Setlist[];refreshSetlists:()=>Promise<void>;toast:(s:string)=>void;onOpen:(s:Song)=>void;onGo:(p:Page)=>void;onFav:(s:Song)=>void;onRecueilSearch:(query:string)=>void}) {
  const [q,setQ]=useState('')
  const deferredQ=useDeferredValue(q)
  const results=useMemo(()=>deferredQ.trim()?songs.filter(s=>searchSong(s,deferredQ)).slice(0,12):[],[songs,deferredQ])
  const recent=[...songs].sort((a,b)=>(b.lastViewedAt||'').localeCompare(a.lastViewedAt||'')).filter(s=>s.lastViewedAt).slice(0,3)
  const added=[...songs].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,3)
  return <>
    <div className="home-search"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Rechercher un titre, artiste, tonalité, BPM…"/>{q&&<button type="button" className="search-clear" aria-label="Effacer la recherche" onClick={()=>setQ('')}><X/></button>}</div>
    {q.trim()&&<section className="panel home-search-results"><div className="panel-title-row"><h2>Résultats</h2><div className="search-result-actions"><span>{results.length} affiché(s)</span><button className="bare-action" aria-label="Rechercher aussi dans les Recueils" title="Rechercher aussi dans les Recueils" onClick={()=>onRecueilSearch(q.trim())}><BookMarked/></button></div></div>{results.length?<div className="quick-results">{results.map(s=><div className="quick-result" key={s.id}><button className="quick-result-main" onClick={()=>onOpen(s)}><span><b className="song-title-with-mark">{s.title}<SongLyricsMark song={s} compact/></b><small>{s.artist||'Artiste inconnu'}</small></span><span className="quick-meta">{songListKey(s).value&&<SongListKey song={s}/>} {songListKey(s).value&&s.bpm!==null?' · ':''}{s.bpm!==null?`${s.bpm} BPM`:''}</span></button><QuickSetlistAdd song={s} setlists={setlists} refresh={refreshSetlists} toast={toast}/></div>)}</div>:<div className="empty-search-suggestion"><BookMarked/><b>Aucun morceau dans DI’ART</b><span>Essayez cette recherche dans les Recueils.</span><button className="secondary" onClick={()=>onRecueilSearch(q.trim())}><Search/>Rechercher dans les Recueils</button></div>}</section>}
    <div className="metrics"><Metric label="Morceaux" value={songs.length}/><Metric label="Artistes" value={artists}/><Metric label="Auteurs" value={authors}/><Metric label="Favoris" value={songs.filter(s=>s.favorite).length}/></div>
    <div className="home-recent-grid"><section className="panel compact-home-panel"><h2>Récemment consultés</h2>{recent.length?recent.map(s=><SongRow key={s.id} song={s} onOpen={()=>onOpen(s)} onFav={()=>onFav(s)} action={<QuickSetlistAdd song={s} setlists={setlists} refresh={refreshSetlists} toast={toast}/>}/>):<Empty text="Aucun morceau consulté."/>}</section><section className="panel compact-home-panel"><h2>Ajouts récents</h2>{added.map(s=><SongRow key={s.id} song={s} onOpen={()=>onOpen(s)} onFav={()=>onFav(s)} action={<QuickSetlistAdd song={s} setlists={setlists} refresh={refreshSetlists} toast={toast}/>}/>)}</section></div>
    <MetronomeCard initialBpm={96}/>
  </>
}

function LibraryPage({songs,setlists,refreshSetlists,toast,searchRef,restoreY,onOpen,onFav,onDeleteMany,onMerge,onRecueilSearch}:{songs:Song[];setlists:Setlist[];refreshSetlists:()=>Promise<void>;toast:(s:string)=>void;searchRef:RefObject<HTMLInputElement>;restoreY:number;onOpen:(s:Song)=>void;onFav:(s:Song)=>void;onDeleteMany:(songs:Song[])=>Promise<void>;onMerge:(primary:Song,secondary:Song,draft?:SongDraft)=>Promise<void>;onRecueilSearch:(query:string)=>void}) {
  const savedLibrarySearch=useMemo(()=>{try{return JSON.parse(sessionStorage.getItem('diart-library-search')||'{}') as Record<string,string>}catch{return {} as Record<string,string>}},[])
  const [q,setQ]=useState(savedLibrarySearch.q||''),[key,setKey]=useState(savedLibrarySearch.key||''),[sig,setSig]=useState(savedLibrarySearch.sig||''),[style,setStyle]=useState(savedLibrarySearch.style||''),[min,setMin]=useState(savedLibrarySearch.min||''),[max,setMax]=useState(savedLibrarySearch.max||''),[sort,setSort]=useState(savedLibrarySearch.sort||'title'),[filters,setFilters]=useState(false)
  const [artistFilter,setArtistFilter]=useState(savedLibrarySearch.artistFilter||''),[authorFilter,setAuthorFilter]=useState(savedLibrarySearch.authorFilter||''),[tagFilter,setTagFilter]=useState(savedLibrarySearch.tagFilter||''),[favoriteStatusFilter,setFavoriteStatusFilter]=useState(savedLibrarySearch.favoriteStatusFilter||''),[lyricsFilter,setLyricsFilter]=useState<'all'|'with'|'without'>((savedLibrarySearch.lyricsFilter as 'all'|'with'|'without')||'all'),[chordsFilter,setChordsFilter]=useState<'all'|'with'|'without'>((savedLibrarySearch.chordsFilter as 'all'|'with'|'without')||'all')
  const [manage,setManage]=useState(false)
  const [sortOpen,setSortOpen]=useState(false)
  const [selectedIds,setSelectedIds]=useState<string[]>([])
  const [confirmDelete,setConfirmDelete]=useState(false)
  const [mergeOpen,setMergeOpen]=useState(false)
  const deferredQ=useDeferredValue(q)
  useEffect(()=>{const id=requestAnimationFrame(()=>window.scrollTo({top:restoreY,behavior:'auto'}));return()=>cancelAnimationFrame(id)},[])
  useEffect(()=>{sessionStorage.setItem('diart-library-search',JSON.stringify({q,key,sig,style,min,max,sort,artistFilter,authorFilter,tagFilter,favoriteStatusFilter,lyricsFilter,chordsFilter}))},[q,key,sig,style,min,max,sort,artistFilter,authorFilter,tagFilter,favoriteStatusFilter,lyricsFilter,chordsFilter])
  const keys=[...new Set(songs.map(s=>s.originalKey).filter(Boolean))].sort()
  const sigs=[...new Set(songs.map(s=>s.timeSignature).filter(Boolean))].sort()
  const styles=[...new Set(songs.map(s=>s.style).filter(Boolean))].sort()
  const artists=[...new Set(songs.map(s=>s.artist).filter(Boolean))].sort()
  const authors=[...new Set(songs.map(s=>s.authorComposer).filter(Boolean))].sort()
  const tags=[...new Set(songs.flatMap(s=>s.tags??[]).filter(Boolean))].sort()
  const result=useMemo(()=>songs.filter(s=>searchSong(s,deferredQ))
    .filter(s=>!key||s.originalKey===key).filter(s=>!sig||s.timeSignature===sig)
    .filter(s=>!style||s.style===style)
    .filter(s=>!artistFilter||s.artist===artistFilter).filter(s=>!authorFilter||s.authorComposer===authorFilter)
    .filter(s=>!tagFilter||(s.tags??[]).includes(tagFilter)).filter(s=>!favoriteStatusFilter||(s.favoriteStatus??(s.favorite?'favorite':''))===favoriteStatusFilter)
    .filter(s=>lyricsFilter==='all'||(lyricsFilter==='with'?Boolean(s.lyrics?.trim()):!s.lyrics?.trim())).filter(s=>chordsFilter==='all'||(chordsFilter==='with'?hasMeaningfulChordContent(s.chords??''):!hasMeaningfulChordContent(s.chords??'')))
    .filter(s=>!min||(s.bpm!==null&&s.bpm>=Number(min))).filter(s=>!max||(s.bpm!==null&&s.bpm<=Number(max)))
    .sort((a,b)=>sort==='artist'?a.artist.localeCompare(b.artist):sort==='bpm'?(a.bpm??999)-(b.bpm??999):sort==='updated'?b.updatedAt.localeCompare(a.updatedAt):a.title.localeCompare(b.title)),
  [songs,deferredQ,key,sig,style,min,max,sort,artistFilter,authorFilter,tagFilter,favoriteStatusFilter,lyricsFilter,chordsFilter])
  const selectedSongs=selectedIds.map(id=>songs.find(s=>s.id===id)).filter(Boolean) as Song[]
  const toggle=(id:string)=>setSelectedIds(ids=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id])
  const exitManage=()=>{setManage(false);setSelectedIds([])}
  return <>
    <div className="toolbar library-toolbar"><div className="searchbox"><Search/><input ref={searchRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="Titre, artiste, auteur, tonalité, BPM, tags…"/>{q&&<button type="button" className="search-clear" aria-label="Effacer la recherche" onClick={()=>setQ('')}><X/></button>}</div><div className="library-toolbar-actions">{q.trim()&&<button className="icon-btn library-tool-btn" aria-label="Rechercher aussi dans les Recueils" title="Recueils" onClick={()=>onRecueilSearch(q.trim())}><BookMarked/></button>}<button className={'icon-btn library-tool-btn '+(filters?'active':'')} aria-label="Filtres" title="Filtres" onClick={()=>{setFilters(true);setSortOpen(false)}}><Filter/></button><button className={'icon-btn library-tool-btn '+(sortOpen?'active':'')} aria-label="Trier" title="Trier" onClick={()=>{setSortOpen(true);setFilters(false)}}><ArrowUpDown/></button><button className={'icon-btn library-tool-btn '+(manage?'active':'')} aria-label={manage?'Terminer la gestion':'Gérer la bibliothèque'} title={manage?'Terminer':'Gérer'} onClick={()=>manage?exitManage():setManage(true)}>{manage?<Check/>:<MoreHorizontal/>}</button></div></div>
    {sortOpen&&<Modal className="library-tool-modal" title="Trier la bibliothèque" onClose={()=>setSortOpen(false)}><div className="library-sort-options">{[['title','Titre A–Z'],['artist','Artiste A–Z'],['bpm','BPM'],['updated','Modifiés récemment']].map(([value,label])=><button type="button" key={value} className={sort===value?'selected':''} onClick={()=>{setSort(value);setSortOpen(false)}}><ArrowUpDown/><span>{label}</span>{sort===value&&<Check/>}</button>)}</div></Modal>}
    {filters&&<Modal className="library-tool-modal advanced-search-modal" title="Recherche avancée" onClose={()=>setFilters(false)}><div className="filters library-filter-modal advanced-search-grid"><select value={artistFilter} onChange={e=>setArtistFilter(e.target.value)}><option value="">Tous les artistes</option>{artists.map(x=><option key={x}>{x}</option>)}</select><select value={authorFilter} onChange={e=>setAuthorFilter(e.target.value)}><option value="">Tous les auteurs</option>{authors.map(x=><option key={x}>{x}</option>)}</select><select value={key} onChange={e=>setKey(e.target.value)}><option value="">Toutes tonalités</option>{keys.map(x=><option key={x}>{x}</option>)}</select><select value={sig} onChange={e=>setSig(e.target.value)}><option value="">Toutes signatures</option>{sigs.map(x=><option key={x}>{x}</option>)}</select><select value={style} onChange={e=>setStyle(e.target.value)}><option value="">Tous styles</option>{styles.map(x=><option key={x}>{x}</option>)}</select><select value={tagFilter} onChange={e=>setTagFilter(e.target.value)}><option value="">Tous tags</option>{tags.map(x=><option key={x}>{x}</option>)}</select><select value={favoriteStatusFilter} onChange={e=>setFavoriteStatusFilter(e.target.value)}><option value="">Tous statuts personnels</option>{FAVORITE_STATUS_OPTIONS.filter(([v])=>v).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><div className="filter-bpm-row"><input value={min} onChange={e=>setMin(e.target.value)} placeholder="BPM min"/><input value={max} onChange={e=>setMax(e.target.value)} placeholder="BPM max"/></div><div className="advanced-filter-choice"><span>Paroles</span><div>{[['all','Tous'],['with','Avec'],['without','Sans']].map(([v,l])=><button type="button" key={v} className={lyricsFilter===v?'active':''} onClick={()=>setLyricsFilter(v as 'all'|'with'|'without')}>{l}</button>)}</div></div><div className="advanced-filter-choice"><span>Accords</span><div>{[['all','Tous'],['with','Avec'],['without','Sans']].map(([v,l])=><button type="button" key={v} className={chordsFilter===v?'active':''} onClick={()=>setChordsFilter(v as 'all'|'with'|'without')}>{l}</button>)}</div></div><div className="modal-actions"><button className="secondary" onClick={()=>{setKey('');setSig('');setStyle('');setMin('');setMax('');setArtistFilter('');setAuthorFilter('');setTagFilter('');setFavoriteStatusFilter('');setLyricsFilter('all');setChordsFilter('all')}}>Réinitialiser</button><button className="primary" onClick={()=>setFilters(false)}><Check/>Appliquer · {result.length}</button></div></div></Modal>}
    {manage&&<div className="library-manage-bar"><div><b>{selectedIds.length} sélectionné{selectedIds.length>1?'s':''}</b><small>Sélectionnez 1+ morceau pour supprimer, exactement 2 pour fusionner.</small></div><div><button className="secondary" disabled={selectedIds.length!==2} onClick={()=>setMergeOpen(true)}><GitMerge/>Fusionner</button><button className="danger" disabled={!selectedIds.length} onClick={()=>setConfirmDelete(true)}><Trash2/>Supprimer</button></div></div>}
    <p className="result-count">{result.length} résultat{result.length>1?'s':''}</p><div className="songs-list library-song-list">{result.length?result.map(s=><div className={'managed-song '+(selectedIds.includes(s.id)?'selected':'')} key={s.id}>{manage&&<button className="manage-select" aria-label={selectedIds.includes(s.id)?'Désélectionner':'Sélectionner'} onClick={()=>toggle(s.id)}>{selectedIds.includes(s.id)?<Check/>:<span/>}</button>}<SongRow song={s} onOpen={()=>manage?toggle(s.id):onOpen(s)} onFav={()=>onFav(s)} action={manage?undefined:<QuickSetlistAdd song={s} setlists={setlists} refresh={refreshSetlists} toast={toast}/>}/></div>):q.trim()?<div className="empty-search-suggestion"><BookMarked/><b>Aucun morceau correspondant</b><span>La recherche peut être envoyée directement aux Recueils.</span><button className="secondary" onClick={()=>onRecueilSearch(q.trim())}><Search/>Rechercher dans les Recueils</button></div>:<Empty text="Aucun résultat."/>}</div>
    {confirmDelete&&<Modal title={selectedIds.length>1?'Supprimer les morceaux sélectionnés ?':'Supprimer ce morceau ?'} onClose={()=>setConfirmDelete(false)}><p>{selectedIds.length} morceau{selectedIds.length>1?'x':''} sera{selectedIds.length>1?'ont':''} placé{selectedIds.length>1?'s':''} dans la corbeille.</p><div className="modal-actions"><button className="secondary" onClick={()=>setConfirmDelete(false)}>Annuler</button><button className="danger" onClick={()=>void onDeleteMany(selectedSongs).then(()=>{setConfirmDelete(false);exitManage()})}><Trash2/>Supprimer</button></div></Modal>}
    {mergeOpen&&selectedSongs.length===2&&<MergeSongsModal a={selectedSongs[0]} b={selectedSongs[1]} onClose={()=>setMergeOpen(false)} onMerge={async(primary,secondary,draft)=>{await onMerge(primary,secondary,draft);setMergeOpen(false);exitManage()}}/>}
  </>
}

function MergeSongsModal({a,b,onClose,onKeepBoth,onMerge}:{a:Song;b:Song;onClose:()=>void;onKeepBoth?:()=>void;onMerge:(primary:Song,secondary:Song,draft?:SongDraft)=>Promise<void>}) {
  type Choice='auto'|'a'|'b'
  const [primaryId,setPrimaryId]=useState(a.id)
  const [busy,setBusy]=useState(false)
  const [choices,setChoices]=useState<Record<string,Choice>>({})
  const primary=primaryId===a.id?a:b
  const secondary=primaryId===a.id?b:a
  const auto=mergeSongDraft(primary,secondary)
  const choose=<K extends keyof SongDraft>(key:K):SongDraft[K]=>{
    const choice=choices[String(key)]??'auto'
    if(choice==='a')return a[key as keyof Song] as SongDraft[K]
    if(choice==='b')return b[key as keyof Song] as SongDraft[K]
    return auto[key]
  }
  const manualDraft:SongDraft={
    ...auto,
    title:choose('title'),artist:choose('artist'),authorComposer:choose('authorComposer'),
    originalKey:choose('originalKey'),personalKey:choose('personalKey'),bpm:choose('bpm'),
    timeSignature:choose('timeSignature'),style:choose('style'),durationSeconds:choose('durationSeconds'),
    tags:choose('tags'),notes:choose('notes'),referenceUrl:choose('referenceUrl'),capo:choose('capo'),
    structure:choose('structure'),chords:choose('chords'),instrumentNotes:choose('instrumentNotes'),
    musicianNotes:choose('musicianNotes'),lyrics:choose('lyrics'),favorite:choose('favorite'),
    favoriteStatus:choose('favoriteStatus'),source:choose('source')
  }
  const display=(key:keyof SongDraft,s:Song|SongDraft)=>{
    const v=(s as any)[key]
    if(key==='tags')return Array.isArray(v)&&v.length?v.join(', '):'—'
    if(key==='musicianNotes')return v&&Object.values(v).some(Boolean)?Object.entries(v).filter(([,x])=>String(x).trim()).map(([r])=>r).join(', '):'—'
    if(key==='lyrics')return String(v??'').trim()?String(v).split('\n').filter(Boolean).length+' lignes':'—'
    if(key==='chords')return hasMeaningfulChordContent(String(v??''))?'✓ Présents':'—'
    if(key==='bpm'||key==='durationSeconds'||key==='capo')return v===null||v===undefined?'—':String(v)
    if(key==='favoriteStatus')return FAVORITE_STATUS_OPTIONS.find(([x])=>x===v)?.[1]||'—'
    return String(v??'').trim()||'—'
  }
  const fields:{key:keyof SongDraft;label:string}[]=[
    {key:'title',label:'Titre'},{key:'artist',label:'Artiste'},{key:'authorComposer',label:'Auteur / Compositeur'},
    {key:'originalKey',label:'Tonalité originale'},{key:'personalKey',label:'Tonalité habituelle'},
    {key:'bpm',label:'BPM'},{key:'timeSignature',label:'Signature'},{key:'style',label:'Style'},
    {key:'durationSeconds',label:'Durée'},{key:'capo',label:'Capo'},{key:'tags',label:'Tags'},
    {key:'structure',label:'Structure'},{key:'chords',label:'Accords'},{key:'lyrics',label:'Paroles'},
    {key:'instrumentNotes',label:'Notes instrumentales'},{key:'musicianNotes',label:'Notes par musicien'},
    {key:'notes',label:'Notes générales'},{key:'referenceUrl',label:'Lien source'},{key:'favoriteStatus',label:'Statut personnel'}
  ]
  const setChoice=(key:keyof SongDraft,value:Choice)=>setChoices(prev=>({...prev,[String(key)]:value}))
  return <Modal className="merge-modal merge-visual-modal" title="Fusion manuelle de morceaux" onClose={onClose}>
    <p className="muted-copy">Choisissez la fiche principale puis, champ par champ, laissez DI’ART décider automatiquement ou imposez la valeur de A ou B.</p><div className="duplicate-insights">{duplicateInsights(a,b).map(item=><span className={item.kind} key={item.label}><b>{item.label}</b>{item.detail}</span>)}</div>
    <div className="merge-primary-picker"><button className={primaryId===a.id?'selected':''} onClick={()=>setPrimaryId(a.id)}><Check/><span>Fiche principale A</span><b>{a.title}</b></button><button className={primaryId===b.id?'selected':''} onClick={()=>setPrimaryId(b.id)}><Check/><span>Fiche principale B</span><b>{b.title}</b></button></div>
    <div className="merge-compare-table manual-merge-table">
      <div className="merge-compare-head"><span>Champ</span><b>A</b><b>B</b><b>Choix</b><b>Résultat</b></div>
      {fields.map(field=><div className="merge-compare-row" key={field.key}>
        <span>{field.label}</span><em title={display(field.key,a)}>{display(field.key,a)}</em><em title={display(field.key,b)}>{display(field.key,b)}</em>
        <div className="merge-field-choice"><button className={(choices[String(field.key)]??'auto')==='auto'?'active':''} onClick={()=>setChoice(field.key,'auto')}>Auto</button><button className={choices[String(field.key)]==='a'?'active':''} onClick={()=>setChoice(field.key,'a')}>A</button><button className={choices[String(field.key)]==='b'?'active':''} onClick={()=>setChoice(field.key,'b')}>B</button></div>
        <strong title={display(field.key,manualDraft)}>{display(field.key,manualDraft)}</strong>
      </div>)}
    </div>
    <div className="merge-summary"><GitMerge/><span>Seule la fiche fusionnée remplacera le doublon. « Garder les deux » laisse les deux fiches intactes.</span></div>
    <div className="modal-actions"><button className="secondary" disabled={busy} onClick={()=>{if(onKeepBoth)onKeepBoth();else onClose()}}>Garder les deux</button><button className="ghost" disabled={busy} onClick={()=>setChoices({})}><RotateCcw/>Réinitialiser les choix</button><button className="primary" disabled={busy} onClick={()=>{setBusy(true);void onMerge(primary,secondary,manualDraft).finally(()=>setBusy(false))}}><GitMerge/>{busy?'Fusion…':'Fusionner avec ces choix'}</button></div>
  </Modal>
}

function QuickSetlistAdd({song,setlists,refresh,toast}:{song:Song;setlists:Setlist[];refresh:()=>Promise<void>;toast:(s:string)=>void}) {
  const [open,setOpen]=useState(false)
  const [pendingId,setPendingId]=useState('')
  const [busy,setBusy]=useState(false)
  const pending=setlists.find(s=>s.id===pendingId)
  const close=()=>{if(busy)return;setOpen(false);setPendingId('')}
  const confirmAdd=()=>{
    if(!pending||busy)return
    if(pending.songIds.includes(song.id)){toast(`${song.title} est déjà dans ${pending.name}.`);close();return}
    const ids=[...pending.songIds,song.id]
    setBusy(true)
    setOpen(false)
    setPendingId('')
    void updateSetlist(pending.id,{songIds:ids}).then(()=>{void refresh();toast(`${song.title} ajouté à ${pending.name}.`)}).catch(()=>toast('Ajout à la setlist impossible.')).finally(()=>setBusy(false))
  }
  return <div className="quick-setlist-add" onClick={e=>e.stopPropagation()}><button className="setlist-plus-btn" aria-label="Ajouter à une setlist" title="Ajouter à une setlist" onClick={()=>{setPendingId('');setOpen(true)}}><ListPlus/></button>{open&&<Modal title="Ajouter à une setlist" onClose={close}><div className="setlist-choice-list">{setlists.length?setlists.map(list=>{const added=list.songIds.includes(song.id);const chosen=pendingId===list.id;return <button key={list.id} className={`setlist-choice ${added?'already-added':''} ${chosen?'selected':''}`} disabled={added} onClick={()=>setPendingId(list.id)}><ListMusic/><span><b>{list.name}</b><small>{added?'Déjà ajouté':chosen?'Sélectionnée — confirmer ci-dessous':`${list.songIds.length} morceau${list.songIds.length>1?'x':''}`}</small></span>{added?<Check/>:chosen?<ChevronRight/>:null}</button>}):<p className="muted-copy">Aucune setlist existante. Utilisez le bouton + pour en créer une.</p>}</div>{pending&&<div className="setlist-confirm-add"><span>Ajouter <b>{song.title}</b> à <b>{pending.name}</b> ?</span><button className="primary" disabled={busy} onClick={confirmAdd}><Check/>Confirmer l’ajout</button></div>}</Modal>}</div>
}

function groupPeople(songs:Song[],field:'artist'|'authorComposer') {
  const map=new Map<string,Song[]>()
  songs.forEach(s=>{const n=s[field].trim();if(n)map.set(n,[...(map.get(n)||[]),s])})
  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]))
}

function ArtistsPage({items,restoreY,onArtist,onRecueilSearch}:{items:[string,Song[]][];restoreY:number;onArtist:(name:string)=>void;onRecueilSearch:(query:string)=>void}) {
  const [q,setQ]=useState('')
  const deferredQ=useDeferredValue(q)
  const filtered=useMemo(()=>items.filter(([name,list])=>!deferredQ.trim()||name.toLowerCase().includes(deferredQ.toLowerCase())||list.some(s=>searchSong(s,deferredQ))),[items,deferredQ])
  useEffect(()=>{const id=requestAnimationFrame(()=>window.scrollTo({top:restoreY,behavior:'auto'}));return()=>cancelAnimationFrame(id)},[])
  return <><div className="artist-search searchbox"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Rechercher un artiste ou un morceau…"/>{q&&<button type="button" className="search-clear" aria-label="Effacer la recherche" onClick={()=>setQ('')}><X/></button>}</div>{filtered.length?<div className="people-grid">{filtered.map(([name,list])=><div className="person-card" key={name}><button onClick={()=>onArtist(name)}><span className="avatar">{name[0]}</span><span><b>{name}</b><small>{list.length} morceau{list.length>1?'x':''}</small></span><ChevronRight/></button></div>)}</div>:q.trim()?<div className="empty-search-suggestion"><BookMarked/><b>Artiste introuvable dans DI’ART</b><span>Essayez son nom dans les Recueils.</span><button className="secondary" onClick={()=>onRecueilSearch(q.trim())}><Search/>Rechercher dans les Recueils</button></div>:<Empty text="Aucun artiste."/>}</>
}

function ArtistDetailPage({artist,songs,setlists,refreshSetlists,toast,onBack,onOpen,onFav,onAdd}:{artist:string;songs:Song[];setlists:Setlist[];refreshSetlists:()=>Promise<void>;toast:(s:string)=>void;onBack:()=>void;onOpen:(s:Song)=>void;onFav:(s:Song)=>void;onAdd:()=>void}) {
  const [q,setQ]=useState('')
  const deferredQ=useDeferredValue(q)
  const filtered=useMemo(()=>songs.filter(s=>searchSong(s,deferredQ)),[songs,deferredQ])
  return <><div className="entity-detail-heading artist-header"><h1>{artist}</h1><p>{songs.length} morceau{songs.length>1?'x':''}</p></div>{songs.length>8&&<div className="artist-search searchbox"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={`Rechercher dans ${artist}…`}/>{q&&<button type="button" className="search-clear" aria-label="Effacer la recherche" onClick={()=>setQ('')}><X/></button>}</div>}<div className="songs-list artist-song-list">{filtered.length?filtered.map(s=><SongRow key={s.id} song={s} onOpen={()=>onOpen(s)} onFav={()=>onFav(s)} action={<QuickSetlistAdd song={s} setlists={setlists} refresh={refreshSetlists} toast={toast}/>}/>):<Empty text="Aucun morceau."/>}</div></>
}

function AuthorsPage({items,restoreY,onAuthor}:{items:[string,Song[]][];restoreY:number;onAuthor:(name:string)=>void}) {
  const [q,setQ]=useState('')
  const deferredQ=useDeferredValue(q)
  const filtered=useMemo(()=>items.filter(([name,list])=>!deferredQ.trim()||name.toLowerCase().includes(deferredQ.toLowerCase())||list.some(s=>searchSong(s,deferredQ))),[items,deferredQ])
  useEffect(()=>{const id=requestAnimationFrame(()=>window.scrollTo({top:restoreY,behavior:'auto'}));return()=>cancelAnimationFrame(id)},[])
  return <><div className="artist-search searchbox authors-search"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Rechercher un auteur ou un morceau…"/>{q&&<button type="button" className="search-clear" aria-label="Effacer la recherche" onClick={()=>setQ('')}><X/></button>}</div><div className="authors-directory">{filtered.map(([name,list])=><button className="author-directory-row" key={name} onClick={()=>onAuthor(name)}><span className="avatar">{name[0]}</span><span className="author-directory-main"><b>{name}</b><small>{list.length} morceau{list.length>1?'x':''}</small></span><span className="author-directory-meta">{list.filter(song=>song.lyrics?.trim()).length>0&&<><BookOpen/><small>{list.filter(song=>song.lyrics?.trim()).length}</small></>}<ChevronRight/></span></button>)}</div></>
}

function AuthorDetailPage({author,songs,setlists,refreshSetlists,toast,onBack,onOpen,onFav,onAdd}:{author:string;songs:Song[];setlists:Setlist[];refreshSetlists:()=>Promise<void>;toast:(s:string)=>void;onBack:()=>void;onOpen:(s:Song)=>void;onFav:(s:Song)=>void;onAdd:()=>void}) {
  const [q,setQ]=useState('')
  const deferredQ=useDeferredValue(q)
  const filtered=useMemo(()=>songs.filter(s=>searchSong(s,deferredQ)),[songs,deferredQ])
  return <><div className="entity-detail-heading artist-header"><h1>{author}</h1><p>{songs.length} morceau{songs.length>1?'x':''}</p></div>{songs.length>8&&<div className="artist-search searchbox"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={`Rechercher dans ${author}…`}/>{q&&<button type="button" className="search-clear" aria-label="Effacer la recherche" onClick={()=>setQ('')}><X/></button>}</div>}<div className="songs-list artist-song-list">{filtered.length?filtered.map(s=><SongRow key={s.id} song={s} onOpen={()=>onOpen(s)} onFav={()=>onFav(s)} action={<QuickSetlistAdd song={s} setlists={setlists} refresh={refreshSetlists} toast={toast}/>}/>):<Empty text="Aucun morceau."/>}</div></>
}

function PeoplePage({title,items,onOpen}:{title:string;items:[string,Song[]][];onOpen:(s:Song)=>void}) {
  const [open,setOpen]=useState<string|null>(null)
  const [q,setQ]=useState('')
  const deferredQ=useDeferredValue(q)
  const filtered=useMemo(()=>items.filter(([name,list])=>!deferredQ.trim()||name.toLowerCase().includes(deferredQ.toLowerCase())||list.some(s=>searchSong(s,deferredQ))),[items,deferredQ])
  return <><div className="page-head compact"><div><p className="eyebrow">Répertoire</p><h1>{title}</h1><p>{filtered.length} entrée{filtered.length>1?'s':''}</p></div></div><div className="artist-search searchbox"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={title.startsWith('Artistes')?'Rechercher un artiste ou un morceau…':'Rechercher…'}/>{q&&<button type="button" className="search-clear" aria-label="Effacer la recherche" onClick={()=>setQ('')}><X/></button>}</div><div className="people-grid">{filtered.map(([name,list])=><div className="person-card" key={name}><button onClick={()=>setOpen(open===name?null:name)}><span className="avatar">{name[0]}</span><span><b>{name}</b><small>{list.length} morceau{list.length>1?'x':''}</small></span><ChevronRight/></button>{open===name&&<div>{list.map(s=><button className="person-song" key={s.id} onClick={()=>onOpen(s)}><span className="person-song-title">{s.title}<SongLyricsMark song={s} compact/></span><span>{songListKey(s).value&&<SongListKey song={s}/>} {songListKey(s).value&&s.bpm!==null?' · ':''}{s.bpm!==null?s.bpm+' BPM':''}</span></button>)}</div>}</div>)}</div></>
}

function SimpleSongs({title,songs,setlists,refreshSetlists,toast,onOpen,onFav}:{title:string;songs:Song[];setlists:Setlist[];refreshSetlists:()=>Promise<void>;toast:(s:string)=>void;onOpen:(s:Song)=>void;onFav:(s:Song)=>void}) {
  return <><div className="songs-list">{songs.length?songs.map(s=><SongRow key={s.id} song={s} onOpen={()=>onOpen(s)} onFav={()=>onFav(s)} action={<QuickSetlistAdd song={s} setlists={setlists} refresh={refreshSetlists} toast={toast}/>}/>):<Empty text="Rien à afficher."/>}</div></>
}

function SongDetail({song,backLabel,setlists,refreshSetlists,toast,onBack,onEdit,onArtist,onFav,onLyricsSave,onRecueilSearch,onDelete,setlistKey,onSetlistKey}:{song:Song;backLabel:string;setlists:Setlist[];refreshSetlists:()=>Promise<void>;toast:(s:string)=>void;onBack:()=>void;onEdit:()=>void;onArtist:(name:string)=>void;onFav:()=>void;onLyricsSave:(lyrics:string)=>Promise<void>;onRecueilSearch:(prefill:{title:string;artist:string})=>void;onDelete:()=>void;setlistKey?:string;onSetlistKey?:(key:string)=>void}) {
  const [editingLyrics,setEditingLyrics]=useState(false)
  const [savingLyrics,setSavingLyrics]=useState(false)
  const [lyricsDraft,setLyricsDraft]=useState(song.lyrics??'')
  const [lyricsHistoryOpen,setLyricsHistoryOpen]=useState(false)
  const [historyVersionId,setHistoryVersionId]=useState('')
  const [confirm,setConfirm]=useState(false)
  const [showTranspose,setShowTranspose]=useState(false)
  const [transpose,setTranspose]=useState(()=>song.originalKey&&setlistKey?keyOffsetFromOriginal(song.originalKey,setlistKey):0)
  const [fullscreen,setFullscreen]=useState(false)
  const [showMetronome,setShowMetronome]=useState(false)
  const originalKey=song.originalKey||song.personalKey
  const habitualDistinct=Boolean(song.personalKey&&normalizeKey(song.personalKey)!==normalizeKey(originalKey))
  const baseKey=originalKey
  const workingKey=baseKey ? transposeKey(baseKey,transpose) : ''
  const applyTranspose=(next:number)=>{setTranspose(next);setShowTranspose(next!==0);if(baseKey&&onSetlistKey)onSetlistKey(transposeKey(baseKey,next))}
  const chooseKey=(key:string)=>{if(!baseKey||!key)return;applyTranspose(keyOffsetFromOriginal(baseKey,key))}
  const workingChords=transposeChordText(song.chords??'',transpose)
  const hasWorkingChords=hasMeaningfulChordContent(workingChords)
  const normalizedStructure=parseStructureSequence(song.structure??'').join(' · ')
  const hasInfo=Boolean(song.originalKey||habitualDistinct||song.capo!=null||song.durationSeconds!=null||(song.tags?.length??0)>0)
  const saveLyrics=()=>{if(savingLyrics)return;const next=lyricsDraft;setEditingLyrics(false);setSavingLyrics(true);void onLyricsSave(next).finally(()=>setSavingLyrics(false))}
  return <><div className="detail-nav song-detail-actions"><span/><div className="detail-icon-actions"><button className="bare-action" aria-label="Favori" title="Favori" onClick={onFav}><Heart fill={song.favorite?'currentColor':'none'}/></button><QuickSetlistAdd song={song} setlists={setlists} refresh={refreshSetlists} toast={toast}/>{baseKey&&<button className={`bare-action ${showTranspose?'active':''}`} aria-label="Transposition" title="Transposition" onClick={()=>setShowTranspose(v=>!v)}><ArrowUpDown/></button>}<button className="bare-action" aria-label="Plein écran" title="Plein écran" onClick={()=>setFullscreen(true)}><Maximize2/></button><button className="bare-action" aria-label="Modifier" title="Modifier" onClick={onEdit}><Pencil/></button><button className="bare-action danger-icon" aria-label="Supprimer" title="Supprimer" onClick={()=>setConfirm(true)}><Trash2/></button></div></div>
  <section className="song-hero"><div><p className="eyebrow">{song.style||'Morceau'}{song.source==='demo'?' · DEMO':''}</p><h1>{song.title}</h1><p>{song.artist?<button type="button" className="artist-link-inline" onClick={()=>onArtist(song.artist)}>{song.artist}</button>:'Artiste inconnu'}{song.authorComposer&&normalizeIdentity(song.authorComposer)!==normalizeIdentity(song.artist)?` · ${song.authorComposer}`:''}</p></div><div className="key-bpm">{baseKey&&<div className="song-key-card"><span>Tonalité</span><strong>{workingKey}</strong>{transpose!==0&&<small>{formatSemitoneOffset(transpose)} depuis l’originale</small>}{song.originalKey&&<div className="song-key-choices"><button type="button" className={transpose===0?'active':''} onClick={()=>chooseKey(song.originalKey)}>Originale · {song.originalKey}</button>{habitualDistinct&&<button type="button" className={normalizeKey(workingKey)===normalizeKey(song.personalKey)?'active':''} onClick={()=>chooseKey(song.personalKey)}>Habituelle · {song.personalKey}</button>}</div>}</div>}{song.bpm!==null&&<div><span>BPM</span><strong>{song.bpm}</strong></div>}{song.timeSignature&&<div><span>Signature</span><strong>{song.timeSignature}</strong></div>}</div></section>
  {showTranspose&&baseKey&&<section className="transpose-bar optional-tool" aria-label="Transposition"><div><span className="eyebrow">Transposition depuis l’originale</span><b>{baseKey} → {workingKey}</b></div><div className="transpose-controls"><button className="secondary transpose-btn" disabled={transpose<=-11} onClick={()=>applyTranspose(Math.max(-11,transpose-1))}><Minus/>½ ton</button><button className="ghost transpose-reset" disabled={transpose===0} onClick={()=>applyTranspose(0)}><RotateCcw/>0</button><button className="secondary transpose-btn" disabled={transpose>=11} onClick={()=>applyTranspose(Math.min(11,transpose+1))}><Plus/>½ ton</button></div></section>}
  <div className="musician-grid">
    {hasInfo&&<section className="panel info-list"><h2>Informations musicales</h2>{song.originalKey&&<button type="button" className={'info-key-row '+(transpose===0?'active':'')} onClick={()=>chooseKey(song.originalKey)}><span>Tonalité originale</span><b>{song.originalKey}</b></button>}{habitualDistinct&&<button type="button" className={'info-key-row '+(normalizeKey(workingKey)===normalizeKey(song.personalKey)?'active':'')} onClick={()=>chooseKey(song.personalKey)}><span>Tonalité habituelle</span><b>{song.personalKey}</b></button>}{song.capo!=null&&<div><span>Capo</span><b>{song.capo}</b></div>}{song.durationSeconds!=null&&<div><span>Durée</span><b>{formatDuration(song.durationSeconds)}</b></div>}{song.tags.length>0&&<div><span>Tags</span><b>{song.tags.join(', ')}</b></div>}{song.favoriteStatus&&<div><span>Statut personnel</span><b>{FAVORITE_STATUS_OPTIONS.find(([v])=>v===song.favoriteStatus)?.[1]}</b></div>}</section>}
    {normalizedStructure&&<section className="panel performance-panel"><h2>Structure</h2><p className="performance-text">{normalizedStructure}</p></section>}
    {hasWorkingChords&&<section className="panel performance-panel chords-panel"><div className="panel-title-row"><h2>Accords / repères</h2>{transpose!==0&&<span className="transpose-chip">{formatSemitoneOffset(transpose)}</span>}</div><pre className="chord-sheet">{workingChords}</pre></section>}
    {song.instrumentNotes&&<section className="panel performance-panel"><h2>Notes instrumentales</h2><p className="performance-text">{song.instrumentNotes}</p></section>}{Object.values(song.musicianNotes??{}).some(Boolean)&&<section className="panel performance-panel"><h2>Notes par musicien</h2><div className="role-note-list">{Object.entries(song.musicianNotes??{}).filter(([,v])=>v?.trim()).map(([role,note])=><div key={role}><b>{role}</b><p>{note}</p></div>)}</div></section>}
    <section className={`panel lyrics-panel ${song.lyrics?'':'lyrics-empty'}`}><div className="panel-title-row"><h2>Paroles</h2><div className="lyrics-title-actions">{(song.lyricVersions?.length??0)>0&&<button className="secondary lyrics-history-button" onClick={()=>{const latest=song.lyricVersions?.[song.lyricVersions.length-1];setHistoryVersionId(latest?.id??'');setLyricsHistoryOpen(true)}}><History/>Historique · {song.lyricVersions?.length}</button>}<button className="bare-action lyrics-inline-action" aria-label={song.lyrics?'Modifier les paroles':'Ajouter des paroles'} title={song.lyrics?'Modifier les paroles':'Ajouter des paroles'} onClick={()=>{setLyricsDraft(song.lyrics??'');setEditingLyrics(true)}}><Pencil/></button></div></div>{song.lyrics?<pre className="lyrics-text">{song.lyrics}</pre>:<div className="lyrics-missing-actions"><button className="lyrics-add-empty" onClick={()=>{setLyricsDraft('');setEditingLyrics(true)}}><Plus/>Ajouter manuellement</button><button className="secondary lyrics-recueil-search" onClick={()=>onRecueilSearch({title:song.title,artist:song.artist})}><BookMarked/>Rechercher dans les Recueils</button></div>}</section>
    <section className="panel optional-metronome-panel"><button type="button" className="optional-metronome-toggle" onClick={()=>setShowMetronome(v=>!v)}><span><Gauge/><span><b>Métronome</b><small>Outil optionnel</small></span></span>{showMetronome?<ChevronUp/>:<ChevronDown/>}</button><div className={'optional-metronome-body collapsible-body '+(showMetronome?'is-expanded':'is-collapsed')}><MetronomeCard initialBpm={song.bpm??96} signature={song.timeSignature}/></div></section>
    {(song.notes||song.referenceUrl)&&<section className="panel notes-panel"><h2>Notes générales</h2>{song.notes&&<p className="notes">{song.notes}</p>}{song.referenceUrl&&<a href={song.referenceUrl} target="_blank" rel="noreferrer">Ouvrir le lien de référence</a>}</section>}
  </div>
  {lyricsHistoryOpen&&<Modal className="lyrics-history-modal" title="Historique des paroles" onClose={()=>setLyricsHistoryOpen(false)}>{(()=>{const versions=song.lyricVersions??[];const selectedVersion=versions.find(v=>v.id===historyVersionId)??versions[versions.length-1];const diff=selectedVersion?lyricLineDiff(selectedVersion.lyrics,song.lyrics??''):[];const changed=diff.filter(x=>x.kind!=='same').length;return <><div className="lyrics-history-layout"><div className="lyrics-version-list">{[...versions].reverse().map((v,i)=><button key={v.id} className={selectedVersion?.id===v.id?'active':''} onClick={()=>setHistoryVersionId(v.id)}><b>{v.label||'Version précédente'}</b><small>{new Date(v.createdAt).toLocaleString()} · {v.lyrics.split('\\n').filter(Boolean).length} lignes</small></button>)}</div>{selectedVersion&&<div className="lyrics-version-preview"><div className="lyrics-version-summary"><span>{changed} ligne{changed>1?'s':''} modifiée{changed>1?'s':''}</span><button className="secondary" onClick={()=>{setLyricsDraft(selectedVersion.lyrics);setLyricsHistoryOpen(false);setEditingLyrics(true)}}><RotateCcw/>Restaurer cette version</button></div><div className="lyric-diff">{diff.map((line,i)=><div className={'lyric-diff-line '+line.kind} key={i}><span>{line.kind==='add'?'+':line.kind==='remove'?'−':' '}</span><pre>{line.text||' '}</pre></div>)}</div></div>}</div></>})()}</Modal>}
  {editingLyrics&&<Modal className="lyrics-modal" title="Paroles du morceau" onClose={()=>{if(!savingLyrics)setEditingLyrics(false)}}><form className="lyrics-modal-form" onSubmit={e=>{e.preventDefault();saveLyrics()}}><textarea autoFocus className="lyrics-editor" rows={18} value={lyricsDraft} onChange={e=>setLyricsDraft(e.target.value)} placeholder="Collez ou saisissez les paroles ici…"/><div className="modal-actions"><button type="button" className="secondary" disabled={savingLyrics} onClick={()=>setEditingLyrics(false)}>Annuler</button><button type="submit" className="primary" disabled={savingLyrics}><Save/>{savingLyrics?'Enregistrement…':'Enregistrer'}</button></div></form></Modal>}
  {confirm&&<Modal title="Supprimer ce morceau ?" onClose={()=>setConfirm(false)}><p>Le morceau sera masqué de la bibliothèque et pourra être restauré via l’action Annuler.</p><div className="modal-actions"><button className="secondary" onClick={()=>setConfirm(false)}>Annuler</button><button className="danger" onClick={onDelete}><Trash2/>Supprimer</button></div></Modal>}
  {fullscreen&&<SetlistStage standalone mode="live" list={{id:'standalone-'+song.id,name:song.title,songIds:[song.id],notes:'',createdAt:song.createdAt,updatedAt:song.updatedAt,deletedAt:null}} songs={[song]} refresh={async()=>{}} toast={toast} onClose={()=>setFullscreen(false)} onOpenSong={()=>{setFullscreen(false);onEdit()}}/>}</>
}

const STRUCTURE_PARTS=['Prélude','Couplet','Refrain','Bridge','Interlude','Postlude'] as const

function normalizeStructurePart(value:string):string{
  const raw=value.trim()
  const variation=/\(\s*(?:variation|var\.?)\s*\)$/i.test(raw)
  const base=raw.replace(/\s+\d+\s*$/,'').replace(/\s*\(\s*(?:variation|var\.?)\s*\)\s*$/i,'').trim()
  const canonical=STRUCTURE_PARTS.find(x=>x.toLowerCase()===base.toLowerCase())||base
  return variation?canonical+' (variation)':canonical
}
function structureBase(value:string):string{
  return normalizeStructurePart(value).replace(/\s*\(variation\)\s*$/i,'').trim()
}
function parseStructureSequence(value:string):string[]{
  return value.split(/[·\n>]+/).map(normalizeStructurePart).filter(Boolean)
}
function numberedStructureLabels(parts:string[]):string[]{
  return parts.map(normalizeStructurePart)
}
function uniqueStructureChoices(parts:string[]):string[]{
  const seen=new Set<string>()
  const out:string[]=[]
  for(const part of parts.map(normalizeStructurePart)){
    const key=part.toLowerCase()
    if(seen.has(key))continue
    seen.add(key)
    out.push(part)
  }
  return out
}
function chordGuideSections(value:string):{label:string;body:string}[]{
  const lines=value.replace(/\r/g,'').split('\n')
  const out:{label:string;body:string}[]=[]
  let current:{label:string;body:string}|null=null
  for(const line of lines){
    const header=line.trim().match(/^\[([^\]]+)\]$/)
    if(header){
      if(current&&current.body.trim())out.push({...current,body:current.body.trim()})
      current={label:normalizeStructurePart(header[1]),body:''}
      continue
    }
    if(!current){
      if(!line.trim())continue
      current={label:'Accords',body:''}
    }
    current.body+=(current.body?'\n':'')+line.trimEnd()
  }
  if(current&&current.body.trim())out.push({...current,body:current.body.trim()})
  return out
}
function hasMeaningfulChordContent(value:string):boolean{
  return chordGuideSections(value).length>0
}

function SongForm({initial,songs,presetArtist='',presetAuthor='',onCancel,onSave,onMergeDuplicate}:{initial:Song|null;songs:Song[];presetArtist?:string;presetAuthor?:string;onCancel:()=>void;onSave:(d:SongDraft)=>Promise<void>;onMergeDuplicate:(d:SongDraft,duplicate:Song)=>Promise<void>}) {
  const [d,setD]=useState<SongDraft>(()=>initial?{...emptySongDraft(),title:initial.title,artist:initial.artist,authorComposer:initial.authorComposer,originalKey:initial.originalKey,personalKey:initial.personalKey,bpm:initial.bpm,timeSignature:initial.timeSignature,style:initial.style,durationSeconds:initial.durationSeconds,tags:initial.tags,notes:initial.notes,referenceUrl:initial.referenceUrl,capo:initial.capo??null,structure:initial.structure??'',chords:initial.chords??'',instrumentNotes:initial.instrumentNotes??'',musicianNotes:initial.musicianNotes??{},lyrics:initial.lyrics??'',favorite:initial.favorite,favoriteStatus:initial.favoriteStatus??(initial.favorite?'favorite':''),source:initial.source}:{...emptySongDraft(),artist:presetArtist,authorComposer:presetAuthor})
  const [duration,setDuration]=useState(initial?formatDuration(initial.durationSeconds)==='—'?'':formatDuration(initial.durationSeconds):'')
  const [saving,setSaving]=useState(false)
  const [mergeConfirm,setMergeConfirm]=useState(false)
  const [tagTyping,setTagTyping]=useState(false)
  const [artistTyping,setArtistTyping]=useState(false)
  const [authorTyping,setAuthorTyping]=useState(false)
  const [chordType,setChordType]=useState<'M'|'m'|'7'|'Sus'|'Aug'>('M')
  const [chordAccidental,setChordAccidental]=useState<''|'#'|'b'>('')
  const chordRef=useRef<HTMLTextAreaElement>(null)
  const set=<K extends keyof SongDraft>(k:K,v:SongDraft[K])=>setD(x=>({...x,[k]:v}))
  const sequence=useMemo(()=>parseStructureSequence(d.structure??''),[d.structure])
  const numberedSequence=useMemo(()=>numberedStructureLabels(sequence),[sequence])
  const structureChoices=useMemo(()=>uniqueStructureChoices(sequence),[sequence])
  const artistNames=useMemo(()=>[...new Set(songs.map(s=>s.artist.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),[songs])
  const authorNames=useMemo(()=>[...new Set(songs.map(s=>s.authorComposer.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),[songs])
  const artistSuggestions=useMemo(()=>{if(!artistTyping)return[];const q=normalizeIdentity(d.artist);return q?artistNames.filter(n=>normalizeIdentity(n)!==q&&normalizeIdentity(n).startsWith(q)).slice(0,5):[]},[d.artist,artistNames,artistTyping])
  const authorSuggestions=useMemo(()=>{if(!authorTyping)return[];const q=normalizeIdentity(d.authorComposer);return q?authorNames.filter(n=>normalizeIdentity(n)!==q&&normalizeIdentity(n).startsWith(q)).slice(0,5):[]},[d.authorComposer,authorNames,authorTyping])
  const allTags=useMemo(()=>[...new Set(songs.flatMap(s=>s.tags??[]).map(x=>x.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),[songs])
  const tagFragment=(d.tags[d.tags.length-1]??'').trim()
  const tagSuggestions=useMemo(()=>tagTyping&&tagFragment?allTags.filter(t=>normalizeIdentity(t).startsWith(normalizeIdentity(tagFragment))&&!d.tags.slice(0,-1).some(x=>normalizeIdentity(x)===normalizeIdentity(t))).slice(0,6):[],[allTags,d.tags,tagFragment,tagTyping])
  const addSuggestedTag=(tag:string)=>{const next=[...d.tags];if(next.length&&tagFragment)next[next.length-1]=tag;else next.push(tag);set('tags',[...new Set(next.map(x=>x.trim()).filter(Boolean))]);setTagTyping(false)}
  const setMusicianNote=(role:string,value:string)=>set('musicianNotes',{...(d.musicianNotes??{}),[role]:value})
  const duplicateCandidate=useMemo(()=>{const title=normalizeIdentity(d.title),artist=normalizeIdentity(d.artist);if(!title)return null;return songs.find(s=>s.id!==initial?.id&&normalizeIdentity(s.title)===title&&normalizeIdentity(s.artist)===artist)??null},[songs,initial?.id,d.title,d.artist])

  const applyStructure=(next:string[])=>setD(prev=>({...prev,structure:next.map(normalizeStructurePart).join(' · ')}))
  const addStructure=(part:string)=>applyStructure([...sequence,part])
  const removeStructure=(index:number)=>applyStructure(sequence.filter((_,i)=>i!==index))
  const toggleVariation=(index:number)=>{
    const next=[...sequence]
    const base=structureBase(next[index])
    next[index]=/\(variation\)$/i.test(next[index])?base:base+' (variation)'
    applyStructure(next)
  }
  const insertChordSection=(label:string)=>{
    const token='['+normalizeStructurePart(label)+']\n'
    const el=chordRef.current
    const value=d.chords??''
    const start=el?.selectionStart??value.length
    const end=el?.selectionEnd??start
    const before=value.slice(0,start)
    const after=value.slice(end)
    const prefix=before&&!before.endsWith('\n\n')?(before.endsWith('\n')?'\n':'\n\n'):''
    const suffix=after&&!after.startsWith('\n')?'\n':''
    const next=before+prefix+token+suffix+after
    const cursor=(before+prefix+token).length
    set('chords',next)
    requestAnimationFrame(()=>{chordRef.current?.focus();chordRef.current?.setSelectionRange(cursor,cursor)})
  }
  const insertChord=(root:string)=>{
    const suffix=chordType==='M'?'':chordType==='m'?'m':chordType==='7'?'7':chordType==='Sus'?'sus':'aug'
    const token=normalizeKey(root+chordAccidental)+suffix
    const el=chordRef.current
    const start=el?.selectionStart??(d.chords??'').length
    const end=el?.selectionEnd??start
    const value=d.chords??''
    const before=value.slice(0,start)
    const after=value.slice(end)
    const left=before&&!/[\s\n]$/.test(before)?' ':''
    const right=after&&!/^[\s\n]/.test(after)?' ':''
    const next=before+left+token+right+after
    const cursor=(before+left+token).length
    set('chords',next)
    requestAnimationFrame(()=>{chordRef.current?.focus();chordRef.current?.setSelectionRange(cursor,cursor)})
  }
  const moveStructure=(index:number,delta:number)=>{
    const next=[...sequence]
    const target=index+delta
    if(target<0||target>=next.length)return
    const [item]=next.splice(index,1)
    next.splice(target,0,item)
    applyStructure(next)
  }
  const normalizedDraft=():SongDraft=>({...d,title:d.title.trim(),originalKey:normalizeKey(d.originalKey),personalKey:normalizeKey(d.personalKey),tags:[...new Set(d.tags.map(x=>x.trim()).filter(Boolean))],durationSeconds:parseDuration(duration)})
  const submit=async(e:FormEvent)=>{e.preventDefault();if(!d.title.trim())return;setSaving(true);try{await onSave(normalizedDraft())}finally{setSaving(false)}}
  const mergeDuplicate=async()=>{if(!duplicateCandidate||saving)return;setSaving(true);try{await onMergeDuplicate(normalizedDraft(),duplicateCandidate);setMergeConfirm(false)}finally{setSaving(false)}}

  return <><div className="page-head compact"><div><p className="eyebrow">{initial?'Modification':'Nouveau morceau'}</p><h1>{initial?initial.title:'Ajouter un morceau'}</h1></div></div><form className="panel form-grid" onSubmit={e=>void submit(e)}><label className="span2">Titre *<input required value={d.title} onChange={e=>set('title',e.target.value)} autoFocus/></label><label>Artiste<div className="autocomplete-wrap"><input value={d.artist} onChange={e=>{set('artist',e.target.value);setArtistTyping(true)}} onBlur={()=>setArtistTyping(false)} onKeyDown={e=>{if(e.key==='Tab'&&artistSuggestions[0]){e.preventDefault();set('artist',artistSuggestions[0]);setArtistTyping(false)}}}/>{artistSuggestions.length>0&&<div className="autocomplete-menu"><small><kbd>Tab</kbd> complète avec {artistSuggestions[0]}</small>{artistSuggestions.map(name=><button type="button" key={name} onMouseDown={e=>e.preventDefault()} onClick={()=>{set('artist',name);setArtistTyping(false)}}>{name}</button>)}</div>}</div></label><label>Auteur / Compositeur<div className="autocomplete-wrap"><input value={d.authorComposer} onChange={e=>{set('authorComposer',e.target.value);setAuthorTyping(true)}} onBlur={()=>setAuthorTyping(false)} onKeyDown={e=>{if(e.key==='Tab'&&authorSuggestions[0]){e.preventDefault();set('authorComposer',authorSuggestions[0]);setAuthorTyping(false)}}}/>{authorSuggestions.length>0&&<div className="autocomplete-menu"><small><kbd>Tab</kbd> complète avec {authorSuggestions[0]}</small>{authorSuggestions.map(name=><button type="button" key={name} onMouseDown={e=>e.preventDefault()} onClick={()=>{set('authorComposer',name);setAuthorTyping(false)}}>{name}</button>)}</div>}</div></label>{duplicateCandidate&&<div className="duplicate-warning span2"><AlertTriangle/><div><b>Doublon existant détecté</b><span>« {duplicateCandidate.title} » — {duplicateCandidate.artist||'Artiste inconnu'}</span></div><button type="button" className="secondary" onClick={()=>setMergeConfirm(true)}><GitMerge/>Fusionner</button></div>}<label>Tonalité originale<select value={d.originalKey} onChange={e=>set('originalKey',e.target.value)}><option value="">—</option>{d.originalKey&&!KEY_OPTIONS.includes(d.originalKey as typeof KEY_OPTIONS[number])&&<option value={d.originalKey}>{d.originalKey} (existant)</option>}{KEY_OPTIONS.map(k=><option key={k} value={k}>{k}</option>)}</select></label><label>Tonalité habituelle<select value={d.personalKey} onChange={e=>set('personalKey',e.target.value)}><option value="">—</option>{d.personalKey&&!KEY_OPTIONS.includes(d.personalKey as typeof KEY_OPTIONS[number])&&<option value={d.personalKey}>{d.personalKey} (existant)</option>}{KEY_OPTIONS.map(k=><option key={k} value={k}>{k}</option>)}</select></label><label>BPM<input inputMode="numeric" value={d.bpm??''} onChange={e=>set('bpm',parseBpm(e.target.value))}/></label><label>Signature<select value={d.timeSignature} onChange={e=>set('timeSignature',e.target.value)}><option value="">—</option>{d.timeSignature&&!SIGNATURE_OPTIONS.includes(d.timeSignature as typeof SIGNATURE_OPTIONS[number])&&<option value={d.timeSignature}>{d.timeSignature} (existante)</option>}{SIGNATURE_OPTIONS.map(sig=><option key={sig} value={sig}>{sig}</option>)}</select></label><label>Style<input value={d.style} onChange={e=>set('style',e.target.value)}/></label><label>Durée mm:ss<input value={duration} onChange={e=>setDuration(e.target.value)} placeholder="4:30"/></label><label>Capo<input inputMode="numeric" type="number" min="0" max="12" value={d.capo??''} onChange={e=>set('capo',e.target.value===''?null:Math.max(0,Math.min(12,Number(e.target.value))))}/></label><label>Tags<div className="autocomplete-wrap tag-autocomplete"><input value={d.tags.join(', ')} onChange={e=>{setTagTyping(true);set('tags',e.target.value.split(/[;,]/).map(x=>x.trim()))}} onBlur={()=>window.setTimeout(()=>setTagTyping(false),120)} placeholder="Louange, Noël, Gospel…"/>{tagSuggestions.length>0&&<div className="autocomplete-menu tag-suggestions"><small><Tag/> Suggestions de vos tags existants</small>{tagSuggestions.map(tag=><button type="button" key={tag} onMouseDown={e=>e.preventDefault()} onClick={()=>addSuggestedTag(tag)}>{tag}</button>)}</div>}</div></label><label>Statut personnel<select value={d.favoriteStatus??''} onChange={e=>{const status=e.target.value as FavoriteStatus;setD(x=>({...x,favoriteStatus:status,favorite:Boolean(status)}))}}>{FAVORITE_STATUS_OPTIONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><div className="form-section-title span2"><span>Préparation musicale</span><small>Informations utiles en répétition et sur scène</small></div>

  <div className="structure-builder span2"><div className="structure-builder-head"><div><b>Structure du morceau</b><small>Couplet 1/2 et Refrain 1/2 sont considérés comme la même section. Activez « Var. » uniquement si une occurrence change réellement.</small></div>{sequence.length>0&&<button type="button" className="bare-action structure-clear" onClick={()=>applyStructure([])}>Effacer</button>}</div><div className="structure-options">{STRUCTURE_PARTS.map(part=><button type="button" key={part} onClick={()=>addStructure(part)}><Plus/>{part}</button>)}</div>{sequence.length>0?<div className="structure-sequence">{numberedSequence.map((label,index)=><div className="structure-chip" key={label+'-'+index}><span>{index+1}</span><b>{label}</b><button type="button" className={/\(variation\)$/i.test(label)?'variation-active':''} title="Variation optionnelle" onClick={()=>toggleVariation(index)}>Var.</button><button type="button" disabled={index===0} title="Déplacer avant" onClick={()=>moveStructure(index,-1)}><ChevronUp/></button><button type="button" disabled={index===sequence.length-1} title="Déplacer après" onClick={()=>moveStructure(index,1)}><ChevronDown/></button><button type="button" title="Retirer" onClick={()=>removeStructure(index)}><X/></button></div>)}</div>:<p className="structure-empty">Aucune structure sélectionnée.</p>}</div>

  <label className="span2">Structure<textarea rows={3} value={d.structure??''} onChange={e=>set('structure',e.target.value)} placeholder="Prélude · Couplet · Refrain · Couplet · Bridge · Refrain · Postlude"/></label>
  <label className="span2 chord-label"><span className="field-label-row"><span>Accords / repères</span></span>{structureChoices.length>0&&<div className="chord-section-picker"><small>Insérer une section</small><div>{structureChoices.map(label=><button type="button" key={label} onClick={()=>insertChordSection(label)}>[{label}]</button>)}</div></div>}<div className="chord-assistant"><div className="chord-accidental-picker">{([{v:'',l:'♮'},{v:'#',l:'#'},{v:'b',l:'b'}] as const).map(item=><button type="button" className={chordAccidental===item.v?'active':''} key={item.l} onClick={()=>setChordAccidental(item.v)}>{item.l}</button>)}</div><div className="chord-type-picker">{(['M','m','7','Sus','Aug'] as const).map(type=><button type="button" className={chordType===type?'active':''} key={type} onClick={()=>setChordType(type)}>{type}</button>)}</div><div className="chord-root-picker">{['A','B','C','D','E','F','G'].map(root=><button type="button" key={root} onClick={()=>insertChord(root)}>{root}</button>)}</div></div><textarea ref={chordRef} rows={Math.max(6,sequence.length*2)} className="chord-input" value={d.chords??''} onChange={e=>set('chords',e.target.value)} placeholder="[Prélude]&#10;C  G  Am  F&#10;&#10;[Couplet]&#10;C  G/B  Am7  F"/></label>
  <label className="span2">Notes instrumentales générales<textarea rows={4} value={d.instrumentNotes??''} onChange={e=>set('instrumentNotes',e.target.value)} placeholder="Informations communes à tous les musiciens…"/></label><div className="span2 musician-role-notes"><div className="form-section-title"><span>Notes propres aux musiciens</span><small>Chaque rôle verra sa note en Mode Musicien.</small></div><div className="musician-role-grid">{MUSICIAN_ROLES.map(role=><label key={role}>{role}<textarea rows={2} value={d.musicianNotes?.[role]??''} onChange={e=>setMusicianNote(role,e.target.value)} placeholder={'Note pour '+role+'…'}/></label>)}</div></div><label className="span2">Paroles<textarea rows={8} value={d.lyrics??''} onChange={e=>set('lyrics',e.target.value)} placeholder="Paroles du morceau…"/></label><label className="span2">Lien de référence<input value={d.referenceUrl} onChange={e=>set('referenceUrl',e.target.value)}/></label><label className="span2">Notes générales<textarea rows={5} value={d.notes} onChange={e=>set('notes',e.target.value)}/></label><div className="form-actions song-form-actions span2"><button type="button" className="secondary" onClick={onCancel}>Annuler</button><button className="primary" disabled={saving}><Save/>{saving?'Enregistrement…':'Enregistrer'}</button></div></form>{mergeConfirm&&duplicateCandidate&&<Modal title="Fusionner avec le doublon ?" onClose={()=>setMergeConfirm(false)}><p>Les informations saisies seront regroupées avec « {duplicateCandidate.title} ». Une seule fiche restera dans la bibliothèque.</p><div className="modal-actions"><button className="secondary" onClick={()=>setMergeConfirm(false)}>Annuler</button><button className="primary" disabled={saving} onClick={()=>void mergeDuplicate()}><GitMerge/>{saving?'Fusion…':'Fusionner'}</button></div></Modal>}</>
}

const fieldOptions:[ImportField,string][]=[['title','Titre *'],['artist','Artiste'],['authorComposer','Auteur / Compositeur'],['originalKey','Tonalité originale'],['personalKey','Tonalité personnelle'],['bpm','BPM'],['timeSignature','Signature rythmique'],['style','Style'],['duration','Durée'],['tags','Tags'],['notes','Notes'],['referenceUrl','Lien de référence'],['capo','Capo'],['structure','Structure'],['chords','Accords'],['instrumentNotes','Notes instrumentales'],['lyrics','Paroles']]


type SongCompletion = {patch:Partial<SongDraft>;labels:string[]}

function findMatchingSong(songs:Song[],title:string,artist:string):Song|undefined{
  const exact=duplicateKey(title,artist)
  const exactMatch=songs.find(s=>duplicateKey(s.title,s.artist)===exact)
  if(exactMatch)return exactMatch
  const normalizedTitle=normalizeIdentity(title)
  const normalizedArtist=normalizeIdentity(artist)
  const sameTitle=songs.filter(s=>normalizeIdentity(s.title)===normalizedTitle)
  if(!sameTitle.length)return undefined
  const artistMatch=sameTitle.find(s=>{
    const a=normalizeIdentity(s.artist)
    return a===normalizedArtist || !a || !normalizedArtist || a.includes(normalizedArtist) || normalizedArtist.includes(a)
  })
  return artistMatch ?? (sameTitle.length===1?sameTitle[0]:undefined)
}

function songCompletion(existing:Song,incoming:SongDraft):SongCompletion{
  const patch:Partial<SongDraft>={}
  const labels:string[]=[]
  const combineText=(a:string|undefined,b:string|undefined)=>{const aa=String(a??'').trim(),bb=String(b??'').trim();if(!aa)return bb;if(!bb||normalizeIdentity(aa)===normalizeIdentity(bb))return aa;return aa+'\n\n'+bb}
  const addString=(key:keyof SongDraft,label:string)=>{
    const current=String(existing[key as keyof Song]??'').trim()
    const next=String(incoming[key]??'').trim()
    if(!current&&next){(patch as any)[key]=incoming[key];labels.push(label)}
  }
  addString('artist','Artiste')
  addString('authorComposer','Auteur / compositeur')
  addString('originalKey','Tonalité originale')
  addString('personalKey','Tonalité habituelle')
  addString('timeSignature','Signature')
  addString('style','Style')
  addString('structure','Structure')
  if(!hasMeaningfulChordContent(existing.chords??'')&&hasMeaningfulChordContent(incoming.chords??'')){patch.chords=incoming.chords;labels.push('Accords / repères')}
  addString('instrumentNotes','Notes instrumentales')
  const musicianRoles=[...new Set([...Object.keys(existing.musicianNotes??{}),...Object.keys(incoming.musicianNotes??{})])]
  const mergedMusicianNotes=Object.fromEntries(musicianRoles.map(role=>[role,combineText(existing.musicianNotes?.[role],incoming.musicianNotes?.[role])]).filter(([,v])=>v))
  if(Object.keys(mergedMusicianNotes).length>Object.keys(existing.musicianNotes??{}).length){patch.musicianNotes=mergedMusicianNotes;labels.push('Notes musiciens')}
  addString('lyrics','Paroles')
  addString('notes','Notes')
  addString('referenceUrl','Lien source')
  if(existing.bpm===null&&incoming.bpm!==null){patch.bpm=incoming.bpm;labels.push('BPM')}
  if(existing.durationSeconds===null&&incoming.durationSeconds!==null){patch.durationSeconds=incoming.durationSeconds;labels.push('Durée')}
  if((existing.capo===null||existing.capo===undefined)&&incoming.capo!==null&&incoming.capo!==undefined){patch.capo=incoming.capo;labels.push('Capo')}
  const mergedTags=[...new Set([...(existing.tags??[]),...(incoming.tags??[])].map(x=>x.trim()).filter(Boolean))]
  if(mergedTags.length>(existing.tags??[]).length){patch.tags=mergedTags;labels.push('Tags')}
  return {patch,labels}
}

function draftSummary(draft:SongDraft):{label:string;value:string}[]{
  const rows=[
    ['Titre',draft.title],['Artiste',draft.artist],['Auteur / compositeur',draft.authorComposer],
    ['Tonalité',draft.personalKey||draft.originalKey],['BPM',draft.bpm===null?'':String(draft.bpm)],
    ['Signature',draft.timeSignature],['Style',draft.style],['Structure',draft.structure??''],
    ['Accords / repères',hasMeaningfulChordContent(draft.chords??'')?'Présents':''],
    ['Paroles',draft.lyrics?.trim()?String(draft.lyrics.split('\n').filter(Boolean).length)+' lignes':''],
    ['Notes instrumentales',draft.instrumentNotes??''],['Lien source',draft.referenceUrl]
  ] as [string,string][]
  return rows.filter(([,value])=>String(value).trim()).map(([label,value])=>({label,value:String(value)}))
}
function patchSummary(patch:Partial<SongDraft>):{label:string;value:string}[]{
  return draftSummary({...emptySongDraft(),...patch})
}


function normalizeImportedLyrics(value:string):string{
  let text=String(value??'')
    .replace(/\r/g,'')
    .replace(/\u00a0/g,' ')
    .replace(/[\u200B-\u200D\uFEFF]/g,'')
    .replace(/<br\s*\/?>/gi,'\n')

  // Certains extracteurs exposent les retours visuels sous forme de séparateurs.
  // On ne les convertit que lorsqu'ils séparent clairement deux segments de paroles.
  text=text.replace(/\s+[|•·]\s+(?=\S)/g,'\n')
  text=text.replace(/\s+\/\s+(?=[A-ZÀ-ÖØ-Þ])/g,'\n')

  const section=/^\s*\[?\s*(couplet|verse|refrain|chorus|ref|fiv|pré[- ]?refrain|pre[- ]?chorus|pont|bridge|intro|outro|interlude|prélude|prelude|postlude)(?:\s*\d+)?\s*\]?\s*[:.-]?\s*$/i
  const source=text.split('\n').map(line=>line.replace(/[ \t]+$/,''))
  const out:string[]=[]
  const pushBlank=()=>{if(out.length&&out[out.length-1]!=='')out.push('')}

  for(const raw of source){
    const indentation=(raw.match(/^[ \t]+/)?.[0]??'').replace(/\t/g,'    ').length
    const line=raw.trim()
    if(!line){pushBlank();continue}
    if(section.test(line)){
      pushBlank();out.push(line)
      continue
    }
    // Tononkira utilise souvent l'indentation pour matérialiser le refrain.
    // Une rupture d'indentation devient donc une frontière de bloc, pas une ligne vide entre chaque vers.
    const previousRaw=source[Math.max(0,source.indexOf(raw)-1)]??''
    const previousIndent=(previousRaw.match(/^[ \t]+/)?.[0]??'').replace(/\t/g,'    ').length
    if(out.length&&indentation>=3&&previousIndent<3)pushBlank()
    if(out.length&&indentation<3&&previousIndent>=3)pushBlank()
    if(out.length>=2&&out[out.length-1]===''&&section.test(out[out.length-2]))out.pop()
    out.push(line)
  }
  while(out[0]==='')out.shift()
  while(out.length&&out[out.length-1]==='')out.pop()
  return out.join('\n').replace(/\n{3,}/g,'\n\n').trim()
}

type RemovedTononkiraNoise={word:string;line:number}

const TONONKIRA_KNOWN_NOISE=new Set('aovex knjmxm jdatu nggixe tabdtmf cpztr csvo ztzw bsylx kcpib yzlpj dwruu kwjaqreo mkku lgksrym mnszr'.split(' '))
function looksLikeTononkiraNoiseWord(word:string):boolean{
  const clean=word.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g,'')
  if(!clean||clean.length<4||clean.length>12)return false
  if(TONONKIRA_KNOWN_NOISE.has(clean))return true
  // Signature prudente des jetons parasites observés : uniquement ASCII, aucune apostrophe,
  // forte densité de consonnes et combinaisons rares. On évite volontairement de filtrer
  // un mot normal sur un seul critère.
  if(!/^[a-z]+$/.test(clean))return false
  const vowels=(clean.match(/[aeiouy]/g)||[]).length
  const consonantRuns=clean.match(/[bcdfghjklmnpqrstvwxz]{4,}/g)||[]
  const rare=(clean.match(/[qxzwkj]/g)||[]).length
  const vowelRatio=vowels/clean.length
  const alternatingNoise=/^(?:[bcdfghjklmnpqrstvwxz]{2,}[aeiouy]?){2,}$/i.test(clean)
  const rareDensity=rare/clean.length
  // Plus sensible qu'avant aux rafales de parasites, tout en exigeant plusieurs indices.
  return clean.length>=5&&(
    (vowelRatio<=.30&&consonantRuns.length>0)||
    (vowelRatio<=.34&&rare>=2&&rareDensity>=.22)||
    (clean.length>=7&&alternatingNoise&&rare>=1)
  )
}
function cleanTononkiraNoiseWords(value:string):{lyrics:string;removed:RemovedTononkiraNoise[]}{
  const removed:RemovedTononkiraNoise[]=[]
  const lines=String(value||'').split('\n').map((line,lineIndex)=>{
    const tokens=line.split(/(\s+)/)
    const kept=tokens.filter(token=>{
      if(/^\s+$/.test(token))return true
      const bare=token.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g,'')
      if(!looksLikeTononkiraNoiseWord(bare))return true
      removed.push({word:bare,line:lineIndex+1})
      return false
    })
    return kept.join('').replace(/[ \t]{2,}/g,' ').trimEnd()
  })
  return {lyrics:lines.join('\n').replace(/\n{3,}/g,'\n\n').trim(),removed}
}

type TononkiraStructureBlock={id:string;label:string;text:string;kind:'verse'|'refrain'|'other';confidence:'forte'|'probable'|'à vérifier'}

function detectTononkiraStructure(lyrics:string):TononkiraStructureBlock[]{
  const normalized=String(lyrics||'').replace(/\r/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+$/gm,'').trim()
  if(!normalized)return []
  const canonical=(x:string)=>normalizeIdentity(x)
    .replace(/^\[?\s*(couplet|verse|refrain|chorus|ref|fiv|pré[- ]?refrain|pre[- ]?chorus|pont|bridge|intro|outro|interlude)\s*\d*\s*\]?\s*[:.\-–—]?\s*/i,'')
    .replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim()
  const labelKind=(line:string):TononkiraStructureBlock['kind']|null=>{
    // Tononkira utilise aussi Ref/Fiv collé au premier vers : "Ref: ...", "Fiv - ...".
    // Ces marqueurs ouvrent toujours un nouveau bloc, même s'ils ne sont pas seuls sur la ligne.
    if(/^\[?\s*(?:ref|fiv)(?=\s|\d|[:.\-–—\]])/i.test(line)||/^\[?\s*(refrain|chorus|pré[- ]?refrain|pre[- ]?chorus)\b/i.test(line))return 'refrain'
    if(/^\[?\s*(couplet|verse)\b/i.test(line))return 'verse'
    if(/^\[?\s*(pont|bridge|intro|outro|interlude|prélude|prelude|postlude)\b/i.test(line))return 'other'
    return null
  }
  const lines=normalized.split('\n')
  const blocks:string[]=[]
  let current:string[]=[]
  const flush=()=>{const text=current.map(x=>x.trim()).filter(Boolean).join('\n').trim();if(text)blocks.push(text);current=[]}
  for(const raw of lines){
    const line=raw.trim()
    if(!line){flush();continue}
    if(labelKind(line)&&current.length)flush()
    current.push(line)
  }
  flush()

  // Garde-fou musical : une chanson Tononkira normale contient quelques sections,
  // pas une section par ligne. Si l'extraction produit trop de blocs, on considère
  // que les blancs/indentations ont été sur-interprétés et on reconstruit 1 à 8 blocs.
  const allLines=normalized.split('\n').map(x=>x.trim()).filter(Boolean)
  const explicitSectionCount=allLines.filter(x=>Boolean(labelKind(x))).length
  const tinyBlocks=blocks.filter(b=>b.split('\n').filter(Boolean).length<=1).length
  const averageLines=allLines.length/Math.max(1,blocks.length)
  // Il n'existe volontairement aucun plafond fixe de 8 sections : 4 est seulement une
  // tendance. On reconstruit uniquement quand la segmentation est manifestement cassée
  // (beaucoup de blocs d'une seule ligne / moyenne quasi égale à un vers par bloc).
  const suspicious=blocks.length>=10&&explicitSectionCount<Math.ceil(blocks.length*.35)&&(averageLines<1.8||tinyBlocks/blocks.length>.55)
  if(suspicious){
    const rebuilt:string[]=[]
    let chunk:string[]=[]
    const flushChunk=()=>{if(!chunk.length)return;const preferred=chunk.length>=36?5:chunk.length>=20?4:3;for(let i=0;i<chunk.length;i+=preferred)rebuilt.push(chunk.slice(i,i+preferred).join('\n'));chunk=[]}
    for(const line of allLines){
      if(labelKind(line)){flushChunk();chunk=[line]}
      else chunk.push(line)
    }
    flushChunk()
    blocks.splice(0,blocks.length,...rebuilt.filter(Boolean))
  }

  // Si tous les séparateurs ont disparu, reconstituer selon la cadence des lignes sans
  // imposer un nombre de blocs : une chanson longue peut naturellement dépasser 8 sections.
  if(blocks.length===1){
    const clean=blocks[0].split('\n').filter(Boolean)
    if(!clean.some(x=>labelKind(x))&&clean.length>=8){
      const preferredLinesPerBlock=clean.length>=36?5:clean.length>=20?4:3
      const size=Math.max(2,preferredLinesPerBlock)
      blocks.splice(0,1,...Array.from({length:Math.ceil(clean.length/size)},(_,i)=>clean.slice(i*size,i*size+size).join('\n')).filter(Boolean))
    }
  }

  // Les marqueurs de répétition (x2, X3, ×2, bis, etc.) appartiennent à ce qui
  // précède : ils ne doivent jamais créer artificiellement le début d'une nouvelle section.
  const repeatMarker=/^(?:[x×]\s*\d+|\d+\s*[x×]|bis|ter)(?:\s*[.!:;-]*)$/i
  for(let i=1;i<blocks.length;i++){
    const first=blocks[i].split('\n')[0]?.trim()||''
    if(!repeatMarker.test(first))continue
    const rest=blocks[i].split('\n').slice(1).join('\n').trim()
    blocks[i-1]=(blocks[i-1]+'\n'+first).trim()
    if(rest)blocks[i]=rest
    else{blocks.splice(i,1);i--}
  }

  // Détection de refrain tolérante : les blocs peuvent différer par ponctuation ou par leur étiquette.
  const similarity=(a:string,b:string)=>{
    const aa=canonical(a).split(' ').filter(Boolean),bb=canonical(b).split(' ').filter(Boolean)
    if(!aa.length||!bb.length)return 0
    const sa=new Set(aa),sb=new Set(bb)
    let common=0;sa.forEach(x=>{if(sb.has(x))common++})
    return common/Math.max(sa.size,sb.size)
  }
  const repeated=new Set<number>()
  for(let i=0;i<blocks.length;i++)for(let j=i+1;j<blocks.length;j++)if(similarity(blocks[i],blocks[j])>=.88){repeated.add(i);repeated.add(j)}

  let verseNo=0
  return blocks.map((text,index)=>{
    const first=text.split('\n')[0]?.trim()||''
    const explicitKind=labelKind(first)
    const kind:TononkiraStructureBlock['kind']=explicitKind||(repeated.has(index)?'refrain':'verse')
    if(kind==='verse')verseNo++
    const label=kind==='refrain'?'Refrain':kind==='verse'?'Couplet '+verseNo:'Section '+(index+1)
    const lineCount=text.split('\n').filter(Boolean).length
    const confidence:TononkiraStructureBlock['confidence']=explicitKind||repeated.has(index)?'forte':blocks.length>1&&lineCount>=2&&lineCount<=8?'probable':'à vérifier'
    return {id:'tk-'+index,label,text,kind,confidence}
  })
}
function tononkiraBlocksToLyrics(blocks:TononkiraStructureBlock[]):string{
  return blocks.map(b=>b.text.split('\n').map(line=>line.trim()).filter(Boolean).join('\n')).filter(Boolean).join('\n\n').trim()
}

function reviewDraftFromExternal(full:{title?:string;artist?:string;sourceUrl?:string;source?:string;structure?:string;chords?:string;lyrics?:string;originalKey?:string;bpm?:number|null},fallback:{title:string;artist:string;url:string}):SongDraft{
  const draft=emptySongDraft()
  draft.title=full.title||fallback.title
  draft.artist=full.artist||fallback.artist
  draft.structure=full.structure||''
  draft.originalKey=normalizeKey(full.originalKey||'')
  draft.bpm=full.bpm??null
  draft.chords=full.chords||''
  draft.lyrics=normalizeImportedLyrics(full.lyrics||'')
  draft.referenceUrl=full.sourceUrl||fallback.url
  draft.notes='Source recueil : '+(full.source||'Externe')
  draft.source='import'
  return draft
}

function RecueilsPage({songs,entryMode,prefill,onImport,onComplete,onViewImported,onEditImported,toast}:{songs:Song[];entryMode:'tononkira'|null;prefill:{title?:string;artist?:string}|null;onImport:(draft:SongDraft)=>Promise<Song>;onComplete:(id:string,patch:Partial<SongDraft>)=>Promise<void>;onViewImported:(song:Song)=>void;onEditImported:(song:Song)=>void;toast:(s:string)=>void}) {
  const [preview,setPreview]=useState<SongDraft|null>(null)
  const [fileName,setFileName]=useState('')
  const [tononkiraTitle,setTononkiraTitle]=useState('')
  const [tononkiraArtist,setTononkiraArtist]=useState('')
  const [tononkiraResults,setTononkiraResults]=useState<TononkiraSearchResult[]>([])
  const [tononkiraSearching,setTononkiraSearching]=useState(false)
  const [tononkiraSearched,setTononkiraSearched]=useState(false)
  const [tononkiraImporting,setTononkiraImporting]=useState('')
  const [review,setReview]=useState<{existing:Song;incoming:SongDraft;source:string}|null>(null)
  const [tononkiraStructure,setTononkiraStructure]=useState<{draft:SongDraft;blocks:TononkiraStructureBlock[];removedNoise:RemovedTononkiraNoise[]}|null>(null)
  const [tononkiraVerifying,setTononkiraVerifying]=useState(false)
  const [tononkiraIdentityConflict,setTononkiraIdentityConflict]=useState<{existing:Song;draft:SongDraft}|null>(null)
  const [importedSong,setImportedSong]=useState<Song|null>(null)
  const [fullscreenImportedSong,setFullscreenImportedSong]=useState<Song|null>(null)
  const fileRef=useRef<HTMLInputElement>(null)
  const tononkiraTitleRef=useRef<HTMLInputElement>(null)
  const tononkiraArtistRef=useRef<HTMLInputElement>(null)
  useEffect(()=>{if(entryMode!=='tononkira')return;setTononkiraTitle(prefill?.title??'');setTononkiraArtist(prefill?.artist??'');setTononkiraResults([]);setTononkiraSearched(false);requestAnimationFrame(()=>{if(prefill?.artist&&!prefill?.title)tononkiraArtistRef.current?.focus();else tononkiraTitleRef.current?.focus()})},[entryMode,prefill?.title,prefill?.artist])
  const duplicate=preview?findMatchingSong(songs,preview.title,preview.artist):null
  const songKey=(title:string,artist:string)=>duplicateKey(title,artist)
  const existingKeys=useMemo(()=>new Set(songs.map(s=>songKey(s.title,s.artist))),[songs])

  const readChordPro=async(file:File)=>{
    try{
      const text=await file.text()
      const parsed=parseChordPro(text)
      if(parsed.title==='Morceau ChordPro') parsed.title=file.name.replace(/\.(pro|chopro|cho|crd|txt)$/i,'')
      setPreview(parsed);setFileName(file.name)
    }catch{toast('Impossible de lire ce fichier ChordPro.')}
  }

  const runTononkiraSearch=async()=>{
    if(tononkiraTitle.trim().length<2){toast('Saisissez au moins deux caractères dans le titre.');return}
    setTononkiraSearching(true);setTononkiraSearched(true)
    try{
      const results=await searchTononkira(tononkiraTitle,tononkiraArtist)
      setTononkiraResults([...results].sort((a,b)=>(b.score??0)-(a.score??0)||a.title.localeCompare(b.title)))
      if(!results.length)toast('Aucun morceau correspondant trouvé sur Tononkira.')
    }catch(e){
      const msg=e instanceof Error?e.message:'Recherche impossible.'
      if(/401|jwt|unauthorized/i.test(msg))toast('Connectez-vous au Cloud DI’ART pour utiliser la recherche Tononkira.')
      else toast('Recherche Tononkira indisponible pour le moment.')
    }finally{setTononkiraSearching(false)}
  }

  const importTononkiraResult=async(item:TononkiraSearchResult)=>{
    setTononkiraImporting(item.url)
    try{
      const full=await fetchTononkiraReference(item.url)
      const draft=emptySongDraft()
      draft.title=full.title||item.title||'Morceau Tononkira'
      draft.artist=full.artist||item.artist||''
      const normalizedLyrics=normalizeImportedLyrics(full.lyrics)
      const cleanedLyrics=cleanTononkiraNoiseWords(normalizedLyrics)
      draft.lyrics=cleanedLyrics.lyrics
      draft.referenceUrl=full.sourceUrl
      draft.notes='Source des paroles : Tononkira Malagasy'
      draft.source='import'
      const blocks=detectTononkiraStructure(draft.lyrics||'')
      setTononkiraVerifying(false)
      setTononkiraStructure({draft,blocks,removedNoise:cleanedLyrics.removed})
    }catch{toast('Import Tononkira impossible pour ce morceau.')}
    finally{setTononkiraImporting('')}
  }

  const restoreTononkiraNoise=(index:number)=>{
    setTononkiraStructure(current=>{
      if(!current)return current
      const item=current.removedNoise[index]
      if(!item)return current
      const lines=tononkiraBlocksToLyrics(current.blocks).split('\n')
      const target=Math.max(0,Math.min(lines.length-1,item.line-1))
      lines[target]=((lines[target]||'')+' '+item.word).trim()
      const lyrics=normalizeImportedLyrics(lines.join('\n'))
      return {...current,draft:{...current.draft,lyrics},blocks:detectTononkiraStructure(lyrics),removedNoise:current.removedNoise.filter((_,i)=>i!==index)}
    })
  }
  const restoreAllTononkiraNoise=()=>{
    setTononkiraStructure(current=>{
      if(!current||!current.removedNoise.length)return current
      const lines=tononkiraBlocksToLyrics(current.blocks).split('\n')
      current.removedNoise.forEach(item=>{const target=Math.max(0,Math.min(lines.length-1,item.line-1));lines[target]=((lines[target]||'')+' '+item.word).trim()})
      const lyrics=normalizeImportedLyrics(lines.join('\n'))
      return {...current,draft:{...current.draft,lyrics},blocks:detectTononkiraStructure(lyrics),removedNoise:[]}
    })
  }

  const saveTononkiraStructure=async()=>{
    if(!tononkiraStructure)return
    const draft={...tononkiraStructure.draft,lyrics:tononkiraBlocksToLyrics(tononkiraStructure.blocks)}
    const searchedTitle=(prefill?.title||tononkiraTitle).trim()
    const searchedArtist=(prefill?.artist||tononkiraArtist).trim()
    const searchedExisting=findMatchingSong(songs,searchedTitle,searchedArtist)
    const importedExisting=findMatchingSong(songs,draft.title,draft.artist)
    const identityDiff=Boolean(searchedExisting&&(normalizeIdentity(draft.title)!==normalizeIdentity(searchedExisting.title)||(draft.artist&&normalizeIdentity(draft.artist)!==normalizeIdentity(searchedExisting.artist))))
    setTononkiraStructure(null)
    setTononkiraVerifying(false)
    if(identityDiff&&searchedExisting){setTononkiraIdentityConflict({existing:searchedExisting,draft});return}
    if(importedExisting){
      const sameTitle=normalizeIdentity(importedExisting.title)===normalizeIdentity(draft.title)
      const sameArtist=!draft.artist||!importedExisting.artist||normalizeIdentity(importedExisting.artist)===normalizeIdentity(draft.artist)
      if(sameTitle&&sameArtist){
        const patch:Partial<SongDraft>={lyrics:draft.lyrics,referenceUrl:draft.referenceUrl,source:'import'}
        await onComplete(importedExisting.id,patch)
        const updated={...importedExisting,...patch,updatedAt:new Date().toISOString()}
        toast(draft.title+' mis à jour depuis Tononkira.')
        setImportedSong(updated)
        return
      }
      setReview({existing:importedExisting,incoming:draft,source:'Tononkira'});return
    }
    const song=await onImport(draft)
    toast(draft.title+' importé depuis Tononkira.')
    setImportedSong(song)
  }
  const mergeTononkiraIdentity=()=>{
    if(!tononkiraIdentityConflict)return
    const {existing,draft}=tononkiraIdentityConflict
    setTononkiraIdentityConflict(null)
    setReview({existing,incoming:draft,source:'Tononkira'})
  }
  const createTononkiraSeparately=async()=>{
    if(!tononkiraIdentityConflict)return
    const draft=tononkiraIdentityConflict.draft
    setTononkiraIdentityConflict(null)
    const song=await onImport(draft)
    toast(draft.title+' créé comme nouveau morceau.')
    setImportedSong(song)
  }
  const startNewTononkiraImport=()=>{
    setImportedSong(null)
    setTononkiraTitle('')
    setTononkiraArtist('')
    setTononkiraResults([])
    setTononkiraSearched(false)
    requestAnimationFrame(()=>tononkiraTitleRef.current?.focus())
  }

  return <><section className="panel tononkira-feature-card tononkira-search-card"><div className="tononkira-feature-mark">MG</div><div className="tononkira-feature-copy"><p className="eyebrow">Import direct Madagascar</p><h2>Tononkira Malagasy</h2><p>Recherche titre/artiste puis import automatique du titre, de l’artiste et des paroles.</p></div><div className="tononkira-search-fields"><label>Titre<div className="field-clear-wrap"><input ref={tononkiraTitleRef} value={tononkiraTitle} onChange={e=>setTononkiraTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void runTononkiraSearch()}} placeholder="Ex. Mama sera"/>{tononkiraTitle&&<button type="button" className="search-clear" aria-label="Effacer le titre" onClick={()=>{setTononkiraTitle('');setTononkiraResults([]);setTononkiraSearched(false)}}><X/></button>}</div></label><label>Artiste <small>optionnel</small><div className="field-clear-wrap"><input ref={tononkiraArtistRef} value={tononkiraArtist} onChange={e=>setTononkiraArtist(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void runTononkiraSearch()}} placeholder="Ex. Mahaleo"/>{tononkiraArtist&&<button type="button" className="search-clear" aria-label="Effacer l’artiste" onClick={()=>setTononkiraArtist('')}><X/></button>}</div></label><button className="primary tononkira-search-button recueil-search-icon" aria-label="Rechercher sur Tononkira" title={tononkiraSearching?'Recherche…':'Rechercher sur Tononkira'} disabled={tononkiraSearching||tononkiraTitle.trim().length<2} onClick={()=>void runTononkiraSearch()}><Search/></button></div>{tononkiraSearching?<div className="recueil-search-loading"><RefreshCw/><span>Recherche sur Tononkira…</span></div>:tononkiraSearched&&<div className="tononkira-search-results recueil-results-scroll"><div className="tononkira-results-head"><b>{tononkiraResults.length} résultat{tononkiraResults.length>1?'s':''}</b><small>Importer récupère automatiquement les paroles.</small></div>{tononkiraResults.length?tononkiraResults.map(item=>{const exists=existingKeys.has(songKey(item.title,item.artist));const busy=tononkiraImporting===item.url;return <article className={'tononkira-search-result recueil-result-row '+(exists?'exists':'')} key={item.url}><div className="recueil-result-main"><b>{item.title}</b><span>{item.artist||'Artiste non renseigné'}</span>{typeof item.score==='number'&&<small>Pertinence {item.score}%</small>}</div><div className="tononkira-result-actions recueil-result-actions"><a className="bare-action" href={item.url} target="_blank" rel="noreferrer" title="Voir sur Tononkira"><ExternalLink/></a>{exists?<button className="secondary review-import-btn" disabled={Boolean(tononkiraImporting)} onClick={()=>void importTononkiraResult(item)}><RotateCcw/>{busy?'Analyse…':'Revoir'}</button>:<button className="primary" disabled={Boolean(tononkiraImporting)} onClick={()=>void importTononkiraResult(item)}><Import/>{busy?'Import…':'Importer'}</button>}</div></article>}):<div className="catalog-empty">Aucun résultat.</div>}</div>}</section>

  <ExternalRecueilSearch prefill={prefill} source="ultimate-guitar" badge="UG" name="Ultimate Guitar" description="Recherchez les grilles publiques. DI’ART tente maintenant d’importer simultanément structure, accords et paroles disponibles sur la page." songs={songs} onImport={onImport} onComplete={onComplete} onImported={setImportedSong} toast={toast}/>
  <ExternalRecueilSearch prefill={prefill} source="chordify" badge="CH" name="Chordify" description="Recherchez les chansons Chordify directement dans DI’ART et récupérez les métadonnées ainsi que les accords détectables." songs={songs} onImport={onImport} onComplete={onComplete} onImported={setImportedSong} toast={toast}/>
  <ExternalRecueilSearch prefill={prefill} source="acoustic-gasy" badge="AG" name="Acoustic Gasy" description="Recherchez par titre sur Acoustic Gasy, puis diagnostiquez et importez les accords, paroles, tonalité et BPM disponibles." songs={songs} onImport={onImport} onComplete={onComplete} onImported={setImportedSong} toast={toast}/>

  <section className="panel recueil-source-card chordpro-direct-card"><div className="recueil-source-head"><span className="recueil-badge">CP</span><div><h2>ChordPro</h2><p>Import direct d’un fichier .pro, .chopro, .cho, .crd ou .txt avec paroles et accords.</p></div></div><div className="recueil-source-actions"><button className="primary recueil-action" onClick={()=>fileRef.current?.click()}><FileUp/>Importer ChordPro</button></div></section>
  <input ref={fileRef} hidden type="file" accept=".pro,.chopro,.cho,.crd,.txt,text/plain" onChange={e=>{const f=e.target.files?.[0];if(f)void readChordPro(f);e.currentTarget.value=''}}/>

  {tononkiraStructure&&<Modal className="tononkira-ready-modal" title="Paroles traitées" onClose={()=>{setTononkiraStructure(null);setTononkiraVerifying(false)}}><div className="tononkira-ready-summary"><Check/><div><b>{tononkiraStructure.draft.title}</b><small>{tononkiraStructure.draft.artist||'Artiste non renseigné'} · {tononkiraStructure.blocks.length} bloc{tononkiraStructure.blocks.length>1?'s':''} détecté{tononkiraStructure.blocks.length>1?'s':''}</small></div></div>{tononkiraStructure.removedNoise.length>0&&<div className="tononkira-noise-review"><small>Parasites retirés automatiquement : {tononkiraStructure.removedNoise.map((item,index)=><button type="button" key={item.word+'-'+index} title="Restaurer ce mot" onClick={()=>restoreTononkiraNoise(index)}>{item.word}</button>)}</small><button type="button" className="bare-action" onClick={restoreAllTononkiraNoise}>Tout restaurer</button></div>}{tononkiraVerifying&&<div className="tononkira-verify-content"><p className="muted-copy">Vérification manuelle avant enregistrement. Vous pouvez corriger le type ou le texte d’un bloc si nécessaire.</p><div className="tononkira-structure-list">{tononkiraStructure.blocks.map((block,index)=><article className="tononkira-structure-block" key={block.id}><div className="tononkira-structure-block-head"><select value={block.kind} onChange={e=>setTononkiraStructure(current=>current?{...current,blocks:current.blocks.map((b,i)=>i===index?{...b,kind:e.target.value as TononkiraStructureBlock['kind'],label:e.target.value==='refrain'?'Refrain':e.target.value==='verse'?'Couplet '+(current.blocks.slice(0,index+1).filter(x=>x.kind==='verse').length||1):'Autre'}:b)}:current)}><option value="verse">Couplet</option><option value="refrain">Refrain</option><option value="other">Autre</option></select><small>{block.confidence}</small></div><textarea rows={Math.min(8,Math.max(3,block.text.split('\n').length))} value={block.text} onChange={e=>setTononkiraStructure(current=>current?{...current,blocks:current.blocks.map((b,i)=>i===index?{...b,text:e.target.value}:b)}:current)}/><div className="tononkira-structure-actions">{index>0&&<button type="button" className="bare-action" onClick={()=>setTononkiraStructure(current=>{if(!current)return current;const blocks=[...current.blocks];blocks[index-1]={...blocks[index-1],text:(blocks[index-1].text+'\n'+blocks[index].text).trim()};blocks.splice(index,1);return {...current,blocks}})}>Fusionner avec précédent</button>}</div></article>)}</div></div>}<div className="modal-actions tononkira-ready-actions"><button className="secondary" onClick={()=>{setTononkiraStructure(null);setTononkiraVerifying(false)}}>Annuler</button><button type="button" className={'icon-btn '+(tononkiraVerifying?'active':'')} aria-label="Vérifier les paroles" title="Vérifier les paroles" onClick={()=>setTononkiraVerifying(v=>!v)}><Eye/></button><button type="button" className="icon-btn primary" aria-label="Enregistrer" title="Enregistrer" onClick={()=>void saveTononkiraStructure()}><Save/></button></div></Modal>}
  {tononkiraIdentityConflict&&<Modal className="import-review-modal tononkira-identity-modal" title="Morceau similaire détecté" onClose={()=>setTononkiraIdentityConflict(null)}><div className="import-review-head"><AlertTriangle/><div><b>{tononkiraIdentityConflict.existing.title}</b><small>DI’ART trouve un morceau existant correspondant à votre recherche.</small></div></div><div className="identity-compare"><div><span>Dans DI’ART</span><b>{tononkiraIdentityConflict.existing.title}</b><small>{tononkiraIdentityConflict.existing.artist||'Artiste non renseigné'}</small></div><div><span>Tononkira</span><b>{tononkiraIdentityConflict.draft.title}</b><small>{tononkiraIdentityConflict.draft.artist||'Artiste non renseigné'}</small></div></div><p className="muted-copy">Le titre ou l’artiste diffère. Choisissez si les paroles doivent être fusionnées avec la fiche existante ou enregistrées comme un nouveau morceau.</p><div className="modal-actions"><button className="secondary" onClick={()=>void createTononkiraSeparately()}><Plus/>Créer séparément</button><button className="primary" onClick={()=>void mergeTononkiraIdentity()}><GitMerge/>Fusionner</button></div></Modal>}
  {review&&<MergeSongsModal a={review.existing} b={{...review.existing,...review.incoming,id:'import-'+Date.now(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),deletedAt:null} as Song} onClose={()=>setReview(null)} onKeepBoth={()=>{const draft=review.incoming;setReview(null);void onImport(draft).then(song=>{toast(draft.title+' créé séparément.');setImportedSong(song)})}} onMerge={async(primary,secondary,draft)=>{const merged=draft??mergeSongDraft(primary,secondary);await onComplete(review.existing.id,merged);const updated={...review.existing,...merged,updatedAt:new Date().toISOString()};setReview(null);toast('Fusion terminée.');setImportedSong(updated)}}/>}
  {importedSong&&<Modal className="post-import-modal" title="Morceau enregistré" onClose={()=>setImportedSong(null)}><div className="post-import-success"><Check/><div><b>{importedSong.title}</b><span>{importedSong.artist||'Artiste non renseigné'} est prêt dans DI’ART.</span></div></div><div className="post-import-actions icon-only"><button className="primary icon-btn" aria-label="Voir" title="Voir" onClick={()=>{const song=importedSong;setImportedSong(null);onViewImported(song)}}><BookOpen/></button><button className="secondary icon-btn" aria-label="Plein écran" title="Plein écran" onClick={()=>{setFullscreenImportedSong(importedSong);setImportedSong(null)}}><Maximize2/></button><button className="secondary icon-btn" aria-label="Modifier" title="Modifier" onClick={()=>{const song=importedSong;setImportedSong(null);onEditImported(song)}}><Pencil/></button><button className="secondary icon-btn" aria-label="Nouvel import" title="Nouvel import" onClick={startNewTononkiraImport}><Import/></button></div></Modal>}
  {preview&&<Modal className="chordpro-preview-modal" title="Aperçu ChordPro" onClose={()=>setPreview(null)}><div className="chordpro-preview-head"><FileUp/><div><b>{preview.title}</b><small>{preview.artist||'Artiste non renseigné'} · {fileName}</small></div></div><div className="chordpro-preview-metrics">{preview.originalKey&&<div><span>Tonalité</span><b>{preview.originalKey}</b></div>}{preview.bpm!==null&&<div><span>BPM</span><b>{preview.bpm}</b></div>}{preview.capo!==null&&preview.capo!==undefined&&<div><span>Capo</span><b>{preview.capo}</b></div>}<div><span>Paroles</span><b>{preview.lyrics?.split('\n').filter(Boolean).length??0} lignes</b></div><div><span>Accords</span><b>{preview.chords?.split('\n').filter(Boolean).length??0} lignes</b></div></div>{duplicate&&<div className="duplicate-warning"><AlertTriangle/><span>Ce morceau existe déjà. DI’ART va proposer uniquement les informations manquantes.</span></div>}<div className="chordpro-preview-body">{preview.lyrics&&<section><h3>Paroles</h3><pre>{preview.lyrics.slice(0,1800)}</pre></section>}{preview.chords&&<section><h3>Accords extraits</h3><pre>{preview.chords.slice(0,1200)}</pre></section>}</div><div className="modal-actions"><button className="secondary" onClick={()=>setPreview(null)}>Annuler</button>{duplicate?(()=>{const completion=songCompletion(duplicate,preview);return completion.labels.length?<button className="primary" onClick={()=>void onComplete(duplicate.id,completion.patch).then(()=>{const updated={...duplicate,...completion.patch,updatedAt:new Date().toISOString()};setPreview(null);setImportedSong(updated);toast('Morceau complété depuis ChordPro.')})}><RotateCcw/>Compléter : {completion.labels.join(', ')}</button>:<button className="primary" disabled><Check/>Rien à ajouter</button>})():<button className="primary" onClick={()=>void onImport(preview).then(song=>{setPreview(null);setImportedSong(song);toast('Morceau ChordPro ajouté à DI’ART.')})}><Plus/>Ajouter à DI’ART</button>}</div></Modal>}{fullscreenImportedSong&&<SetlistStage standalone mode="live" list={{id:'import-preview-'+fullscreenImportedSong.id,name:fullscreenImportedSong.title,songIds:[fullscreenImportedSong.id],notes:'',createdAt:fullscreenImportedSong.createdAt,updatedAt:fullscreenImportedSong.updatedAt,deletedAt:null}} songs={[fullscreenImportedSong]} refresh={async()=>{}} toast={toast} onClose={()=>setFullscreenImportedSong(null)} onOpenSong={()=>{const song=fullscreenImportedSong;setFullscreenImportedSong(null);if(song)onEditImported(song)}}/>}</>
}

function ExternalRecueilSearch({source,badge,name,description,prefill,songs,onImport,onComplete,onImported,toast}:{source:ExternalRecueilSource;badge:string;name:string;description:string;prefill?:{title?:string;artist?:string}|null;songs:Song[];onImport:(draft:SongDraft)=>Promise<Song>;onComplete:(id:string,patch:Partial<SongDraft>)=>Promise<void>;onImported:(song:Song)=>void;toast:(s:string)=>void}) {
  const [title,setTitle]=useState('')
  const [artist,setArtist]=useState('')
  const [results,setResults]=useState<ExternalRecueilResult[]>([])
  const [searched,setSearched]=useState(false)
  const [loading,setLoading]=useState(false)
  const [importing,setImporting]=useState('')
  const [review,setReview]=useState<{existing:Song;incoming:SongDraft}|null>(null)
  const [pendingImport,setPendingImport]=useState<SongDraft|null>(null)
  const [directUrl,setDirectUrl]=useState('')
  useEffect(()=>{if(!prefill)return;setTitle(prefill.title??'');setArtist(prefill.artist??'');setResults([]);setSearched(false)},[prefill?.title,prefill?.artist])
  const songKey=(t:string,a:string)=>t.trim().toLowerCase()+'::'+a.trim().toLowerCase()

  const run=async()=>{
    if(title.trim().length<2){toast('Saisissez au moins deux caractères dans le titre.');return}
    setLoading(true);setSearched(true)
    try{
      const found=await searchExternalRecueil(source,title,source==='acoustic-gasy'?'':artist)
      setResults(found)
      if(!found.length)toast('Aucun résultat trouvé sur '+name+'.')
    }catch{toast('Recherche '+name+' indisponible pour le moment.')}
    finally{setLoading(false)}
  }

  const add=async(item:ExternalRecueilResult)=>{
    setImporting(item.url)
    try{
      const full=await importExternalRecueil(source,item.url)
      const draft=reviewDraftFromExternal(full,item)
      const existingSong=findMatchingSong(songs,draft.title,draft.artist)
      if(existingSong){setReview({existing:existingSong,incoming:draft});return}
      setPendingImport(draft)
    }catch{toast('Import '+name+' impossible pour ce résultat.')}
    finally{setImporting('')}
  }
  const importDirect=async()=>{
    const url=directUrl.trim()
    if(!url)return
    if(source==='chordify'&&!/^https?:\/\/(?:[^/]+\.)?chordify\.net\//i.test(url)){toast('Collez un lien Chordify valide.');return}
    setImporting(url)
    try{
      const full=await importExternalRecueil(source,url)
      const fallback={title:full.title||title||'Morceau Chordify',artist:full.artist||artist||'',url}
      const draft=reviewDraftFromExternal(full,fallback)
      const existingSong=findMatchingSong(songs,draft.title,draft.artist)
      if(existingSong)setReview({existing:existingSong,incoming:draft})
      else setPendingImport(draft)
    }catch{toast('Import direct '+name+' impossible pour ce lien.')}
    finally{setImporting('')}
  }

  return <section className="panel external-recueil-card"><div className="external-recueil-head"><span className="recueil-badge">{badge}</span><div><p className="eyebrow">Recherche intégrée</p><h2>{name}</h2><p>{description}</p></div></div><div className="external-recueil-fields"><label>Titre<div className="field-clear-wrap"><input value={title} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void run()}} placeholder="Titre du morceau"/>{title&&<button type="button" className="search-clear" aria-label="Effacer le titre" onClick={()=>{setTitle('');setResults([]);setSearched(false)}}><X/></button>}</div></label>{source!=='acoustic-gasy'&&<label>Artiste <small>optionnel</small><div className="field-clear-wrap"><input value={artist} onChange={e=>setArtist(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void run()}} placeholder="Nom de l’artiste"/>{artist&&<button type="button" className="search-clear" aria-label="Effacer l’artiste" onClick={()=>setArtist('')}><X/></button>}</div></label>}<button className="primary recueil-search-icon" aria-label={'Rechercher sur '+name} title={loading?'Recherche…':'Rechercher sur '+name} disabled={loading||title.trim().length<2} onClick={()=>void run()}><Search/></button></div>{source==='chordify'&&<div className="chordify-direct-import"><div><ExternalLink/><span><b>Import direct par lien</b><small>Collez l’URL d’une page morceau Chordify si la recherche intégrée ne retourne rien.</small></span></div><div className="chordify-direct-row"><input value={directUrl} onChange={e=>setDirectUrl(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void importDirect()}} placeholder="https://chordify.net/chords/…"/><button className="secondary" disabled={!directUrl.trim()||Boolean(importing)} onClick={()=>void importDirect()}><Import/>{importing===directUrl.trim()?'Analyse…':'Importer le lien'}</button></div></div>}{loading?<div className="recueil-search-loading"><RefreshCw/><span>Recherche en cours…</span></div>:searched&&<div className="external-recueil-results recueil-results-scroll">{results.length?results.map(item=>{const exists=Boolean(findMatchingSong(songs,item.title,item.artist));const busy=importing===item.url;return <article className={'external-recueil-result recueil-result-row '+(exists?'exists':'')} key={item.url}><div className="recueil-result-main"><b>{item.title}</b><span>{item.artist||'Artiste non renseigné'}{item.subtitle?' · '+item.subtitle:''}</span></div><div className="external-recueil-actions recueil-result-actions"><a className="bare-action" href={item.url} target="_blank" rel="noreferrer" title="Voir la source"><ExternalLink/></a>{exists?<button className="secondary review-import-btn" disabled={Boolean(importing)} onClick={()=>void add(item)}><RotateCcw/>{busy?'Analyse…':'Revoir'}</button>:<button className="primary" disabled={Boolean(importing)} onClick={()=>void add(item)}><Import/>{busy?'Import…':'Importer'}</button>}</div></article>}):<div className="catalog-empty">Aucun résultat.</div>}</div>}{pendingImport&&<Modal className="import-confirm-modal" title={'Confirmer l’import '+name} onClose={()=>setPendingImport(null)}><div className="import-review-head"><Import/><div><b>{pendingImport.title}</b><small>{pendingImport.artist||'Artiste non renseigné'}</small></div></div><div className="import-field-preview">{draftSummary(pendingImport).map(row=><div key={row.label}><span>{row.label}</span><b>{row.value}</b></div>)}</div><div className="modal-actions"><button className="secondary" onClick={()=>setPendingImport(null)}>Annuler</button><button className="primary" onClick={()=>void onImport(pendingImport).then(song=>{toast(pendingImport.title+' importé depuis '+name+'.');setPendingImport(null);onImported(song)})}><Import/>Confirmer l’import</button></div></Modal>}{review&&<Modal className="import-review-modal" title={'Revoir depuis '+name} onClose={()=>setReview(null)}>{(()=>{const completion=songCompletion(review.existing,review.incoming);return <><div className="import-review-head"><RotateCcw/><div><b>{review.existing.title}</b><small>{review.existing.artist||'Artiste non renseigné'}</small></div></div>{completion.labels.length?<><div className="import-review-suggestion"><b>À compléter :</b><div>{completion.labels.map(label=><span key={label}><Plus/>{label}</span>)}</div></div><div className="import-field-preview">{patchSummary(completion.patch).map(row=><div key={row.label}><span>{row.label}</span><b>{row.value}</b></div>)}</div><div className="modal-actions"><button className="secondary" onClick={()=>setReview(null)}>Annuler</button><button className="primary" onClick={()=>void onComplete(review.existing.id,completion.patch).then(()=>{const updated={...review.existing,...completion.patch,updatedAt:new Date().toISOString()};toast('Morceau complété depuis '+name+'.');setReview(null);onImported(updated)})}><Save/>Compléter les manquants</button></div></>:<><div className="import-nothing"><Check/><div><b>Rien à ajouter</b><span>Les informations utiles de cette source sont déjà présentes.</span></div></div><div className="modal-actions"><button className="primary" onClick={()=>setReview(null)}>Fermer</button></div></>}</>})()}</Modal>}</section>
}

function ImportWizard({songs,refresh,toast,onRecord,onLibrary}:{songs:Song[];refresh:()=>Promise<void>;toast:(s:string)=>void;onRecord:(kind:ActivityKind,label:string,details:string,meta?:{songId?:string|null;songTitle?:string;source?:string})=>Promise<void>;onLibrary:()=>void}) {
  const [step,setStep]=useState(1),[book,setBook]=useState<ParsedWorkbook|null>(null),[sheet,setSheet]=useState(''),[headers,setHeaders]=useState<string[]>([]),[mapping,setMapping]=useState<ImportMapping>({}),[preview,setPreview]=useState<ImportRowPreview[]>([]),[mode,setMode]=useState<'skip'|'create'|'fill'>('fill'),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[result,setResult]=useState<{added:number;updated:number;skipped:number;errors:number}|null>(null)
  const rows=book&&sheet?book.sheets[sheet]||[]:[]
  const choose=async(file:File)=>{try{setBusy(true);const p=await parseWorkbook(file);setBook(p);setSheet(p.sheetNames[0]||'');setStep(2);setErr('')}catch(e){setErr(e instanceof Error?e.message:'Lecture impossible')}finally{setBusy(false)}}
  const analyse=()=>{if(!rows.length){setErr('Cette feuille ne contient aucune ligne.');return}const h=Object.keys(rows[0]);setHeaders(h);setMapping(suggestMapping(h));setStep(3);setErr('')}
  const makePreview=()=>{if(!Object.values(mapping).includes('title')){setErr('Associez une colonne au champ Titre.');return}setPreview(rowsToPreview(rows,mapping,songs));setStep(4);setErr('')}
  const run=async()=>{setBusy(true);let added=0,updated=0,skipped=0,errors=0;for(const row of preview){if(!row.valid){errors++;continue}try{if(row.duplicateId&&mode==='skip'){skipped++;continue}if(row.duplicateId&&mode==='fill'){const old=songs.find(s=>s.id===row.duplicateId);if(old){const completion=songCompletion(old,row.draft);if(Object.keys(completion.patch).length){await updateSong(row.duplicateId,completion.patch);updated++}else skipped++;continue}}await createSong(row.draft);added++}catch{errors++}}await refresh();setResult({added,updated,skipped,errors});await onRecord('import','Import Excel / CSV',`${added} ajouté(s), ${updated} complété(s), ${skipped} sans changement, ${errors} erreur(s)`,{source:book?.fileName||'Excel/CSV'});setBusy(false);setStep(5);toast(`Import terminé : ${added} ajouté(s).`)}
  return <><div className="steps">{['Fichier','Feuille','Correspondance','Aperçu','Résultat'].map((x,i)=><div key={x} className={step>=i+1?'active':''}><span>{i+1}</span>{x}</div>)}</div>{err&&<div className="alert"><AlertTriangle/>{err}</div>}
    {step===1&&<section className="panel import-drop"><Upload size={42}/><h2>Sélectionner un fichier</h2><p>.xlsx, .xls ou .csv. L’analyse reste dans votre navigateur.</p><label className="primary file-btn">{busy?'Lecture…':'Choisir un fichier'}<input type="file" accept=".xlsx,.xls,.csv" onChange={e=>e.target.files?.[0]&&void choose(e.target.files[0])}/></label></section>}
    {step===2&&book&&<section className="panel"><h2>{book.fileName}</h2><div className="sheet-list">{book.sheetNames.map(n=><button key={n} className={sheet===n?'selected':''} onClick={()=>setSheet(n)}><FileSpreadsheet/><span><b>{n}</b><small>{book.sheets[n].length} lignes</small></span>{sheet===n&&<Check/>}</button>)}</div><div className="form-actions"><button className="secondary" onClick={()=>setStep(1)}>Retour</button><button className="primary" onClick={analyse}>Analyser<ChevronRight/></button></div></section>}
    {step===3&&<section className="panel"><h2>Correspondance des colonnes</h2><div className="mapping-grid">{headers.map(h=><div className="mapping-row" key={h}><div><b>{h}</b><small>{String(rows[0]?.[h]??'').slice(0,80)||'—'}</small></div><select value={mapping[h]||''} onChange={e=>setMapping({...mapping,[h]:e.target.value as ImportField|''})}><option value="">Ignorer</option>{fieldOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>)}</div><div className="form-actions"><button className="secondary" onClick={()=>setStep(2)}>Retour</button><button className="primary" onClick={makePreview}>Prévisualiser</button></div></section>}
    {step===4&&<section className="panel"><h2>Prévisualisation</h2><p>{preview.length} lignes · {preview.filter(x=>x.duplicateId).length} doublon(s) probable(s)</p><div className="radio-row"><label><input type="radio" checked={mode==='fill'} onChange={()=>setMode('fill')}/> Revoir / compléter les champs manquants</label><label><input type="radio" checked={mode==='create'} onChange={()=>setMode('create')}/> Créer quand même</label><label><input type="radio" checked={mode==='skip'} onChange={()=>setMode('skip')}/> Ignorer volontairement</label></div><div className="preview-table"><table><thead><tr><th>Titre</th><th>Artiste</th><th>Tonalité</th><th>BPM</th><th>État</th></tr></thead><tbody>{preview.slice(0,200).map(r=><tr key={r.sourceIndex}><td>{r.draft.title||'—'}</td><td>{r.draft.artist||'—'}</td><td>{r.draft.personalKey||r.draft.originalKey||'—'}</td><td>{r.draft.bpm??'—'}</td><td>{!r.valid?r.error:r.duplicateId?(()=>{const old=songs.find(s=>s.id===r.duplicateId);if(!old)return'Revoir';const completion=songCompletion(old,r.draft);return completion.labels.length?'Revoir · '+completion.labels.join(', '):'Rien à ajouter'})():'Prêt'}</td></tr>)}</tbody></table></div><div className="form-actions"><button className="secondary" onClick={()=>setStep(3)}>Retour</button><button className="primary" disabled={busy} onClick={()=>void run()}>{busy?'Importation…':'Importer'}<Import/></button></div></section>}
    {step===5&&result&&<section className="panel result-card"><Check size={44}/><h2>Import terminé</h2><div className="metrics"><Metric label="Ajoutés" value={result.added}/><Metric label="Mis à jour" value={result.updated}/><Metric label="Ignorés" value={result.skipped}/><Metric label="Erreurs" value={result.errors}/></div><div className="post-import-actions"><button className="primary" onClick={onLibrary}><Library/>Voir la bibliothèque</button><button className="secondary" onClick={()=>{setStep(1);setBook(null);setSheet('');setHeaders([]);setMapping({});setPreview([]);setResult(null);setErr('')}}><Import/>Nouvel import</button></div></section>}
  </>
}

function AboutPage({songs,setlists,cloudStats}:{songs:Song[];setlists:Setlist[];cloudStats:{songs:number;setlists:number}|null}) {
  const [historyCount,setHistoryCount]=useState(0)
  useEffect(()=>{void db.activity.count().then(setHistoryCount)},[])
  const artists=new Set(songs.map(s=>s.artist.trim()).filter(Boolean)).size
  const authors=new Set(songs.map(s=>s.authorComposer.trim()).filter(Boolean)).size
  const withLyrics=songs.filter(s=>Boolean(s.lyrics?.trim())).length
  const withChords=songs.filter(s=>hasMeaningfulChordContent(s.chords??'')).length
  const favorites=songs.filter(s=>s.favorite).length
  return <>
    <section className="panel about-hero"><div className="about-mark"><Music2/></div><div><span className="eyebrow">Version {APP_VERSION}</span><h2>Votre mémoire musicale, de la préparation à la scène.</h2><p>DI’ART centralise titres, artistes, auteurs, tonalités, BPM, signatures rythmiques, paroles, accords, structures, notes instrumentales, setlists et recueils. L’application est conçue pour fonctionner sur ordinateur, tablette et téléphone, avec une approche locale-first et une synchronisation cloud lorsque le compte DI’ART est connecté.</p></div></section>
    <div className="about-grid">
      <section className="panel"><h2>But</h2><p>Réduire le temps passé à chercher une information musicale et disposer d’un seul espace pour préparer un morceau, répéter, construire une setlist et jouer en Live.</p></section>
      <section className="panel"><h2>Usage</h2><p>Bibliothèque personnelle, aide-mémoire, préparation de répétition, consultation de paroles et accords, transposition, métronome, organisation de setlists et affichage plein écran sur scène.</p></section>
      <section className="panel"><h2>Créateur</h2><p><b>RAZAFINDRAKOTO Arijaona Zo Nampoina</b></p><p>Créateur de DI’ART, conçu et développé comme un outil musical personnel évolutif.</p></section>
      <section className="panel"><h2>Copyright</h2><p>© 2026 ARIZONA. Tous droits réservés pour l’application DI’ART et son identité. Les paroles, accords et contenus provenant de sources externes restent attribués à leurs auteurs, éditeurs et plateformes respectifs.</p></section>
    </div>
    <section className="panel about-stats"><div className="panel-title-row"><div><h2>Statistiques actuelles</h2><small>Calculées à partir des données présentes dans DI’ART au moment de l’ouverture.</small></div></div><div className="about-stat-grid"><Metric label="Morceaux" value={songs.length}/><Metric label="Artistes" value={artists}/><Metric label="Auteurs" value={authors}/><Metric label="Setlists" value={setlists.length}/><Metric label="Avec paroles" value={withLyrics}/><Metric label="Avec accords" value={withChords}/><Metric label="Favoris" value={favorites}/><Metric label="Historique" value={historyCount}/>{cloudStats&&<Metric label="Cloud" value={cloudStats.songs}/>}</div></section>
    <section className="panel about-version"><div><span>Version de l’application</span><b>{APP_VERSION}</b></div></section>
  </>
}


function levenshtein(a:string,b:string):number{
  const x=normalizeIdentity(a),y=normalizeIdentity(b)
  if(!x)return y.length;if(!y)return x.length
  const row=Array.from({length:y.length+1},(_,i)=>i)
  for(let i=1;i<=x.length;i++){
    let prev=row[0];row[0]=i
    for(let j=1;j<=y.length;j++){
      const old=row[j]
      row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(x[i-1]===y[j-1]?0:1))
      prev=old
    }
  }
  return row[y.length]
}
function duplicateScore(a:Song,b:Song):number{
  const at=normalizeIdentity(a.title),bt=normalizeIdentity(b.title),aa=normalizeIdentity(a.artist),ba=normalizeIdentity(b.artist)
  if(!at||!bt)return 0
  let score=0
  if(at===bt)score+=70
  else if(at.includes(bt)||bt.includes(at))score+=48
  else{
    const d=levenshtein(at,bt),max=Math.max(at.length,bt.length)
    if(max&&d/max<=.18)score+=42
    else if(max&&d/max<=.3)score+=26
  }
  if(aa&&ba){
    if(aa===ba)score+=30
    else if(aa.includes(ba)||ba.includes(aa))score+=18
    else if(levenshtein(aa,ba)<=2)score+=12
  }else score+=6
  return Math.min(100,score)
}

function ToolsPage({songs,onMerge}:{songs:Song[];onMerge:(primary:Song,secondary:Song,draft?:SongDraft)=>Promise<void>}) {
  const [pair,setPair]=useState<[Song,Song]|null>(null)
  const [threshold,setThreshold]=useState(66)
  const [keptPairs,setKeptPairs]=useState<Set<string>>(()=>{try{return new Set(JSON.parse(localStorage.getItem('diart-kept-duplicate-pairs')||'[]'))}catch{return new Set()}})
  const pairKey=(a:Song,b:Song)=>[a.id,b.id].sort().join('::')
  const candidates=useMemo(()=>{
    const out:{a:Song;b:Song;score:number}[]=[]
    for(let i=0;i<songs.length;i++)for(let j=i+1;j<songs.length;j++){
      const score=duplicateScore(songs[i],songs[j])
      if(score>=threshold&&!keptPairs.has(pairKey(songs[i],songs[j])))out.push({a:songs[i],b:songs[j],score})
    }
    return out.sort((x,y)=>y.score-x.score).slice(0,80)
  },[songs,threshold,keptPairs])
  return <>
    <section className="panel tools-intro"><div><GitMerge/><div><h2>Détection améliorée des doublons</h2><p>DI’ART compare les titres, variantes d’écriture et artistes, pas seulement les correspondances exactes.</p></div></div><label>Seuil <input type="range" min="50" max="90" value={threshold} onChange={e=>setThreshold(Number(e.target.value))}/><b>{threshold}%</b></label></section>
    <div className="duplicate-scan-list">{candidates.length?candidates.map(({a,b,score})=><article className="duplicate-scan-card duplicate-scan-card-rich" key={a.id+'-'+b.id}><span className="duplicate-score">{score}%</span><div><b>{a.title}</b><small>{a.artist||'Artiste inconnu'}</small></div><GitMerge/><div><b>{b.title}</b><small>{b.artist||'Artiste inconnu'}</small></div><div className="duplicate-card-insights">{duplicateInsights(a,b).slice(0,4).map(item=><span className={item.kind} key={item.label}>{item.label}: {item.detail}</span>)}</div><button className="secondary" onClick={()=>setPair([a,b])}>Comparer</button></article>):<Empty text="Aucun doublon probable avec ce seuil."/>}</div>
    {pair&&<MergeSongsModal a={pair[0]} b={pair[1]} onClose={()=>setPair(null)} onKeepBoth={()=>{const key=pairKey(pair[0],pair[1]);setKeptPairs(prev=>{const next=new Set(prev).add(key);try{localStorage.setItem('diart-kept-duplicate-pairs',JSON.stringify([...next]))}catch{};return next});setPair(null)}} onMerge={async(a,b,draft)=>{await onMerge(a,b,draft);setPair(null)}}/>}
  </>
}

function ShortcutsPage({value,onChange}:{value:Record<string,string>;onChange:(v:Record<string,string>)=>void}) {
  const rows=[['search','Recherche'],['newSong','Nouveau morceau'],['setlists','Setlists'],['favorites','Favoris']]
  return <section className="panel interaction-settings"><div className="interaction-intro"><Keyboard/><div><h2>Raccourcis clavier</h2><p>Personnalisez les touches utilisées sur PC. Une seule touche est recommandée.</p></div></div>{rows.map(([key,label])=><label key={key}><span><b>{label}</b><small>{key==='search'?'Place le curseur dans la recherche Bibliothèque':''}</small></span><input maxLength={1} value={value[key]??''} onChange={e=>onChange({...value,[key]:e.target.value.toLowerCase()})}/></label>)}<button className="secondary" onClick={()=>onChange(DEFAULT_SHORTCUTS)}><RotateCcw/>Valeurs par défaut</button></section>
}

function GesturesPage({value,onChange}:{value:typeof DEFAULT_GESTURES;onChange:(v:typeof DEFAULT_GESTURES)=>void}) {
  const toggle=(key:keyof typeof DEFAULT_GESTURES)=><button className={value[key]?'gesture-toggle active':'gesture-toggle'} onClick={()=>onChange({...value,[key]:!value[key]})}>{value[key]?<Check/>:<X/>}</button>
  return <section className="panel interaction-settings"><div className="interaction-intro"><Hand/><div><h2>Commandes tactiles</h2><p>Ces gestes s’appliquent principalement aux modes Live, Répétition et Plein écran.</p></div></div><div className="gesture-row"><span><b>Balayage horizontal</b><small>Gauche/droite pour morceau suivant/précédent</small></span>{toggle('swipeSongs')}</div><div className="gesture-row"><span><b>Double toucher / double clic</b><small>Play / Stop du défilement automatique</small></span>{toggle('doubleTapPlay')}</div><div className="gesture-row"><span><b>Appui long</b><small>Verrouiller ou déverrouiller le mode Live</small></span>{toggle('longPressLock')}</div><button className="secondary" onClick={()=>onChange(DEFAULT_GESTURES)}><RotateCcw/>Valeurs par défaut</button></section>
}

function HistoryPage({songs}:{songs:Song[]}) {
  const [items,setItems]=useState<ActivityEntry[]>([])
  const [q,setQ]=useState('')
  const [kind,setKind]=useState('')
  const [tab,setTab]=useState<'activity'|'play'|'stats'>('activity')
  useEffect(()=>{void listActivity(1200).then(setItems)},[])
  const labels:Record<ActivityKind,string>={create:'Création',update:'Modification',import:'Import',complete:'Complétion',delete:'Suppression',restore:'Restauration',merge:'Fusion',export:'Export',backup_restore:'Restauration sauvegarde',play:'Jeu'}
  const filtered=useMemo(()=>items.filter(item=>!kind||item.kind===kind).filter(item=>!q.trim()||normalizeIdentity([item.label,item.details,item.songTitle,item.source,item.setlistName].join(' ')).includes(normalizeIdentity(q))),[items,q,kind])
  const plays=useMemo(()=>items.filter(x=>x.kind==='play'),[items])
  const playDays=useMemo(()=>{
    const map=new Map<string,ActivityEntry[]>()
    plays.forEach(p=>{const d=new Date(p.createdAt).toLocaleDateString('fr-FR',{year:'numeric',month:'long',day:'numeric'});map.set(d,[...(map.get(d)||[]),p])})
    return [...map.entries()]
  },[plays])
  const avgBpm=useMemo(()=>{const vals=songs.map(s=>s.bpm).filter((x):x is number=>x!==null);return vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):0},[songs])
  const topKey=useMemo(()=>{const m=new Map<string,number>();songs.forEach(s=>{const k=s.originalKey;if(k)m.set(k,(m.get(k)||0)+1)});return [...m.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'—'},[songs])
  const topArtist=useMemo(()=>{const m=new Map<string,number>();songs.forEach(s=>{if(s.artist)m.set(s.artist,(m.get(s.artist)||0)+1)});return [...m.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'—'},[songs])
  const mostPlayed=useMemo(()=>{const m=new Map<string,number>();plays.forEach(p=>{if(p.songTitle)m.set(p.songTitle,(m.get(p.songTitle)||0)+1)});return [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8)},[plays])
  return <><div className="history-tabs"><button className={tab==='activity'?'active':''} onClick={()=>setTab('activity')}><History/>Activité</button><button className={tab==='play'?'active':''} onClick={()=>setTab('play')}><Play/>Historique de jeu</button><button className={tab==='stats'?'active':''} onClick={()=>setTab('stats')}><BarChart3/>Statistiques</button></div>
  {tab==='activity'&&<><div className="toolbar history-toolbar"><div className="searchbox"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Rechercher dans l’historique…"/>{q&&<button type="button" className="search-clear" onClick={()=>setQ('')}><X/></button>}</div><label className="select-wrap"><History/><select value={kind} onChange={e=>setKind(e.target.value)}><option value="">Toutes les actions</option>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div><section className="panel history-panel">{filtered.length?<div className="history-list">{filtered.map(item=><article className="history-row" key={item.id}><span className={'history-kind '+item.kind}>{labels[item.kind]}</span><div><b>{item.label}</b>{item.songTitle&&<small>{item.songTitle}</small>}<p>{item.details}</p></div><time>{new Date(item.createdAt).toLocaleString()}</time></article>)}</div>:<Empty text="Aucun événement dans l’historique."/>}</section></>}
  {tab==='play'&&<section className="play-history">{playDays.length?playDays.map(([day,dayItems])=><article className="panel play-day" key={day}><div className="play-day-head"><h3>{day}</h3><span>{dayItems.length} morceau{dayItems.length>1?'x':''}</span></div>{dayItems.map(x=><div className="play-row" key={x.id}><Play/><span><b>{x.songTitle||x.label}</b><small>{x.setlistName||x.details}</small></span><time>{new Date(x.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</time></div>)}</article>):<Empty text="Aucune session de jeu enregistrée."/>}</section>}
  {tab==='stats'&&<div className="personal-stats"><div className="stats-grid"><Metric label="Morceaux" value={songs.length}/><Metric label="BPM moyen" value={avgBpm||'—'}/><Metric label="Tonalité dominante" value={topKey}/><Metric label="Artiste principal" value={topArtist}/><Metric label="Sessions jouées" value={plays.length}/><Metric label="Favoris" value={songs.filter(s=>s.favorite).length}/></div><section className="panel"><h2>Morceaux les plus joués</h2>{mostPlayed.length?<div className="ranking-list">{mostPlayed.map(([title,count],i)=><div key={title}><span>{i+1}</span><b>{title}</b><strong>{count}×</strong></div>)}</div>:<p className="muted-copy">Les statistiques de jeu apparaîtront après vos premières sessions Live/Répétition.</p>}</section></div>}
  </>
}

function BackupPage({songs,refresh,toast,onRecord}:{songs:Song[];refresh:()=>Promise<void>;toast:(s:string)=>void;onRecord:(kind:ActivityKind,label:string,details:string,meta?:{songId?:string|null;songTitle?:string;source?:string})=>Promise<void>}) {
  const [file,setFile]=useState<File|null>(null)
  const restore=async()=>{if(!file)return;try{const r=await restoreJson(file);await refresh();await onRecord('backup_restore','Sauvegarde restaurée',`${r.songs} morceaux restaurés`,{source:file.name});toast(`Sauvegarde restaurée : ${r.songs} morceaux.`)}catch(e){toast(e instanceof Error?e.message:'Restauration impossible')}finally{setFile(null)}}
  return <><div className="backup-grid"><section className="panel"><Download/><h2>Sauvegarde JSON</h2><p>Format recommandé pour restaurer DI’ART.</p><button className="primary" onClick={()=>void exportJson().then(()=>onRecord('export','Export JSON',`${songs.length} morceaux exportés`,{source:'JSON'}))}>Télécharger</button></section><section className="panel"><FileSpreadsheet/><h2>Exports tableur</h2><p>{songs.length} morceaux actifs.</p><button className="secondary" onClick={()=>void exportXlsx().then(()=>onRecord('export','Export Excel',`${songs.length} morceaux exportés`,{source:'XLSX'}))}>Excel</button><button className="secondary" onClick={()=>void exportCsv().then(()=>onRecord('export','Export CSV',`${songs.length} morceaux exportés`,{source:'CSV'}))}>CSV</button></section><section className="panel"><RotateCcw/><h2>Restaurer</h2><label className="secondary file-btn">Choisir un JSON<input type="file" accept=".json" onChange={e=>e.target.files?.[0]&&setFile(e.target.files[0])}/></label></section></div>{file&&<Modal title="Restaurer cette sauvegarde ?" onClose={()=>setFile(null)}><p>La base locale actuelle sera remplacée.</p><div className="modal-actions"><button className="secondary" onClick={()=>setFile(null)}>Annuler</button><button className="danger" onClick={()=>void restore()}>Restaurer</button></div></Modal>}</>
}

function SettingsPage({theme,setTheme,songs,refresh,toast,userEmail,localCount,cloudStats,lastSyncAt,syncing,syncMode,syncIntervalMinutes,onSyncMode,onSyncInterval,onSync,onPull,onSignedIn}:{theme:string;setTheme:(t:'dark'|'light'|'system')=>void;songs:Song[];refresh:()=>Promise<void>;toast:(s:string)=>void;userEmail:string;localCount:number;cloudStats:{songs:number;setlists:number}|null;lastSyncAt:string;syncing:boolean;syncMode:SyncMode;syncIntervalMinutes:SyncInterval;onSyncMode:(mode:SyncMode)=>void;onSyncInterval:(minutes:SyncInterval)=>void;onSync:()=>void;onPull:()=>void;onSignedIn:()=>Promise<void>}) {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[authBusy,setAuthBusy]=useState(false)
  const [offlineReady,setOfflineReady]=useState(Boolean(navigator.serviceWorker?.controller))
  const [persistentStorage,setPersistentStorage]=useState(false)
  useEffect(()=>{void navigator.storage?.persisted?.().then(setPersistentStorage);if(navigator.serviceWorker)void navigator.serviceWorker.ready.then(()=>setOfflineReady(true))},[])
  const requestPersistence=async()=>{try{const ok=await navigator.storage?.persist?.();setPersistentStorage(Boolean(ok));toast(ok?'Stockage hors ligne rendu persistant.':'Le navigateur n’a pas accordé le stockage persistant.')}catch{toast('Stockage persistant indisponible sur cet appareil.')}}
  const demos=songs.filter(s=>s.source==='demo')
  const remove=async()=>{await db.songs.bulkDelete(demos.map(x=>x.id));await refresh();toast(`${demos.length} démo(s) supprimée(s).`)}
  const auth=async(mode:'login'|'signup')=>{try{setAuthBusy(true);const r=mode==='login'?await signIn(email,password):await signUp(email,password);if(r.error)throw r.error;toast(mode==='login'?'Connexion réussie.':'Compte créé. Vérifiez votre e-mail si une confirmation est demandée.');await onSignedIn()}catch(e){toast(e instanceof Error?e.message:'Authentification impossible.')}finally{setAuthBusy(false)}}
  const logout=async()=>{await signOut();toast('Déconnecté du cloud DI’ART.');location.reload()}
  return <>
  <section className="panel cloud-panel"><div className="cloud-heading"><Cloud/><div><h2>Cloud DI’ART</h2><p>{userEmail?`Connecté : ${userEmail}`:'Connectez le même compte sur PC, tablette et Android pour retrouver automatiquement votre bibliothèque.'}</p></div></div>{userEmail?<><div className="cloud-stats"><div><span>Sur cet appareil</span><b>{localCount}</b><small>morceaux</small></div><div><span>Dans le cloud</span><b>{cloudStats?.songs??'—'}</b><small>morceaux</small></div><div><span>Setlists cloud</span><b>{cloudStats?.setlists??'—'}</b><small>listes</small></div></div><div className="cloud-help"><b>Synchronisation multi-appareils active.</b><span> Vérifiez que cette adresse e-mail est exactement la même sur le PC, la tablette et Android.</span>{lastSyncAt&&<small>Dernière synchro réussie : {new Date(lastSyncAt).toLocaleString('fr-FR')}</small>}</div><div className="cloud-actions"><button className="primary" disabled={syncing} onClick={onPull}><Download/>{syncing?'Récupération…':'Récupérer depuis le cloud'}</button><button className="secondary" disabled={syncing} onClick={onSync}>{syncing?'Synchronisation…':'Synchroniser maintenant'}</button><button className="secondary" onClick={()=>void logout()}><LogOut/>Déconnexion</button></div></>:<div className="cloud-auth"><input type="email" autoComplete="username" placeholder="Adresse e-mail" value={email} onChange={e=>setEmail(e.target.value)}/><input type="password" autoComplete="current-password" placeholder="Mot de passe" value={password} onChange={e=>setPassword(e.target.value)}/><button className="primary" disabled={authBusy||!email||password.length<6} onClick={()=>void auth('login')}><LogIn/>Connexion</button><button className="secondary" disabled={authBusy||!email||password.length<6} onClick={()=>void auth('signup')}>Créer un compte</button></div>}</section>
  <section className="panel offline-panel"><div className="cloud-heading"><ShieldCheck/><div><h2>Mode hors ligne</h2><p>DI’ART conserve sa bibliothèque localement et met en cache l’application pour les répétitions sans réseau.</p></div></div><div className="offline-status-grid"><div><span>Application</span><b>{offlineReady?'Disponible hors ligne':'Préparation…'}</b></div><div><span>Stockage</span><b>{persistentStorage?'Persistant':'Standard'}</b></div><div><span>Connexion</span><b>{navigator.onLine?'En ligne':'Hors ligne'}</b></div></div><button className="secondary" disabled={persistentStorage} onClick={()=>void requestPersistence()}><ShieldCheck/>{persistentStorage?'Stockage protégé':'Protéger les données hors ligne'}</button></section>
  <section className="panel settings-list"><div><span><b>Thème</b><small>{theme==='system'?'Suit automatiquement le thème clair/sombre de cet appareil.':'Mode manuel : choisissez Système pour suivre automatiquement l’appareil.'}</small></span><select value={theme} onChange={e=>setTheme(e.target.value as 'dark'|'light'|'system')}><option value="system">Système · automatique</option><option value="dark">Sombre · manuel</option><option value="light">Clair · manuel</option></select></div><div><span><b>Mode de synchronisation</b><small>Automatique selon une fréquence définie, ou uniquement à votre demande.</small></span><select value={syncMode} onChange={e=>onSyncMode(e.target.value as SyncMode)}><option value="auto">Automatique</option><option value="manual">Manuel</option></select></div><div><span><b>Fréquence automatique</b><small>{syncMode==='auto'?`Toutes les ${syncIntervalMinutes} minutes`:'Inactive en mode manuel'}</small></span><select value={syncIntervalMinutes} disabled={syncMode!=='auto'} onChange={e=>onSyncInterval(Number(e.target.value) as SyncInterval)}>{([5,15,30,60] as SyncInterval[]).map(n=><option key={n} value={n}>{n} min</option>)}</select></div><div><span><b>Données de démonstration</b><small>{demos.length} morceau(x)</small></span><button className="danger" disabled={!demos.length} onClick={()=>void remove()}><Trash2/>Supprimer les démos</button></div><div><span><b>Synchronisation cloud</b><small>Bibliothèque et setlists synchronisées entre appareils connectés au même compte.</small></span><em>{userEmail?(syncMode==='auto'?`Auto · ${syncIntervalMinutes} min`:'Manuel'):'Connexion requise'}</em></div><div><span><b>DI’ART v{APP_VERSION}</b><small>Versioning des paroles, fusion intelligente, répétitions à résoudre, transitions, recherche naturelle et palette Ctrl+K.</small></span><em>Actif</em></div></section></>
}


function MetronomeCard({initialBpm=96,signature='4/4'}:{initialBpm?:number;signature?:string}) {
  const [bpm,setBpm]=useState(Math.max(30,Math.min(240,initialBpm||96)))
  const [running,setRunning]=useState(false)
  const [taps,setTaps]=useState<number[]>([])
  const [pulse,setPulse]=useState(false)
  const [beat,setBeat]=useState(1)
  const scheduler=useRef<number|null>(null)
  const audio=useRef<AudioContext|null>(null)
  const nextNoteTime=useRef(0)
  const beatIndex=useRef(0)
  const runningRef=useRef(false)
  const bpmRef=useRef(bpm)
  const beatsPerBar=Math.max(1,Math.min(12,Number.parseInt(signature?.split('/')[0]||'4',10)||4))

  useEffect(()=>{bpmRef.current=bpm},[bpm])
  const stopScheduler=()=>{if(scheduler.current!==null){window.clearInterval(scheduler.current);scheduler.current=null}}
  const scheduleClick=(time:number,index:number)=>{
    const ctx=audio.current
    if(!ctx)return
    const accent=index%beatsPerBar===0
    const osc=ctx.createOscillator(),gain=ctx.createGain()
    osc.type='square'
    osc.frequency.setValueAtTime(accent?1500:950,time)
    gain.gain.setValueAtTime(accent ? .19 : .12,time)
    gain.gain.exponentialRampToValueAtTime(.001,time+.05)
    osc.connect(gain);gain.connect(ctx.destination);osc.start(time);osc.stop(time+.055)
    const delay=Math.max(0,(time-ctx.currentTime)*1000)
    window.setTimeout(()=>{if(!runningRef.current)return;setBeat(index%beatsPerBar+1);setPulse(true);window.setTimeout(()=>setPulse(false),65)},delay)
  }
  const tick=()=>{
    const ctx=audio.current
    if(!ctx||!runningRef.current)return
    while(nextNoteTime.current<ctx.currentTime+.12){
      scheduleClick(nextNoteTime.current,beatIndex.current)
      nextNoteTime.current+=60/bpmRef.current
      beatIndex.current=(beatIndex.current+1)%beatsPerBar
    }
  }
  const start=async()=>{
    try{
      audio.current??=new AudioContext({latencyHint:'interactive'})
      if(audio.current.state==='suspended')await audio.current.resume()
      runningRef.current=true
      setRunning(true)
      beatIndex.current=0
      nextNoteTime.current=audio.current.currentTime+.04
      stopScheduler()
      tick()
      scheduler.current=window.setInterval(tick,25)
    }catch{runningRef.current=false;setRunning(false)}
  }
  const stop=()=>{runningRef.current=false;setRunning(false);stopScheduler();setBeat(1);setPulse(false)}
  useEffect(()=>()=>{runningRef.current=false;stopScheduler();void audio.current?.close()},[])
  const tap=()=>{
    const now=performance.now()
    const recent=taps.length&&now-taps[taps.length-1]>2200?[]:taps
    const next=[...recent,now].slice(-7)
    setTaps(next)
    if(next.length>1){
      const diffs=next.slice(1).map((t,i)=>t-next[i]).filter(v=>v>180&&v<2000)
      if(diffs.length){const avg=diffs.reduce((a,b)=>a+b,0)/diffs.length;setBpm(Math.max(30,Math.min(240,Math.round(60000/avg))))}
    }
  }
  return <section className="panel metronome-card"><div><span className="eyebrow">Outil musicien</span><h2>Métronome & Tap Tempo</h2><small className="metro-hint">Scheduler audio haute précision · mesure {beatsPerBar} temps</small></div><div className={`metro-display ${pulse?'pulse':''}`}><Gauge/><strong>{bpm}</strong><span>BPM · {beat}/{beatsPerBar}</span></div><div className="metro-controls"><button className="secondary" onClick={()=>setBpm(v=>Math.max(30,v-1))}><Minus/></button><input aria-label="BPM" type="range" min="30" max="240" value={bpm} onChange={e=>setBpm(Number(e.target.value))}/><button className="secondary" onClick={()=>setBpm(v=>Math.min(240,v+1))}><Plus/></button><button className="secondary tap-btn" onClick={tap}>TAP</button><button className={running?'danger':'primary'} onClick={()=>void (running?Promise.resolve(stop()):start())}>{running?<><Square/>Stop</>:<><Play/>Start</>}</button></div></section>
}

function SetlistsPage({songs,setlists,refresh,toast,onOpenDetail,onOpenSong}:{songs:Song[];setlists:Setlist[];refresh:()=>Promise<void>;toast:(s:string,action?:Toast['action'])=>void;onOpenDetail:(id:string)=>void;onOpenSong:(s:Song)=>void}) {
  const [name,setName]=useState('')
  const [open,setOpen]=useState<string|null>(null)
  const [editing,setEditing]=useState<string|null>(null)
  const [editName,setEditName]=useState('')
  const [deleting,setDeleting]=useState<Setlist|null>(null)
  const [stage,setStage]=useState<{list:Setlist;mode:'rehearsal'|'live'}|null>(null)
  const [sortBy,setSortBy]=useState<'updated'|'created'|'name'>('updated')
  const [sortDir,setSortDir]=useState<'asc'|'desc'>('desc')
  const sortedSetlists=useMemo(()=>[...setlists].sort((a,b)=>{const cmp=sortBy==='name'?a.name.localeCompare(b.name):sortBy==='created'?a.createdAt.localeCompare(b.createdAt):a.updatedAt.localeCompare(b.updatedAt);return sortDir==='asc'?cmp:-cmp}),[setlists,sortBy,sortDir])
  const rename=async(list:Setlist)=>{const next=editName.trim();if(!next){setEditing(null);return}await updateSetlist(list.id,{name:next});void refresh();setEditing(null);toast('Nom de la setlist mis à jour.')}
  const deleteList=async(list:Setlist)=>{const deletedAt=new Date().toISOString();await updateSetlist(list.id,{deletedAt});void refresh();setDeleting(null);toast(`Setlist « ${list.name} » supprimée.`,{label:'Annuler',run:async()=>{await updateSetlist(list.id,{deletedAt:null});void refresh()}})}
  const clickList=(list:Setlist)=>{if(open===list.id)onOpenDetail(list.id);else setOpen(list.id)}
  return <><div className="setlist-sortbar"><label><span>Trier par</span><select value={sortBy} onChange={e=>setSortBy(e.target.value as 'updated'|'created'|'name')}><option value="updated">Date de modification</option><option value="created">Date de création</option><option value="name">Nom</option></select></label><label><span>Ordre</span><select value={sortDir} onChange={e=>setSortDir(e.target.value as 'asc'|'desc')}><option value="asc">Croissant</option><option value="desc">Décroissant</option></select></label></div>
  <div className="setlist-grid modern-setlist-grid">{sortedSetlists.length?sortedSetlists.map(list=>{
    const preview=list.songIds.map(id=>songs.find(s=>s.id===id)).filter(Boolean) as Song[]
    const isOpen=open===list.id
    const previewTop=preview.slice(0,3)
    const previewMore=preview.slice(3)
    return <section className={`panel setlist-card modern-setlist-card ${isOpen?'open':''}`} key={list.id} style={{height:'auto',minHeight:0,alignSelf:'start'}}><div className="setlist-head">{editing===list.id?<div className="setlist-rename"><input autoFocus value={editName} onChange={e=>setEditName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void rename(list);if(e.key==='Escape')setEditing(null)}}/><button className="icon-btn" onClick={()=>void rename(list)}><Check/></button><button className="icon-btn" onClick={()=>setEditing(null)}><X/></button></div>:<div className="setlist-title-area"><button className="setlist-title-button" onClick={()=>clickList(list)}><span className="setlist-cover"><ListMusic/></span><div><b>{list.name}</b><small>{list.songIds.length} morceau{list.songIds.length>1?'x':''}</small></div></button><button className={`setlist-toggle-preview ${isOpen?'open':''}`} aria-label={isOpen?'Masquer l’aperçu':'Afficher l’aperçu'} title={isOpen?'Masquer l’aperçu':'Afficher l’aperçu'} onClick={e=>{e.stopPropagation();setOpen(isOpen?null:list.id)}}><ChevronRight/></button></div>}<div className="setlist-head-actions"><button className="bare-action" aria-label="Renommer" title="Renommer" onClick={()=>{setEditing(list.id);setEditName(list.name)}}><Pencil/></button><button className="bare-action danger-icon" aria-label="Supprimer la setlist" title="Supprimer" onClick={()=>setDeleting(list)}><Trash2/></button></div></div>{isOpen&&<div className="setlist-preview"><div className="setlist-preview-actions"><button className="secondary" disabled={!preview.length} onClick={()=>setStage({list,mode:'rehearsal'})}><Play/>Répétition</button><button className="primary" disabled={!preview.length} onClick={()=>setStage({list,mode:'live'})}><Maximize2/>Live</button></div><div className="setlist-preview-songs">{previewTop.length?previewTop.map((s,i)=><div key={s.id}><span>{i+1}</span><b className="song-title-with-mark">{s.title}<SongLyricsMark song={s} compact/></b><small>{setlistSongDisplayKey(list,s)}{!s.originalKey&&s.personalKey&&setlistSongDisplayKey(list,s)&&<sup className="habitual-key-mark" title="Tonalité habituelle · tonalité originale non renseignée">★</sup>}{setlistSongDisplayKey(list,s)&&s.bpm!==null?' · ':''}{s.bpm!==null?`${s.bpm} BPM`:''}</small></div>):<p>Aucun morceau pour le moment.</p>}</div>{previewMore.length>0&&<details className="setlist-preview-more"><summary><span>+ {previewMore.length} autre{previewMore.length>1?'s':''} morceau{previewMore.length>1?'x':''}</span><ChevronDown/></summary><div className="setlist-preview-songs setlist-preview-overflow">{previewMore.map((s,i)=><div key={s.id}><span>{i+4}</span><b className="song-title-with-mark">{s.title}<SongLyricsMark song={s} compact/></b><small>{setlistSongDisplayKey(list,s)}{!s.originalKey&&s.personalKey&&setlistSongDisplayKey(list,s)&&<sup className="habitual-key-mark" title="Tonalité habituelle · tonalité originale non renseignée">★</sup>}{setlistSongDisplayKey(list,s)&&s.bpm!==null?' · ':''}{s.bpm!==null?`${s.bpm} BPM`:''}</small></div>)}</div></details>}</div>}</section>
  }):<Empty text="Aucune setlist. Utilisez + pour créer votre première liste."/>}</div>
  {deleting&&<Modal title="Supprimer cette setlist ?" onClose={()=>setDeleting(null)}><p>« {deleting.name} » sera retirée de tous vos appareils synchronisés. Les morceaux ne seront pas supprimés.</p><div className="modal-actions"><button className="secondary" onClick={()=>setDeleting(null)}>Annuler</button><button className="danger" onClick={()=>void deleteList(deleting)}><Trash2/>Supprimer</button></div></Modal>}
  {stage&&<SetlistStage mode={stage.mode} list={stage.list} songs={stage.list.songIds.map(id=>songs.find(s=>s.id===id)).filter(Boolean) as Song[]} refresh={refresh} toast={toast} onClose={()=>setStage(null)} onOpenSong={onOpenSong}/>} 
  </>
}

function SetlistDetailPage({list,songs,refresh,toast,onBack,onOpenSong}:{list:Setlist;songs:Song[];refresh:()=>Promise<void>;toast:(s:string)=>void;onBack:()=>void;onOpenSong:(s:Song)=>void}) {
  const [stage,setStage]=useState<'rehearsal'|'live'|null>(null)
  const [addOpen,setAddOpen]=useState(false)
  const [addMode,setAddMode]=useState<'song'|'artist'>('song')
  const [addQuery,setAddQuery]=useState('')
  const [artistPick,setArtistPick]=useState('')
  const [orderIds,setOrderIds]=useState<string[]>(()=>[...list.songIds])
  const [draggingId,setDraggingId]=useState<string|null>(null)
  const [dragShiftId,setDragShiftId]=useState<string|null>(null)
  const [dragDirection,setDragDirection]=useState<'up'|'down'|null>(null)
  const [transitionPair,setTransitionPair]=useState<{from:Song;to:Song}|null>(null)
  const [transitionNotes,setTransitionNotes]=useState('')
  const [transitionBars,setTransitionBars]=useState('')
  const [transitionChords,setTransitionChords]=useState('')
  const holdTimer=useRef<number|null>(null)
  const dragIndex=useRef<number|null>(null)
  const dragPointer=useRef<number|null>(null)
  const orderRef=useRef<string[]>(orderIds)

  useEffect(()=>{orderRef.current=orderIds},[orderIds])
  useEffect(()=>{if(!draggingId)setOrderIds([...list.songIds])},[list.songIds,draggingId])

  const listSongs=useMemo(()=>orderIds.map(id=>songs.find(s=>s.id===id)).filter(Boolean) as Song[],[orderIds,songs])
  const available=useMemo(()=>songs.filter(s=>!orderIds.includes(s.id)),[songs,orderIds])
  const artistNames=useMemo(()=>[...new Set(available.map(s=>s.artist.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),[available])
  const songMatches=useMemo(()=>available.filter(s=>searchSong(s,addQuery)).slice(0,80),[available,addQuery])
  const artistMatches=useMemo(()=>artistNames.filter(a=>!addQuery.trim()||a.toLowerCase().includes(addQuery.toLowerCase())),[artistNames,addQuery])
  const artistSongs=useMemo(()=>artistPick?available.filter(s=>s.artist.trim()===artistPick):[],[available,artistPick])
  const totalSeconds=listSongs.reduce((n,s)=>n+(s.durationSeconds??0),0)
  const bpmSongs=listSongs.filter(s=>s.bpm!==null)
  const avgBpm=bpmSongs.length?Math.round(bpmSongs.reduce((n,s)=>n+(s.bpm??0),0)/bpmSongs.length):null
  const lyricsCount=listSongs.filter(s=>Boolean(s.lyrics)).length
  const configuredTransitions=useMemo(()=>listSongs.slice(0,-1).flatMap((from,i)=>{const to=listSongs[i+1];const transition=list.transitions?.[transitionKey(from.id,to.id)];if(!transition||!transitionHasContent(transition))return [];return [{from,to,transition}]}),[listSongs,list.transitions])

  const persistOrder=async(ids:string[])=>{setOrderIds(ids);orderRef.current=ids;await updateSetlist(list.id,{songIds:ids});void refresh()}
  const add=async(songId:string)=>{if(!songId||orderRef.current.includes(songId))return;await persistOrder([...orderRef.current,songId]);toast('Morceau ajouté à la setlist.')}
  const addAndStay=async(songId:string)=>{await add(songId);setArtistPick('')}
  const remove=async(songId:string)=>{await persistOrder(orderRef.current.filter(id=>id!==songId));toast('Morceau retiré de la setlist.')}
  const move=async(index:number,dir:number)=>{const target=index+dir;if(target<0||target>=orderRef.current.length)return;const ids=[...orderRef.current];[ids[index],ids[target]]=[ids[target],ids[index]];await persistOrder(ids)}
  const cancelHold=()=>{if(holdTimer.current!==null){window.clearTimeout(holdTimer.current);holdTimer.current=null}}
  const startHold=(e:PointerEvent<HTMLElement>,index:number)=>{
    if(e.pointerType==='mouse')return
    cancelHold()
    const pointer=e.pointerId
    holdTimer.current=window.setTimeout(()=>{
      holdTimer.current=null
      dragPointer.current=pointer
      dragIndex.current=index
      setDraggingId(orderRef.current[index]??null)
      try{e.currentTarget.setPointerCapture(pointer);navigator.vibrate?.(18)}catch{}
    },320)
  }
  const dragMove=(e:PointerEvent<HTMLElement>)=>{
    if(dragIndex.current===null||dragPointer.current!==e.pointerId)return
    e.preventDefault()
    const target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-setlist-index]')
    const to=target?Number(target.dataset.setlistIndex):-1
    const from=dragIndex.current
    if(!Number.isInteger(to)||to<0||to>=orderRef.current.length||to===from)return
    setDragShiftId(orderRef.current[to]??null)
    setDragDirection(to<from?'up':'down')
    const ids=[...orderRef.current]
    const [moved]=ids.splice(from,1)
    ids.splice(to,0,moved)
    dragIndex.current=to
    orderRef.current=ids
    setOrderIds(ids)
  }
  const finishDrag=async(e:PointerEvent<HTMLElement>)=>{
    cancelHold()
    if(dragIndex.current===null)return
    try{e.currentTarget.releasePointerCapture?.(e.pointerId)}catch{}
    dragIndex.current=null
    dragPointer.current=null
    setDraggingId(null)
    setDragShiftId(null)
    setDragDirection(null)
    await updateSetlist(list.id,{songIds:orderRef.current})
    void refresh()
  }
  const closeAdd=()=>{setAddOpen(false);setAddQuery('');setArtistPick('');setAddMode('song')}
  const openTransition=(from:Song,to:Song)=>{const existing=list.transitions?.[transitionKey(from.id,to.id)];setTransitionPair({from,to});setTransitionNotes(existing?.notes??'');setTransitionBars(existing?.bars==null?'':String(existing.bars));setTransitionChords(existing?.chords??'')}
  const saveTransition=async()=>{if(!transitionPair)return;const key=transitionKey(transitionPair.from.id,transitionPair.to.id);const transitions={...(list.transitions??{})};if(!transitionNotes.trim()&&!transitionChords.trim()&&!transitionBars.trim())delete transitions[key];else transitions[key]={fromSongId:transitionPair.from.id,toSongId:transitionPair.to.id,notes:transitionNotes.trim(),bars:transitionBars.trim()?Math.max(1,Number(transitionBars)):null,chords:transitionChords.trim(),updatedAt:new Date().toISOString()};await updateSetlist(list.id,{transitions});await refresh();setTransitionPair(null);toast('Transition enregistrée.')}

  return <><div className="detail-nav setlist-detail-nav stage-entry-actions"><span/><div className="setlist-mode-actions"><button type="button" className="secondary" disabled={!listSongs.length} onClick={()=>setStage('rehearsal')}><Play/>Répétition</button><button type="button" className="primary" disabled={!listSongs.length} onClick={()=>setStage('live')}><Maximize2/>Live Mode</button></div></div>
  <section className="setlist-detail-hero" style={{minHeight:0}}><div className="setlist-detail-title"><span className="setlist-hero-icon"><ListMusic/></span><p className="eyebrow">Setlist</p><h1>{list.name}</h1><p>{listSongs.length} morceau{listSongs.length>1?'x':''} · {lyricsCount} avec paroles</p></div>{(totalSeconds>0||avgBpm!==null||lyricsCount>0)&&<div className="setlist-detail-metrics" role="list">{totalSeconds>0&&<div role="listitem"><span>Durée</span><b>{formatDuration(totalSeconds)}</b></div>}{avgBpm!==null&&<div role="listitem"><span>BPM moyen</span><b>{avgBpm}</b></div>}{lyricsCount>0&&<div role="listitem"><span>Paroles</span><b>{lyricsCount}/{listSongs.length}</b></div>}</div>}</section>
  <section className="panel setlist-manager"><div className="panel-title-row setlist-order-head"><h2>Ordre des morceaux</h2><button className="bare-action setlist-add-button" aria-label="Ajouter des morceaux" title="Ajouter des morceaux" onClick={()=>setAddOpen(true)}><ListPlus/></button></div><div className={'setlist-detail-songs '+(draggingId?'drag-active':'')}>{listSongs.length?listSongs.map((s,i)=><div className={'setlist-detail-song '+(draggingId===s.id?'dragging ':'')+(dragShiftId===s.id?'drag-shift drag-shift-'+(dragDirection??'down'):'')} data-setlist-index={i} key={s.id}><span className="setlist-number">{i+1}</span><span className="setlist-drag-grip" aria-label="Maintenir puis déplacer" title="Maintenir puis déplacer" onPointerDown={e=>startHold(e,i)} onPointerMove={dragMove} onPointerUp={e=>void finishDrag(e)} onPointerCancel={e=>void finishDrag(e)}><GripVertical/></span><button className="setlist-song-main" onClick={()=>{if(!draggingId)onOpenSong(s)}}><b className="song-title-with-mark">{s.title}<SongLyricsMark song={s} compact/></b><small>{s.artist||'Artiste inconnu'}{s.bpm!==null?' · '+s.bpm+' BPM':''}</small></button><strong className={'setlist-song-key '+(!setlistSongDisplayKey(list,s)?'empty':'')} aria-hidden={!setlistSongDisplayKey(list,s)} title={setlistSongDisplayKey(list,s)?(setlistSongSavedTranspose(list,s)?`Transposition setlist ${formatSemitoneOffset(setlistSongSavedTranspose(list,s))}`:'Tonalité du morceau'):''}>{setlistSongDisplayKey(list,s)}{!s.originalKey&&s.personalKey&&setlistSongDisplayKey(list,s)&&<sup className="habitual-key-mark" title="Tonalité habituelle · tonalité originale non renseignée">★</sup>}{Boolean(setlistSongSavedTranspose(list,s))&&<small>{formatSemitoneOffset(setlistSongSavedTranspose(list,s))}</small>}</strong><div className="setlist-song-flags">{list.rehearsalNotes?.[s.id]&&<span>Notes</span>}{(list.rehearsalIssues?.[s.id]??[]).filter(issue=>!issue.resolvedAt).length>0&&<span className="issue-flag">{(list.rehearsalIssues?.[s.id]??[]).filter(issue=>!issue.resolvedAt).length} à revoir</span>}</div><button className="bare-action setlist-move-btn" disabled={i===0} aria-label="Monter" onClick={()=>void move(i,-1)}><ChevronUp/></button><button className="bare-action setlist-move-btn" disabled={i===listSongs.length-1} aria-label="Descendre" onClick={()=>void move(i,1)}><ChevronDown/></button><button className="bare-action danger-icon setlist-remove-btn" aria-label="Retirer" onClick={()=>void remove(s.id)}><X/></button></div>):<Empty text="Cette setlist est vide."/>}</div></section>
  {configuredTransitions.length>0&&<section className="panel setlist-transitions"><div className="panel-title-row"><div><h2>Transitions</h2><small>Repères configurés entre les morceaux.</small></div></div><div className="transition-list">{configuredTransitions.map(({from,to,transition})=><button key={from.id+'-'+to.id} className="configured" onClick={()=>openTransition(from,to)}><span className="transition-route"><b>{from.title}</b><ChevronRight/><b>{to.title}</b></span><small>{transition.bars?transition.bars+' mesure'+(transition.bars>1?'s':'')+' · ':''}{transition.chords||transition.notes||'Transition configurée'}</small><Pencil/></button>)}</div></section>}
  {transitionPair&&<Modal className="transition-modal" title="Transition entre morceaux" onClose={()=>setTransitionPair(null)}><div className="transition-heading"><b>{transitionPair.from.title}</b><ChevronRight/><b>{transitionPair.to.title}</b></div><div className="transition-form"><label>Nombre de mesures<input type="number" min="1" value={transitionBars} onChange={e=>setTransitionBars(e.target.value)} placeholder="Ex. 4"/></label><label>Accords / progression<input value={transitionChords} onChange={e=>setTransitionChords(e.target.value)} placeholder="Ex. G → D/F# → Em"/></label><label className="span2">Consigne<textarea rows={4} value={transitionNotes} onChange={e=>setTransitionNotes(e.target.value)} placeholder="Ex. Pad seul, compter 4 mesures, sax entre sur Em…"/></label></div><div className="modal-actions"><button className="secondary" onClick={()=>setTransitionPair(null)}>Annuler</button><button className="primary" onClick={()=>void saveTransition()}><Save/>Enregistrer</button></div></Modal>}
  {addOpen&&<Modal className="setlist-add-modal" title="Ajouter des morceaux" onClose={closeAdd}><div className="setlist-add-mode"><button className={addMode==='song'?'active':''} onClick={()=>{setAddMode('song');setArtistPick('');setAddQuery('')}}><Search/>Rechercher un morceau</button><button className={addMode==='artist'?'active':''} onClick={()=>{setAddMode('artist');setArtistPick('');setAddQuery('')}}><UsersRound/>Rechercher un artiste</button></div><div className="setlist-add-search"><Search/><input value={addQuery} onChange={e=>setAddQuery(e.target.value)} placeholder={addMode==='song'?'Titre, artiste, tonalité, BPM…':'Nom de l’artiste…'}/>{addQuery&&<button type="button" className="search-clear" aria-label="Effacer la recherche" onClick={()=>setAddQuery('')}><X/></button>}</div>{addMode==='song'?<div className="setlist-add-results">{songMatches.length?songMatches.map(s=><button key={s.id} onClick={()=>void addAndStay(s.id)}><span><b className="song-title-with-mark">{s.title}<SongLyricsMark song={s} compact/></b><small>{s.artist||'Artiste inconnu'}</small></span><span>{setlistSongDisplayKey(list,s)}{!s.originalKey&&s.personalKey&&setlistSongDisplayKey(list,s)&&<sup className="habitual-key-mark" title="Tonalité habituelle · tonalité originale non renseignée">★</sup>}{setlistSongDisplayKey(list,s)&&s.bpm!==null?' · ':''}{s.bpm!==null?s.bpm+' BPM':''}</span><Plus/></button>):<p className="muted-copy">Aucun morceau disponible.</p>}</div>:artistPick?<><button className="ghost setlist-artist-back" onClick={()=>setArtistPick('')}><ChevronLeft/>Artistes</button><div className="setlist-add-results">{artistSongs.map(s=><button key={s.id} onClick={()=>void addAndStay(s.id)}><span><b className="song-title-with-mark">{s.title}<SongLyricsMark song={s} compact/></b><small>{s.artist}</small></span><span>{setlistSongDisplayKey(list,s)}{!s.originalKey&&s.personalKey&&setlistSongDisplayKey(list,s)&&<sup className="habitual-key-mark" title="Tonalité habituelle · tonalité originale non renseignée">★</sup>}{setlistSongDisplayKey(list,s)&&s.bpm!==null?' · ':''}{s.bpm!==null?s.bpm+' BPM':''}</span><Plus/></button>)}</div></>:<div className="setlist-artist-results">{artistMatches.map(a=><button key={a} onClick={()=>setArtistPick(a)}><span className="avatar">{a[0]}</span><span><b>{a}</b><small>{available.filter(s=>s.artist.trim()===a).length} morceau(x) disponible(s)</small></span><ChevronRight/></button>)}</div>}</Modal>}
  {stage&&<SetlistStage mode={stage} list={list} songs={listSongs} refresh={refresh} toast={toast} onClose={()=>setStage(null)} onOpenSong={onOpenSong}/>}
  </>
}

function SetlistStage({mode,list,songs,refresh,toast,onClose,onOpenSong,standalone=false}:{mode:'rehearsal'|'live';list:Setlist;songs:Song[];refresh:()=>Promise<void>;toast:(s:string)=>void;onClose:()=>void;onOpenSong:(s:Song)=>void;standalone?:boolean}) {
  const prefNumber=(key:string,fallback:number,min:number,max:number)=>{
    try{const raw=localStorage.getItem(key);if(raw===null)return fallback;const n=Number(raw);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback}catch{return fallback}
  }
  const prefBool=(key:string,fallback=false)=>{
    try{const v=localStorage.getItem(key);return v===null?fallback:v==='1'}catch{return fallback}
  }
  const orderedSongs=useMemo(()=>songs.filter(Boolean),[songs])
  const [index,setIndex]=useState(0)
  const [view,setView]=useState<'guide'|'lyrics'>('guide')
  const [stageTheme,setStageTheme]=useState<'dark'|'light'>('dark')
  const [navDirection,setNavDirection]=useState<1|-1>(1)
  const [localNotes,setLocalNotes]=useState<Record<string,string>>(list.rehearsalNotes??{})
  const [localIssues,setLocalIssues]=useState(list.rehearsalIssues??{})
  const [issueDraft,setIssueDraft]=useState('')
  const [localOverrides,setLocalOverrides]=useState(list.songOverrides??{})
  const localOverridesRef=useRef(list.songOverrides??{})
  const transposeSaveTimerRef=useRef<number|null>(null)
  useEffect(()=>{localOverridesRef.current=localOverrides},[localOverrides])
  const [lyricsFontSize,setLyricsFontSize]=useState(()=>prefNumber('diart-stage-font',22,14,48))
  const [transpose,setTranspose]=useState(()=>{const first=songs.filter(Boolean)[0];return first?setlistSongSavedTranspose(list,first):0})
  const [autoScroll,setAutoScroll]=useState(false)
  const [scrollSpeed,setScrollSpeed]=useState(()=>prefNumber('diart-stage-scroll-speed',2,0.05,20))
  const [toolsCollapsed,setToolsCollapsed]=useState(()=>prefBool('diart-stage-tools-collapsed',false))
  const [showHeaderIdentity,setShowHeaderIdentity]=useState(false)
  const [stageCanTop,setStageCanTop]=useState(false)
  const [stageRole,setStageRole]=useState<StageRole>(()=>(localStorage.getItem('diart-stage-role') as StageRole)||'normal')
  const [musicianRole,setMusicianRole]=useState(()=>localStorage.getItem('diart-musician-role')||'Piano')
  const [locked,setLocked]=useState(false)
  const [keepAwake,setKeepAwake]=useState(true)
  const [wakeActive,setWakeActive]=useState(false)
  const [resumeIndex,setResumeIndex]=useState<number|null>(null)
  const [showTransitionDetail,setShowTransitionDetail]=useState(false)
  const [transitionEditing,setTransitionEditing]=useState(false)
  const [stageTransitionNotes,setStageTransitionNotes]=useState('')
  const [stageTransitionBars,setStageTransitionBars]=useState('')
  const [stageTransitionChords,setStageTransitionChords]=useState('')
  const [localTransitions,setLocalTransitions]=useState(list.transitions??{})
  const [stageFeedback,setStageFeedback]=useState<{id:number;text:string}|null>(null)
  const sessionId=useRef(crypto.randomUUID())
  const wakeLockRef=useRef<any>(null)
  const lastTapRef=useRef(0)
  const longPressRef=useRef<number|null>(null)
  const gesturePrefs=useMemo(()=>{try{const saved=JSON.parse(localStorage.getItem('diart-gestures')||'{}');return {...DEFAULT_GESTURES,...saved,doubleTapPlay:saved.doubleTapPlay??saved.doubleTapTools??true}}catch{return DEFAULT_GESTURES}},[])
  const contentRef=useRef<HTMLDivElement>(null)
  const songHeadRef=useRef<HTMLDivElement>(null)
  const swipeStart=useRef<{x:number;y:number}|null>(null)
  const song=orderedSongs[index]??orderedSongs[0]
  const nextSong=orderedSongs[index+1]??null
  const currentTransition=nextSong?localTransitions?.[transitionKey(song.id,nextSong.id)]:undefined
  const hasCurrentTransition=transitionHasContent(currentTransition)
  const [noteDraft,setNoteDraft]=useState(song?localNotes[song.id]??'':'')
  const showStageFeedback=(text:string)=>{const id=Date.now()+Math.random();setStageFeedback({id,text});window.setTimeout(()=>setStageFeedback(prev=>prev?.id===id?null:prev),850)}
  const go=(delta:number)=>{setAutoScroll(false);setNavDirection(delta<0?-1:1);setIndex(current=>Math.max(0,Math.min(orderedSongs.length-1,current+delta)))}

  useEffect(()=>()=>{if(transposeSaveTimerRef.current!==null)window.clearTimeout(transposeSaveTimerRef.current);if(!standalone)void updateSetlist(list.id,{songOverrides:localOverridesRef.current})},[])
  useEffect(()=>{try{localStorage.setItem('diart-stage-font',String(lyricsFontSize))}catch{}},[lyricsFontSize])
  useEffect(()=>{try{localStorage.setItem('diart-stage-scroll-speed',String(scrollSpeed))}catch{}},[scrollSpeed])
  useEffect(()=>{try{localStorage.setItem('diart-stage-tools-collapsed',toolsCollapsed?'1':'0')}catch{}},[toolsCollapsed])
  useEffect(()=>{try{localStorage.setItem('diart-stage-role',stageRole);localStorage.setItem('diart-musician-role',musicianRole)}catch{}},[stageRole,musicianRole])

  useEffect(()=>{
    const previousBody=document.body.style.overflow
    const previousHtml=document.documentElement.style.overflow
    document.body.style.overflow='hidden'
    document.documentElement.style.overflow='hidden'
    let raf1=0,raf2=0
    raf1=requestAnimationFrame(()=>{raf2=requestAnimationFrame(()=>contentRef.current?.scrollTo({top:0,behavior:'auto'}))})
    return()=>{
      cancelAnimationFrame(raf1);cancelAnimationFrame(raf2)
      document.body.style.overflow=previousBody
      document.documentElement.style.overflow=previousHtml
    }
  },[])

  useEffect(()=>{
    let cancelled=false
    const request=async()=>{
      if(!keepAwake||document.visibilityState!=='visible'||!(navigator as any).wakeLock)return
      try{wakeLockRef.current=await (navigator as any).wakeLock.request('screen');if(!cancelled)setWakeActive(true);wakeLockRef.current.addEventListener?.('release',()=>setWakeActive(false))}catch{setWakeActive(false)}
    }
    const onVisibility=()=>{if(document.visibilityState==='visible')void request()}
    void request()
    document.addEventListener('visibilitychange',onVisibility)
    return()=>{cancelled=true;document.removeEventListener('visibilitychange',onVisibility);void wakeLockRef.current?.release?.();wakeLockRef.current=null;setWakeActive(false)}
  },[keepAwake])

  useEffect(()=>{
    if(standalone)return
    try{
      const raw=localStorage.getItem('diart-stage-session')
      if(raw){const saved=JSON.parse(raw);if(saved.listId===list.id&&saved.index>0&&saved.index<orderedSongs.length&&Date.now()-Number(saved.at||0)<43200000)setResumeIndex(saved.index)}
    }catch{}
  },[])

  useEffect(()=>{
    if(!song)return
    try{localStorage.setItem('diart-stage-session',JSON.stringify({listId:list.id,listName:list.name,index,mode,at:Date.now()}))}catch{}
    void logActivity('play','Morceau joué',mode==='rehearsal'?'Répétition':'Live Mode',{songId:song.id,songTitle:song.title,source:mode,sessionId:sessionId.current,setlistId:list.id,setlistName:list.name})
  },[song?.id,index])

  useEffect(()=>{
    if(index>=orderedSongs.length&&orderedSongs.length)setIndex(0)
  },[orderedSongs.length,index])

  const structureParts=useMemo(()=>parseStructureSequence(song?.structure??''),[song?.structure])
  const rawChordSections=useMemo(()=>chordGuideSections(song?.chords??''),[song?.chords])
  const hasGuide=Boolean(structureParts.length||rawChordSections.length||song?.instrumentNotes?.trim()||Object.values(song?.musicianNotes??{}).some(Boolean))

  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      const target=e.target as HTMLElement|null
      const editing=Boolean(target&&['INPUT','TEXTAREA','SELECT'].includes(target.tagName))
      if(e.key==='Escape'&&!locked){e.preventDefault();void closeToSetlist();return}
      if(editing)return
      if(e.key==='ArrowRight'){e.preventDefault();go(1);return}
      if(e.key==='ArrowLeft'){e.preventDefault();go(-1);return}
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){
        e.preventDefault()
        const el=contentRef.current
        if(el){const amount=Math.max(90,Math.round(el.clientHeight*.18));el.scrollBy({top:e.key==='ArrowDown'?amount:-amount,behavior:'smooth'})}
        return
      }
      if(e.key==='Tab'&&hasGuide&&Boolean(song?.lyrics)){
        e.preventDefault()
        setAutoScroll(false)
        setView(v=>v==='guide'?'lyrics':'guide')
        requestAnimationFrame(()=>contentRef.current?.scrollTo({top:0,behavior:'smooth'}))
        showStageFeedback(view==='guide'?'Paroles':'Repères')
        return
      }
      if(e.code==='Space'){
        e.preventDefault()
        setAutoScroll(v=>{const next=!v;showStageFeedback(next?'Défilement · Play':'Défilement · Stop');return next})
      }
    }
    window.addEventListener('keydown',onKey)
    return()=>window.removeEventListener('keydown',onKey)
  },[locked,hasGuide,song?.id,song?.lyrics,view])

  useEffect(()=>{
    if(!song)return
    setView(hasGuide?'guide':song.lyrics?'lyrics':'guide')
    setNoteDraft(localNotes[song.id]??'')
    setTranspose(setlistSongSavedTranspose({...list,songOverrides:localOverrides},song))
    setAutoScroll(false)
    setShowHeaderIdentity(false)
    setShowTransitionDetail(false)
    setTransitionEditing(false)
    let raf1=0,raf2=0
    raf1=requestAnimationFrame(()=>{raf2=requestAnimationFrame(()=>contentRef.current?.scrollTo({top:0,behavior:'auto'}))})
    return()=>{cancelAnimationFrame(raf1);cancelAnimationFrame(raf2)}
  },[index,song?.id,hasGuide])

  useEffect(()=>{
    if(!autoScroll)return
    let raf=0
    let last=performance.now()
    let virtualTop=contentRef.current?.scrollTop??0
    const tick=(now:number)=>{
      const el=contentRef.current
      if(!el)return
      const dt=Math.min(100,now-last)
      last=now
      virtualTop+=scrollSpeed*dt/1000
      el.scrollTop=virtualTop
      if(el.scrollTop+el.clientHeight>=el.scrollHeight-2){setAutoScroll(false);return}
      raf=requestAnimationFrame(tick)
    }
    raf=requestAnimationFrame(tick)
    return()=>cancelAnimationFrame(raf)
  },[autoScroll,scrollSpeed,index,view])

  if(!song)return null


  const loadStageTransitionDraft=()=>{
    setStageTransitionNotes(currentTransition?.notes??'')
    setStageTransitionBars(currentTransition?.bars==null?'':String(currentTransition.bars))
    setStageTransitionChords(currentTransition?.chords??'')
  }
  const openStageTransition=(edit=false)=>{
    if(!nextSong)return
    loadStageTransitionDraft()
    setTransitionEditing(edit)
    setShowTransitionDetail(true)
  }
  const saveStageTransition=async()=>{
    if(!nextSong)return
    const key=transitionKey(song.id,nextSong.id)
    const transitions={...localTransitions}
    if(!stageTransitionNotes.trim()&&!stageTransitionChords.trim()&&!stageTransitionBars.trim())delete transitions[key]
    else transitions[key]={fromSongId:song.id,toSongId:nextSong.id,notes:stageTransitionNotes.trim(),bars:stageTransitionBars.trim()?Math.max(1,Number(stageTransitionBars)):null,chords:stageTransitionChords.trim(),updatedAt:new Date().toISOString()}
    setLocalTransitions(transitions)
    await updateSetlist(list.id,{transitions})
    await refresh()
    setTransitionEditing(false)
    setShowTransitionDetail(transitionHasContent(transitions[key]))
    toast(transitionHasContent(transitions[key])?'Transition enregistrée.':'Transition supprimée.')
  }
  const saveNote=async()=>{const next={...localNotes,[song.id]:noteDraft};setLocalNotes(next);await updateSetlist(list.id,{rehearsalNotes:next});void refresh();toast('Notes de répétition enregistrées.')}
  const persistIssues=async(next:typeof localIssues)=>{setLocalIssues(next);await updateSetlist(list.id,{rehearsalIssues:next});void refresh()}
  const addIssue=async()=>{const text=issueDraft.trim();if(!text)return;const next={...localIssues,[song.id]:[...(localIssues[song.id]??[]),{id:crypto.randomUUID(),text,createdAt:new Date().toISOString(),resolvedAt:null}]};setIssueDraft('');await persistIssues(next);toast('Point à revoir ajouté.')}
  const toggleIssue=async(issueId:string)=>{const next={...localIssues,[song.id]:(localIssues[song.id]??[]).map(issue=>issue.id===issueId?{...issue,resolvedAt:issue.resolvedAt?null:new Date().toISOString()}:issue)};await persistIssues(next)}
  const removeIssue=async(issueId:string)=>{const next={...localIssues,[song.id]:(localIssues[song.id]??[]).filter(issue=>issue.id!==issueId)};await persistIssues(next)}
  const beginSwipe=(e:TouchEvent<HTMLElement>)=>{
    if(!gesturePrefs.swipeSongs||e.touches.length!==1){swipeStart.current=null;return}
    const t=e.touches[0]
    swipeStart.current={x:t.clientX,y:t.clientY}
  }
  const moveSwipe=(e:TouchEvent<HTMLElement>)=>{
    const start=swipeStart.current
    if(!start||e.touches.length!==1)return
    const t=e.touches[0]
    const dx=t.clientX-start.x
    const dy=t.clientY-start.y
    if(Math.abs(dy)>14&&Math.abs(dy)>Math.abs(dx)*1.05)swipeStart.current=null
  }
  const endSwipe=(e:TouchEvent<HTMLElement>)=>{
    const start=swipeStart.current
    swipeStart.current=null
    if(!start||!gesturePrefs.swipeSongs||e.changedTouches.length!==1)return
    const t=e.changedTouches[0]
    const dx=t.clientX-start.x
    const dy=t.clientY-start.y
    if(Math.abs(dx)<58||Math.abs(dx)<Math.abs(dy)*1.25)return
    go(dx>0?-1:1)
  }
  const handleTap=(e:any)=>{
    if((e.target as HTMLElement)?.closest?.('button,input,textarea,select,a'))return
    const now=Date.now()
    if(gesturePrefs.doubleTapPlay&&now-lastTapRef.current<320){
      setAutoScroll(v=>{const next=!v;showStageFeedback(next?'Défilement · Play':'Défilement · Stop');return next})
      lastTapRef.current=0
    }else lastTapRef.current=now
  }
  const beginLongPress=()=>{if(!gesturePrefs.longPressLock)return;if(longPressRef.current!==null)window.clearTimeout(longPressRef.current);longPressRef.current=window.setTimeout(()=>{setLocked(v=>!v);navigator.vibrate?.(25)},650)}
  const cancelLongPress=()=>{if(longPressRef.current!==null){window.clearTimeout(longPressRef.current);longPressRef.current=null}}
  const handleStageScroll=()=>{
    const scroller=contentRef.current
    const head=songHeadRef.current
    if(!scroller||!head)return
    const threshold=Math.max(36,head.offsetHeight-18)
    setStageCanTop(scroller.scrollTop>260)
    setShowHeaderIdentity(prev=>{
      const showAt=threshold+18
      const hideAt=Math.max(0,threshold-18)
      if(!prev&&scroller.scrollTop>showAt)return true
      if(prev&&scroller.scrollTop<hideAt)return false
      return prev
    })
  }
  const persistTranspose=(next:number)=>{
    setTranspose(next)
    if(standalone||!song)return
    const reference=song.originalKey
    const selectedKey=reference?transposeKey(reference,next):''
    const current=localOverridesRef.current
    const nextOverrides={...current,[song.id]:{...(current[song.id]??{}),transpose:next,key:selectedKey}}
    localOverridesRef.current=nextOverrides
    setLocalOverrides(nextOverrides)
    if(transposeSaveTimerRef.current!==null)window.clearTimeout(transposeSaveTimerRef.current)
    transposeSaveTimerRef.current=window.setTimeout(()=>{
      transposeSaveTimerRef.current=null
      void updateSetlist(list.id,{songOverrides:localOverridesRef.current}).then(()=>refresh())
    },180)
  }
  const saveSetlistChoices=async()=>{
    if(standalone)return
    if(transposeSaveTimerRef.current!==null){window.clearTimeout(transposeSaveTimerRef.current);transposeSaveTimerRef.current=null}
    await updateSetlist(list.id,{songOverrides:localOverridesRef.current})
    await refresh()
  }
  const closeToSetlist=async()=>{await saveSetlistChoices();onClose()}
  const baseKey=song.originalKey
  const habitualOffset=baseKey&&song.personalKey&&normalizeKey(song.personalKey)!==normalizeKey(baseKey)?keyOffsetFromOriginal(baseKey,song.personalKey):null
  const displayKey=baseKey?transposeKey(baseKey,transpose):''
  const displayChords=transposeChordText(song.chords??'',transpose)
  const chordSections=chordGuideSections(displayChords)
  const [transitionTop,setTransitionTop]=useState(112)
  const stageHeaderRef=useRef<HTMLElement>(null)
  useEffect(()=>{
    const el=stageHeaderRef.current
    if(!el)return
    const update=()=>setTransitionTop(Math.round(el.getBoundingClientRect().bottom+12))
    update()
    const ro=new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize',update)
    return()=>{ro.disconnect();window.removeEventListener('resize',update)}
  },[])
  const stageStyle:CSSProperties={position:'fixed',inset:0,zIndex:10000,display:'grid',gridTemplateRows:'auto minmax(0,1fr)',overflow:'hidden'}
  const stageTools=<div className={'stage-session-tools '+(toolsCollapsed?'collapsed':'')}>
    <button type="button" className="stage-tools-toggle" aria-label={toolsCollapsed?'Afficher les réglages':'Masquer les réglages'} title={toolsCollapsed?'Afficher les réglages':'Masquer les réglages'} onClick={()=>setToolsCollapsed(v=>!v)}><Settings/></button>
    <div className={'stage-tools-body collapsible-body '+(toolsCollapsed?'is-collapsed':'is-expanded')}>
      <div className="stage-control-group stage-role-control"><span>Mode</span>{(['normal','chef','musicien'] as StageRole[]).map(role=><button type="button" key={role} className={stageRole===role?'active':''} onClick={()=>{setStageRole(role);showStageFeedback(role==='normal'?'Mode Normal':role==='chef'?'Mode Chef':'Mode Musicien')}}>{role==='normal'?'N':role==='chef'?'C':'M'}</button>)}</div>
      {stageRole==='musicien'&&<div className="stage-control-group"><span>Rôle</span><select value={musicianRole} onChange={e=>setMusicianRole(e.target.value)}>{MUSICIAN_ROLES.map(role=><option key={role}>{role}</option>)}</select></div>}
      <div className="stage-control-group"><span>Écran</span><button type="button" className={keepAwake?'active':''} title="Maintenir l’écran actif" onClick={()=>setKeepAwake(v=>{const next=!v;showStageFeedback(next?'Écran maintenu actif':'Écran actif désactivé');return next})}><MonitorUp/></button><b>{wakeActive?'Actif':'Auto'}</b></div>
      <div className="stage-control-group"><span>Paroles</span><button type="button" title="Réduire la police" onClick={()=>setLyricsFontSize(v=>Math.max(14,v-2))}><Minus/></button><b>{lyricsFontSize}</b><button type="button" title="Agrandir la police" onClick={()=>setLyricsFontSize(v=>Math.min(48,v+2))}><Plus/></button></div>
      <div className="stage-control-group stage-transpose-control"><span>Transposer</span><button type="button" title="Tonalité originale" className={transpose===0?'active':''} onClick={()=>persistTranspose(0)}>O</button>{habitualOffset!==null&&<button type="button" title={'Tonalité habituelle · '+song.personalKey} className={transpose===habitualOffset?'active':''} onClick={()=>persistTranspose(habitualOffset)}>H</button>}<button type="button" title="-1 demi-ton" onClick={()=>persistTranspose(Math.max(-12,transpose-1))}><Minus/></button><b>{displayKey||formatSemitoneOffset(transpose)}</b><button type="button" title="+1 demi-ton" onClick={()=>persistTranspose(Math.min(12,transpose+1))}><Plus/></button></div>
      <div className={'stage-control-group auto-scroll-control '+(autoScroll?'active':'')}><span>Défilement</span><button type="button" className="stage-autoscroll-toggle" title={autoScroll?'Arrêter':'Démarrer'} onClick={()=>setAutoScroll(v=>{const next=!v;showStageFeedback(next?'Défilement · Play':'Défilement · Stop');return next})}>{autoScroll?<Square/>:<Play/>}</button><input aria-label="Vitesse de défilement" type="range" min="0.05" max="20" step="0.05" value={scrollSpeed} onChange={e=>setScrollSpeed(Number(e.target.value))}/><b>{scrollSpeed<1?scrollSpeed.toFixed(2):scrollSpeed<10?scrollSpeed.toFixed(1):Math.round(scrollSpeed)}</b><button type="button" title="Retour en haut" onClick={()=>{setAutoScroll(false);contentRef.current?.scrollTo({top:0,behavior:'smooth'})}}><ChevronUp/></button></div>
    </div>
  </div>

  return createPortal(<div className={'stage-mode '+mode+' stage-theme-'+stageTheme+' stage-role-'+stageRole+(locked?' stage-locked':'')} data-stage-theme={stageTheme} style={stageStyle}>
    <header ref={stageHeaderRef} className="stage-topbar" style={{zIndex:4,background:'rgba(2,9,12,.96)',borderBottom:'1px solid #17323a',display:'grid',gridTemplateColumns:'1fr auto 1fr',alignItems:'center'}}>
      <div className="stage-left-stack" style={{gridColumn:1,justifySelf:'start'}}>{!standalone&&<div className="stage-list-context"><span>{mode==='rehearsal'?'Répétition':'Live Mode'}</span><b>{list.name}</b></div>}</div>
      <div className={'stage-current-song '+(showHeaderIdentity?'identity-visible':'identity-hidden')} style={{gridColumn:2,justifySelf:'center',textAlign:'center'}}>
        <div className="stage-header-identity" aria-hidden={!showHeaderIdentity}><b>{song.title}</b><small>{song.artist||'Artiste inconnu'}</small></div>
        {(hasGuide||song.lyrics)&&<div className="stage-view-tabs">{hasGuide&&<button type="button" className={view==='guide'?'active':''} onClick={()=>{setView('guide');setAutoScroll(false);requestAnimationFrame(()=>contentRef.current?.scrollTo({top:0}))}}>Repères</button>}{song.lyrics&&<button type="button" className={view==='lyrics'?'active':''} onClick={()=>{setView('lyrics');setAutoScroll(false);requestAnimationFrame(()=>contentRef.current?.scrollTo({top:0}))}}>Paroles</button>}</div>}
      </div>
      <div className="stage-top-actions" style={{gridColumn:3,justifySelf:'end'}}><button type="button" className={'stage-lock-toggle '+(locked?'active':'')} aria-label={locked?'Déverrouiller Live':'Verrouiller Live'} title={locked?'Déverrouiller':'Verrouiller'} onClick={()=>setLocked(v=>!v)}>{locked?<Lock/>:<Unlock/>}</button><button type="button" className="stage-theme-toggle" aria-label={stageTheme==='dark'?'Passer en mode jour':'Passer en mode nuit'} title={stageTheme==='dark'?'Mode jour':'Mode nuit'} onClick={()=>setStageTheme(t=>t==='dark'?'light':'dark')}>{stageTheme==='dark'?<Sun/>:<Moon/>}</button><button type="button" className="live-close" disabled={locked} onClick={()=>void closeToSetlist()} aria-label="Fermer"><X/></button></div>
    </header>

    <main key={song.id} ref={contentRef} className={'stage-content stage-song-motion '+(navDirection>0?'motion-next':'motion-prev')} onScroll={handleStageScroll} onClick={handleTap} onTouchStart={e=>{beginSwipe(e);beginLongPress()}} onTouchMove={e=>{moveSwipe(e);cancelLongPress()}} onTouchEnd={e=>{endSwipe(e);cancelLongPress()}} onTouchCancel={cancelLongPress} style={{minHeight:0,height:'100%',overflowY:'auto',overflowX:'hidden',WebkitOverflowScrolling:'touch',overscrollBehavior:'contain',touchAction:'pan-y'}}>
      <div ref={songHeadRef} className={'stage-song-head '+(showHeaderIdentity?'handoff':'')}><p>{song.artist||'Artiste inconnu'}</p><h1>{song.title}</h1><div className="stage-metrics">{displayKey&&<strong>{displayKey}</strong>}{song.bpm!==null&&<span>{song.bpm} BPM</span>}{song.timeSignature&&<span>{song.timeSignature}</span>}</div></div>

      {view==='lyrics'&&song.lyrics
        ?<pre className="stage-lyrics" style={{fontSize:lyricsFontSize}}>{song.lyrics}</pre>
        :hasGuide?<div className="stage-guide stage-guide-modern">
          {structureParts.length>0&&<section className="stage-structure-card"><h3>Structure</h3><div className="stage-structure-flow">{structureParts.map((part,i)=><span key={part+'-'+i}>{part}</span>)}</div></section>}
          {chordSections.length>0&&<section className="stage-chords-card"><h3>Accords / repères{transpose!==0&&<small className="transpose-indicator"> · {formatSemitoneOffset(transpose)} demi-ton{Math.abs(transpose)>1?'s':''}</small>}</h3><div className="stage-chord-sections">{chordSections.map((section,i)=><article key={section.label+'-'+i}><b>{section.label}</b><pre>{section.body}</pre></article>)}</div></section>}
          {song.instrumentNotes?.trim()&&stageRole!=='musicien'&&<section className="stage-instrument-card"><h3>Notes instrumentales</h3><p>{song.instrumentNotes}</p></section>}{stageRole==='musicien'&&<section className="stage-instrument-card stage-role-note"><h3>{musicianRole}</h3><p>{song.musicianNotes?.[musicianRole]?.trim()||song.instrumentNotes?.trim()||'Aucune note spécifique pour ce rôle.'}</p></section>}
        </div>:null}

      {mode==='rehearsal'&&!locked&&<section className="rehearsal-edit-panel"><div className="panel-title-row"><div><h3>Répétition · points à résoudre</h3><small>Les points non résolus réapparaîtront à la prochaine répétition de ce morceau.</small></div><button type="button" className="secondary" onClick={()=>void saveSetlistChoices().then(()=>{onClose();onOpenSong(song)})}><Pencil/>Modifier la fiche</button></div><div className="rehearsal-issues">{(localIssues[song.id]??[]).length?<>{(localIssues[song.id]??[]).filter(issue=>!issue.resolvedAt).map(issue=><div className="rehearsal-issue" key={issue.id}><button className="issue-check" title="Marquer comme résolu" onClick={()=>void toggleIssue(issue.id)}><span/></button><span><b>{issue.text}</b><small>Ajouté {new Date(issue.createdAt).toLocaleString()}</small></span><button className="bare-action danger-icon" onClick={()=>void removeIssue(issue.id)}><Trash2/></button></div>)}{(localIssues[song.id]??[]).some(issue=>issue.resolvedAt)&&<details className="resolved-issues"><summary>Points résolus · {(localIssues[song.id]??[]).filter(issue=>issue.resolvedAt).length}</summary>{(localIssues[song.id]??[]).filter(issue=>issue.resolvedAt).map(issue=><div className="rehearsal-issue resolved" key={issue.id}><button className="issue-check" title="Rouvrir" onClick={()=>void toggleIssue(issue.id)}><Check/></button><span><b>{issue.text}</b><small>Résolu {new Date(issue.resolvedAt!).toLocaleString()}</small></span><button className="bare-action danger-icon" onClick={()=>void removeIssue(issue.id)}><Trash2/></button></div>)}</details>}</>:<p className="muted-copy">Aucun point à revoir pour ce morceau.</p>}</div><div className="issue-add-row"><input value={issueDraft} onChange={e=>setIssueDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void addIssue()}}} placeholder="Ex. Refaire la fin, sax mesure 17, ralentir le refrain…"/><button className="primary" onClick={()=>void addIssue()}><Plus/>Ajouter</button></div><details className="rehearsal-general-notes"><summary>Notes générales de répétition</summary><textarea value={noteDraft} onChange={e=>setNoteDraft(e.target.value)} placeholder="Notes libres propres à cette setlist…"/><button type="button" className="secondary" onClick={()=>void saveNote()}><Save/>Enregistrer les notes</button></details></section>}
    </main>

    {stageCanTop&&<button type="button" className="stage-scroll-top" aria-label="Retour en haut" title="Retour en haut" onClick={()=>{setAutoScroll(false);contentRef.current?.scrollTo({top:0,behavior:'smooth'})}}><ChevronUp/></button>}
    <div className="stage-floating-tools">{stageTools}</div>
    {stageFeedback&&<div key={stageFeedback.id} className="stage-feedback" role="status">{stageFeedback.text}</div>}
    {nextSong&&<div className="stage-next-song"><span>SUIVANT</span><b>{nextSong.title}</b><small>{setlistSongDisplayKey({...list,songOverrides:localOverrides},nextSong)}{setlistSongDisplayKey({...list,songOverrides:localOverrides},nextSong)&&nextSong.bpm!==null?' · ':''}{nextSong.bpm!==null?nextSong.bpm+' BPM':''}</small></div>}
    {showTransitionDetail&&nextSong&&<div className="stage-transition-popup-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget){setShowTransitionDetail(false);setTransitionEditing(false)}}}><section className="stage-transition-popup" role="dialog" aria-modal="true" aria-label="Transition vers le morceau suivant"><div className="stage-transition-popup-head"><div><span>TRANSITION</span><b>{song.title} <ChevronRight/> {nextSong.title}</b></div><div className="stage-transition-popup-actions">{!transitionEditing&&hasCurrentTransition&&<button type="button" onClick={()=>{loadStageTransitionDraft();setTransitionEditing(true)}} aria-label="Modifier la transition" title="Modifier"><Pencil/></button>}<button type="button" onClick={()=>{setShowTransitionDetail(false);setTransitionEditing(false)}} aria-label="Fermer"><X/></button></div></div>{transitionEditing?<div className="stage-transition-editor"><label>Nombre de mesures<input type="number" min="1" value={stageTransitionBars} onChange={e=>setStageTransitionBars(e.target.value)} placeholder="Ex. 4"/></label><label>Accords / progression<input value={stageTransitionChords} onChange={e=>setStageTransitionChords(e.target.value)} placeholder="Ex. G → D/F# → Em"/></label><label className="wide">Consigne<textarea rows={4} value={stageTransitionNotes} onChange={e=>setStageTransitionNotes(e.target.value)} placeholder="Ex. Pad seul, compter 4 mesures…"/></label><div className="stage-transition-editor-actions"><button className="secondary" onClick={()=>{if(hasCurrentTransition)setTransitionEditing(false);else setShowTransitionDetail(false)}}>Annuler</button><button className="primary" onClick={()=>void saveStageTransition()}><Save/>Enregistrer</button></div></div>:hasCurrentTransition&&<div className="stage-transition-popup-body">{currentTransition?.bars&&<div><span>Mesures</span><strong>{currentTransition.bars}</strong></div>}{currentTransition?.chords&&<div className="wide"><span>Accords / progression</span><strong>{currentTransition.chords}</strong></div>}{currentTransition?.notes&&<div className="wide"><span>Consigne</span><p>{currentTransition.notes}</p></div>}</div>}</section></div>}
    <div className="stage-floating-count" aria-label="Position dans la setlist">{index+1} / {orderedSongs.length}</div>
    {resumeIndex!==null&&<div className="stage-resume-overlay"><div className="stage-resume-card"><RefreshCw/><div><b>Reprendre la session ?</b><span>{list.name} · morceau {resumeIndex+1}/{orderedSongs.length}</span></div><button className="secondary" onClick={()=>{setResumeIndex(null);setIndex(0)}}>Recommencer</button><button className="primary" onClick={()=>{setIndex(resumeIndex);setResumeIndex(null)}}>Reprendre</button></div></div>}
    {!standalone&&<nav className="stage-nav compact-stage-nav" aria-label="Navigation entre morceaux"><div className="stage-nav-inner">
      <button type="button" className="stage-nav-btn stage-prev-btn secondary" aria-label="Morceau précédent" title="Précédent" disabled={index===0} onClick={()=>go(-1)}><ChevronLeft/></button>
      <span/>
      <button type="button" className="stage-nav-btn stage-next-btn primary" aria-label="Morceau suivant" title="Suivant" disabled={index===orderedSongs.length-1} onClick={()=>go(1)}><ChevronRight/></button>
    </div></nav>}
    {nextSong&&((hasCurrentTransition)||mode==='rehearsal')&&createPortal(<button type="button" className={'stage-transition-trigger stage-transition-floating '+(!hasCurrentTransition?'is-add':'')} style={{top:transitionTop}} aria-label={hasCurrentTransition?'Afficher la transition':'Ajouter une transition'} title={hasCurrentTransition?'Afficher la transition':'Ajouter une transition'} onClick={(e)=>{e.preventDefault();e.stopPropagation();openStageTransition(!hasCurrentTransition)}}>{hasCurrentTransition?'T':'+'}</button>,document.body)}
  </div>,document.body)
}

function Empty({text}:{text:string}) { return <div className="empty"><Music2/><p>{text}</p></div> }

export default App

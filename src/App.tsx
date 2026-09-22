import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject, type FormEvent, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  BookOpen, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Heart, Home, Import,
  Library, Menu, Moon, MoreHorizontal, Music2, Plus, Search, Settings, Star, Sun,
  Trash2, Upload, UserRound, UsersRound, Wifi, WifiOff, X, Pencil, Save, RotateCcw,
  Filter, ArrowUpDown, Check, AlertTriangle, Minus, ListMusic, Cloud, LogIn, LogOut,
  Play, Square, Gauge, Maximize2, ChevronUp, ChevronDown, ListPlus, BookMarked, ExternalLink, FileUp, Globe2
} from 'lucide-react'
import { db, createSong, ensureDemoSeed, getSetting, markViewed, setSetting, softDeleteSong, updateSong, createSetlist, updateSetlist } from './db'
import type { ImportField, ImportMapping, ImportRowPreview, Song, SongDraft, Setlist } from './types'
import { emptySongDraft, formatDuration, normalizeKey, parseBpm, parseDuration, searchSong, transposeKey, transposeChordText, formatSemitoneOffset } from './music'
import { parseWorkbook, rowsToPreview, suggestMapping, type ParsedWorkbook } from './importer'
import { exportCsv, exportJson, exportXlsx, restoreJson } from './exporter'
import { supabase, syncAll, signIn, signOut, signUp, getCloudStats, pullCloudToLocal } from './cloud'
import { parseChordPro } from './recueils'
import { fetchTononkiraReference, searchTononkira, searchExternalRecueil, importExternalRecueil, type TononkiraSearchResult, type ExternalRecueilSource, type ExternalRecueilResult } from './catalog'

const navItems = [
  ['dashboard','Accueil',Home], ['library','Bibliothèque',Library], ['artists','Artistes',UsersRound],
  ['authors','Auteurs',UserRound], ['favorites','Favoris',Heart], ['recent','Récents',BookOpen],
  ['setlists','Setlists',ListMusic], ['recueils','Recueils',BookMarked], ['import','Importer',Import], ['backup','Sauvegarde',Download], ['settings','Paramètres',Settings]
] as const

type Page = typeof navItems[number][0] | 'song' | 'edit' | 'new' | 'artist' | 'author' | 'setlist'
type Toast = { id:number; text:string; action?:{label:string;run:()=>void} }

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

function Metric({label,value}:{label:string;value:string|number}) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>
}

function SongRow({song,onOpen,onFav,action}:{song:Song;onOpen:()=>void;onFav:()=>void;action?:ReactNode}) {
  const key=song.personalKey||song.originalKey
  const hasMeta=Boolean(key||song.bpm!==null||song.timeSignature)
  return <div className={`song-row ${action?'has-action':''} ${hasMeta?'':'no-meta'}`} onClick={onOpen} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')onOpen()}}>
    <button className={`icon-btn fav ${song.favorite?'active':''}`} aria-label={song.favorite?'Retirer des favoris':'Ajouter aux favoris'} onClick={e=>{e.stopPropagation();onFav()}}><Star size={18} fill={song.favorite?'currentColor':'none'}/></button>
    <div className="song-main"><b>{song.title}</b><span>{song.artist || 'Artiste inconnu'}{song.source==='demo'&&<em>DEMO</em>}</span></div>
    {hasMeta&&<div className="song-meta">{key&&<strong>{key}</strong>}{song.bpm!==null&&<span>{song.bpm} BPM</span>}{song.timeSignature&&<span>{song.timeSignature}</span>}</div>}
    {action&&<div className="song-row-action" onClick={e=>e.stopPropagation()}>{action}</div>}
    <ChevronRight className="song-row-chevron" size={18}/>
  </div>
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
  const [selectedSetlistId,setSelectedSetlistId]=useState('')
  const [presetArtist,setPresetArtist]=useState('')
  const [presetAuthor,setPresetAuthor]=useState('')
  const [createMode,setCreateMode]=useState<'menu'|'artist'|'setlist'|null>(null)
  const [recueilEntry,setRecueilEntry]=useState<'tononkira'|null>(null)
  const [createName,setCreateName]=useState('')
  const [sidebar,setSidebar]=useState(false)
  const [theme,setTheme]=useState<'dark'|'light'|'system'>('dark')
  const [online,setOnline]=useState(navigator.onLine)
  const [toasts,setToasts]=useState<Toast[]>([])
  const [setlists,setSetlists]=useState<Setlist[]>([])
  const [userId,setUserId]=useState('')
  const [userEmail,setUserEmail]=useState('')
  const [syncing,setSyncing]=useState(false)
  const [cloudStats,setCloudStats]=useState<{songs:number;setlists:number}|null>(null)
  const [lastSyncAt,setLastSyncAt]=useState('')
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
      const result=await syncAll(userId)
      if(result.pulled>0) await Promise.all([refresh(),refreshSetlists()])
      if(showToast||result.pulled>0||result.pushed>0) await refreshCloudStats(userId)
      markSynced()
      if(showToast)toast('Synchronisation cloud terminée.')
    }catch(e){if(showToast)toast(e instanceof Error?e.message:'Synchronisation impossible.')}
    finally{syncLockRef.current=false;setSyncing(false)}
  }
  const scheduleSync=(delay=250)=>{
    if(syncTimerRef.current!==null)window.clearTimeout(syncTimerRef.current)
    syncTimerRef.current=window.setTimeout(()=>{syncTimerRef.current=null;void doSync(false)},delay)
  }
  const forcePull=async()=>{
    if(!userId||!navigator.onLine||syncLockRef.current)return
    syncLockRef.current=true
    setSyncing(true)
    try{const r=await pullCloudToLocal(userId);await Promise.all([refresh(),refreshSetlists(),refreshCloudStats(userId)]);markSynced();toast(`Cloud récupéré : ${r.songs} morceau(x), ${r.setlists} setlist(s).`)}
    catch(e){toast(e instanceof Error?e.message:'Récupération cloud impossible.')}
    finally{syncLockRef.current=false;setSyncing(false)}
  }

  useEffect(()=>{void getSetting('theme','dark').then(v=>setTheme((v as typeof theme)||'dark'));void getSetting('lastSyncAt','').then(setLastSyncAt);void refreshSetlists()},[])
  useEffect(()=>{
    void supabase.auth.getSession().then(({data})=>{const u=data.session?.user;setUserId(u?.id??'');setUserEmail(u?.email??'')})
    const {data}=supabase.auth.onAuthStateChange((_event,session)=>{const u=session?.user;setUserId(u?.id??'');setUserEmail(u?.email??'')})
    return()=>data.subscription.unsubscribe()
  },[])
  useEffect(()=>{if(userId&&online){scheduleSync(80);void refreshCloudStats(userId)}else if(!userId)setCloudStats(null)},[userId,online])
  const syncSignature=useMemo(()=>{
    let songLatest='',setlistLatest=''
    let songCount=0
    for(const s of songs){if(s.source==='demo')continue;songCount++;if(s.updatedAt>songLatest)songLatest=s.updatedAt}
    for(const s of setlists){if(s.updatedAt>setlistLatest)setlistLatest=s.updatedAt}
    return `${songCount}:${songLatest}#${setlists.length}:${setlistLatest}`
  },[songs,setlists])
  useEffect(()=>{if(!userId||!online)return;const timer=window.setTimeout(()=>scheduleSync(40),700);return()=>window.clearTimeout(timer)},[syncSignature,userId,online])
  useEffect(()=>{
    if(!userId)return
    const channel=supabase.channel(`diart-live-sync-${userId}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'diart_songs',filter:`user_id=eq.${userId}`},()=>scheduleSync(180))
      .on('postgres_changes',{event:'*',schema:'public',table:'diart_setlists',filter:`user_id=eq.${userId}`},()=>scheduleSync(180))
      .subscribe(status=>{if(status==='SUBSCRIBED')scheduleSync(80)})
    const timer=window.setInterval(()=>{if(navigator.onLine) scheduleSync(100)},180000)
    const wake=()=>{if(document.visibilityState==='visible'&&navigator.onLine)scheduleSync(60)}
    document.addEventListener('visibilitychange',wake)
    window.addEventListener('focus',wake)
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',wake);window.removeEventListener('focus',wake);if(syncTimerRef.current!==null)window.clearTimeout(syncTimerRef.current);void supabase.removeChannel(channel)}
  },[userId])
  useEffect(()=>{
    const resolved=theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):theme
    document.documentElement.dataset.theme=resolved
    void setSetting('theme',theme)
  },[theme])
  useEffect(()=>{
    const on=()=>setOnline(true),off=()=>setOnline(false)
    addEventListener('online',on); addEventListener('offline',off)
    return()=>{removeEventListener('online',on);removeEventListener('offline',off)}
  },[])
  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setPage('library');setTimeout(()=>searchRef.current?.focus(),50)}}
    addEventListener('keydown',handler); return()=>removeEventListener('keydown',handler)
  },[])

  const go=(p:Page)=>{if(p==='recueils')setRecueilEntry(null);setPage(p);setSidebar(false)}
  const startNewSong=(artist='',author='')=>{if(!artist)setSelectedArtist('');if(!author)setSelectedAuthor('');setPresetArtist(artist);setPresetAuthor(author);setSelected(null);setCreateMode(null);setCreateName('');setPage('new')}
  const currentScrollY=()=>window.scrollY||document.documentElement.scrollTop||0
  const openArtist=(name:string)=>{setArtistsScrollY(currentScrollY());setSelectedArtist(name);setPage('artist')}
  const openAuthor=(name:string)=>{setAuthorsScrollY(currentScrollY());setSelectedAuthor(name);setPage('author')}
  const openSetlist=(id:string)=>{setSelectedSetlistId(id);setPage('setlist')}
  const createNamedArtist=()=>{const name=createName.trim();if(!name)return;startNewSong(name)}
  const createNamedSetlist=async()=>{const name=createName.trim();if(!name)return;await createSetlist(name);await refreshSetlists();setCreateMode(null);setCreateName('');setPage('setlists');toast(`Setlist « ${name} » créée.`)}
  const openSong=(s:Song,origin?:{page:Page;label:string})=>{
    const lastViewedAt=new Date().toISOString()
    const next={...s,lastViewedAt}
    const fallback:Record<string,string>={dashboard:'Accueil',library:'Bibliothèque',artist:selectedArtist||'Artiste',artists:'Artistes',favorites:'Favoris',recent:'Récents',setlist:currentSetlist?.name||'Setlist',setlists:'Setlists',author:selectedAuthor||'Auteur',authors:'Auteurs'}
    setSongBack(origin??{page,label:fallback[page]||'Retour'})
    setSelected(next);patchLocal(s.id,{lastViewedAt});setPage('song');void markViewed(s.id)
  }
  const fav=(s:Song)=>{const favorite=!s.favorite;const updatedAt=new Date().toISOString();patchLocal(s.id,{favorite,updatedAt});setSelected(prev=>prev?.id===s.id?{...prev,favorite,updatedAt}:prev);void updateSong(s.id,{favorite}).catch(()=>void refresh())}
  const artistGroups=useMemo(()=>groupPeople(songs,'artist'),[songs])
  const authorGroups=useMemo(()=>groupPeople(songs,'authorComposer'),[songs])
  const favoriteSongs=useMemo(()=>songs.filter(s=>s.favorite),[songs])
  const recentSongs=useMemo(()=>[...songs].sort((a,b)=>(b.lastViewedAt||b.updatedAt).localeCompare(a.lastViewedAt||a.updatedAt)).slice(0,50),[songs])
  const artists=artistGroups.length
  const authors=authorGroups.length
  const currentSetlist=useMemo(()=>setlists.find(s=>s.id===selectedSetlistId)||null,[setlists,selectedSetlistId])

  return <div className="app-shell">
    <aside className={`sidebar ${sidebar?'open':''}`}>
      <button className="brand" onClick={()=>go('dashboard')} aria-label="Accueil DI'ART"><span className="brand-mark"><img className="brand-logo logo-night" src="./logo-night.svg" alt=""/><img className="brand-logo logo-day" src="./logo-day.svg" alt=""/></span><div><b>DI'ART</b><small>by ARIZONA</small></div></button>
      <nav>{navItems.map(([id,label,Icon])=><button key={id} className={page===id?'active':''} onClick={()=>go(id)}><Icon size={19}/>{label}</button>)}</nav>
      <div className="sidebar-bottom">{online?<Wifi size={16}/>:<WifiOff size={16}/>} {online?'En ligne':'Hors connexion'}<small>Données locales IndexedDB</small></div>
    </aside>
    {sidebar&&<div className="scrim" onClick={()=>setSidebar(false)}/>}
    <main className="main">
      <header className="topbar">
        <button className="icon-btn menu-btn" onClick={()=>setSidebar(v=>!v)}><Menu/></button>
        <button className="mobile-brand" onClick={()=>go('dashboard')} aria-label="Accueil DI'ART"><img className="mobile-logo logo-night" src="./logo-night.svg" alt=""/><img className="mobile-logo logo-day" src="./logo-day.svg" alt=""/><span>DI'ART</span></button>
        <div className="top-actions"><button className="icon-btn theme-toggle" title="Changer le thème" aria-label="Changer le thème" onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?<Sun/>:<Moon/>}</button><button className="primary global-create-btn" aria-label="Créer" title="Créer" onClick={()=>{setCreateMode('menu');setCreateName('')}}><Plus size={22}/></button></div>
      </header>
      <div className="content">
        {page==='dashboard'&&<Dashboard songs={songs} artists={artists} authors={authors} setlists={setlists} refreshSetlists={refreshSetlists} toast={toast} onOpen={s=>openSong(s,{page:'dashboard',label:'Accueil'})} onGo={go} onFav={fav}/>} 
        {page==='library'&&<LibraryPage songs={songs} setlists={setlists} refreshSetlists={refreshSetlists} toast={toast} searchRef={searchRef} onOpen={s=>openSong(s,{page:'library',label:'Bibliothèque'})} onFav={fav}/>} 
        {page==='artists'&&<ArtistsPage items={artistGroups} restoreY={artistsScrollY} onArtist={openArtist}/>} 
        {page==='artist'&&selectedArtist&&<ArtistDetailPage artist={selectedArtist} songs={songs.filter(s=>s.artist.trim()===selectedArtist)} setlists={setlists} refreshSetlists={refreshSetlists} toast={toast} onBack={()=>go('artists')} onOpen={s=>openSong(s,{page:'artist',label:selectedArtist})} onFav={fav} onAdd={()=>startNewSong(selectedArtist)}/>}
        {page==='authors'&&<AuthorsPage items={authorGroups} restoreY={authorsScrollY} onAuthor={openAuthor}/>}
        {page==='author'&&selectedAuthor&&<AuthorDetailPage author={selectedAuthor} songs={songs.filter(s=>s.authorComposer.trim()===selectedAuthor)} setlists={setlists} refreshSetlists={refreshSetlists} toast={toast} onBack={()=>go('authors')} onOpen={s=>openSong(s,{page:'author',label:selectedAuthor})} onFav={fav} onAdd={()=>startNewSong('',selectedAuthor)}/>} 
        {page==='favorites'&&<SimpleSongs title="Favoris" songs={favoriteSongs} setlists={setlists} refreshSetlists={refreshSetlists} toast={toast} onOpen={s=>openSong(s,{page:'favorites',label:'Favoris'})} onFav={fav}/>} 
        {page==='recent'&&<SimpleSongs title="Récents" songs={recentSongs} setlists={setlists} refreshSetlists={refreshSetlists} toast={toast} onOpen={s=>openSong(s,{page:'recent',label:'Récents'})} onFav={fav}/>} 
        {page==='setlists'&&<SetlistsPage songs={songs} setlists={setlists} refresh={refreshSetlists} toast={toast} onOpenDetail={openSetlist} onOpenSong={s=>openSong(s,{page:'setlists',label:'Setlists'})}/>} 
        {page==='setlist'&&currentSetlist&&<SetlistDetailPage list={currentSetlist} songs={songs} refresh={refreshSetlists} toast={toast} onBack={()=>go('setlists')} onOpenSong={s=>openSong(s,{page:'setlist',label:currentSetlist.name})}/>} 
        {page==='song'&&selected&&<SongDetail song={songs.find(s=>s.id===selected.id)||selected} backLabel={songBack.label} setlists={setlists} refreshSetlists={refreshSetlists} toast={toast} onBack={()=>go(songBack.page)} onEdit={()=>go('edit')} onFav={()=>void fav(songs.find(s=>s.id===selected.id)||selected)} onLyricsSave={async lyrics=>{const id=selected.id;const updatedAt=new Date().toISOString();patchLocal(id,{lyrics,updatedAt});setSelected(prev=>prev&&prev.id===id?{...prev,lyrics,updatedAt}:prev);await updateSong(id,{lyrics});toast('Paroles enregistrées.')}} onDelete={async()=>{const id=selected.id;await softDeleteSong(id);removeLocal(id);toast('Morceau placé dans la corbeille',{label:'Annuler',run:async()=>{await db.songs.update(id,{deletedAt:null});await refresh()}});go('library')}}/>}
        {(page==='new'||(page==='edit'&&selected))&&<SongForm initial={page==='edit'?selected:null} presetArtist={page==='new'?presetArtist:''} presetAuthor={page==='new'?presetAuthor:''} onCancel={()=>go(selected?'song':selectedArtist?'artist':selectedAuthor?'author':'library')} onSave={async draft=>{if(page==='edit'&&selected){await updateSong(selected.id,draft);const updatedAt=new Date().toISOString();const next={...selected,...draft,updatedAt};patchLocal(selected.id,{...draft,updatedAt});setSelected(next);toast('Morceau mis à jour');go('song')}else{const s=await createSong(draft);addLocal(s);setSelected(s);toast('Morceau ajouté');go('song')}}}/>}
        {page==='recueils'&&<RecueilsPage songs={songs} entryMode={recueilEntry} toast={toast} onImport={async draft=>{const s=await createSong(draft);addLocal(s)}} onComplete={async(id,patch)=>{await updateSong(id,patch);patchLocal(id,{...patch,updatedAt:new Date().toISOString()})}}/>}
        {page==='import'&&<ImportWizard songs={songs} refresh={refresh} toast={toast}/>}
        {page==='backup'&&<BackupPage songs={songs} refresh={refresh} toast={toast}/>}
        {page==='settings'&&<SettingsPage theme={theme} setTheme={setTheme} songs={songs} refresh={refresh} toast={toast} userEmail={userEmail} localCount={songs.filter(s=>s.source!=='demo').length} cloudStats={cloudStats} lastSyncAt={lastSyncAt} syncing={syncing} onSync={()=>void doSync()} onPull={()=>void forcePull()} onSignedIn={async()=>{const {data}=await supabase.auth.getUser();const u=data.user;setUserId(u?.id??'');setUserEmail(u?.email??'');if(u){setSyncing(true);try{await pullCloudToLocal(u.id);await syncAll(u.id);await Promise.all([refresh(),refreshSetlists(),refreshCloudStats(u.id)]);toast('Cloud DI’ART connecté et récupéré.')}finally{setSyncing(false)}}}}/>}
      </div>
    </main>
    <nav className="bottom-nav">
      <button onClick={()=>go('library')}><Library/><span>Bibliothèque</span></button>
      <button onClick={()=>go('artists')}><UsersRound/><span>Artistes</span></button>
      <button onClick={()=>{go('library');setTimeout(()=>searchRef.current?.focus(),50)}}><Search/><span>Recherche</span></button>
      <button onClick={()=>go('favorites')}><Heart/><span>Favoris</span></button>
      <button onClick={()=>go('setlists')}><ListMusic/><span>Setlists</span></button>
    </nav>
    {createMode==='menu'&&<Modal title="Créer" onClose={()=>setCreateMode(null)}><div className="create-choice-grid"><button onClick={()=>startNewSong()}><Music2/><span><b>Nouveau morceau</b><small>Créer une nouvelle fiche musicale</small></span></button><button onClick={()=>{setCreateMode('artist');setCreateName('')}}><UsersRound/><span><b>Nouvel artiste</b><small>Créer son premier morceau</small></span></button><button onClick={()=>{setCreateMode('setlist');setCreateName('')}}><ListMusic/><span><b>Nouvelle setlist</b><small>Créer une liste vide</small></span></button><button onClick={()=>{setCreateMode(null);go('import')}}><Import/><span><b>Nouvel import</b><small>Importer Excel ou CSV</small></span></button><button onClick={()=>{setCreateMode(null);setRecueilEntry('tononkira');setPage('recueils')}}><BookMarked/><span><b>Importer depuis Tononkira</b><small>Rechercher titre/artiste puis importer les paroles directement</small></span></button></div></Modal>}
    {createMode==='artist'&&<Modal title="Nouvel artiste" onClose={()=>setCreateMode(null)}><div className="create-name-form"><label>Nom de l’artiste<input autoFocus value={createName} onChange={e=>setCreateName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')createNamedArtist()}}/></label><div className="modal-actions"><button className="secondary" onClick={()=>setCreateMode('menu')}>Retour</button><button className="primary" disabled={!createName.trim()} onClick={createNamedArtist}><Plus/>Continuer</button></div></div></Modal>}
    {createMode==='setlist'&&<Modal title="Nouvelle setlist" onClose={()=>setCreateMode(null)}><div className="create-name-form"><label>Nom de la setlist<input autoFocus value={createName} onChange={e=>setCreateName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void createNamedSetlist()}}/></label><div className="modal-actions"><button className="secondary" onClick={()=>setCreateMode('menu')}>Retour</button><button className="primary" disabled={!createName.trim()} onClick={()=>void createNamedSetlist()}><Plus/>Créer</button></div></div></Modal>}
    <Toasts items={toasts}/>
  </div>
}

function Dashboard({songs,artists,authors,setlists,refreshSetlists,toast,onOpen,onGo,onFav}:{songs:Song[];artists:number;authors:number;setlists:Setlist[];refreshSetlists:()=>Promise<void>;toast:(s:string)=>void;onOpen:(s:Song)=>void;onGo:(p:Page)=>void;onFav:(s:Song)=>void}) {
  const [q,setQ]=useState('')
  const deferredQ=useDeferredValue(q)
  const results=useMemo(()=>deferredQ.trim()?songs.filter(s=>searchSong(s,deferredQ)).slice(0,12):[],[songs,deferredQ])
  const recent=[...songs].sort((a,b)=>(b.lastViewedAt||'').localeCompare(a.lastViewedAt||'')).filter(s=>s.lastViewedAt).slice(0,3)
  const added=[...songs].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,3)
  return <>
    <div className="page-head"><div><p className="eyebrow">Répertoire personnel</p><h1>Votre musique, immédiatement.</h1><p>Retrouvez tonalité, BPM et informations utiles en quelques secondes.</p></div></div>
    <div className="home-search"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Rechercher un titre, artiste, tonalité, BPM…"/>{q&&<button className="icon-btn" aria-label="Effacer la recherche" onClick={()=>setQ('')}><X/></button>}</div>
    {q.trim()&&<section className="panel home-search-results"><div className="panel-title-row"><h2>Résultats</h2><span>{results.length} affiché(s)</span></div>{results.length?<div className="quick-results">{results.map(s=><div className="quick-result" key={s.id}><button className="quick-result-main" onClick={()=>onOpen(s)}><span><b>{s.title}</b><small>{s.artist||'Artiste inconnu'}</small></span><span className="quick-meta">{s.personalKey||s.originalKey||'—'}{s.bpm!==null?` · ${s.bpm} BPM`:''}</span></button><QuickSetlistAdd song={s} setlists={setlists} refresh={refreshSetlists} toast={toast}/></div>)}</div>:<Empty text="Aucun résultat."/>}</section>}
    <div className="metrics"><Metric label="Morceaux" value={songs.length}/><Metric label="Artistes" value={artists}/><Metric label="Auteurs" value={authors}/><Metric label="Favoris" value={songs.filter(s=>s.favorite).length}/></div>
    <div className="home-recent-grid"><section className="panel compact-home-panel"><h2>Récemment consultés</h2>{recent.length?recent.map(s=><SongRow key={s.id} song={s} onOpen={()=>onOpen(s)} onFav={()=>onFav(s)} action={<QuickSetlistAdd song={s} setlists={setlists} refresh={refreshSetlists} toast={toast}/>}/>):<Empty text="Aucun morceau consulté."/>}</section><section className="panel compact-home-panel"><h2>Ajouts récents</h2>{added.map(s=><SongRow key={s.id} song={s} onOpen={()=>onOpen(s)} onFav={()=>onFav(s)} action={<QuickSetlistAdd song={s} setlists={setlists} refresh={refreshSetlists} toast={toast}/>}/>)}</section></div>
    <MetronomeCard initialBpm={96}/>
  </>
}

function LibraryPage({songs,setlists,refreshSetlists,toast,searchRef,onOpen,onFav}:{songs:Song[];setlists:Setlist[];refreshSetlists:()=>Promise<void>;toast:(s:string)=>void;searchRef:RefObject<HTMLInputElement>;onOpen:(s:Song)=>void;onFav:(s:Song)=>void}) {
  const [q,setQ]=useState(''),[key,setKey]=useState(''),[sig,setSig]=useState(''),[style,setStyle]=useState(''),[favOnly,setFavOnly]=useState(false),[min,setMin]=useState(''),[max,setMax]=useState(''),[sort,setSort]=useState('title'),[filters,setFilters]=useState(false)
  const deferredQ=useDeferredValue(q)
  const keys=[...new Set(songs.map(s=>s.personalKey||s.originalKey).filter(Boolean))].sort()
  const sigs=[...new Set(songs.map(s=>s.timeSignature).filter(Boolean))].sort()
  const styles=[...new Set(songs.map(s=>s.style).filter(Boolean))].sort()
  const result=useMemo(()=>songs.filter(s=>searchSong(s,deferredQ))
    .filter(s=>!key||(s.personalKey||s.originalKey)===key).filter(s=>!sig||s.timeSignature===sig)
    .filter(s=>!style||s.style===style).filter(s=>!favOnly||s.favorite)
    .filter(s=>!min||(s.bpm!==null&&s.bpm>=Number(min))).filter(s=>!max||(s.bpm!==null&&s.bpm<=Number(max)))
    .sort((a,b)=>sort==='artist'?a.artist.localeCompare(b.artist):sort==='bpm'?(a.bpm??999)-(b.bpm??999):sort==='updated'?b.updatedAt.localeCompare(a.updatedAt):a.title.localeCompare(b.title)),
  [songs,deferredQ,key,sig,style,favOnly,min,max,sort])
  return <>
    <div className="page-head compact"><div><p className="eyebrow">Bibliothèque</p><h1>{songs.length} morceaux</h1></div></div>
    <div className="toolbar"><div className="searchbox"><Search/><input ref={searchRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="Titre, artiste, auteur, tonalité, BPM, tags…"/>{q&&<button type="button" className="search-clear" aria-label="Effacer la recherche" onClick={()=>setQ('')}><X/></button>}</div><button className="secondary" onClick={()=>setFilters(v=>!v)}><Filter/>Filtres</button><label className="select-wrap"><ArrowUpDown/><select value={sort} onChange={e=>setSort(e.target.value)}><option value="title">Titre A–Z</option><option value="artist">Artiste A–Z</option><option value="bpm">BPM</option><option value="updated">Modifiés récemment</option></select></label></div>
    {filters&&<div className="filters"><select value={key} onChange={e=>setKey(e.target.value)}><option value="">Toutes tonalités</option>{keys.map(x=><option key={x}>{x}</option>)}</select><input value={min} onChange={e=>setMin(e.target.value)} placeholder="BPM min"/><input value={max} onChange={e=>setMax(e.target.value)} placeholder="BPM max"/><select value={sig} onChange={e=>setSig(e.target.value)}><option value="">Toutes signatures</option>{sigs.map(x=><option key={x}>{x}</option>)}</select><select value={style} onChange={e=>setStyle(e.target.value)}><option value="">Tous styles</option>{styles.map(x=><option key={x}>{x}</option>)}</select><label><input type="checkbox" checked={favOnly} onChange={e=>setFavOnly(e.target.checked)}/> Favoris</label></div>}
    <p className="result-count">{result.length} résultat{result.length>1?'s':''}</p><div className="songs-list">{result.length?result.map(s=><SongRow key={s.id} song={s} onOpen={()=>onOpen(s)} onFav={()=>onFav(s)} action={<QuickSetlistAdd song={s} setlists={setlists} refresh={refreshSetlists} toast={toast}/>}/>):<Empty text="Aucun résultat."/>}</div>
  </>
}


function QuickSetlistAdd({song,setlists,refresh,toast}:{song:Song;setlists:Setlist[];refresh:()=>Promise<void>;toast:(s:string)=>void}) {
  const [open,setOpen]=useState(false)
  const [pendingId,setPendingId]=useState('')
  const [name,setName]=useState('')
  const [busy,setBusy]=useState(false)
  const pending=setlists.find(s=>s.id===pendingId)
  const close=()=>{if(busy)return;setOpen(false);setPendingId('');setName('')}
  const confirmAdd=()=>{
    if(!pending||busy)return
    if(pending.songIds.includes(song.id)){toast(`${song.title} est déjà dans ${pending.name}.`);close();return}
    const ids=[...pending.songIds,song.id]
    setBusy(true)
    setOpen(false)
    setPendingId('')
    void updateSetlist(pending.id,{songIds:ids}).then(()=>{void refresh();toast(`${song.title} ajouté à ${pending.name}.`)}).catch(()=>toast('Ajout à la setlist impossible.')).finally(()=>setBusy(false))
  }
  const createAndAdd=()=>{
    const clean=name.trim()
    if(!clean||busy)return
    setBusy(true)
    setOpen(false)
    void createSetlist(clean).then(async list=>{await updateSetlist(list.id,{songIds:[song.id]});void refresh();toast(`Setlist « ${clean} » créée avec ${song.title}.`)}).catch(()=>toast('Création de la setlist impossible.')).finally(()=>{setBusy(false);setName('')})
  }
  return <div className="quick-setlist-add" onClick={e=>e.stopPropagation()}><button className="setlist-plus-btn" aria-label="Ajouter à une setlist" title="Ajouter à une setlist" onClick={()=>{setPendingId('');setOpen(true)}}><ListPlus/></button>{open&&<Modal title="Ajouter à une setlist" onClose={close}><div className="setlist-choice-list">{setlists.length?setlists.map(list=>{const added=list.songIds.includes(song.id);const chosen=pendingId===list.id;return <button key={list.id} className={`setlist-choice ${added?'already-added':''} ${chosen?'selected':''}`} disabled={added} onClick={()=>setPendingId(list.id)}><ListMusic/><span><b>{list.name}</b><small>{added?'Déjà ajouté':chosen?'Sélectionnée — confirmer ci-dessous':`${list.songIds.length} morceau${list.songIds.length>1?'x':''}`}</small></span>{added?<Check/>:chosen?<ChevronRight/>:null}</button>}):<p className="muted-copy">Aucune setlist existante.</p>}</div>{pending&&<div className="setlist-confirm-add"><span>Ajouter <b>{song.title}</b> à <b>{pending.name}</b> ?</span><button className="primary" disabled={busy} onClick={confirmAdd}><Check/>Confirmer l’ajout</button></div>}<div className="setlist-modal-create"><label>Ou créer une nouvelle setlist<input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')createAndAdd()}} placeholder="Nom de la setlist"/></label><button className="secondary" disabled={!name.trim()||busy} onClick={createAndAdd}><Plus/>Créer et ajouter</button></div></Modal>}</div>
}

function groupPeople(songs:Song[],field:'artist'|'authorComposer') {
  const map=new Map<string,Song[]>()
  songs.forEach(s=>{const n=s[field].trim();if(n)map.set(n,[...(map.get(n)||[]),s])})
  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]))
}

function ArtistsPage({items,restoreY,onArtist}:{items:[string,Song[]][];restoreY:number;onArtist:(name:string)=>void}) {
  const [q,setQ]=useState('')
  const deferredQ=useDeferredValue(q)
  const filtered=useMemo(()=>items.filter(([name,list])=>!deferredQ.trim()||name.toLowerCase().includes(deferredQ.toLowerCase())||list.some(s=>searchSong(s,deferredQ))),[items,deferredQ])
  useEffect(()=>{const id=requestAnimationFrame(()=>window.scrollTo({top:restoreY,behavior:'auto'}));return()=>cancelAnimationFrame(id)},[])
  return <><div className="page-head compact"><div><p className="eyebrow">Répertoire</p><h1>Artistes</h1><p>{filtered.length} artiste{filtered.length>1?'s':''}</p></div></div><div className="artist-search searchbox"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Rechercher un artiste ou un morceau…"/>{q&&<button type="button" className="search-clear" aria-label="Effacer la recherche" onClick={()=>setQ('')}><X/></button>}</div><div className="people-grid">{filtered.map(([name,list])=><div className="person-card" key={name}><button onClick={()=>onArtist(name)}><span className="avatar">{name[0]}</span><span><b>{name}</b><small>{list.length} morceau{list.length>1?'x':''}</small></span><ChevronRight/></button></div>)}</div></>
}

function ArtistDetailPage({artist,songs,setlists,refreshSetlists,toast,onBack,onOpen,onFav,onAdd}:{artist:string;songs:Song[];setlists:Setlist[];refreshSetlists:()=>Promise<void>;toast:(s:string)=>void;onBack:()=>void;onOpen:(s:Song)=>void;onFav:(s:Song)=>void;onAdd:()=>void}) {
  const [q,setQ]=useState('')
  const deferredQ=useDeferredValue(q)
  const filtered=useMemo(()=>songs.filter(s=>searchSong(s,deferredQ)),[songs,deferredQ])
  return <><div className="detail-nav artist-detail-nav"><button className="ghost" onClick={onBack}><ChevronLeft/>Artistes</button><button className="icon-btn artist-add-song" aria-label="Ajouter un morceau pour cet artiste" title="Ajouter un morceau" onClick={onAdd}><Plus/></button></div><div className="page-head compact artist-header"><div><p className="eyebrow">Artiste</p><h1>{artist}</h1><p>{songs.length} morceau{songs.length>1?'x':''}</p></div></div>{songs.length>8&&<div className="artist-search searchbox"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={`Rechercher dans ${artist}…`}/>{q&&<button type="button" className="search-clear" aria-label="Effacer la recherche" onClick={()=>setQ('')}><X/></button>}</div>}<div className="songs-list artist-song-list">{filtered.length?filtered.map(s=><SongRow key={s.id} song={s} onOpen={()=>onOpen(s)} onFav={()=>onFav(s)} action={<QuickSetlistAdd song={s} setlists={setlists} refresh={refreshSetlists} toast={toast}/>}/>):<Empty text="Aucun morceau."/>}</div></>
}

function AuthorsPage({items,restoreY,onAuthor}:{items:[string,Song[]][];restoreY:number;onAuthor:(name:string)=>void}) {
  const [q,setQ]=useState('')
  const deferredQ=useDeferredValue(q)
  const filtered=useMemo(()=>items.filter(([name,list])=>!deferredQ.trim()||name.toLowerCase().includes(deferredQ.toLowerCase())||list.some(s=>searchSong(s,deferredQ))),[items,deferredQ])
  useEffect(()=>{const id=requestAnimationFrame(()=>window.scrollTo({top:restoreY,behavior:'auto'}));return()=>cancelAnimationFrame(id)},[])
  return <><div className="page-head compact"><div><p className="eyebrow">Répertoire</p><h1>Auteurs / Compositeurs</h1><p>{filtered.length} auteur{filtered.length>1?'s':''}</p></div></div><div className="artist-search searchbox"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Rechercher un auteur ou un morceau…"/>{q&&<button type="button" className="search-clear" aria-label="Effacer la recherche" onClick={()=>setQ('')}><X/></button>}</div><div className="people-grid">{filtered.map(([name,list])=><div className="person-card" key={name}><button onClick={()=>onAuthor(name)}><span className="avatar">{name[0]}</span><span><b>{name}</b><small>{list.length} morceau{list.length>1?'x':''}</small></span><ChevronRight/></button></div>)}</div></>
}

function AuthorDetailPage({author,songs,setlists,refreshSetlists,toast,onBack,onOpen,onFav,onAdd}:{author:string;songs:Song[];setlists:Setlist[];refreshSetlists:()=>Promise<void>;toast:(s:string)=>void;onBack:()=>void;onOpen:(s:Song)=>void;onFav:(s:Song)=>void;onAdd:()=>void}) {
  const [q,setQ]=useState('')
  const deferredQ=useDeferredValue(q)
  const filtered=useMemo(()=>songs.filter(s=>searchSong(s,deferredQ)),[songs,deferredQ])
  return <><div className="detail-nav artist-detail-nav"><button className="ghost" onClick={onBack}><ChevronLeft/>Auteurs</button><button className="icon-btn artist-add-song" aria-label="Ajouter un morceau pour cet auteur" title="Ajouter un morceau" onClick={onAdd}><Plus/></button></div><div className="page-head compact artist-header"><div><p className="eyebrow">Auteur / Compositeur</p><h1>{author}</h1><p>{songs.length} morceau{songs.length>1?'x':''}</p></div></div>{songs.length>8&&<div className="artist-search searchbox"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={`Rechercher dans ${author}…`}/>{q&&<button type="button" className="search-clear" aria-label="Effacer la recherche" onClick={()=>setQ('')}><X/></button>}</div>}<div className="songs-list artist-song-list">{filtered.length?filtered.map(s=><div className="library-result-wrap" key={s.id}><SongRow song={s} onOpen={()=>onOpen(s)} onFav={()=>onFav(s)}/><div className="library-setlist-action"><QuickSetlistAdd song={s} setlists={setlists} refresh={refreshSetlists} toast={toast}/></div></div>):<Empty text="Aucun morceau."/>}</div></>
}

function PeoplePage({title,items,onOpen}:{title:string;items:[string,Song[]][];onOpen:(s:Song)=>void}) {
  const [open,setOpen]=useState<string|null>(null)
  const [q,setQ]=useState('')
  const deferredQ=useDeferredValue(q)
  const filtered=useMemo(()=>items.filter(([name,list])=>!deferredQ.trim()||name.toLowerCase().includes(deferredQ.toLowerCase())||list.some(s=>searchSong(s,deferredQ))),[items,deferredQ])
  return <><div className="page-head compact"><div><p className="eyebrow">Répertoire</p><h1>{title}</h1><p>{filtered.length} entrée{filtered.length>1?'s':''}</p></div></div><div className="artist-search searchbox"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={title.startsWith('Artistes')?'Rechercher un artiste ou un morceau…':'Rechercher…'}/>{q&&<button type="button" className="search-clear" aria-label="Effacer la recherche" onClick={()=>setQ('')}><X/></button>}</div><div className="people-grid">{filtered.map(([name,list])=><div className="person-card" key={name}><button onClick={()=>setOpen(open===name?null:name)}><span className="avatar">{name[0]}</span><span><b>{name}</b><small>{list.length} morceau{list.length>1?'x':''}</small></span><ChevronRight/></button>{open===name&&<div>{list.map(s=><button className="person-song" key={s.id} onClick={()=>onOpen(s)}>{s.title}<span>{s.personalKey||s.originalKey||'—'} · {s.bpm??'—'} BPM</span></button>)}</div>}</div>)}</div></>
}

function SimpleSongs({title,songs,setlists,refreshSetlists,toast,onOpen,onFav}:{title:string;songs:Song[];setlists:Setlist[];refreshSetlists:()=>Promise<void>;toast:(s:string)=>void;onOpen:(s:Song)=>void;onFav:(s:Song)=>void}) {
  return <><div className="page-head compact"><div><p className="eyebrow">Répertoire</p><h1>{title}</h1><p>{songs.length} morceau{songs.length>1?'x':''}</p></div></div><div className="songs-list">{songs.length?songs.map(s=><SongRow key={s.id} song={s} onOpen={()=>onOpen(s)} onFav={()=>onFav(s)} action={<QuickSetlistAdd song={s} setlists={setlists} refresh={refreshSetlists} toast={toast}/>}/>):<Empty text="Rien à afficher."/>}</div></>
}

function SongDetail({song,backLabel,setlists,refreshSetlists,toast,onBack,onEdit,onFav,onLyricsSave,onDelete}:{song:Song;backLabel:string;setlists:Setlist[];refreshSetlists:()=>Promise<void>;toast:(s:string)=>void;onBack:()=>void;onEdit:()=>void;onFav:()=>void;onLyricsSave:(lyrics:string)=>Promise<void>;onDelete:()=>void}) {
  const [editingLyrics,setEditingLyrics]=useState(false)
  const [savingLyrics,setSavingLyrics]=useState(false)
  const [lyricsDraft,setLyricsDraft]=useState(song.lyrics??'')
  const [confirm,setConfirm]=useState(false)
  const [showTranspose,setShowTranspose]=useState(false)
  const [transpose,setTranspose]=useState(0)
  const baseKey=song.personalKey||song.originalKey
  const workingKey=baseKey ? transposeKey(baseKey,transpose) : ''
  const workingChords=transposeChordText(song.chords??'',transpose)
  const hasHeroMetrics=Boolean(baseKey||song.bpm!==null||song.timeSignature)
  const hasInfo=Boolean(song.originalKey||song.personalKey||song.capo!==null&&song.capo!==undefined||song.durationSeconds!==null||song.tags.length)
  const saveLyrics=()=>{if(savingLyrics)return;const next=lyricsDraft;setEditingLyrics(false);setSavingLyrics(true);void onLyricsSave(next).finally(()=>setSavingLyrics(false))}
  return <><div className="detail-nav"><button className="ghost contextual-back" onClick={onBack}><ChevronLeft/>{backLabel}</button><div className="detail-icon-actions"><QuickSetlistAdd song={song} setlists={setlists} refresh={refreshSetlists} toast={toast}/><button className="bare-action" aria-label="Favori" title="Favori" onClick={onFav}><Heart fill={song.favorite?'currentColor':'none'}/></button>{baseKey&&<button className={`bare-action ${showTranspose?'active':''}`} aria-label="Transposition" title="Transposition" onClick={()=>setShowTranspose(v=>!v)}><ArrowUpDown/></button>}<button className="bare-action" aria-label="Modifier" title="Modifier" onClick={onEdit}><Pencil/></button><button className="bare-action danger-icon" aria-label="Supprimer" title="Supprimer" onClick={()=>setConfirm(true)}><Trash2/></button></div></div>
  <section className="song-hero"><div><p className="eyebrow">{song.style||'Morceau'}{song.source==='demo'?' · DEMO':''}</p><h1>{song.title}</h1><p>{song.artist||'Artiste inconnu'}{song.authorComposer?` · ${song.authorComposer}`:''}</p></div>{hasHeroMetrics&&<div className="key-bpm">{baseKey&&<div><span>Tonalité</span><strong>{workingKey}</strong>{transpose!==0&&<small>{formatSemitoneOffset(transpose)}</small>}</div>}{song.bpm!==null&&<div><span>BPM</span><strong>{song.bpm}</strong></div>}{song.timeSignature&&<div><span>Signature</span><strong>{song.timeSignature}</strong></div>}</div>}</section>
  {showTranspose&&baseKey&&<section className="transpose-bar optional-tool" aria-label="Transposition"><div><span className="eyebrow">Transposition</span><b>{baseKey} → {workingKey}</b></div><div className="transpose-controls"><button className="secondary transpose-btn" disabled={transpose<=-11} onClick={()=>setTranspose(v=>Math.max(-11,v-1))}><Minus/>½ ton</button><button className="ghost transpose-reset" disabled={transpose===0} onClick={()=>setTranspose(0)}><RotateCcw/>0</button><button className="secondary transpose-btn" disabled={transpose>=11} onClick={()=>setTranspose(v=>Math.min(11,v+1))}><Plus/>½ ton</button></div></section>}
  <div className="musician-grid">
    {hasInfo&&<section className="panel info-list"><h2>Informations musicales</h2>{song.originalKey&&<div><span>Tonalité originale</span><b>{song.originalKey}</b></div>}{song.personalKey&&<div><span>Tonalité habituelle</span><b>{song.personalKey}</b></div>}{song.capo!==null&&song.capo!==undefined&&<div><span>Capo</span><b>{song.capo}</b></div>}{song.durationSeconds!==null&&<div><span>Durée</span><b>{formatDuration(song.durationSeconds)}</b></div>}{song.tags.length>0&&<div><span>Tags</span><b>{song.tags.join(', ')}</b></div>}</section>}
    {song.structure&&<section className="panel performance-panel"><h2>Structure</h2><p className="performance-text">{song.structure}</p></section>}
    {song.chords&&<section className="panel performance-panel chords-panel"><div className="panel-title-row"><h2>Accords / repères</h2>{transpose!==0&&<span className="transpose-chip">{formatSemitoneOffset(transpose)}</span>}</div><pre className="chord-sheet">{workingChords}</pre></section>}
    {song.instrumentNotes&&<section className="panel performance-panel"><h2>Notes instrumentales</h2><p className="performance-text">{song.instrumentNotes}</p></section>}
    <section className={`panel lyrics-panel ${song.lyrics?'':'lyrics-empty'}`}><div className="panel-title-row"><h2>Paroles</h2><button className="bare-action lyrics-inline-action" aria-label={song.lyrics?'Modifier les paroles':'Ajouter des paroles'} title={song.lyrics?'Modifier les paroles':'Ajouter des paroles'} onClick={()=>{setLyricsDraft(song.lyrics??'');setEditingLyrics(true)}}><Pencil/></button></div>{song.lyrics?<pre className="lyrics-text">{song.lyrics}</pre>:<button className="lyrics-add-empty" onClick={()=>{setLyricsDraft('');setEditingLyrics(true)}}><Plus/>Ajouter des paroles</button>}</section>
    <MetronomeCard initialBpm={song.bpm??96} signature={song.timeSignature}/>
    {(song.notes||song.referenceUrl)&&<section className="panel notes-panel"><h2>Notes générales</h2>{song.notes&&<p className="notes">{song.notes}</p>}{song.referenceUrl&&<a href={song.referenceUrl} target="_blank" rel="noreferrer">Ouvrir le lien de référence</a>}</section>}
  </div>
  {editingLyrics&&<Modal className="lyrics-modal" title="Paroles du morceau" onClose={()=>{if(!savingLyrics)setEditingLyrics(false)}}><form className="lyrics-modal-form" onSubmit={e=>{e.preventDefault();saveLyrics()}}><textarea autoFocus className="lyrics-editor" rows={18} value={lyricsDraft} onChange={e=>setLyricsDraft(e.target.value)} placeholder="Collez ou saisissez les paroles ici…"/><div className="modal-actions"><button type="button" className="secondary" disabled={savingLyrics} onClick={()=>setEditingLyrics(false)}>Annuler</button><button type="submit" className="primary" disabled={savingLyrics}><Save/>{savingLyrics?'Enregistrement…':'Enregistrer'}</button></div></form></Modal>}
  {confirm&&<Modal title="Supprimer ce morceau ?" onClose={()=>setConfirm(false)}><p>Le morceau sera masqué de la bibliothèque et pourra être restauré via l’action Annuler.</p><div className="modal-actions"><button className="secondary" onClick={()=>setConfirm(false)}>Annuler</button><button className="danger" onClick={onDelete}><Trash2/>Supprimer</button></div></Modal>}</>
}

const STRUCTURE_PARTS=['Prélude','Couplet','Refrain','Bridge','Interlude','Postlude'] as const

function parseStructureSequence(value:string):string[]{
  return value.split(/[·\n>]+/).map(x=>x.trim()).filter(Boolean)
}
function numberedStructureLabels(parts:string[]):string[]{
  const totals=new Map<string,number>()
  for(const part of parts)totals.set(part,(totals.get(part)||0)+1)
  const seen=new Map<string,number>()
  return parts.map(part=>{
    const count=(seen.get(part)||0)+1
    seen.set(part,count)
    return (totals.get(part)||0)>1 ? part+' '+count : part
  })
}
function generatedChordTemplate(parts:string[]):string{
  return numberedStructureLabels(parts).map(label=>'['+label+']\n').join('\n').trimEnd()
}
function looksGeneratedChordTemplate(value:string):boolean{
  const lines=value.split('\n').map(x=>x.trim()).filter(Boolean)
  return lines.length===0 || lines.every(line=>/^\[[^\]]+\]$/.test(line))
}

function SongForm({initial,presetArtist='',presetAuthor='',onCancel,onSave}:{initial:Song|null;presetArtist?:string;presetAuthor?:string;onCancel:()=>void;onSave:(d:SongDraft)=>Promise<void>}) {
  const [d,setD]=useState<SongDraft>(()=>initial?{...emptySongDraft(),title:initial.title,artist:initial.artist,authorComposer:initial.authorComposer,originalKey:initial.originalKey,personalKey:initial.personalKey,bpm:initial.bpm,timeSignature:initial.timeSignature,style:initial.style,durationSeconds:initial.durationSeconds,tags:initial.tags,notes:initial.notes,referenceUrl:initial.referenceUrl,capo:initial.capo??null,structure:initial.structure??'',chords:initial.chords??'',instrumentNotes:initial.instrumentNotes??'',lyrics:initial.lyrics??'',favorite:initial.favorite,source:initial.source}:{...emptySongDraft(),artist:presetArtist,authorComposer:presetAuthor})
  const [duration,setDuration]=useState(initial?formatDuration(initial.durationSeconds)==='—'?'':formatDuration(initial.durationSeconds):'')
  const [saving,setSaving]=useState(false)
  const set=<K extends keyof SongDraft>(k:K,v:SongDraft[K])=>setD(x=>({...x,[k]:v}))
  const sequence=useMemo(()=>parseStructureSequence(d.structure??''),[d.structure])
  const numberedSequence=useMemo(()=>numberedStructureLabels(sequence),[sequence])

  const applyStructure=(next:string[])=>{
    setD(prev=>{
      const shouldGenerate=!prev.chords?.trim()||looksGeneratedChordTemplate(prev.chords??'')
      return {...prev,structure:next.join(' · '),chords:shouldGenerate?generatedChordTemplate(next):prev.chords}
    })
  }
  const addStructure=(part:string)=>applyStructure([...sequence,part])
  const removeStructure=(index:number)=>applyStructure(sequence.filter((_,i)=>i!==index))
  const moveStructure=(index:number,delta:number)=>{
    const next=[...sequence]
    const target=index+delta
    if(target<0||target>=next.length)return
    const [item]=next.splice(index,1)
    next.splice(target,0,item)
    applyStructure(next)
  }
  const submit=async(e:FormEvent)=>{e.preventDefault();if(!d.title.trim())return;setSaving(true);await onSave({...d,title:d.title.trim(),originalKey:normalizeKey(d.originalKey),personalKey:normalizeKey(d.personalKey),durationSeconds:parseDuration(duration)});setSaving(false)}

  return <><div className="page-head compact"><div><p className="eyebrow">{initial?'Modification':'Nouveau morceau'}</p><h1>{initial?initial.title:'Ajouter un morceau'}</h1></div></div><form className="panel form-grid" onSubmit={e=>void submit(e)}><label className="span2">Titre *<input required value={d.title} onChange={e=>set('title',e.target.value)} autoFocus/></label><label>Artiste<input value={d.artist} onChange={e=>set('artist',e.target.value)}/></label><label>Auteur / Compositeur<input value={d.authorComposer} onChange={e=>set('authorComposer',e.target.value)}/></label><label>Tonalité originale<input value={d.originalKey} onChange={e=>set('originalKey',e.target.value)}/></label><label>Tonalité habituelle<input value={d.personalKey} onChange={e=>set('personalKey',e.target.value)}/></label><label>BPM<input inputMode="numeric" value={d.bpm??''} onChange={e=>set('bpm',parseBpm(e.target.value))}/></label><label>Signature<input value={d.timeSignature} onChange={e=>set('timeSignature',e.target.value)} placeholder="4/4"/></label><label>Style<input value={d.style} onChange={e=>set('style',e.target.value)}/></label><label>Durée mm:ss<input value={duration} onChange={e=>setDuration(e.target.value)} placeholder="4:30"/></label><label>Capo<input inputMode="numeric" type="number" min="0" max="12" value={d.capo??''} onChange={e=>set('capo',e.target.value===''?null:Math.max(0,Math.min(12,Number(e.target.value))))}/></label><label>Tags<input value={d.tags.join(', ')} onChange={e=>set('tags',e.target.value.split(/[;,]/).map(x=>x.trim()).filter(Boolean))}/></label><div className="form-section-title span2"><span>Préparation musicale</span><small>Informations utiles en répétition et sur scène</small></div>

  <div className="structure-builder span2"><div className="structure-builder-head"><div><b>Structure du morceau</b><small>Sélectionnez les sections dans l’ordre réel. Une même section peut être ajoutée plusieurs fois.</small></div>{sequence.length>0&&<button type="button" className="bare-action structure-clear" onClick={()=>applyStructure([])}>Effacer</button>}</div><div className="structure-options">{STRUCTURE_PARTS.map(part=><button type="button" key={part} onClick={()=>addStructure(part)}><Plus/>{part}</button>)}</div>{sequence.length>0?<div className="structure-sequence">{numberedSequence.map((label,index)=><div className="structure-chip" key={label+'-'+index}><span>{index+1}</span><b>{label}</b><button type="button" disabled={index===0} title="Déplacer avant" onClick={()=>moveStructure(index,-1)}><ChevronUp/></button><button type="button" disabled={index===sequence.length-1} title="Déplacer après" onClick={()=>moveStructure(index,1)}><ChevronDown/></button><button type="button" title="Retirer" onClick={()=>removeStructure(index)}><X/></button></div>)}</div>:<p className="structure-empty">Aucune structure sélectionnée.</p>}</div>

  <label className="span2">Structure<textarea rows={3} value={d.structure??''} onChange={e=>set('structure',e.target.value)} placeholder="Prélude · Couplet · Refrain · Couplet · Bridge · Refrain · Postlude"/></label>
  <label className="span2 chord-label"><span className="field-label-row"><span>Accords / repères</span><button type="button" className="secondary compact-field-action" disabled={!sequence.length} onClick={()=>set('chords',generatedChordTemplate(sequence))}>Générer les lignes</button></span><textarea rows={Math.max(6,sequence.length*2)} className="chord-input" value={d.chords??''} onChange={e=>set('chords',e.target.value)} placeholder="[Prélude]&#10;C  G  Am  F&#10;&#10;[Couplet]&#10;C  G/B  Am7  F"/></label>
  <label className="span2">Notes instrumentales<textarea rows={4} value={d.instrumentNotes??''} onChange={e=>set('instrumentNotes',e.target.value)} placeholder="Sax après refrain 2, basse légère au couplet, pad au pont…"/></label><label className="span2">Paroles<textarea rows={8} value={d.lyrics??''} onChange={e=>set('lyrics',e.target.value)} placeholder="Paroles du morceau…"/></label><label className="span2">Lien de référence<input value={d.referenceUrl} onChange={e=>set('referenceUrl',e.target.value)}/></label><label className="span2">Notes générales<textarea rows={5} value={d.notes} onChange={e=>set('notes',e.target.value)}/></label><div className="form-actions span2"><button type="button" className="secondary" onClick={onCancel}>Annuler</button><button className="primary" disabled={saving}><Save/>{saving?'Enregistrement…':'Enregistrer'}</button></div></form></>
}

const fieldOptions:[ImportField,string][]=[['title','Titre *'],['artist','Artiste'],['authorComposer','Auteur / Compositeur'],['originalKey','Tonalité originale'],['personalKey','Tonalité personnelle'],['bpm','BPM'],['timeSignature','Signature rythmique'],['style','Style'],['duration','Durée'],['tags','Tags'],['notes','Notes'],['referenceUrl','Lien de référence'],['capo','Capo'],['structure','Structure'],['chords','Accords'],['instrumentNotes','Notes instrumentales'],['lyrics','Paroles']]


type SongCompletion = {patch:Partial<SongDraft>;labels:string[]}

function songCompletion(existing:Song,incoming:SongDraft):SongCompletion{
  const patch:Partial<SongDraft>={}
  const labels:string[]=[]
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
  addString('chords','Accords / repères')
  addString('instrumentNotes','Notes instrumentales')
  addString('lyrics','Paroles')
  addString('referenceUrl','Lien source')
  if(existing.bpm===null&&incoming.bpm!==null){patch.bpm=incoming.bpm;labels.push('BPM')}
  if(existing.durationSeconds===null&&incoming.durationSeconds!==null){patch.durationSeconds=incoming.durationSeconds;labels.push('Durée')}
  if((existing.capo===null||existing.capo===undefined)&&incoming.capo!==null&&incoming.capo!==undefined){patch.capo=incoming.capo;labels.push('Capo')}
  const mergedTags=[...new Set([...(existing.tags??[]),...(incoming.tags??[])].map(x=>x.trim()).filter(Boolean))]
  if(mergedTags.length>(existing.tags??[]).length){patch.tags=mergedTags;labels.push('Tags')}
  return {patch,labels}
}

function reviewDraftFromExternal(full:{title?:string;artist?:string;sourceUrl?:string;source?:string;structure?:string;chords?:string},fallback:{title:string;artist:string;url:string}):SongDraft{
  const draft=emptySongDraft()
  draft.title=full.title||fallback.title
  draft.artist=full.artist||fallback.artist
  draft.structure=full.structure||''
  draft.chords=full.chords||''
  draft.referenceUrl=full.sourceUrl||fallback.url
  draft.notes='Source recueil : '+(full.source||'Externe')
  draft.source='import'
  return draft
}

function RecueilsPage({songs,entryMode,onImport,onComplete,toast}:{songs:Song[];entryMode:'tononkira'|null;onImport:(draft:SongDraft)=>Promise<void>;onComplete:(id:string,patch:Partial<SongDraft>)=>Promise<void>;toast:(s:string)=>void}) {
  const [preview,setPreview]=useState<SongDraft|null>(null)
  const [fileName,setFileName]=useState('')
  const [tononkiraTitle,setTononkiraTitle]=useState('')
  const [tononkiraArtist,setTononkiraArtist]=useState('')
  const [tononkiraResults,setTononkiraResults]=useState<TononkiraSearchResult[]>([])
  const [tononkiraSearching,setTononkiraSearching]=useState(false)
  const [tononkiraSearched,setTononkiraSearched]=useState(false)
  const [tononkiraImporting,setTononkiraImporting]=useState('')
  const [review,setReview]=useState<{existing:Song;incoming:SongDraft;source:string}|null>(null)
  const fileRef=useRef<HTMLInputElement>(null)
  const tononkiraTitleRef=useRef<HTMLInputElement>(null)
  useEffect(()=>{if(entryMode==='tononkira')requestAnimationFrame(()=>tononkiraTitleRef.current?.focus())},[entryMode])
  const duplicate=preview? songs.find(s=>s.title.trim().toLowerCase()===preview.title.trim().toLowerCase() && s.artist.trim().toLowerCase()===preview.artist.trim().toLowerCase()):null
  const songKey=(title:string,artist:string)=>title.trim().toLowerCase()+'::'+artist.trim().toLowerCase()
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
      setTononkiraResults(results)
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
      draft.lyrics=full.lyrics.trim()
      draft.referenceUrl=full.sourceUrl
      draft.notes='Source des paroles : Tononkira Malagasy'
      draft.source='import'
      const existing=songs.find(s=>songKey(s.title,s.artist)===songKey(draft.title,draft.artist))
      if(existing){setReview({existing,incoming:draft,source:'Tononkira'});return}
      await onImport(draft)
      toast(draft.title+' importé depuis Tononkira.')
    }catch{toast('Import Tononkira impossible pour ce morceau.')}
    finally{setTononkiraImporting('')}
  }

  return <><div className="page-head"><div><p className="eyebrow">Recueils · Sources musicales</p><h1>Recueils</h1><p>Recherchez directement dans Tononkira, Ultimate Guitar et Chordify, puis ajoutez les résultats utiles à DI’ART.</p></div></div>

  <section className="panel tononkira-feature-card tononkira-search-card"><div className="tononkira-feature-mark">MG</div><div className="tononkira-feature-copy"><p className="eyebrow">Import direct Madagascar</p><h2>Tononkira Malagasy</h2><p>Recherche titre/artiste puis import automatique du titre, de l’artiste et des paroles.</p></div><div className="tononkira-search-fields"><label>Titre<div className="field-clear-wrap"><input ref={tononkiraTitleRef} value={tononkiraTitle} onChange={e=>setTononkiraTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void runTononkiraSearch()}} placeholder="Ex. Mama sera"/>{tononkiraTitle&&<button type="button" className="search-clear" aria-label="Effacer le titre" onClick={()=>{setTononkiraTitle('');setTononkiraResults([]);setTononkiraSearched(false)}}><X/></button>}</div></label><label>Artiste <small>optionnel</small><div className="field-clear-wrap"><input value={tononkiraArtist} onChange={e=>setTononkiraArtist(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void runTononkiraSearch()}} placeholder="Ex. Mahaleo"/>{tononkiraArtist&&<button type="button" className="search-clear" aria-label="Effacer l’artiste" onClick={()=>setTononkiraArtist('')}><X/></button>}</div></label><button className="primary tononkira-search-button" disabled={tononkiraSearching||tononkiraTitle.trim().length<2} onClick={()=>void runTononkiraSearch()}><Search/>{tononkiraSearching?'Recherche…':'Rechercher sur Tononkira'}</button></div>{tononkiraSearched&&<div className="tononkira-search-results"><div className="tononkira-results-head"><b>{tononkiraResults.length} résultat{tononkiraResults.length>1?'s':''}</b><small>Importer récupère automatiquement les paroles.</small></div>{tononkiraResults.length?tononkiraResults.map(item=>{const exists=existingKeys.has(songKey(item.title,item.artist));const busy=tononkiraImporting===item.url;return <article className={'tononkira-search-result '+(exists?'exists':'')} key={item.url}><div><b>{item.title}</b><span>{item.artist||'Artiste non renseigné'}</span></div><div className="tononkira-result-actions"><a className="bare-action" href={item.url} target="_blank" rel="noreferrer" title="Voir sur Tononkira"><ExternalLink/></a>{exists?<button className="secondary review-import-btn" disabled={Boolean(tononkiraImporting)} onClick={()=>void importTononkiraResult(item)}><RotateCcw/>{busy?'Analyse…':'Revoir'}</button>:<button className="primary" disabled={Boolean(tononkiraImporting)} onClick={()=>void importTononkiraResult(item)}><Import/>{busy?'Import…':'Importer'}</button>}</div></article>}):<div className="catalog-empty">Aucun résultat.</div>}</div>}</section>

  <ExternalRecueilSearch source="ultimate-guitar" badge="UG" name="Ultimate Guitar" description="Recherchez les grilles et tabs publiques. DI’ART importe les métadonnées et les repères/accords détectables, avec le lien source." songs={songs} onImport={onImport} onComplete={onComplete} toast={toast}/>
  <ExternalRecueilSearch source="chordify" badge="CH" name="Chordify" description="Recherchez les chansons Chordify directement dans DI’ART et récupérez les métadonnées ainsi que les accords détectables." songs={songs} onImport={onImport} onComplete={onComplete} toast={toast}/>

  <section className="panel recueil-source-card chordpro-direct-card"><div className="recueil-source-head"><span className="recueil-badge">CP</span><div><h2>ChordPro</h2><p>Import direct d’un fichier .pro, .chopro, .cho, .crd ou .txt avec paroles et accords.</p></div></div><div className="recueil-source-actions"><button className="primary recueil-action" onClick={()=>fileRef.current?.click()}><FileUp/>Importer ChordPro</button></div></section>
  <input ref={fileRef} hidden type="file" accept=".pro,.chopro,.cho,.crd,.txt,text/plain" onChange={e=>{const f=e.target.files?.[0];if(f)void readChordPro(f);e.currentTarget.value=''}}/>

  {review&&<Modal className="import-review-modal" title="Revoir le morceau" onClose={()=>setReview(null)}><div className="import-review-head"><RotateCcw/><div><b>{review.existing.title}</b><small>{review.existing.artist||'Artiste non renseigné'} · source : {review.source}</small></div></div>{(()=>{const completion=songCompletion(review.existing,review.incoming);return completion.labels.length?<><div className="import-review-suggestion"><b>DI’ART peut compléter :</b><div>{completion.labels.map(label=><span key={label}><Plus/>{label}</span>)}</div></div><p className="muted-copy">Les informations déjà renseignées ne seront pas écrasées.</p><div className="modal-actions"><button className="secondary" onClick={()=>setReview(null)}>Annuler</button><button className="primary" onClick={()=>void onComplete(review.existing.id,completion.patch).then(()=>{toast('Morceau complété sans écraser les données existantes.');setReview(null)})}><Save/>Compléter les manquants</button></div></>:<><div className="import-nothing"><Check/><div><b>Rien à ajouter</b><span>Les informations disponibles dans cette source sont déjà présentes dans DI’ART.</span></div></div><div className="modal-actions"><button className="primary" onClick={()=>setReview(null)}>Fermer</button></div></>})()}</Modal>}
  {preview&&<Modal className="chordpro-preview-modal" title="Aperçu ChordPro" onClose={()=>setPreview(null)}><div className="chordpro-preview-head"><FileUp/><div><b>{preview.title}</b><small>{preview.artist||'Artiste non renseigné'} · {fileName}</small></div></div><div className="chordpro-preview-metrics">{preview.originalKey&&<div><span>Tonalité</span><b>{preview.originalKey}</b></div>}{preview.bpm!==null&&<div><span>BPM</span><b>{preview.bpm}</b></div>}{preview.capo!==null&&preview.capo!==undefined&&<div><span>Capo</span><b>{preview.capo}</b></div>}<div><span>Paroles</span><b>{preview.lyrics?.split('\n').filter(Boolean).length??0} lignes</b></div><div><span>Accords</span><b>{preview.chords?.split('\n').filter(Boolean).length??0} lignes</b></div></div>{duplicate&&<div className="duplicate-warning"><AlertTriangle/><span>Ce morceau existe déjà. DI’ART va proposer uniquement les informations manquantes.</span></div>}<div className="chordpro-preview-body">{preview.lyrics&&<section><h3>Paroles</h3><pre>{preview.lyrics.slice(0,1800)}</pre></section>}{preview.chords&&<section><h3>Accords extraits</h3><pre>{preview.chords.slice(0,1200)}</pre></section>}</div><div className="modal-actions"><button className="secondary" onClick={()=>setPreview(null)}>Annuler</button>{duplicate?(()=>{const completion=songCompletion(duplicate,preview);return completion.labels.length?<button className="primary" onClick={()=>void onComplete(duplicate.id,completion.patch).then(()=>{setPreview(null);toast('Morceau complété depuis ChordPro.')})}><RotateCcw/>Compléter : {completion.labels.join(', ')}</button>:<button className="primary" disabled><Check/>Rien à ajouter</button>})():<button className="primary" onClick={()=>void onImport(preview).then(()=>{setPreview(null);toast('Morceau ChordPro ajouté à DI’ART.')})}><Plus/>Ajouter à DI’ART</button>}</div></Modal>}</>
}

function ExternalRecueilSearch({source,badge,name,description,songs,onImport,onComplete,toast}:{source:ExternalRecueilSource;badge:string;name:string;description:string;songs:Song[];onImport:(draft:SongDraft)=>Promise<void>;onComplete:(id:string,patch:Partial<SongDraft>)=>Promise<void>;toast:(s:string)=>void}) {
  const [title,setTitle]=useState('')
  const [artist,setArtist]=useState('')
  const [results,setResults]=useState<ExternalRecueilResult[]>([])
  const [searched,setSearched]=useState(false)
  const [loading,setLoading]=useState(false)
  const [importing,setImporting]=useState('')
  const [review,setReview]=useState<{existing:Song;incoming:SongDraft}|null>(null)
  const songKey=(t:string,a:string)=>t.trim().toLowerCase()+'::'+a.trim().toLowerCase()
  const existing=useMemo(()=>new Set(songs.map(s=>songKey(s.title,s.artist))),[songs])

  const run=async()=>{
    if(title.trim().length<2){toast('Saisissez au moins deux caractères dans le titre.');return}
    setLoading(true);setSearched(true)
    try{
      const found=await searchExternalRecueil(source,title,artist)
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
      const existingSong=songs.find(s=>songKey(s.title,s.artist)===songKey(draft.title,draft.artist))
      if(existingSong){setReview({existing:existingSong,incoming:draft});return}
      await onImport(draft)
      toast(draft.title+' importé depuis '+name+'.')
    }catch{toast('Import '+name+' impossible pour ce résultat.')}
    finally{setImporting('')}
  }

  return <section className="panel external-recueil-card"><div className="external-recueil-head"><span className="recueil-badge">{badge}</span><div><p className="eyebrow">Recherche intégrée</p><h2>{name}</h2><p>{description}</p></div></div><div className="external-recueil-fields"><label>Titre<div className="field-clear-wrap"><input value={title} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void run()}} placeholder="Titre du morceau"/>{title&&<button type="button" className="search-clear" aria-label="Effacer le titre" onClick={()=>{setTitle('');setResults([]);setSearched(false)}}><X/></button>}</div></label><label>Artiste <small>optionnel</small><div className="field-clear-wrap"><input value={artist} onChange={e=>setArtist(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void run()}} placeholder="Nom de l’artiste"/>{artist&&<button type="button" className="search-clear" aria-label="Effacer l’artiste" onClick={()=>setArtist('')}><X/></button>}</div></label><button className="primary" disabled={loading||title.trim().length<2} onClick={()=>void run()}><Search/>{loading?'Recherche…':'Rechercher'}</button></div>{searched&&<div className="external-recueil-results">{results.length?results.map(item=>{const exists=existing.has(songKey(item.title,item.artist));const busy=importing===item.url;return <article className={'external-recueil-result '+(exists?'exists':'')} key={item.url}><div><b>{item.title}</b><span>{item.artist||'Artiste non renseigné'}{item.subtitle?' · '+item.subtitle:''}</span></div><div className="external-recueil-actions"><a className="bare-action" href={item.url} target="_blank" rel="noreferrer" title="Voir la source"><ExternalLink/></a>{exists?<button className="secondary review-import-btn" disabled={Boolean(importing)} onClick={()=>void add(item)}><RotateCcw/>{busy?'Analyse…':'Revoir'}</button>:<button className="primary" disabled={Boolean(importing)} onClick={()=>void add(item)}><Import/>{busy?'Import…':'Importer'}</button>}</div></article>}):<div className="catalog-empty">Aucun résultat.</div>}</div>}{review&&<Modal className="import-review-modal" title={'Revoir depuis '+name} onClose={()=>setReview(null)}>{(()=>{const completion=songCompletion(review.existing,review.incoming);return <><div className="import-review-head"><RotateCcw/><div><b>{review.existing.title}</b><small>{review.existing.artist||'Artiste non renseigné'}</small></div></div>{completion.labels.length?<><div className="import-review-suggestion"><b>À compléter :</b><div>{completion.labels.map(label=><span key={label}><Plus/>{label}</span>)}</div></div><div className="modal-actions"><button className="secondary" onClick={()=>setReview(null)}>Annuler</button><button className="primary" onClick={()=>void onComplete(review.existing.id,completion.patch).then(()=>{toast('Morceau complété depuis '+name+'.');setReview(null)})}><Save/>Compléter les manquants</button></div></>:<><div className="import-nothing"><Check/><div><b>Rien à ajouter</b><span>Les informations utiles de cette source sont déjà présentes.</span></div></div><div className="modal-actions"><button className="primary" onClick={()=>setReview(null)}>Fermer</button></div></>}</>})()}</Modal>}</section>
}

function ImportWizard({songs,refresh,toast}:{songs:Song[];refresh:()=>Promise<void>;toast:(s:string)=>void}) {
  const [step,setStep]=useState(1),[book,setBook]=useState<ParsedWorkbook|null>(null),[sheet,setSheet]=useState(''),[headers,setHeaders]=useState<string[]>([]),[mapping,setMapping]=useState<ImportMapping>({}),[preview,setPreview]=useState<ImportRowPreview[]>([]),[mode,setMode]=useState<'skip'|'create'|'fill'>('skip'),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[result,setResult]=useState<{added:number;updated:number;skipped:number;errors:number}|null>(null)
  const rows=book&&sheet?book.sheets[sheet]||[]:[]
  const choose=async(file:File)=>{try{setBusy(true);const p=await parseWorkbook(file);setBook(p);setSheet(p.sheetNames[0]||'');setStep(2);setErr('')}catch(e){setErr(e instanceof Error?e.message:'Lecture impossible')}finally{setBusy(false)}}
  const analyse=()=>{if(!rows.length){setErr('Cette feuille ne contient aucune ligne.');return}const h=Object.keys(rows[0]);setHeaders(h);setMapping(suggestMapping(h));setStep(3);setErr('')}
  const makePreview=()=>{if(!Object.values(mapping).includes('title')){setErr('Associez une colonne au champ Titre.');return}setPreview(rowsToPreview(rows,mapping,songs));setStep(4);setErr('')}
  const run=async()=>{setBusy(true);let added=0,updated=0,skipped=0,errors=0;for(const row of preview){if(!row.valid){errors++;continue}try{if(row.duplicateId&&mode==='skip'){skipped++;continue}if(row.duplicateId&&mode==='fill'){const old=songs.find(s=>s.id===row.duplicateId);if(old){const patch:Partial<SongDraft>={};for(const k of Object.keys(row.draft) as (keyof SongDraft)[]){const cur=old[k as keyof Song],incoming=row.draft[k];if((cur===''||cur===null||(Array.isArray(cur)&&cur.length===0))&&incoming!==''&&incoming!==null)(patch as Record<string,unknown>)[k]=incoming}await updateSong(row.duplicateId,patch);updated++;continue}}await createSong(row.draft);added++}catch{errors++}}await refresh();setResult({added,updated,skipped,errors});setBusy(false);setStep(5);toast(`Import terminé : ${added} ajouté(s).`)}
  return <><div className="page-head compact"><div><p className="eyebrow">Import Excel / CSV</p><h1>Assistant d’importation</h1><p>Aucune structure de colonnes n’est imposée.</p></div></div><div className="steps">{['Fichier','Feuille','Correspondance','Aperçu','Résultat'].map((x,i)=><div key={x} className={step>=i+1?'active':''}><span>{i+1}</span>{x}</div>)}</div>{err&&<div className="alert"><AlertTriangle/>{err}</div>}
    {step===1&&<section className="panel import-drop"><Upload size={42}/><h2>Sélectionner un fichier</h2><p>.xlsx, .xls ou .csv. L’analyse reste dans votre navigateur.</p><label className="primary file-btn">{busy?'Lecture…':'Choisir un fichier'}<input type="file" accept=".xlsx,.xls,.csv" onChange={e=>e.target.files?.[0]&&void choose(e.target.files[0])}/></label></section>}
    {step===2&&book&&<section className="panel"><h2>{book.fileName}</h2><div className="sheet-list">{book.sheetNames.map(n=><button key={n} className={sheet===n?'selected':''} onClick={()=>setSheet(n)}><FileSpreadsheet/><span><b>{n}</b><small>{book.sheets[n].length} lignes</small></span>{sheet===n&&<Check/>}</button>)}</div><div className="form-actions"><button className="secondary" onClick={()=>setStep(1)}>Retour</button><button className="primary" onClick={analyse}>Analyser<ChevronRight/></button></div></section>}
    {step===3&&<section className="panel"><h2>Correspondance des colonnes</h2><div className="mapping-grid">{headers.map(h=><div className="mapping-row" key={h}><div><b>{h}</b><small>{String(rows[0]?.[h]??'').slice(0,80)||'—'}</small></div><select value={mapping[h]||''} onChange={e=>setMapping({...mapping,[h]:e.target.value as ImportField|''})}><option value="">Ignorer</option>{fieldOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>)}</div><div className="form-actions"><button className="secondary" onClick={()=>setStep(2)}>Retour</button><button className="primary" onClick={makePreview}>Prévisualiser</button></div></section>}
    {step===4&&<section className="panel"><h2>Prévisualisation</h2><p>{preview.length} lignes · {preview.filter(x=>x.duplicateId).length} doublon(s) probable(s)</p><div className="radio-row"><label><input type="radio" checked={mode==='skip'} onChange={()=>setMode('skip')}/> Ignorer les doublons</label><label><input type="radio" checked={mode==='create'} onChange={()=>setMode('create')}/> Créer quand même</label><label><input type="radio" checked={mode==='fill'} onChange={()=>setMode('fill')}/> Compléter les champs vides</label></div><div className="preview-table"><table><thead><tr><th>Titre</th><th>Artiste</th><th>Tonalité</th><th>BPM</th><th>État</th></tr></thead><tbody>{preview.slice(0,200).map(r=><tr key={r.sourceIndex}><td>{r.draft.title||'—'}</td><td>{r.draft.artist||'—'}</td><td>{r.draft.personalKey||r.draft.originalKey||'—'}</td><td>{r.draft.bpm??'—'}</td><td>{!r.valid?r.error:r.duplicateId?'Doublon probable':'Prêt'}</td></tr>)}</tbody></table></div><div className="form-actions"><button className="secondary" onClick={()=>setStep(3)}>Retour</button><button className="primary" disabled={busy} onClick={()=>void run()}>{busy?'Importation…':'Importer'}<Import/></button></div></section>}
    {step===5&&result&&<section className="panel result-card"><Check size={44}/><h2>Import terminé</h2><div className="metrics"><Metric label="Ajoutés" value={result.added}/><Metric label="Mis à jour" value={result.updated}/><Metric label="Ignorés" value={result.skipped}/><Metric label="Erreurs" value={result.errors}/></div></section>}
  </>
}

function BackupPage({songs,refresh,toast}:{songs:Song[];refresh:()=>Promise<void>;toast:(s:string)=>void}) {
  const [file,setFile]=useState<File|null>(null)
  const restore=async()=>{if(!file)return;try{const r=await restoreJson(file);await refresh();toast(`Sauvegarde restaurée : ${r.songs} morceaux.`)}catch(e){toast(e instanceof Error?e.message:'Restauration impossible')}finally{setFile(null)}}
  return <><div className="page-head compact"><div><p className="eyebrow">Sauvegarde</p><h1>Vos données restent sous votre contrôle.</h1></div></div><div className="backup-grid"><section className="panel"><Download/><h2>Sauvegarde JSON</h2><p>Format recommandé pour restaurer DI’ART.</p><button className="primary" onClick={()=>void exportJson()}>Télécharger</button></section><section className="panel"><FileSpreadsheet/><h2>Exports tableur</h2><p>{songs.length} morceaux actifs.</p><button className="secondary" onClick={()=>void exportXlsx()}>Excel</button><button className="secondary" onClick={()=>void exportCsv()}>CSV</button></section><section className="panel"><RotateCcw/><h2>Restaurer</h2><label className="secondary file-btn">Choisir un JSON<input type="file" accept=".json" onChange={e=>e.target.files?.[0]&&setFile(e.target.files[0])}/></label></section></div>{file&&<Modal title="Restaurer cette sauvegarde ?" onClose={()=>setFile(null)}><p>La base locale actuelle sera remplacée.</p><div className="modal-actions"><button className="secondary" onClick={()=>setFile(null)}>Annuler</button><button className="danger" onClick={()=>void restore()}>Restaurer</button></div></Modal>}</>
}

function SettingsPage({theme,setTheme,songs,refresh,toast,userEmail,localCount,cloudStats,lastSyncAt,syncing,onSync,onPull,onSignedIn}:{theme:string;setTheme:(t:'dark'|'light'|'system')=>void;songs:Song[];refresh:()=>Promise<void>;toast:(s:string)=>void;userEmail:string;localCount:number;cloudStats:{songs:number;setlists:number}|null;lastSyncAt:string;syncing:boolean;onSync:()=>void;onPull:()=>void;onSignedIn:()=>Promise<void>}) {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[authBusy,setAuthBusy]=useState(false)
  const demos=songs.filter(s=>s.source==='demo')
  const remove=async()=>{await db.songs.bulkDelete(demos.map(x=>x.id));await refresh();toast(`${demos.length} démo(s) supprimée(s).`)}
  const auth=async(mode:'login'|'signup')=>{try{setAuthBusy(true);const r=mode==='login'?await signIn(email,password):await signUp(email,password);if(r.error)throw r.error;toast(mode==='login'?'Connexion réussie.':'Compte créé. Vérifiez votre e-mail si une confirmation est demandée.');await onSignedIn()}catch(e){toast(e instanceof Error?e.message:'Authentification impossible.')}finally{setAuthBusy(false)}}
  const logout=async()=>{await signOut();toast('Déconnecté du cloud DI’ART.');location.reload()}
  return <><div className="page-head compact"><div><p className="eyebrow">Paramètres</p><h1>Préférences</h1></div></div>
  <section className="panel cloud-panel"><div className="cloud-heading"><Cloud/><div><h2>Cloud DI’ART</h2><p>{userEmail?`Connecté : ${userEmail}`:'Connectez le même compte sur PC, tablette et Android pour retrouver automatiquement votre bibliothèque.'}</p></div></div>{userEmail?<><div className="cloud-stats"><div><span>Sur cet appareil</span><b>{localCount}</b><small>morceaux</small></div><div><span>Dans le cloud</span><b>{cloudStats?.songs??'—'}</b><small>morceaux</small></div><div><span>Setlists cloud</span><b>{cloudStats?.setlists??'—'}</b><small>listes</small></div></div><div className="cloud-help"><b>Synchronisation multi-appareils active.</b><span> Vérifiez que cette adresse e-mail est exactement la même sur le PC, la tablette et Android.</span>{lastSyncAt&&<small>Dernière synchro réussie : {new Date(lastSyncAt).toLocaleString('fr-FR')}</small>}</div><div className="cloud-actions"><button className="primary" disabled={syncing} onClick={onPull}><Download/>{syncing?'Récupération…':'Récupérer depuis le cloud'}</button><button className="secondary" disabled={syncing} onClick={onSync}>{syncing?'Synchronisation…':'Synchroniser maintenant'}</button><button className="secondary" onClick={()=>void logout()}><LogOut/>Déconnexion</button></div></>:<div className="cloud-auth"><input type="email" placeholder="Adresse e-mail" value={email} onChange={e=>setEmail(e.target.value)}/><input type="password" placeholder="Mot de passe" value={password} onChange={e=>setPassword(e.target.value)}/><button className="primary" disabled={authBusy||!email||password.length<6} onClick={()=>void auth('login')}><LogIn/>Connexion</button><button className="secondary" disabled={authBusy||!email||password.length<6} onClick={()=>void auth('signup')}>Créer un compte</button></div>}</section>
  <section className="panel settings-list"><div><span><b>Thème</b><small>Apparence de l’interface</small></span><select value={theme} onChange={e=>setTheme(e.target.value as 'dark'|'light'|'system')}><option value="dark">Sombre</option><option value="light">Clair</option><option value="system">Système</option></select></div><div><span><b>Données de démonstration</b><small>{demos.length} morceau(x)</small></span><button className="danger" disabled={!demos.length} onClick={()=>void remove()}><Trash2/>Supprimer les démos</button></div><div><span><b>Synchronisation cloud</b><small>Bibliothèque et setlists synchronisées entre appareils connectés au même compte.</small></span><em>{userEmail?'Actif':'Connexion requise'}</em></div><div><span><b>Expérience musicale V1.3</b><small>Transposition, métronome, Tap Tempo, setlists, répétition et Live Mode.</small></span><em>Actif</em></div></section></>
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
  const create=async()=>{if(!name.trim())return;const s=await createSetlist(name);setName('');setOpen(s.id);void refresh();toast(`Setlist « ${s.name} » créée.`)}
  const rename=async(list:Setlist)=>{const next=editName.trim();if(!next){setEditing(null);return}await updateSetlist(list.id,{name:next});void refresh();setEditing(null);toast('Nom de la setlist mis à jour.')}
  const deleteList=async(list:Setlist)=>{const deletedAt=new Date().toISOString();await updateSetlist(list.id,{deletedAt});void refresh();setDeleting(null);toast(`Setlist « ${list.name} » supprimée.`,{label:'Annuler',run:async()=>{await updateSetlist(list.id,{deletedAt:null});void refresh()}})}
  const clickList=(list:Setlist)=>{if(open===list.id)onOpenDetail(list.id);else setOpen(list.id)}
  return <><div className="page-head"><div><p className="eyebrow">Setlists</p><h1>Setlists</h1><p>Premier clic : actions rapides. Deuxième clic : ouvrir la setlist.</p></div><div className="setlist-create"><input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void create()}} placeholder="Nom de la nouvelle setlist"/><button className="primary" disabled={!name.trim()} onClick={()=>void create()}><Plus/>Créer</button></div></div>
  <div className="setlist-grid modern-setlist-grid">{setlists.length?setlists.map(list=>{
    const preview=list.songIds.map(id=>songs.find(s=>s.id===id)).filter(Boolean) as Song[]
    const isOpen=open===list.id
    return <section className={`panel setlist-card modern-setlist-card ${isOpen?'open':''}`} key={list.id} style={{height:'auto',minHeight:0,alignSelf:'start'}}><div className="setlist-head">{editing===list.id?<div className="setlist-rename"><input autoFocus value={editName} onChange={e=>setEditName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void rename(list);if(e.key==='Escape')setEditing(null)}}/><button className="icon-btn" onClick={()=>void rename(list)}><Check/></button><button className="icon-btn" onClick={()=>setEditing(null)}><X/></button></div>:<div className="setlist-title-area"><button className="setlist-title-button" onClick={()=>clickList(list)}><span className="setlist-cover"><ListMusic/></span><div><b>{list.name}</b><small>{list.songIds.length} morceau{list.songIds.length>1?'x':''}{isOpen?' · cliquer à nouveau pour ouvrir':''}</small></div></button><button className={`setlist-toggle-preview ${isOpen?'open':''}`} aria-label={isOpen?'Masquer l’aperçu':'Afficher l’aperçu'} title={isOpen?'Masquer l’aperçu':'Afficher l’aperçu'} onClick={e=>{e.stopPropagation();setOpen(isOpen?null:list.id)}}><ChevronRight/></button></div>}<div className="setlist-head-actions"><button className="bare-action" aria-label="Renommer" title="Renommer" onClick={()=>{setEditing(list.id);setEditName(list.name)}}><Pencil/></button><button className="bare-action danger-icon" aria-label="Supprimer la setlist" title="Supprimer" onClick={()=>setDeleting(list)}><Trash2/></button></div></div>{isOpen&&<div className="setlist-preview"><div className="setlist-preview-actions"><button className="secondary" disabled={!preview.length} onClick={()=>setStage({list,mode:'rehearsal'})}><Play/>Répétition</button><button className="primary" disabled={!preview.length} onClick={()=>setStage({list,mode:'live'})}><Maximize2/>Live</button></div><div className="setlist-preview-songs">{preview.length?preview.slice(0,4).map((s,i)=><div key={s.id}><span>{i+1}</span><b>{s.title}</b><small>{s.personalKey||s.originalKey||'—'}{s.bpm!==null?` · ${s.bpm} BPM`:''}</small></div>):<p>Aucun morceau pour le moment.</p>}</div></div>}</section>
  }):<Empty text="Aucune setlist. Créez votre première liste."/>}</div>
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
  const listSongs=useMemo(()=>list.songIds.map(id=>songs.find(s=>s.id===id)).filter(Boolean) as Song[],[list.songIds,songs])
  const available=useMemo(()=>songs.filter(s=>!list.songIds.includes(s.id)),[songs,list.songIds])
  const artistNames=useMemo(()=>[...new Set(available.map(s=>s.artist.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),[available])
  const songMatches=useMemo(()=>available.filter(s=>searchSong(s,addQuery)).slice(0,80),[available,addQuery])
  const artistMatches=useMemo(()=>artistNames.filter(a=>!addQuery.trim()||a.toLowerCase().includes(addQuery.toLowerCase())),[artistNames,addQuery])
  const artistSongs=useMemo(()=>artistPick?available.filter(s=>s.artist.trim()===artistPick):[],[available,artistPick])
  const totalSeconds=listSongs.reduce((n,s)=>n+(s.durationSeconds??0),0)
  const bpmSongs=listSongs.filter(s=>s.bpm!==null)
  const avgBpm=bpmSongs.length?Math.round(bpmSongs.reduce((n,s)=>n+(s.bpm??0),0)/bpmSongs.length):null
  const lyricsCount=listSongs.filter(s=>Boolean(s.lyrics)).length
  const add=async(songId:string)=>{if(!songId||list.songIds.includes(songId))return;await updateSetlist(list.id,{songIds:[...list.songIds,songId]});void refresh();toast('Morceau ajouté à la setlist.')}
  const addAndStay=async(songId:string)=>{await add(songId);setArtistPick('')}
  const remove=async(songId:string)=>{await updateSetlist(list.id,{songIds:list.songIds.filter(id=>id!==songId)});void refresh();toast('Morceau retiré de la setlist.')}
  const move=async(index:number,dir:number)=>{const target=index+dir;if(target<0||target>=list.songIds.length)return;const ids=[...list.songIds];[ids[index],ids[target]]=[ids[target],ids[index]];await updateSetlist(list.id,{songIds:ids});void refresh()}
  const closeAdd=()=>{setAddOpen(false);setAddQuery('');setArtistPick('');setAddMode('song')}
  return <><div className="detail-nav setlist-detail-nav"><button className="ghost" onClick={onBack}><ChevronLeft/>Setlists</button><div className="setlist-mode-actions"><button type="button" className="secondary" disabled={!listSongs.length} onClick={()=>setStage('rehearsal')}><Play/>Répétition</button><button type="button" className="primary" disabled={!listSongs.length} onClick={()=>setStage('live')}><Maximize2/>Live Mode</button></div></div>
  <section className="setlist-detail-hero" style={{minHeight:0}}><div className="setlist-detail-title"><span className="setlist-hero-icon"><ListMusic/></span><p className="eyebrow">Setlist</p><h1>{list.name}</h1><p>{listSongs.length} morceau{listSongs.length>1?'x':''} · {lyricsCount} avec paroles</p></div><div className="setlist-detail-metrics" role="list"><div role="listitem"><span>Durée</span><b>{totalSeconds?formatDuration(totalSeconds):'—'}</b></div><div role="listitem"><span>BPM moyen</span><b>{avgBpm??'—'}</b></div><div role="listitem"><span>Paroles</span><b>{lyricsCount}/{listSongs.length}</b></div></div></section>
  <section className="panel setlist-manager"><div className="panel-title-row"><h2>Ordre des morceaux</h2><button className="primary setlist-add-button" onClick={()=>setAddOpen(true)}><ListPlus/>Ajouter des morceaux</button></div><div className="setlist-detail-songs">{listSongs.length?listSongs.map((s,i)=><div className="setlist-detail-song" key={s.id}><span className="setlist-number">{i+1}</span><button className="setlist-song-main" onClick={()=>onOpenSong(s)}><b>{s.title}</b><small>{s.artist||'Artiste inconnu'} · {s.personalKey||s.originalKey||'—'}{s.bpm!==null?` · ${s.bpm} BPM`:''}</small></button><div className="setlist-song-flags">{s.lyrics&&<span>Paroles</span>}{list.rehearsalNotes?.[s.id]&&<span>Notes</span>}</div><button className="bare-action" disabled={i===0} aria-label="Monter" onClick={()=>void move(i,-1)}><ChevronUp/></button><button className="bare-action" disabled={i===listSongs.length-1} aria-label="Descendre" onClick={()=>void move(i,1)}><ChevronDown/></button><button className="bare-action danger-icon" aria-label="Retirer" onClick={()=>void remove(s.id)}><X/></button></div>):<Empty text="Cette setlist est vide."/>}</div></section>
  {addOpen&&<Modal className="setlist-add-modal" title="Ajouter des morceaux" onClose={closeAdd}><div className="setlist-add-mode"><button className={addMode==='song'?'active':''} onClick={()=>{setAddMode('song');setArtistPick('');setAddQuery('')}}><Search/>Rechercher un morceau</button><button className={addMode==='artist'?'active':''} onClick={()=>{setAddMode('artist');setArtistPick('');setAddQuery('')}}><UsersRound/>Rechercher un artiste</button></div><div className="setlist-add-search"><Search/><input autoFocus value={addQuery} onChange={e=>setAddQuery(e.target.value)} placeholder={addMode==='song'?'Titre, artiste, tonalité, BPM…':'Nom de l’artiste…'}/>{addQuery&&<button type="button" className="search-clear" aria-label="Effacer la recherche" onClick={()=>setAddQuery('')}><X/></button>}</div>{addMode==='song'?<div className="setlist-add-results">{songMatches.length?songMatches.map(s=><button key={s.id} onClick={()=>void addAndStay(s.id)}><span><b>{s.title}</b><small>{s.artist||'Artiste inconnu'}</small></span><span>{s.personalKey||s.originalKey||'—'}{s.bpm!==null?` · ${s.bpm} BPM`:''}</span><Plus/></button>):<p className="muted-copy">Aucun morceau disponible.</p>}</div>:artistPick?<><button className="ghost setlist-artist-back" onClick={()=>setArtistPick('')}><ChevronLeft/>Artistes</button><div className="setlist-add-results">{artistSongs.map(s=><button key={s.id} onClick={()=>void addAndStay(s.id)}><span><b>{s.title}</b><small>{s.artist}</small></span><span>{s.personalKey||s.originalKey||'—'}{s.bpm!==null?` · ${s.bpm} BPM`:''}</span><Plus/></button>)}</div></>:<div className="setlist-artist-results">{artistMatches.map(a=><button key={a} onClick={()=>setArtistPick(a)}><span className="avatar">{a[0]}</span><span><b>{a}</b><small>{available.filter(s=>s.artist.trim()===a).length} morceau(x) disponible(s)</small></span><ChevronRight/></button>)}</div>}</Modal>}
  {stage&&<SetlistStage mode={stage} list={list} songs={listSongs} refresh={refresh} toast={toast} onClose={()=>setStage(null)} onOpenSong={onOpenSong}/>}
  </>
}

function SetlistStage({mode,list,songs,refresh,toast,onClose,onOpenSong}:{mode:'rehearsal'|'live';list:Setlist;songs:Song[];refresh:()=>Promise<void>;toast:(s:string)=>void;onClose:()=>void;onOpenSong:(s:Song)=>void}) {
  const [index,setIndex]=useState(0)
  const [view,setView]=useState<'guide'|'lyrics'>('guide')
  const [localNotes,setLocalNotes]=useState<Record<string,string>>(list.rehearsalNotes??{})
  const [lyricsFontSize,setLyricsFontSize]=useState(22)
  const [transpose,setTranspose]=useState(0)
  const [autoScroll,setAutoScroll]=useState(false)
  const [scrollSpeed,setScrollSpeed]=useState(36)
  const contentRef=useRef<HTMLDivElement>(null)
  const song=songs[index]
  const [noteDraft,setNoteDraft]=useState(song?localNotes[song.id]??'':'')

  useEffect(()=>{
    const previous=document.body.style.overflow
    document.body.style.overflow='hidden'
    return()=>{document.body.style.overflow=previous}
  },[])

  const hasGuide=Boolean(song?.structure||song?.chords||song?.instrumentNotes)
  useEffect(()=>{
    if(!song)return
    setView(song.structure||song.chords||song.instrumentNotes?'guide':song.lyrics?'lyrics':'guide')
    setNoteDraft(localNotes[song.id]??'')
    setTranspose(0)
    setAutoScroll(false)
    requestAnimationFrame(()=>contentRef.current?.scrollTo({top:0,behavior:'auto'}))
  },[index,song?.id])

  useEffect(()=>{
    if(!autoScroll)return
    let raf=0
    let last=performance.now()
    const tick=(now:number)=>{
      const el=contentRef.current
      if(!el)return
      const dt=Math.min(80,now-last)
      last=now
      el.scrollTop+=scrollSpeed*dt/1000
      if(el.scrollTop+el.clientHeight>=el.scrollHeight-2){setAutoScroll(false);return}
      raf=requestAnimationFrame(tick)
    }
    raf=requestAnimationFrame(tick)
    return()=>cancelAnimationFrame(raf)
  },[autoScroll,scrollSpeed,index,view])

  if(!song)return null

  const saveNote=async()=>{const next={...localNotes,[song.id]:noteDraft};setLocalNotes(next);await updateSetlist(list.id,{rehearsalNotes:next});void refresh();toast('Notes de répétition enregistrées.')}
  const go=(next:number)=>{if(next<0||next>=songs.length)return;setAutoScroll(false);setIndex(next)}
  const baseKey=song.personalKey||song.originalKey
  const displayKey=baseKey?transposeKey(baseKey,transpose):''
  const displayChords=transposeChordText(song.chords??'',transpose)
  const stageStyle:CSSProperties={position:'fixed',inset:0,zIndex:10000,display:'grid',gridTemplateRows:'auto minmax(0,1fr) auto',overflow:'hidden',background:mode==='rehearsal'?'radial-gradient(circle at 70% 0,#0d3039,#030b0e 52%)':'#02090c',color:'#f2fbfc'}

  return createPortal(<div className={'stage-mode '+mode} style={stageStyle}>
    <header className="stage-topbar" style={{zIndex:2,background:'rgba(2,9,12,.96)',borderBottom:'1px solid #17323a',display:'grid',gridTemplateColumns:'1fr auto 1fr',alignItems:'center'}}>
      <div className="stage-list-context" style={{gridColumn:1,justifySelf:'start'}}><span>{mode==='rehearsal'?'Répétition':'Live Mode'}</span><b>{list.name}</b></div>
      <div className="stage-current-song" style={{gridColumn:2,justifySelf:'center',textAlign:'center'}}><b>{song.title}</b><small>{song.artist||'Artiste inconnu'}</small>{(hasGuide||song.lyrics)&&<div className="stage-view-tabs">{hasGuide&&<button className={view==='guide'?'active':''} onClick={()=>{setView('guide');setAutoScroll(false);requestAnimationFrame(()=>contentRef.current?.scrollTo({top:0}))}}>Repères</button>}{song.lyrics&&<button className={view==='lyrics'?'active':''} onClick={()=>{setView('lyrics');setAutoScroll(false);requestAnimationFrame(()=>contentRef.current?.scrollTo({top:0}))}}>Paroles</button>}</div>}</div>
      <button className="live-close" style={{gridColumn:3,justifySelf:'end'}} onClick={onClose}><X/></button>
    </header>

    <main ref={contentRef} className="stage-content" style={{minHeight:0,height:'100%',overflowY:'auto',overflowX:'hidden',WebkitOverflowScrolling:'touch',overscrollBehavior:'contain'}}>
      <div className="stage-song-head"><p>{song.artist||'Artiste inconnu'} · {index+1}/{songs.length}</p><h1>{song.title}</h1><div className="stage-metrics">{displayKey&&<strong>{displayKey}</strong>}{song.bpm!==null&&<span>{song.bpm} BPM</span>}{song.timeSignature&&<span>{song.timeSignature}</span>}</div></div>

      <div className="stage-session-tools">
        <div className="stage-control-group"><span>Paroles</span><button title="Réduire la police" onClick={()=>setLyricsFontSize(v=>Math.max(14,v-2))}><Minus/></button><b>{lyricsFontSize}</b><button title="Agrandir la police" onClick={()=>setLyricsFontSize(v=>Math.min(48,v+2))}><Plus/></button></div>
        <div className="stage-control-group"><span>Transposer</span><button title="-1 demi-ton" onClick={()=>setTranspose(v=>Math.max(-12,v-1))}><Minus/></button><b>{formatSemitoneOffset(transpose)}</b><button title="+1 demi-ton" onClick={()=>setTranspose(v=>Math.min(12,v+1))}><Plus/></button><button title="Réinitialiser la transposition" className="stage-reset-btn" disabled={transpose===0} onClick={()=>setTranspose(0)}><RotateCcw/></button></div>
        <div className={'stage-control-group auto-scroll-control '+(autoScroll?'active':'')}><span>Défilement</span><button className="stage-autoscroll-toggle" title={autoScroll?'Arrêter':'Démarrer'} onClick={()=>setAutoScroll(v=>!v)}>{autoScroll?<Square/>:<Play/>}</button><input aria-label="Vitesse de défilement" type="range" min="10" max="120" step="2" value={scrollSpeed} onChange={e=>setScrollSpeed(Number(e.target.value))}/><b>{scrollSpeed}</b><button title="Retour en haut" onClick={()=>{setAutoScroll(false);contentRef.current?.scrollTo({top:0,behavior:'smooth'})}}><ChevronUp/></button></div>
      </div>

      {view==='lyrics'&&song.lyrics
        ?<pre className="stage-lyrics" style={{fontSize:lyricsFontSize}}>{song.lyrics}</pre>
        :hasGuide?<div className="stage-guide">{song.structure&&<section><h3>Structure</h3><p>{song.structure}</p></section>}{song.chords&&<section><h3>Accords / repères{transpose!==0&&<small className="transpose-indicator"> · {formatSemitoneOffset(transpose)} demi-ton{Math.abs(transpose)>1?'s':''}</small>}</h3><pre>{displayChords}</pre></section>}{song.instrumentNotes&&<section><h3>Notes instrumentales</h3><p>{song.instrumentNotes}</p></section>}</div>:null}

      {mode==='rehearsal'&&<section className="rehearsal-edit-panel"><div className="panel-title-row"><div><h3>Modifications / notes de répétition</h3><small>Ces annotations restent liées à cette setlist et se synchronisent sur vos appareils.</small></div><button className="secondary" onClick={()=>{onClose();onOpenSong(song)}}><Pencil/>Modifier la fiche</button></div><textarea value={noteDraft} onChange={e=>setNoteDraft(e.target.value)} placeholder="Ex. Reprendre le pont 2x, sax après le refrain, descendre d’un ton…"/><button className="primary" onClick={()=>void saveNote()}><Save/>Enregistrer les modifications</button></section>}
    </main>

    <footer className="stage-nav compact-stage-nav" style={{zIndex:2,background:'rgba(2,9,12,.96)',borderTop:'1px solid #17323a'}}><button className="stage-nav-btn secondary" disabled={index===0} onClick={()=>go(index-1)}><ChevronLeft/><span>Précédent</span></button><div>{index+1} / {songs.length}</div><button className="stage-nav-btn primary" disabled={index===songs.length-1} onClick={()=>go(index+1)}><span>Suivant</span><ChevronRight/></button></footer>
  </div>,document.body)
}

function Empty({text}:{text:string}) { return <div className="empty"><Music2/><p>{text}</p></div> }

export default App

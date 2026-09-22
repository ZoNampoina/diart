import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject, type FormEvent } from 'react'
import {
  BookOpen, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Heart, Home, Import,
  Library, Menu, Moon, MoreHorizontal, Music2, Plus, Search, Settings, Star, Sun,
  Trash2, Upload, UserRound, UsersRound, Wifi, WifiOff, X, Pencil, Save, RotateCcw,
  Filter, ArrowUpDown, Check, AlertTriangle, Minus, ListMusic, Cloud, LogIn, LogOut,
  Play, Square, Gauge, Maximize2, ChevronUp, ChevronDown
} from 'lucide-react'
import { db, createSong, ensureDemoSeed, getSetting, markViewed, setSetting, softDeleteSong, updateSong, createSetlist, updateSetlist } from './db'
import type { ImportField, ImportMapping, ImportRowPreview, Song, SongDraft, Setlist } from './types'
import { emptySongDraft, formatDuration, normalizeKey, parseBpm, parseDuration, searchSong, transposeKey, transposeChordText, formatSemitoneOffset } from './music'
import { parseWorkbook, rowsToPreview, suggestMapping, type ParsedWorkbook } from './importer'
import { exportCsv, exportJson, exportXlsx, restoreJson } from './exporter'
import { supabase, syncAll, signIn, signOut, signUp, getCloudStats, pullCloudToLocal } from './cloud'

const navItems = [
  ['dashboard','Accueil',Home], ['library','Bibliothèque',Library], ['artists','Artistes',UsersRound],
  ['authors','Auteurs',UserRound], ['favorites','Favoris',Heart], ['recent','Récents',BookOpen],
  ['setlists','Setlists',ListMusic], ['import','Importer',Import], ['backup','Sauvegarde',Download], ['settings','Paramètres',Settings]
] as const

type Page = typeof navItems[number][0] | 'song' | 'edit' | 'new'
type Toast = { id:number; text:string; action?:{label:string;run:()=>void} }

function useSongs() {
  const [songs,setSongs] = useState<Song[]>([])
  const refresh = async () => setSongs((await db.songs.toArray()).filter(s=>!s.deletedAt))
  useEffect(()=>{ void ensureDemoSeed().then(refresh) },[])
  return { songs, refresh }
}

function Modal({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}) {
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="modal"><div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X/></button></div>{children}</div>
  </div>
}

function Toasts({items}:{items:Toast[]}) {
  return <div className="toasts">{items.map(t=><div className="toast" key={t.id}>{t.text}{t.action&&<button onClick={t.action.run}>{t.action.label}</button>}</div>)}</div>
}

function Metric({label,value}:{label:string;value:string|number}) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>
}

function SongRow({song,onOpen,onFav}:{song:Song;onOpen:()=>void;onFav:()=>void}) {
  return <div className="song-row" onClick={onOpen} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')onOpen()}}>
    <button className={`icon-btn fav ${song.favorite?'active':''}`} onClick={e=>{e.stopPropagation();onFav()}}><Star size={18} fill={song.favorite?'currentColor':'none'}/></button>
    <div className="song-main"><b>{song.title}</b><span>{song.artist || 'Artiste inconnu'}{song.source==='demo'&&<em>DEMO</em>}</span></div>
    <div className="song-meta"><strong>{song.personalKey||song.originalKey||'—'}</strong><span>{song.bpm??'—'} BPM</span><span>{song.timeSignature||'—'}</span></div>
    <ChevronRight size={18}/>
  </div>
}

function App() {
  const {songs,refresh}=useSongs()
  const [page,setPage]=useState<Page>('dashboard')
  const [selected,setSelected]=useState<Song|null>(null)
  const [sidebar,setSidebar]=useState(false)
  const [theme,setTheme]=useState<'dark'|'light'|'system'>('dark')
  const [online,setOnline]=useState(navigator.onLine)
  const [toasts,setToasts]=useState<Toast[]>([])
  const [setlists,setSetlists]=useState<Setlist[]>([])
  const [userId,setUserId]=useState('')
  const [userEmail,setUserEmail]=useState('')
  const [syncing,setSyncing]=useState(false)
  const [cloudStats,setCloudStats]=useState<{songs:number;setlists:number}|null>(null)
  const searchRef=useRef<HTMLInputElement>(null)

  const refreshSetlists=async()=>setSetlists((await db.setlists.toArray()).filter(x=>!x.deletedAt))

  const toast=(text:string,action?:Toast['action'])=>{
    const id=Date.now()+Math.random()
    setToasts(x=>[...x,{id,text,action}])
    setTimeout(()=>setToasts(x=>x.filter(t=>t.id!==id)),4500)
  }

  const refreshCloudStats=async(id=userId)=>{if(!id)return;try{setCloudStats(await getCloudStats(id))}catch{}}
  const doSync=async(showToast=true)=>{
    if(!userId||!navigator.onLine||syncing)return
    try{setSyncing(true);await syncAll(userId);await Promise.all([refresh(),refreshSetlists(),refreshCloudStats(userId)]);if(showToast)toast('Synchronisation cloud terminée.')}
    catch(e){if(showToast)toast(e instanceof Error?e.message:'Synchronisation impossible.')}
    finally{setSyncing(false)}
  }
  const forcePull=async()=>{
    if(!userId||!navigator.onLine||syncing)return
    try{setSyncing(true);const r=await pullCloudToLocal(userId);await Promise.all([refresh(),refreshSetlists(),refreshCloudStats(userId)]);toast(`Cloud récupéré : ${r.songs} morceau(x), ${r.setlists} setlist(s).`)}
    catch(e){toast(e instanceof Error?e.message:'Récupération cloud impossible.')}
    finally{setSyncing(false)}
  }

  useEffect(()=>{void getSetting('theme','dark').then(v=>setTheme((v as typeof theme)||'dark'));void refreshSetlists()},[])
  useEffect(()=>{
    void supabase.auth.getSession().then(({data})=>{const u=data.session?.user;setUserId(u?.id??'');setUserEmail(u?.email??'')})
    const {data}=supabase.auth.onAuthStateChange((_event,session)=>{const u=session?.user;setUserId(u?.id??'');setUserEmail(u?.email??'')})
    return()=>data.subscription.unsubscribe()
  },[])
  useEffect(()=>{if(userId&&online){void doSync(false);void refreshCloudStats(userId)}else if(!userId)setCloudStats(null)},[userId,online])
  const syncSignature=useMemo(()=>songs.filter(s=>s.source!=='demo').map(s=>s.id+':'+s.updatedAt).sort().join('|')+'#'+setlists.map(s=>s.id+':'+s.updatedAt).sort().join('|'),[songs,setlists])
  useEffect(()=>{if(!userId||!online)return;const timer=setTimeout(()=>void doSync(false),1200);return()=>clearTimeout(timer)},[syncSignature,userId,online])
  useEffect(()=>{
    if(!userId)return
    const channel=supabase.channel('diart-live-sync')
      .on('postgres_changes',{event:'*',schema:'public',table:'diart_songs',filter:`user_id=eq.${userId}`},()=>void doSync(false))
      .on('postgres_changes',{event:'*',schema:'public',table:'diart_setlists',filter:`user_id=eq.${userId}`},()=>void doSync(false))
      .subscribe()
    const timer=setInterval(()=>{if(navigator.onLine)void doSync(false)},60000)
    return()=>{clearInterval(timer);void supabase.removeChannel(channel)}
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

  const go=(p:Page)=>{setPage(p);setSidebar(false)}
  const openSong=async(s:Song)=>{setSelected(s);setPage('song');await markViewed(s.id);await refresh()}
  const fav=async(s:Song)=>{await updateSong(s.id,{favorite:!s.favorite});await refresh()}
  const artists=useMemo(()=>new Set(songs.map(s=>s.artist.trim()).filter(Boolean)).size,[songs])
  const authors=useMemo(()=>new Set(songs.map(s=>s.authorComposer.trim()).filter(Boolean)).size,[songs])

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
        <div className="top-actions"><button className="icon-btn theme-toggle" title="Changer le thème" aria-label="Changer le thème" onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?<Sun/>:<Moon/>}</button><button className="primary" onClick={()=>go('new')}><Plus size={18}/>Nouveau</button></div>
      </header>
      <div className="content">
        {page==='dashboard'&&<Dashboard songs={songs} artists={artists} authors={authors} setlists={setlists} refreshSetlists={refreshSetlists} toast={toast} onOpen={openSong} onGo={go} onFav={fav}/>} 
        {page==='library'&&<LibraryPage songs={songs} setlists={setlists} refreshSetlists={refreshSetlists} toast={toast} searchRef={searchRef} onOpen={openSong} onFav={fav}/>} 
        {page==='artists'&&<PeoplePage title="Artistes" items={groupPeople(songs,'artist')} onOpen={openSong}/>}
        {page==='authors'&&<PeoplePage title="Auteurs / Compositeurs" items={groupPeople(songs,'authorComposer')} onOpen={openSong}/>}
        {page==='favorites'&&<SimpleSongs title="Favoris" songs={songs.filter(s=>s.favorite)} onOpen={openSong} onFav={fav}/>}
        {page==='recent'&&<SimpleSongs title="Récents" songs={[...songs].sort((a,b)=>(b.lastViewedAt||b.updatedAt).localeCompare(a.lastViewedAt||a.updatedAt)).slice(0,50)} onOpen={openSong} onFav={fav}/>}
        {page==='setlists'&&<SetlistsPage songs={songs} setlists={setlists} refresh={refreshSetlists} toast={toast}/>}
        {page==='song'&&selected&&<SongDetail song={songs.find(s=>s.id===selected.id)||selected} onBack={()=>go('library')} onEdit={()=>go('edit')} onFav={()=>void fav(songs.find(s=>s.id===selected.id)||selected)} onLyricsSave={async lyrics=>{await updateSong(selected.id,{lyrics});await refresh();toast('Paroles enregistrées.')}} onDelete={async()=>{const id=selected.id;await softDeleteSong(id);await refresh();toast('Morceau placé dans la corbeille',{label:'Annuler',run:async()=>{await db.songs.update(id,{deletedAt:null});await refresh()}});go('library')}}/>}
        {(page==='new'||(page==='edit'&&selected))&&<SongForm initial={page==='edit'?selected:null} onCancel={()=>go(selected?'song':'library')} onSave={async draft=>{if(page==='edit'&&selected){await updateSong(selected.id,draft);await refresh();setSelected({...selected,...draft,updatedAt:new Date().toISOString()});toast('Morceau mis à jour');go('song')}else{const s=await createSong(draft);await refresh();setSelected(s);toast('Morceau ajouté');go('song')}}}/>}
        {page==='import'&&<ImportWizard songs={songs} refresh={refresh} toast={toast}/>}
        {page==='backup'&&<BackupPage songs={songs} refresh={refresh} toast={toast}/>}
        {page==='settings'&&<SettingsPage theme={theme} setTheme={setTheme} songs={songs} refresh={refresh} toast={toast} userEmail={userEmail} localCount={songs.filter(s=>s.source!=='demo').length} cloudStats={cloudStats} syncing={syncing} onSync={()=>void doSync()} onPull={()=>void forcePull()} onSignedIn={async()=>{const {data}=await supabase.auth.getUser();const u=data.user;setUserId(u?.id??'');setUserEmail(u?.email??'');if(u){setSyncing(true);try{await pullCloudToLocal(u.id);await syncAll(u.id);await Promise.all([refresh(),refreshSetlists(),refreshCloudStats(u.id)]);toast('Cloud DI’ART connecté et récupéré.')}finally{setSyncing(false)}}}}/>}
      </div>
    </main>
    <nav className="bottom-nav">
      <button onClick={()=>go('library')}><Library/><span>Bibliothèque</span></button>
      <button onClick={()=>go('artists')}><UsersRound/><span>Artistes</span></button>
      <button onClick={()=>{go('library');setTimeout(()=>searchRef.current?.focus(),50)}}><Search/><span>Recherche</span></button>
      <button onClick={()=>go('favorites')}><Heart/><span>Favoris</span></button>
      <button onClick={()=>go('setlists')}><ListMusic/><span>Setlists</span></button>
    </nav>
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
    <div className="page-head"><div><p className="eyebrow">Répertoire personnel</p><h1>Votre musique, immédiatement.</h1><p>Retrouvez tonalité, BPM et informations utiles en quelques secondes.</p></div><div className="actions"><button className="secondary" onClick={()=>onGo('import')}><FileSpreadsheet/>Importer</button><button className="primary" onClick={()=>onGo('new')}><Plus/>Nouveau morceau</button></div></div>
    <div className="home-search"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Rechercher un titre, artiste, tonalité, BPM…"/>{q&&<button className="icon-btn" aria-label="Effacer la recherche" onClick={()=>setQ('')}><X/></button>}</div>
    {q.trim()&&<section className="panel home-search-results"><div className="panel-title-row"><h2>Résultats</h2><span>{results.length} affiché(s)</span></div>{results.length?<div className="quick-results">{results.map(s=><div className="quick-result" key={s.id}><button className="quick-result-main" onClick={()=>onOpen(s)}><span><b>{s.title}</b><small>{s.artist||'Artiste inconnu'}</small></span><span className="quick-meta">{s.personalKey||s.originalKey||'—'} · {s.bpm??'—'} BPM</span></button><QuickSetlistAdd song={s} setlists={setlists} refresh={refreshSetlists} toast={toast}/></div>)}</div>:<Empty text="Aucun résultat."/>}</section>}
    <div className="metrics"><Metric label="Morceaux" value={songs.length}/><Metric label="Artistes" value={artists}/><Metric label="Auteurs" value={authors}/><Metric label="Favoris" value={songs.filter(s=>s.favorite).length}/></div>
    <div className="home-recent-grid"><section className="panel compact-home-panel"><h2>Récemment consultés</h2>{recent.length?recent.map(s=><SongRow key={s.id} song={s} onOpen={()=>onOpen(s)} onFav={()=>onFav(s)}/>):<Empty text="Aucun morceau consulté."/>}</section><section className="panel compact-home-panel"><h2>Ajouts récents</h2>{added.map(s=><SongRow key={s.id} song={s} onOpen={()=>onOpen(s)} onFav={()=>onFav(s)}/>)}</section></div>
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
    <div className="toolbar"><div className="searchbox"><Search/><input ref={searchRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="Titre, artiste, auteur, tonalité, BPM, tags…"/></div><button className="secondary" onClick={()=>setFilters(v=>!v)}><Filter/>Filtres</button><label className="select-wrap"><ArrowUpDown/><select value={sort} onChange={e=>setSort(e.target.value)}><option value="title">Titre A–Z</option><option value="artist">Artiste A–Z</option><option value="bpm">BPM</option><option value="updated">Modifiés récemment</option></select></label></div>
    {filters&&<div className="filters"><select value={key} onChange={e=>setKey(e.target.value)}><option value="">Toutes tonalités</option>{keys.map(x=><option key={x}>{x}</option>)}</select><input value={min} onChange={e=>setMin(e.target.value)} placeholder="BPM min"/><input value={max} onChange={e=>setMax(e.target.value)} placeholder="BPM max"/><select value={sig} onChange={e=>setSig(e.target.value)}><option value="">Toutes signatures</option>{sigs.map(x=><option key={x}>{x}</option>)}</select><select value={style} onChange={e=>setStyle(e.target.value)}><option value="">Tous styles</option>{styles.map(x=><option key={x}>{x}</option>)}</select><label><input type="checkbox" checked={favOnly} onChange={e=>setFavOnly(e.target.checked)}/> Favoris</label></div>}
    <p className="result-count">{result.length} résultat{result.length>1?'s':''}</p><div className="songs-list">{result.length?result.map(s=><div className="library-result-wrap" key={s.id}><SongRow song={s} onOpen={()=>onOpen(s)} onFav={()=>onFav(s)}/><div className="library-setlist-action"><QuickSetlistAdd song={s} setlists={setlists} refresh={refreshSetlists} toast={toast}/></div></div>):<Empty text="Aucun résultat."/>}</div>
  </>
}


function QuickSetlistAdd({song,setlists,refresh,toast}:{song:Song;setlists:Setlist[];refresh:()=>Promise<void>;toast:(s:string)=>void}) {
  const [open,setOpen]=useState(false)
  const [name,setName]=useState('')
  const add=async(list:Setlist)=>{
    if(list.songIds.includes(song.id)){toast(`${song.title} est déjà dans ${list.name}.`);setOpen(false);return}
    await updateSetlist(list.id,{songIds:[...list.songIds,song.id]})
    await refresh()
    setOpen(false)
    toast(`${song.title} ajouté à ${list.name}.`)
  }
  const createAndAdd=async()=>{
    const clean=name.trim()
    if(!clean)return
    const list=await createSetlist(clean)
    await updateSetlist(list.id,{songIds:[song.id]})
    await refresh()
    setName('')
    setOpen(false)
    toast(`Setlist « ${clean} » créée avec ${song.title}.`)
  }
  return <div className="quick-setlist-add" onClick={e=>e.stopPropagation()}><button className="setlist-plus-btn" aria-label="Ajouter à une setlist" title="Ajouter à une setlist" onClick={()=>setOpen(v=>!v)}><Plus/></button>{open&&<div className="setlist-popover"><div className="setlist-popover-head"><b>Ajouter à une setlist</b><button className="icon-btn" onClick={()=>setOpen(false)}><X/></button></div><div className="setlist-popover-list">{setlists.length?setlists.map(list=><button key={list.id} onClick={()=>void add(list)}><ListMusic/><span>{list.name}</span>{list.songIds.includes(song.id)&&<Check/>}</button>):<small>Aucune setlist existante.</small>}</div><div className="setlist-popover-create"><input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void createAndAdd()}} placeholder="Nouvelle setlist…"/><button className="primary" disabled={!name.trim()} onClick={()=>void createAndAdd()}><Plus/>Créer</button></div></div>}</div>
}

function groupPeople(songs:Song[],field:'artist'|'authorComposer') {
  const map=new Map<string,Song[]>()
  songs.forEach(s=>{const n=s[field].trim();if(n)map.set(n,[...(map.get(n)||[]),s])})
  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]))
}

function PeoplePage({title,items,onOpen}:{title:string;items:[string,Song[]][];onOpen:(s:Song)=>void}) {
  const [open,setOpen]=useState<string|null>(null)
  const [q,setQ]=useState('')
  const deferredQ=useDeferredValue(q)
  const filtered=useMemo(()=>items.filter(([name,list])=>!deferredQ.trim()||name.toLowerCase().includes(deferredQ.toLowerCase())||list.some(s=>searchSong(s,deferredQ))),[items,deferredQ])
  return <><div className="page-head compact"><div><p className="eyebrow">Répertoire</p><h1>{title}</h1><p>{filtered.length} entrée{filtered.length>1?'s':''}</p></div></div><div className="artist-search searchbox"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={title.startsWith('Artistes')?'Rechercher un artiste ou un morceau…':'Rechercher…'}/></div><div className="people-grid">{filtered.map(([name,list])=><div className="person-card" key={name}><button onClick={()=>setOpen(open===name?null:name)}><span className="avatar">{name[0]}</span><span><b>{name}</b><small>{list.length} morceau{list.length>1?'x':''}</small></span><ChevronRight/></button>{open===name&&<div>{list.map(s=><button className="person-song" key={s.id} onClick={()=>onOpen(s)}>{s.title}<span>{s.personalKey||s.originalKey||'—'} · {s.bpm??'—'} BPM</span></button>)}</div>}</div>)}</div></>
}

function SimpleSongs({title,songs,onOpen,onFav}:{title:string;songs:Song[];onOpen:(s:Song)=>void;onFav:(s:Song)=>void}) {
  return <><div className="page-head compact"><div><p className="eyebrow">Répertoire</p><h1>{title}</h1><p>{songs.length} morceau{songs.length>1?'x':''}</p></div></div><div className="songs-list">{songs.length?songs.map(s=><SongRow key={s.id} song={s} onOpen={()=>onOpen(s)} onFav={()=>onFav(s)}/>):<Empty text="Rien à afficher."/>}</div></>
}

function SongDetail({song,onBack,onEdit,onFav,onLyricsSave,onDelete}:{song:Song;onBack:()=>void;onEdit:()=>void;onFav:()=>void;onLyricsSave:(lyrics:string)=>Promise<void>;onDelete:()=>void}) {
  const [editingLyrics,setEditingLyrics]=useState(false)
  const [lyricsDraft,setLyricsDraft]=useState(song.lyrics??'')
  const [confirm,setConfirm]=useState(false)
  const [transpose,setTranspose]=useState(0)
  const baseKey=song.personalKey||song.originalKey
  const workingKey=baseKey ? transposeKey(baseKey,transpose) : '—'
  const workingChords=transposeChordText(song.chords??'',transpose)
  return <><div className="detail-nav"><button className="ghost" onClick={onBack}><ChevronLeft/>Bibliothèque</button><div><button className="icon-btn" aria-label="Favori" onClick={onFav}><Heart fill={song.favorite?'currentColor':'none'}/></button><button className="secondary" onClick={onEdit}><Pencil/>Modifier</button><button className="danger" onClick={()=>setConfirm(true)}><Trash2/>Supprimer</button></div></div>
  <section className="song-hero"><div><p className="eyebrow">{song.style||'Morceau'}{song.source==='demo'?' · DEMO':''}</p><h1>{song.title}</h1><p>{song.artist||'Artiste inconnu'}{song.authorComposer?` · ${song.authorComposer}`:''}</p></div><div className="key-bpm"><div><span>Tonalité de travail</span><strong>{workingKey}</strong>{transpose!==0&&<small>{formatSemitoneOffset(transpose)} demi-ton{Math.abs(transpose)>1?'s':''}</small>}</div><div><span>BPM</span><strong>{song.bpm??'—'}</strong></div><div><span>Signature</span><strong>{song.timeSignature||'—'}</strong></div></div></section>
  <section className="transpose-bar" aria-label="Transposition"><div><span className="eyebrow">Transposition instantanée</span><b>{baseKey||'Tonalité non définie'} → {workingKey}</b></div><div className="transpose-controls"><button className="secondary transpose-btn" disabled={!baseKey||transpose<=-11} onClick={()=>setTranspose(v=>Math.max(-11,v-1))}><Minus/>½ ton</button><button className="ghost transpose-reset" disabled={transpose===0} onClick={()=>setTranspose(0)}><RotateCcw/>0</button><button className="secondary transpose-btn" disabled={!baseKey||transpose>=11} onClick={()=>setTranspose(v=>Math.min(11,v+1))}><Plus/>½ ton</button></div></section>
  <div className="musician-grid">
    <section className="panel info-list"><h2>Informations musicales</h2><div><span>Tonalité originale</span><b>{song.originalKey||'—'}</b></div><div><span>Tonalité habituelle</span><b>{song.personalKey||'—'}</b></div><div><span>Capo</span><b>{song.capo??'—'}</b></div><div><span>Durée</span><b>{formatDuration(song.durationSeconds)}</b></div><div><span>Tags</span><b>{song.tags.join(', ')||'—'}</b></div></section>
    <section className="panel performance-panel"><h2>Structure</h2><p className="performance-text">{song.structure||'Aucune structure renseignée.'}</p></section>
    <section className="panel performance-panel chords-panel"><div className="panel-title-row"><h2>Accords / repères</h2>{transpose!==0&&<span className="transpose-chip">{formatSemitoneOffset(transpose)}</span>}</div><pre className="chord-sheet">{workingChords||'Aucun accord ou repère renseigné.'}</pre></section>
    <section className="panel performance-panel"><h2>Notes instrumentales</h2><p className="performance-text">{song.instrumentNotes||'Aucune note instrumentale.'}</p></section>
    <section className="panel lyrics-panel"><div className="panel-title-row"><h2>Paroles</h2><button className="secondary lyrics-edit-btn" onClick={()=>{setLyricsDraft(song.lyrics??'');setEditingLyrics(true)}}><Pencil/>{song.lyrics?'Modifier':'Ajouter'}</button></div>{song.lyrics?<pre className="lyrics-text">{song.lyrics}</pre>:<p className="performance-text">Aucune parole enregistrée.</p>}</section>
    <MetronomeCard initialBpm={song.bpm??96} signature={song.timeSignature}/>
    <section className="panel notes-panel"><h2>Notes générales</h2><p className="notes">{song.notes||'Aucune note.'}</p>{song.referenceUrl&&<a href={song.referenceUrl} target="_blank" rel="noreferrer">Ouvrir le lien de référence</a>}</section>
  </div>
  {editingLyrics&&<Modal title="Paroles du morceau" onClose={()=>setEditingLyrics(false)}><textarea className="lyrics-editor" rows={18} value={lyricsDraft} onChange={e=>setLyricsDraft(e.target.value)} placeholder="Collez ou saisissez les paroles ici…"/><div className="modal-actions"><button className="secondary" onClick={()=>setEditingLyrics(false)}>Annuler</button><button className="primary" onClick={()=>void onLyricsSave(lyricsDraft).then(()=>setEditingLyrics(false))}><Save/>Enregistrer</button></div></Modal>}
  {confirm&&<Modal title="Supprimer ce morceau ?" onClose={()=>setConfirm(false)}><p>Le morceau sera masqué de la bibliothèque et pourra être restauré via l’action Annuler.</p><div className="modal-actions"><button className="secondary" onClick={()=>setConfirm(false)}>Annuler</button><button className="danger" onClick={onDelete}><Trash2/>Supprimer</button></div></Modal>}</>
}

function SongForm({initial,onCancel,onSave}:{initial:Song|null;onCancel:()=>void;onSave:(d:SongDraft)=>Promise<void>}) {
  const [d,setD]=useState<SongDraft>(()=>initial?{...emptySongDraft(),title:initial.title,artist:initial.artist,authorComposer:initial.authorComposer,originalKey:initial.originalKey,personalKey:initial.personalKey,bpm:initial.bpm,timeSignature:initial.timeSignature,style:initial.style,durationSeconds:initial.durationSeconds,tags:initial.tags,notes:initial.notes,referenceUrl:initial.referenceUrl,capo:initial.capo??null,structure:initial.structure??'',chords:initial.chords??'',instrumentNotes:initial.instrumentNotes??'',lyrics:initial.lyrics??'',favorite:initial.favorite,source:initial.source}:emptySongDraft())
  const [duration,setDuration]=useState(initial?formatDuration(initial.durationSeconds)==='—'?'':formatDuration(initial.durationSeconds):'')
  const [saving,setSaving]=useState(false)
  const set=<K extends keyof SongDraft>(k:K,v:SongDraft[K])=>setD(x=>({...x,[k]:v}))
  const submit=async(e:FormEvent)=>{e.preventDefault();if(!d.title.trim())return;setSaving(true);await onSave({...d,title:d.title.trim(),originalKey:normalizeKey(d.originalKey),personalKey:normalizeKey(d.personalKey),durationSeconds:parseDuration(duration)});setSaving(false)}
  return <><div className="page-head compact"><div><p className="eyebrow">{initial?'Modification':'Nouveau morceau'}</p><h1>{initial?initial.title:'Ajouter un morceau'}</h1></div></div><form className="panel form-grid" onSubmit={e=>void submit(e)}><label className="span2">Titre *<input required value={d.title} onChange={e=>set('title',e.target.value)} autoFocus/></label><label>Artiste<input value={d.artist} onChange={e=>set('artist',e.target.value)}/></label><label>Auteur / Compositeur<input value={d.authorComposer} onChange={e=>set('authorComposer',e.target.value)}/></label><label>Tonalité originale<input value={d.originalKey} onChange={e=>set('originalKey',e.target.value)}/></label><label>Tonalité habituelle<input value={d.personalKey} onChange={e=>set('personalKey',e.target.value)}/></label><label>BPM<input inputMode="numeric" value={d.bpm??''} onChange={e=>set('bpm',parseBpm(e.target.value))}/></label><label>Signature<input value={d.timeSignature} onChange={e=>set('timeSignature',e.target.value)} placeholder="4/4"/></label><label>Style<input value={d.style} onChange={e=>set('style',e.target.value)}/></label><label>Durée mm:ss<input value={duration} onChange={e=>setDuration(e.target.value)} placeholder="4:30"/></label><label>Capo<input inputMode="numeric" type="number" min="0" max="12" value={d.capo??''} onChange={e=>set('capo',e.target.value===''?null:Math.max(0,Math.min(12,Number(e.target.value))))}/></label><label>Tags<input value={d.tags.join(', ')} onChange={e=>set('tags',e.target.value.split(/[;,]/).map(x=>x.trim()).filter(Boolean))}/></label><div className="form-section-title span2"><span>Préparation musicale</span><small>Informations utiles en répétition et sur scène</small></div><label className="span2">Structure<textarea rows={3} value={d.structure??''} onChange={e=>set('structure',e.target.value)} placeholder="Intro · Couplet 1 · Refrain · Couplet 2 · Pont · Refrain x2"/></label><label className="span2">Accords / repères<textarea rows={5} className="chord-input" value={d.chords??''} onChange={e=>set('chords',e.target.value)} placeholder="C   G/B   Am7   F&#10;C   G     F"/></label><label className="span2">Notes instrumentales<textarea rows={4} value={d.instrumentNotes??''} onChange={e=>set('instrumentNotes',e.target.value)} placeholder="Sax après refrain 2, basse légère au couplet, pad au pont…"/></label><label className="span2">Paroles<textarea rows={8} value={d.lyrics??''} onChange={e=>set('lyrics',e.target.value)} placeholder="Paroles du morceau…"/></label><label className="span2">Lien de référence<input value={d.referenceUrl} onChange={e=>set('referenceUrl',e.target.value)}/></label><label className="span2">Notes générales<textarea rows={5} value={d.notes} onChange={e=>set('notes',e.target.value)}/></label><div className="form-actions span2"><button type="button" className="secondary" onClick={onCancel}>Annuler</button><button className="primary" disabled={saving}><Save/>{saving?'Enregistrement…':'Enregistrer'}</button></div></form></>
}

const fieldOptions:[ImportField,string][]=[['title','Titre *'],['artist','Artiste'],['authorComposer','Auteur / Compositeur'],['originalKey','Tonalité originale'],['personalKey','Tonalité personnelle'],['bpm','BPM'],['timeSignature','Signature rythmique'],['style','Style'],['duration','Durée'],['tags','Tags'],['notes','Notes'],['referenceUrl','Lien de référence'],['capo','Capo'],['structure','Structure'],['chords','Accords'],['instrumentNotes','Notes instrumentales'],['lyrics','Paroles']]

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

function SettingsPage({theme,setTheme,songs,refresh,toast,userEmail,localCount,cloudStats,syncing,onSync,onPull,onSignedIn}:{theme:string;setTheme:(t:'dark'|'light'|'system')=>void;songs:Song[];refresh:()=>Promise<void>;toast:(s:string)=>void;userEmail:string;localCount:number;cloudStats:{songs:number;setlists:number}|null;syncing:boolean;onSync:()=>void;onPull:()=>void;onSignedIn:()=>Promise<void>}) {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[authBusy,setAuthBusy]=useState(false)
  const demos=songs.filter(s=>s.source==='demo')
  const remove=async()=>{await db.songs.bulkDelete(demos.map(x=>x.id));await refresh();toast(`${demos.length} démo(s) supprimée(s).`)}
  const auth=async(mode:'login'|'signup')=>{try{setAuthBusy(true);const r=mode==='login'?await signIn(email,password):await signUp(email,password);if(r.error)throw r.error;toast(mode==='login'?'Connexion réussie.':'Compte créé. Vérifiez votre e-mail si une confirmation est demandée.');await onSignedIn()}catch(e){toast(e instanceof Error?e.message:'Authentification impossible.')}finally{setAuthBusy(false)}}
  const logout=async()=>{await signOut();toast('Déconnecté du cloud DI’ART.');location.reload()}
  return <><div className="page-head compact"><div><p className="eyebrow">Paramètres</p><h1>Préférences</h1></div></div>
  <section className="panel cloud-panel"><div className="cloud-heading"><Cloud/><div><h2>Cloud DI’ART</h2><p>{userEmail?`Connecté : ${userEmail}`:'Connectez le même compte sur PC, tablette et Android pour retrouver automatiquement votre bibliothèque.'}</p></div></div>{userEmail?<><div className="cloud-stats"><div><span>Sur cet appareil</span><b>{localCount}</b><small>morceaux</small></div><div><span>Dans le cloud</span><b>{cloudStats?.songs??'—'}</b><small>morceaux</small></div><div><span>Setlists cloud</span><b>{cloudStats?.setlists??'—'}</b><small>listes</small></div></div><div className="cloud-help">Vérifiez que cette adresse e-mail est exactement la même sur le PC, la tablette et Android.</div><div className="cloud-actions"><button className="primary" disabled={syncing} onClick={onPull}><Download/>{syncing?'Récupération…':'Récupérer depuis le cloud'}</button><button className="secondary" disabled={syncing} onClick={onSync}>{syncing?'Synchronisation…':'Synchroniser maintenant'}</button><button className="secondary" onClick={()=>void logout()}><LogOut/>Déconnexion</button></div></>:<div className="cloud-auth"><input type="email" placeholder="Adresse e-mail" value={email} onChange={e=>setEmail(e.target.value)}/><input type="password" placeholder="Mot de passe" value={password} onChange={e=>setPassword(e.target.value)}/><button className="primary" disabled={authBusy||!email||password.length<6} onClick={()=>void auth('login')}><LogIn/>Connexion</button><button className="secondary" disabled={authBusy||!email||password.length<6} onClick={()=>void auth('signup')}>Créer un compte</button></div>}</section>
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
    gain.gain.setValueAtTime(accent?.19:.12,time)
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

function SetlistsPage({songs,setlists,refresh,toast}:{songs:Song[];setlists:Setlist[];refresh:()=>Promise<void>;toast:(s:string)=>void}) {
  const [name,setName]=useState('')
  const [open,setOpen]=useState<string|null>(null)
  const [live,setLive]=useState<{id:string;index:number;rehearsal:boolean}|null>(null)
  const [editing,setEditing]=useState<string|null>(null)
  const [editName,setEditName]=useState('')
  const create=async()=>{if(!name.trim())return;const s=await createSetlist(name);setName('');setOpen(s.id);await refresh();toast(`Setlist « ${s.name} » créée.`)}
  const rename=async(list:Setlist)=>{const next=editName.trim();if(!next){setEditing(null);return}await updateSetlist(list.id,{name:next});await refresh();setEditing(null);toast('Nom de la setlist mis à jour.')}
  const add=async(list:Setlist,songId:string)=>{if(list.songIds.includes(songId))return;await updateSetlist(list.id,{songIds:[...list.songIds,songId]});await refresh()}
  const remove=async(list:Setlist,songId:string)=>{await updateSetlist(list.id,{songIds:list.songIds.filter(id=>id!==songId)});await refresh()}
  const move=async(list:Setlist,index:number,dir:number)=>{const target=index+dir;if(target<0||target>=list.songIds.length)return;const ids=[...list.songIds];[ids[index],ids[target]]=[ids[target],ids[index]];await updateSetlist(list.id,{songIds:ids});await refresh()}
  const active=live?setlists.find(x=>x.id===live.id):null
  const liveSong=active?songs.find(s=>s.id===active.songIds[live!.index]):null
  return <><div className="page-head"><div><p className="eyebrow">V1.3</p><h1>Setlists</h1><p>Chaque setlist possède son propre nom et peut être renommée à tout moment.</p></div><div className="setlist-create"><input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void create()}} placeholder="Nom de la nouvelle setlist"/><button className="primary" disabled={!name.trim()} onClick={()=>void create()}><Plus/>Créer</button></div></div>
  <div className="setlist-grid">{setlists.length?setlists.map(list=><section className="panel setlist-card" key={list.id}><div className="setlist-head">{editing===list.id?<div className="setlist-rename"><input autoFocus value={editName} onChange={e=>setEditName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void rename(list);if(e.key==='Escape')setEditing(null)}}/><button className="icon-btn" onClick={()=>void rename(list)}><Check/></button><button className="icon-btn" onClick={()=>setEditing(null)}><X/></button></div>:<button className="setlist-title-button" onClick={()=>setOpen(open===list.id?null:list.id)}><div><b>{list.name}</b><small>{list.songIds.length} morceau{list.songIds.length>1?'x':''}</small></div><ChevronRight/></button>}<button className="icon-btn setlist-edit-name" aria-label="Renommer" onClick={()=>{setEditing(list.id);setEditName(list.name)}}><Pencil/></button></div>{open===list.id&&<div className="setlist-body"><div className="setlist-actions"><button className="secondary" disabled={!list.songIds.length} onClick={()=>setLive({id:list.id,index:0,rehearsal:true})}><Play/>Répétition</button><button className="primary" disabled={!list.songIds.length} onClick={()=>setLive({id:list.id,index:0,rehearsal:false})}><Maximize2/>Live Mode</button></div><select defaultValue="" onChange={e=>{if(e.target.value)void add(list,e.target.value);e.target.value=''}}><option value="">+ Ajouter un morceau</option>{songs.filter(s=>!list.songIds.includes(s.id)).map(s=><option value={s.id} key={s.id}>{s.title} — {s.artist}</option>)}</select><div className="setlist-songs">{list.songIds.map((id,i)=>{const s=songs.find(x=>x.id===id);return s?<div key={id}><span className="setlist-number">{i+1}</span><span><b>{s.title}</b><small>{s.artist||'Artiste inconnu'} · {s.personalKey||s.originalKey||'—'} · {s.bpm??'—'} BPM</small></span><button className="icon-btn" disabled={i===0} onClick={()=>void move(list,i,-1)}><ChevronUp/></button><button className="icon-btn" disabled={i===list.songIds.length-1} onClick={()=>void move(list,i,1)}><ChevronDown/></button><button className="icon-btn danger" onClick={()=>void remove(list,id)}><X/></button></div>:null})}</div></div>}</section>):<Empty text="Aucune setlist. Donnez un nom à votre première liste puis ajoutez vos morceaux."/>}</div>
  {live&&active&&liveSong&&<div className={`live-mode ${live.rehearsal?'rehearsal':''}`}><button className="live-close" onClick={()=>setLive(null)}><X/></button><div className="live-counter">{active.name} · {live.index+1}/{active.songIds.length}</div><div className="live-content"><p>{liveSong.artist||'Artiste inconnu'}</p><h1>{liveSong.title}</h1><div className="live-metrics"><strong>{liveSong.personalKey||liveSong.originalKey||'—'}</strong><span>{liveSong.bpm??'—'} BPM</span><span>{liveSong.timeSignature||'—'}</span></div>{live.rehearsal&&<><p className="live-structure">{liveSong.structure||'Structure non renseignée'}</p><pre>{liveSong.chords||'Accords non renseignés'}</pre></>}</div><div className="live-nav"><button className="secondary" disabled={live.index===0} onClick={()=>setLive({...live,index:live.index-1})}><ChevronLeft/>Précédent</button><button className="primary" disabled={live.index===active.songIds.length-1} onClick={()=>setLive({...live,index:live.index+1})}>Suivant<ChevronRight/></button></div></div>}
  </>
}

function Empty({text}:{text:string}) { return <div className="empty"><Music2/><p>{text}</p></div> }

export default App

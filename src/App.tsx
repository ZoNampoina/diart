import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject, type FormEvent } from 'react'
import {
  BookOpen, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Heart, Home, Import,
  Library, Menu, Moon, MoreHorizontal, Music2, Plus, Search, Settings, Star, Sun,
  Trash2, Upload, UserRound, UsersRound, Wifi, WifiOff, X, Pencil, Save, RotateCcw,
  Filter, ArrowUpDown, Check, AlertTriangle, Minus
} from 'lucide-react'
import { db, createSong, ensureDemoSeed, getSetting, markViewed, setSetting, softDeleteSong, updateSong } from './db'
import type { ImportField, ImportMapping, ImportRowPreview, Song, SongDraft } from './types'
import { emptySongDraft, formatDuration, normalizeKey, parseBpm, parseDuration, searchSong, transposeKey, transposeChordText, formatSemitoneOffset } from './music'
import { parseWorkbook, rowsToPreview, suggestMapping, type ParsedWorkbook } from './importer'
import { exportCsv, exportJson, exportXlsx, restoreJson } from './exporter'

const navItems = [
  ['dashboard','Accueil',Home], ['library','Bibliothèque',Library], ['artists','Artistes',UsersRound],
  ['authors','Auteurs',UserRound], ['favorites','Favoris',Heart], ['recent','Récents',BookOpen],
  ['import','Importer',Import], ['backup','Sauvegarde',Download], ['settings','Paramètres',Settings]
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
  const searchRef=useRef<HTMLInputElement>(null)

  const toast=(text:string,action?:Toast['action'])=>{
    const id=Date.now()+Math.random()
    setToasts(x=>[...x,{id,text,action}])
    setTimeout(()=>setToasts(x=>x.filter(t=>t.id!==id)),4500)
  }

  useEffect(()=>{void getSetting('theme','dark').then(v=>setTheme((v as typeof theme)||'dark'))},[])
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
        {page==='dashboard'&&<Dashboard songs={songs} artists={artists} authors={authors} onOpen={openSong} onGo={go} onFav={fav}/>} 
        {page==='library'&&<LibraryPage songs={songs} searchRef={searchRef} onOpen={openSong} onFav={fav}/>}
        {page==='artists'&&<PeoplePage title="Artistes" items={groupPeople(songs,'artist')} onOpen={openSong}/>}
        {page==='authors'&&<PeoplePage title="Auteurs / Compositeurs" items={groupPeople(songs,'authorComposer')} onOpen={openSong}/>}
        {page==='favorites'&&<SimpleSongs title="Favoris" songs={songs.filter(s=>s.favorite)} onOpen={openSong} onFav={fav}/>}
        {page==='recent'&&<SimpleSongs title="Récents" songs={[...songs].sort((a,b)=>(b.lastViewedAt||b.updatedAt).localeCompare(a.lastViewedAt||a.updatedAt)).slice(0,50)} onOpen={openSong} onFav={fav}/>}
        {page==='song'&&selected&&<SongDetail song={songs.find(s=>s.id===selected.id)||selected} onBack={()=>go('library')} onEdit={()=>go('edit')} onFav={()=>void fav(songs.find(s=>s.id===selected.id)||selected)} onDelete={async()=>{const id=selected.id;await softDeleteSong(id);await refresh();toast('Morceau placé dans la corbeille',{label:'Annuler',run:async()=>{await db.songs.update(id,{deletedAt:null});await refresh()}});go('library')}}/>}
        {(page==='new'||(page==='edit'&&selected))&&<SongForm initial={page==='edit'?selected:null} onCancel={()=>go(selected?'song':'library')} onSave={async draft=>{if(page==='edit'&&selected){await updateSong(selected.id,draft);await refresh();setSelected({...selected,...draft,updatedAt:new Date().toISOString()});toast('Morceau mis à jour');go('song')}else{const s=await createSong(draft);await refresh();setSelected(s);toast('Morceau ajouté');go('song')}}}/>}
        {page==='import'&&<ImportWizard songs={songs} refresh={refresh} toast={toast}/>}
        {page==='backup'&&<BackupPage songs={songs} refresh={refresh} toast={toast}/>}
        {page==='settings'&&<SettingsPage theme={theme} setTheme={setTheme} songs={songs} refresh={refresh} toast={toast}/>}
      </div>
    </main>
    <nav className="bottom-nav">
      <button onClick={()=>go('library')}><Library/><span>Bibliothèque</span></button>
      <button onClick={()=>go('artists')}><UsersRound/><span>Artistes</span></button>
      <button onClick={()=>{go('library');setTimeout(()=>searchRef.current?.focus(),50)}}><Search/><span>Recherche</span></button>
      <button onClick={()=>go('favorites')}><Heart/><span>Favoris</span></button>
      <button onClick={()=>setSidebar(true)}><MoreHorizontal/><span>Plus</span></button>
    </nav>
    <Toasts items={toasts}/>
  </div>
}

function Dashboard({songs,artists,authors,onOpen,onGo,onFav}:{songs:Song[];artists:number;authors:number;onOpen:(s:Song)=>void;onGo:(p:Page)=>void;onFav:(s:Song)=>void}) {
  const recent=[...songs].sort((a,b)=>(b.lastViewedAt||'').localeCompare(a.lastViewedAt||'')).filter(s=>s.lastViewedAt).slice(0,5)
  const added=[...songs].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,5)
  return <>
    <div className="page-head"><div><p className="eyebrow">Répertoire personnel</p><h1>Votre musique, immédiatement.</h1><p>Retrouvez tonalité, BPM et informations utiles en quelques secondes.</p></div><div className="actions"><button className="secondary" onClick={()=>onGo('import')}><FileSpreadsheet/>Importer</button><button className="primary" onClick={()=>onGo('new')}><Plus/>Nouveau morceau</button></div></div>
    <button className="global-search" onClick={()=>onGo('library')}><Search/>Rechercher un titre, artiste, tonalité, BPM… <kbd>Ctrl K</kbd></button>
    <div className="metrics"><Metric label="Morceaux" value={songs.length}/><Metric label="Artistes" value={artists}/><Metric label="Auteurs" value={authors}/><Metric label="Favoris" value={songs.filter(s=>s.favorite).length}/></div>
    <div className="two-col"><section className="panel"><h2>Récemment consultés</h2>{recent.length?recent.map(s=><SongRow key={s.id} song={s} onOpen={()=>onOpen(s)} onFav={()=>onFav(s)}/>):<Empty text="Aucun morceau consulté."/>}</section><section className="panel"><h2>Ajouts récents</h2>{added.map(s=><SongRow key={s.id} song={s} onOpen={()=>onOpen(s)} onFav={()=>onFav(s)}/>)}</section></div>
  </>
}

function LibraryPage({songs,searchRef,onOpen,onFav}:{songs:Song[];searchRef:RefObject<HTMLInputElement>;onOpen:(s:Song)=>void;onFav:(s:Song)=>void}) {
  const [q,setQ]=useState(''),[key,setKey]=useState(''),[sig,setSig]=useState(''),[style,setStyle]=useState(''),[favOnly,setFavOnly]=useState(false),[min,setMin]=useState(''),[max,setMax]=useState(''),[sort,setSort]=useState('title'),[filters,setFilters]=useState(false)
  const keys=[...new Set(songs.map(s=>s.personalKey||s.originalKey).filter(Boolean))].sort()
  const sigs=[...new Set(songs.map(s=>s.timeSignature).filter(Boolean))].sort()
  const styles=[...new Set(songs.map(s=>s.style).filter(Boolean))].sort()
  const result=useMemo(()=>songs.filter(s=>searchSong(s,q))
    .filter(s=>!key||(s.personalKey||s.originalKey)===key).filter(s=>!sig||s.timeSignature===sig)
    .filter(s=>!style||s.style===style).filter(s=>!favOnly||s.favorite)
    .filter(s=>!min||(s.bpm!==null&&s.bpm>=Number(min))).filter(s=>!max||(s.bpm!==null&&s.bpm<=Number(max)))
    .sort((a,b)=>sort==='artist'?a.artist.localeCompare(b.artist):sort==='bpm'?(a.bpm??999)-(b.bpm??999):sort==='updated'?b.updatedAt.localeCompare(a.updatedAt):a.title.localeCompare(b.title)),
  [songs,q,key,sig,style,favOnly,min,max,sort])
  return <>
    <div className="page-head compact"><div><p className="eyebrow">Bibliothèque</p><h1>{songs.length} morceaux</h1></div></div>
    <div className="toolbar"><div className="searchbox"><Search/><input ref={searchRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="Titre, artiste, auteur, tonalité, BPM, tags…"/></div><button className="secondary" onClick={()=>setFilters(v=>!v)}><Filter/>Filtres</button><label className="select-wrap"><ArrowUpDown/><select value={sort} onChange={e=>setSort(e.target.value)}><option value="title">Titre A–Z</option><option value="artist">Artiste A–Z</option><option value="bpm">BPM</option><option value="updated">Modifiés récemment</option></select></label></div>
    {filters&&<div className="filters"><select value={key} onChange={e=>setKey(e.target.value)}><option value="">Toutes tonalités</option>{keys.map(x=><option key={x}>{x}</option>)}</select><input value={min} onChange={e=>setMin(e.target.value)} placeholder="BPM min"/><input value={max} onChange={e=>setMax(e.target.value)} placeholder="BPM max"/><select value={sig} onChange={e=>setSig(e.target.value)}><option value="">Toutes signatures</option>{sigs.map(x=><option key={x}>{x}</option>)}</select><select value={style} onChange={e=>setStyle(e.target.value)}><option value="">Tous styles</option>{styles.map(x=><option key={x}>{x}</option>)}</select><label><input type="checkbox" checked={favOnly} onChange={e=>setFavOnly(e.target.checked)}/> Favoris</label></div>}
    <p className="result-count">{result.length} résultat{result.length>1?'s':''}</p><div className="songs-list">{result.length?result.map(s=><SongRow key={s.id} song={s} onOpen={()=>onOpen(s)} onFav={()=>onFav(s)}/>):<Empty text="Aucun résultat."/>}</div>
  </>
}

function groupPeople(songs:Song[],field:'artist'|'authorComposer') {
  const map=new Map<string,Song[]>()
  songs.forEach(s=>{const n=s[field].trim();if(n)map.set(n,[...(map.get(n)||[]),s])})
  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]))
}

function PeoplePage({title,items,onOpen}:{title:string;items:[string,Song[]][];onOpen:(s:Song)=>void}) {
  const [open,setOpen]=useState<string|null>(null)
  return <><div className="page-head compact"><div><p className="eyebrow">Répertoire</p><h1>{title}</h1><p>{items.length} entrée{items.length>1?'s':''}</p></div></div><div className="people-grid">{items.map(([name,list])=><div className="person-card" key={name}><button onClick={()=>setOpen(open===name?null:name)}><span className="avatar">{name[0]}</span><span><b>{name}</b><small>{list.length} morceau{list.length>1?'x':''}</small></span><ChevronRight/></button>{open===name&&<div>{list.map(s=><button className="person-song" key={s.id} onClick={()=>onOpen(s)}>{s.title}<span>{s.personalKey||s.originalKey||'—'} · {s.bpm??'—'} BPM</span></button>)}</div>}</div>)}</div></>
}

function SimpleSongs({title,songs,onOpen,onFav}:{title:string;songs:Song[];onOpen:(s:Song)=>void;onFav:(s:Song)=>void}) {
  return <><div className="page-head compact"><div><p className="eyebrow">Répertoire</p><h1>{title}</h1><p>{songs.length} morceau{songs.length>1?'x':''}</p></div></div><div className="songs-list">{songs.length?songs.map(s=><SongRow key={s.id} song={s} onOpen={()=>onOpen(s)} onFav={()=>onFav(s)}/>):<Empty text="Rien à afficher."/>}</div></>
}

function SongDetail({song,onBack,onEdit,onFav,onDelete}:{song:Song;onBack:()=>void;onEdit:()=>void;onFav:()=>void;onDelete:()=>void}) {
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
    <section className="panel notes-panel"><h2>Notes générales</h2><p className="notes">{song.notes||'Aucune note.'}</p>{song.referenceUrl&&<a href={song.referenceUrl} target="_blank" rel="noreferrer">Ouvrir le lien de référence</a>}</section>
  </div>
  {confirm&&<Modal title="Supprimer ce morceau ?" onClose={()=>setConfirm(false)}><p>Le morceau sera masqué de la bibliothèque et pourra être restauré via l’action Annuler.</p><div className="modal-actions"><button className="secondary" onClick={()=>setConfirm(false)}>Annuler</button><button className="danger" onClick={onDelete}><Trash2/>Supprimer</button></div></Modal>}</>
}

function SongForm({initial,onCancel,onSave}:{initial:Song|null;onCancel:()=>void;onSave:(d:SongDraft)=>Promise<void>}) {
  const [d,setD]=useState<SongDraft>(()=>initial?{...emptySongDraft(),title:initial.title,artist:initial.artist,authorComposer:initial.authorComposer,originalKey:initial.originalKey,personalKey:initial.personalKey,bpm:initial.bpm,timeSignature:initial.timeSignature,style:initial.style,durationSeconds:initial.durationSeconds,tags:initial.tags,notes:initial.notes,referenceUrl:initial.referenceUrl,capo:initial.capo??null,structure:initial.structure??'',chords:initial.chords??'',instrumentNotes:initial.instrumentNotes??'',favorite:initial.favorite,source:initial.source}:emptySongDraft())
  const [duration,setDuration]=useState(initial?formatDuration(initial.durationSeconds)==='—'?'':formatDuration(initial.durationSeconds):'')
  const [saving,setSaving]=useState(false)
  const set=<K extends keyof SongDraft>(k:K,v:SongDraft[K])=>setD(x=>({...x,[k]:v}))
  const submit=async(e:FormEvent)=>{e.preventDefault();if(!d.title.trim())return;setSaving(true);await onSave({...d,title:d.title.trim(),originalKey:normalizeKey(d.originalKey),personalKey:normalizeKey(d.personalKey),durationSeconds:parseDuration(duration)});setSaving(false)}
  return <><div className="page-head compact"><div><p className="eyebrow">{initial?'Modification':'Nouveau morceau'}</p><h1>{initial?initial.title:'Ajouter un morceau'}</h1></div></div><form className="panel form-grid" onSubmit={e=>void submit(e)}><label className="span2">Titre *<input required value={d.title} onChange={e=>set('title',e.target.value)} autoFocus/></label><label>Artiste<input value={d.artist} onChange={e=>set('artist',e.target.value)}/></label><label>Auteur / Compositeur<input value={d.authorComposer} onChange={e=>set('authorComposer',e.target.value)}/></label><label>Tonalité originale<input value={d.originalKey} onChange={e=>set('originalKey',e.target.value)}/></label><label>Tonalité habituelle<input value={d.personalKey} onChange={e=>set('personalKey',e.target.value)}/></label><label>BPM<input inputMode="numeric" value={d.bpm??''} onChange={e=>set('bpm',parseBpm(e.target.value))}/></label><label>Signature<input value={d.timeSignature} onChange={e=>set('timeSignature',e.target.value)} placeholder="4/4"/></label><label>Style<input value={d.style} onChange={e=>set('style',e.target.value)}/></label><label>Durée mm:ss<input value={duration} onChange={e=>setDuration(e.target.value)} placeholder="4:30"/></label><label>Capo<input inputMode="numeric" type="number" min="0" max="12" value={d.capo??''} onChange={e=>set('capo',e.target.value===''?null:Math.max(0,Math.min(12,Number(e.target.value))))}/></label><label>Tags<input value={d.tags.join(', ')} onChange={e=>set('tags',e.target.value.split(/[;,]/).map(x=>x.trim()).filter(Boolean))}/></label><div className="form-section-title span2"><span>Préparation musicale</span><small>Informations utiles en répétition et sur scène</small></div><label className="span2">Structure<textarea rows={3} value={d.structure??''} onChange={e=>set('structure',e.target.value)} placeholder="Intro · Couplet 1 · Refrain · Couplet 2 · Pont · Refrain x2"/></label><label className="span2">Accords / repères<textarea rows={5} className="chord-input" value={d.chords??''} onChange={e=>set('chords',e.target.value)} placeholder="C   G/B   Am7   F&#10;C   G     F"/></label><label className="span2">Notes instrumentales<textarea rows={4} value={d.instrumentNotes??''} onChange={e=>set('instrumentNotes',e.target.value)} placeholder="Sax après refrain 2, basse légère au couplet, pad au pont…"/></label><label className="span2">Lien de référence<input value={d.referenceUrl} onChange={e=>set('referenceUrl',e.target.value)}/></label><label className="span2">Notes générales<textarea rows={5} value={d.notes} onChange={e=>set('notes',e.target.value)}/></label><div className="form-actions span2"><button type="button" className="secondary" onClick={onCancel}>Annuler</button><button className="primary" disabled={saving}><Save/>{saving?'Enregistrement…':'Enregistrer'}</button></div></form></>
}

const fieldOptions:[ImportField,string][]=[['title','Titre *'],['artist','Artiste'],['authorComposer','Auteur / Compositeur'],['originalKey','Tonalité originale'],['personalKey','Tonalité personnelle'],['bpm','BPM'],['timeSignature','Signature rythmique'],['style','Style'],['duration','Durée'],['tags','Tags'],['notes','Notes'],['referenceUrl','Lien de référence']]

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

function SettingsPage({theme,setTheme,songs,refresh,toast}:{theme:string;setTheme:(t:'dark'|'light'|'system')=>void;songs:Song[];refresh:()=>Promise<void>;toast:(s:string)=>void}) {
  const demos=songs.filter(s=>s.source==='demo')
  const remove=async()=>{await db.songs.bulkDelete(demos.map(x=>x.id));await refresh();toast(`${demos.length} démo(s) supprimée(s).`)}
  return <><div className="page-head compact"><div><p className="eyebrow">Paramètres</p><h1>Préférences</h1></div></div><section className="panel settings-list"><div><span><b>Thème</b><small>Apparence de l’interface</small></span><select value={theme} onChange={e=>setTheme(e.target.value as 'dark'|'light'|'system')}><option value="dark">Sombre</option><option value="light">Clair</option><option value="system">Système</option></select></div><div><span><b>Données de démonstration</b><small>{demos.length} morceau(x)</small></span><button className="danger" disabled={!demos.length} onClick={()=>void remove()}><Trash2/>Supprimer les démos</button></div><div><span><b>Synchronisation cloud</b><small>Prévue pour une version ultérieure.</small></span><em>Prévu</em></div><div><span><b>Expérience musicale V1.2</b><small>Transposition, structure, accords, capo et notes instrumentales actifs.</small></span><em>Actif</em></div><div><span><b>Métronome, setlists et Live</b><small>Prochaines évolutions.</small></span><em>À venir</em></div></section></>
}

function Empty({text}:{text:string}) { return <div className="empty"><Music2/><p>{text}</p></div> }

export default App

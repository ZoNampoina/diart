import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, ArrowLeftRight, Check, ChevronDown, ListMusic, LoaderCircle, Pencil, Plus, Search, Sparkles, X } from 'lucide-react'
import { createSetlist, createSong, db, logActivity, updateSetlist, updateSong } from './db'
import { fetchTononkiraReference, importExternalRecueil, searchExternalRecueil, searchTononkira, type ExternalRecueilResult, type ExternalRecueilSource } from './catalog'
import type { Setlist, Song, SongDraft } from './types'
import {
  SMART_IMPORT_THRESHOLDS, classifySongOrigin, draftFromExternal, externalQueryVariants, matchLocalSongs,
  minimalDraft, missingFieldsPatch, parseSmartList, scoreExternalMatch, type SmartImportLine
} from './smart-list-import'

export type SmartListImportMode='new-setlist'|'append-setlist'|'songs-only'
export interface SmartListImportResult{setlistId?:string;setlistName?:string;createdSongs:number;reusedSongs:number;minimalSongs:number;total:number}

type Props={
  mode:SmartListImportMode
  songs:Song[]
  targetSetlist?:Setlist|null
  onClose:()=>void
  onDone:(result:SmartListImportResult)=>Promise<void>|void
  toast:(message:string)=>void
}

type ExternalDraft={draft:SongDraft;source:string;sourceUrl:string;score:number}
type CompletionState={row:SmartImportLine;existing:Song;incoming:SongDraft;source:string}|null

const SOURCE_LABELS:Record<ExternalRecueilSource,string>={'ultimate-guitar':'Ultimate Guitar','acoustic-gasy':'AcousticGasy',chordify:'Chordify'}

function normalizeLyrics(value:string):string{
  return String(value??'').replace(/\r/g,'').replace(/\u00a0/g,' ').split('\n').map(x=>x.replace(/[ \t]+$/,'')).join('\n').replace(/\n{3,}/g,'\n\n').trim()
}

function externalQuality(result:ExternalRecueilResult):number{
  const text=(result.subtitle||'').toLowerCase()
  if(/chords?\s*\+\s*lyrics?|chords?.*lyrics?|lyrics?.*chords?/.test(text))return 30
  if(/chords?|accords?/.test(text))return 22
  if(/tab|structured|structure/.test(text))return 12
  if(/lyrics?|paroles?/.test(text))return 5
  return 0
}

async function collectExternalResults(source:ExternalRecueilSource,row:SmartImportLine):Promise<Array<{item:ExternalRecueilResult;score:number}>>{
  const merged=new Map<string,{item:ExternalRecueilResult;score:number}>()
  for(const variant of externalQueryVariants(row.title,row.artist)){
    try{
      const found=await searchExternalRecueil(source,variant.title,variant.artist)
      for(const item of found){
        const score=scoreExternalMatch(row.title,row.artist,item)
        const previous=merged.get(item.url)
        if(!previous||score>previous.score)merged.set(item.url,{item,score})
      }
      if([...merged.values()].some(x=>x.score>=92))break
    }catch{}
  }
  return [...merged.values()].sort((a,b)=>(b.score+externalQuality(b.item))-(a.score+externalQuality(a.item)))
}

async function bestExternalDraft(source:ExternalRecueilSource,row:SmartImportLine):Promise<ExternalDraft|null>{
  const candidates=(await collectExternalResults(source,row)).filter(x=>x.score>=SMART_IMPORT_THRESHOLDS.external).slice(0,3)
  if(!candidates.length)return null
  let best:{value:ExternalDraft;rank:number}|null=null
  for(const candidate of candidates){
    try{
      const full=await importExternalRecueil(source,candidate.item.url)
      const draft=draftFromExternal({...full,source:full.source||SOURCE_LABELS[source]},row)
      const contentRank=(draft.chordLyrics?.trim()?35:0)+(draft.chords?.trim()?25:0)+(draft.lyrics?.trim()?12:0)+(draft.originalKey?5:0)+(draft.structure?4:0)
      const rank=candidate.score+contentRank
      const value={draft,source:SOURCE_LABELS[source],sourceUrl:draft.referenceUrl||candidate.item.url,score:candidate.score}
      if(!best||rank>best.rank)best={value,rank}
      if(source==='ultimate-guitar'&&draft.chordLyrics?.trim()&&candidate.score>=82)break
    }catch{}
  }
  return best?.value??null
}

async function bestTononkiraDraft(row:SmartImportLine):Promise<ExternalDraft|null>{
  const merged=new Map<string,{title:string;artist:string;url:string;score:number}>()
  for(const variant of externalQueryVariants(row.title,row.artist)){
    try{
      const found=await searchTononkira(variant.title,variant.artist)
      for(const item of found){
        const score=Math.max(Number(item.score)||0,scoreExternalMatch(row.title,row.artist,item))
        const previous=merged.get(item.url)
        if(!previous||score>previous.score)merged.set(item.url,{...item,score})
      }
      if([...merged.values()].some(x=>x.score>=92))break
    }catch{}
  }
  const best=[...merged.values()].sort((a,b)=>b.score-a.score)[0]
  if(!best||best.score<SMART_IMPORT_THRESHOLDS.external)return null
  try{
    const full=await fetchTononkiraReference(best.url)
    const draft=minimalDraft(full.title||best.title||row.title,full.artist||best.artist||row.artist)
    draft.lyrics=normalizeLyrics(full.lyrics)
    draft.referenceUrl=full.sourceUrl||best.url
    draft.notes='Source : Tononkira Malagasy'
    draft.source='import'
    return {draft,source:'Tononkira',sourceUrl:draft.referenceUrl,score:best.score}
  }catch{return null}
}

async function findExternal(row:SmartImportLine,songs:Song[]):Promise<ExternalDraft|null>{
  const origin=row.origin??classifySongOrigin(row.title,row.artist,songs)
  if(origin==='malagasy'){
    const acoustic=await bestExternalDraft('acoustic-gasy',row)
    if(acoustic)return acoustic
    return bestTononkiraDraft(row)
  }
  if(origin==='international')return bestExternalDraft('ultimate-guitar',row)
  const international=await bestExternalDraft('ultimate-guitar',row)
  if(international&&international.score>=82)return international
  const acoustic=await bestExternalDraft('acoustic-gasy',row)
  if(acoustic&&acoustic.score>=82)return acoustic
  return international??acoustic
}

function statusMeta(row:SmartImportLine){
  if(row.status==='found')return {symbol:'✓',label:'Déjà présent',className:'found'}
  if(row.status==='confirm')return {symbol:'?',label:'À confirmer',className:'confirm'}
  if(row.status==='new')return {symbol:'+',label:'Nouveau',className:'new'}
  if(row.status==='importing')return {symbol:'…',label:'Recherche',className:'importing'}
  if(row.status==='imported')return {symbol:'+',label:row.source||'Importé',className:'imported'}
  if(row.status==='minimal')return {symbol:'+',label:'À compléter',className:'minimal'}
  if(row.status==='ignored')return {symbol:'×',label:'Ignoré',className:'ignored'}
  return {symbol:'!',label:'À vérifier',className:'problem'}
}

function replacementPatch(incoming:SongDraft):Partial<SongDraft>{
  const {favorite:_favorite,favoriteStatus:_favoriteStatus,...content}=incoming
  return content
}

export function SmartListImportModal({mode,songs,targetSetlist,onClose,onDone,toast}:Props){
  const [raw,setRaw]=useState('')
  const [setlistName,setSetlistName]=useState(()=>targetSetlist?.name||`Setlist ${new Date().toLocaleDateString('fr-FR')}`)
  const [rows,setRows]=useState<SmartImportLine[]>([])
  const [trustStrong,setTrustStrong]=useState(true)
  const [express,setExpress]=useState(true)
  const [busy,setBusy]=useState(false)
  const [progress,setProgress]=useState({current:0,total:0,label:''})
  const [editingId,setEditingId]=useState('')
  const [onlyAmbiguous,setOnlyAmbiguous]=useState(false)
  const [completion,setCompletion]=useState<CompletionState>(null)

  const counts=useMemo(()=>rows.reduce((acc,row)=>{acc.total++;if(row.status==='found')acc.found++;else if(row.status==='confirm')acc.confirm++;else if(row.status==='imported')acc.imported++;else if(row.status==='minimal')acc.minimal++;else if(row.status==='new')acc.new++;else if(row.status==='problem')acc.problem++;return acc},{total:0,found:0,confirm:0,imported:0,minimal:0,new:0,problem:0}),[rows])
  const sourceCounts=useMemo(()=>rows.reduce<Record<string,number>>((acc,row)=>{const source=row.status==='found'?'DI’ART':row.status==='minimal'?'Fiche minimale':row.source;if(source)acc[source]=(acc[source]||0)+1;return acc},{}),[rows])
  const manuallyVerified=useMemo(()=>rows.filter(row=>row.manual&&row.status==='found').length,[rows])
  const visibleRows=onlyAmbiguous?rows.filter(r=>r.status==='confirm'||r.status==='problem'):rows

  const rematch=(row:SmartImportLine,title=row.title,artist=row.artist):SmartImportLine=>{
    const candidates=matchLocalSongs(title,artist,songs).slice(0,5),top=candidates[0]
    const origin=classifySongOrigin(title,artist,songs)
    const ambiguousTitleOnly=!artist.trim()&&candidates.filter(candidate=>candidate.score>=SMART_IMPORT_THRESHOLDS.auto).length>1
    if(top&&top.score>=SMART_IMPORT_THRESHOLDS.auto&&trustStrong&&!ambiguousTitleOnly)return {...row,title,artist,candidates,status:'found',chosenSongId:top.songId,origin,manual:true}
    if(top&&top.score>=SMART_IMPORT_THRESHOLDS.confirm)return {...row,title,artist,candidates,status:'confirm',chosenSongId:undefined,origin,manual:true}
    return {...row,title,artist,candidates,status:'new',chosenSongId:undefined,origin,manual:true}
  }
  const updateRow=(id:string,fn:(row:SmartImportLine)=>SmartImportLine)=>setRows(list=>list.map(row=>row.id===id?fn(row):row))

  const importMissing=async(input=rows):Promise<SmartImportLine[]>=>{
    const work=input.map(x=>({...x,candidates:[...x.candidates]}))
    const targets=work.map((row,index)=>({row,index})).filter(x=>x.row.status==='new'||x.row.status==='problem')
    if(!targets.length)return work
    setBusy(true);setProgress({current:0,total:targets.length,label:'Préparation…'})
    let currentSongs=(await db.songs.toArray()).filter(s=>!s.deletedAt)
    for(let n=0;n<targets.length;n++){
      const {index}=targets[n]
      let row=work[index]
      setProgress({current:n+1,total:targets.length,label:`Recherche de « ${row.title} »…`})
      row={...row,status:'importing'};work[index]=row;setRows([...work])
      const local=matchLocalSongs(row.title,row.artist,currentSongs)[0]
      if(local&&local.score>=SMART_IMPORT_THRESHOLDS.auto){work[index]={...row,status:'found',chosenSongId:local.songId,source:'DI’ART'};setRows([...work]);continue}
      let external:ExternalDraft|null=null
      try{external=await findExternal(row,currentSongs)}catch{}
      if(external){
        const duplicate=matchLocalSongs(external.draft.title,external.draft.artist,currentSongs)[0]
        if(duplicate&&duplicate.score>=SMART_IMPORT_THRESHOLDS.auto){
          work[index]={...row,title:external.draft.title,artist:external.draft.artist,status:'found',chosenSongId:duplicate.songId,source:'DI’ART',note:`Source externe reconnue : ${external.source}`};setRows([...work]);continue
        }
        try{
          const created=await createSong(external.draft);currentSongs=[...currentSongs,created]
          await logActivity('import','Import intelligent de liste',created.title,{songId:created.id,songTitle:created.title,source:external.source})
          work[index]={...row,title:created.title,artist:created.artist,status:'imported',chosenSongId:created.id,source:external.source,sourceUrl:external.sourceUrl};setRows([...work]);continue
        }catch{}
      }
      try{
        const draft=minimalDraft(row.title,row.artist),created=await createSong(draft);currentSongs=[...currentSongs,created]
        await logActivity('import','Création minimale depuis liste',created.title,{songId:created.id,songTitle:created.title,source:'Import liste'})
        work[index]={...row,status:'minimal',chosenSongId:created.id,source:'Import liste',note:'Aucune source suffisamment fiable trouvée.'}
      }catch{work[index]={...row,status:'problem',note:'Création impossible.'}}
      setRows([...work])
    }
    setBusy(false);setProgress({current:0,total:0,label:''});return work
  }

  const analyze=async()=>{
    if(!raw.trim()){toast('Collez d’abord une liste de morceaux.');return}
    let parsed=parseSmartList(raw,songs)
    if(!trustStrong)parsed=parsed.map(row=>row.status==='found'?{...row,status:'confirm' as const,chosenSongId:undefined}:row)
    setRows(parsed);setOnlyAmbiguous(false)
    if(express)parsed=await importMissing(parsed)
    const ambiguous=parsed.filter(row=>row.status==='confirm'||row.status==='problem').length
    if(express&&ambiguous)setOnlyAmbiguous(true)
  }

  const chooseCandidate=(row:SmartImportLine,songId:string)=>updateRow(row.id,r=>({...r,status:'found',chosenSongId:songId,manual:true,note:'Correspondance confirmée manuellement.'}))
  const forceNew=(row:SmartImportLine)=>updateRow(row.id,r=>({...r,status:'new',chosenSongId:undefined,manual:true,note:'Forcé comme nouveau morceau.'}))
  const invert=(row:SmartImportLine)=>updateRow(row.id,r=>rematch(r,row.artist,row.title))
  const titleOnly=(row:SmartImportLine)=>updateRow(row.id,r=>rematch(r,row.title,''))
  const ignore=(row:SmartImportLine)=>updateRow(row.id,r=>({...r,status:'ignored',chosenSongId:undefined,manual:true}))
  const saveEdit=(row:SmartImportLine,title:string,artist:string)=>{updateRow(row.id,r=>rematch(r,title.trim()||r.title,artist.trim()));setEditingId('')}

  const prepareCompletion=async(row:SmartImportLine)=>{
    const existing=songs.find(s=>s.id===row.chosenSongId)
    if(!existing)return
    setBusy(true);setProgress({current:1,total:1,label:`Recherche d’une version plus complète de « ${row.title} »…`})
    try{
      const incoming=await findExternal(row,songs)
      if(!incoming){toast('Aucune source externe suffisamment fiable et plus exploitable trouvée.');return}
      setCompletion({row,existing,incoming:incoming.draft,source:incoming.source})
    }finally{setBusy(false);setProgress({current:0,total:0,label:''})}
  }
  const applyCompletion=async(kind:'chords'|'lyrics'|'missing'|'replace')=>{
    if(!completion)return
    let patch:Partial<SongDraft>={}
    if(kind==='chords')patch={chords:completion.incoming.chords,chordLyrics:completion.incoming.chordLyrics,originalKey:completion.incoming.originalKey||completion.existing.originalKey,structure:completion.incoming.structure||completion.existing.structure,referenceUrl:completion.incoming.referenceUrl||completion.existing.referenceUrl}
    else if(kind==='lyrics')patch={lyrics:completion.incoming.lyrics,referenceUrl:completion.incoming.referenceUrl||completion.existing.referenceUrl}
    else if(kind==='missing')patch=missingFieldsPatch(completion.existing,completion.incoming)
    else patch=replacementPatch(completion.incoming)
    await updateSong(completion.existing.id,patch)
    await logActivity('complete','Complétion depuis import liste',Object.keys(patch).join(', '),{songId:completion.existing.id,songTitle:completion.existing.title,source:completion.source})
    setCompletion(null);toast('Morceau existant complété sans créer de doublon.')
  }

  const finish=async()=>{
    let finalRows=rows
    if(finalRows.some(r=>r.status==='new'||r.status==='problem'))finalRows=await importMissing(finalRows)
    const unresolved=finalRows.filter(r=>r.status==='confirm'||r.status==='problem')
    if(unresolved.length){setRows(finalRows);setOnlyAmbiguous(true);toast(`${unresolved.length} cas ambigu${unresolved.length>1?'s':''} reste${unresolved.length>1?'nt':''} à confirmer.`);return}
    const orderedIds=finalRows.filter(r=>r.status!=='ignored'&&r.chosenSongId).map(r=>r.chosenSongId!)
    setBusy(true)
    try{
      let setlistId:string|undefined,setlistLabel:string|undefined
      if(mode==='new-setlist'){
        const list=await createSetlist(setlistName.trim()||'Setlist importée')
        await updateSetlist(list.id,{songIds:orderedIds});setlistId=list.id;setlistLabel=list.name
      }else if(mode==='append-setlist'&&targetSetlist){
        const merged=[...targetSetlist.songIds,...orderedIds]
        await updateSetlist(targetSetlist.id,{songIds:merged});setlistId=targetSetlist.id;setlistLabel=targetSetlist.name
      }
      const sessionId=crypto.randomUUID()
      const sourceSummary=finalRows.filter(r=>r.source).reduce<Record<string,number>>((acc,r)=>{acc[r.source!]=(acc[r.source!]||0)+1;return acc},{})
      const details=[`Liste brute :\n${raw.trim()}`,`Résolution : ${finalRows.map(r=>`${r.position}. ${r.title}${r.artist?' — '+r.artist:''} [${r.source||r.status}]`).join(' | ')}`,`Sources : ${Object.entries(sourceSummary).map(([k,v])=>`${k} ${v}`).join(', ')||'DI’ART local uniquement'}`].join('\n\n')
      const createdSongIds=finalRows.filter(r=>r.status==='imported'||r.status==='minimal').map(r=>r.chosenSongId).filter((id):id is string=>Boolean(id))
      await logActivity('import','Import intelligent de liste',details,{sessionId,setlistId,setlistName:setlistLabel,source:'Import liste intelligent',restoreData:{kind:'list_import',label:'Import intelligent de liste',createdSongIds,setlistId,createdSetlist:mode==='new-setlist',previousSetlistSongIds:mode==='append-setlist'?[...(targetSetlist?.songIds??[])]:undefined}})
      const result={setlistId,setlistName:setlistLabel,createdSongs:createdSongIds.length,reusedSongs:finalRows.filter(r=>r.status==='found').length,minimalSongs:finalRows.filter(r=>r.status==='minimal').length,total:orderedIds.length}
      await onDone(result)
    }finally{setBusy(false)}
  }

  const title=mode==='songs-only'?'Importer une liste de morceaux':mode==='append-setlist'?`Importer dans « ${targetSetlist?.name||'Setlist'} »`:'Importer une liste en setlist'
  return createPortal(<div className="modal-backdrop smart-list-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}><div className="modal smart-list-modal" role="dialog" aria-modal="true" aria-label={title}>
    <div className="modal-head"><div><h3>{title}</h3><small>DI’ART local → source prioritaire → création minimale</small></div><button className="icon-btn" disabled={busy} onClick={onClose}><X/></button></div>
    {!rows.length?<div className="smart-list-paste">
      {mode==='new-setlist'&&<label>Nom de la setlist<input value={setlistName} onChange={e=>setSetlistName(e.target.value)} placeholder="Ex. Mariage 03/10/2026"/></label>}
      <label>Liste brute<textarea autoFocus rows={11} value={raw} onChange={e=>setRaw(e.target.value)} placeholder={'1-Titre_Artiste\n2-Titre - Artiste\n3-Titre seulement'}/></label>
      <div className="smart-list-options"><label><input type="checkbox" checked={express} onChange={e=>setExpress(e.target.checked)}/><span><b>Import express</b><small>Recherche automatiquement les morceaux absents.</small></span></label><label><input type="checkbox" checked={trustStrong} onChange={e=>setTrustStrong(e.target.checked)}/><span><b>Faire confiance aux correspondances fortes</b><small>Les cas ambigus restent à confirmer.</small></span></label></div>
      <div className="modal-actions"><button className="secondary" onClick={onClose}>Annuler</button><button className="primary" disabled={!raw.trim()||busy} onClick={()=>void analyze()}><Sparkles/>Analyser</button></div>
    </div>:<div className="smart-list-review">
      <div className="smart-list-summary"><span><b>{counts.total}</b>Morceaux</span><span className="found"><b>{counts.found}</b>DI’ART</span><span className="confirm"><b>{counts.confirm}</b>À confirmer</span><span className="imported"><b>{counts.imported}</b>Importés</span><span className="minimal"><b>{counts.minimal}</b>À compléter</span></div>
      {Object.keys(sourceCounts).length>0&&<div className="smart-list-source-summary">{Object.entries(sourceCounts).map(([source,count])=><span key={source}><b>{count}</b> {source}</span>)}{manuallyVerified>0&&<span><b>{manuallyVerified}</b> vérifié{manuallyVerified>1?'s':''} manuellement</span>}</div>}
      {busy&&progress.total>0&&<div className="smart-list-progress"><LoaderCircle/><div><b>Recherche {progress.current}/{progress.total}</b><small>{progress.label}</small><progress max={progress.total} value={progress.current}/></div></div>}
      <div className="smart-list-toolbar"><label><input type="checkbox" checked={onlyAmbiguous} onChange={e=>setOnlyAmbiguous(e.target.checked)}/>Afficher seulement les cas à vérifier</label><button className="secondary" disabled={busy||!rows.some(r=>r.status==='new'||r.status==='problem')} onClick={()=>void importMissing()}><Search/>Importer les morceaux manquants</button></div>
      <div className="smart-list-rows">{visibleRows.map(row=>{const meta=statusMeta(row);const existing=songs.find(s=>s.id===row.chosenSongId);const incomplete=existing&&(!existing.chords?.trim()||!existing.lyrics?.trim());return <article className={`smart-list-row ${meta.className}`} key={row.id}>
        <span className="smart-list-number">{row.position}</span><span className={`smart-list-status ${meta.className}`} title={meta.label}>{meta.symbol}</span>
        <div className="smart-list-identity"><b>{row.title||'Titre à définir'}</b><small>{row.artist||'Artiste non renseigné'}{row.source?` · ${row.source}`:''}</small></div>
        <button className="smart-list-expand" aria-label="Détails" onClick={()=>setEditingId(editingId===row.id?'':row.id)}><ChevronDown/></button>
        {editingId===row.id&&<div className="smart-list-detail">
          <div className="smart-list-original"><span>Original</span><code>{row.original}</code></div>
          <InlineIdentity row={row} onSave={saveEdit}/>
          <div className="smart-list-row-actions"><button onClick={()=>invert(row)} disabled={!row.artist}><ArrowLeftRight/>Inverser Titre / Artiste</button><button onClick={()=>titleOnly(row)}>Titre uniquement</button><button onClick={()=>ignore(row)}>Ignorer</button>{row.status==='found'&&incomplete&&<button onClick={()=>void prepareCompletion(row)}><Plus/>Compléter l’existant</button>}</div>
          {row.status==='confirm'&&<div className="smart-list-candidates"><b>Correspondances possibles</b>{row.candidates.map(candidate=><button key={candidate.songId} onClick={()=>chooseCandidate(row,candidate.songId)}><Check/><span>{candidate.label}</span></button>)}<button className="smart-list-new-choice" onClick={()=>forceNew(row)}><Plus/>Créer un nouveau morceau</button></div>}
          {row.note&&<p className="smart-list-note"><AlertTriangle/>{row.note}</p>}
        </div>}
      </article>})}</div>
      {!visibleRows.length&&<p className="smart-list-empty">Aucun cas ambigu. La liste peut être créée directement.</p>}
      <div className="smart-list-footer"><button className="secondary" disabled={busy} onClick={()=>{setRows([]);setOnlyAmbiguous(false)}}>Modifier la liste</button><button className="primary" disabled={busy||!rows.length} onClick={()=>void finish()}><ListMusic/>{mode==='songs-only'?'Terminer l’import':mode==='append-setlist'?'Ajouter à la setlist':'Créer la setlist'}</button></div>
    </div>}
    {completion&&<div className="smart-completion-overlay"><section><h4>Compléter « {completion.existing.title} »</h4><p>Source trouvée : <b>{completion.source}</b>. DI’ART ne crée pas de doublon.</p><div className="smart-completion-actions"><button onClick={()=>void applyCompletion('chords')}>Ajouter seulement les accords</button><button onClick={()=>void applyCompletion('lyrics')}>Ajouter seulement les paroles</button><button className="primary" onClick={()=>void applyCompletion('missing')}>Ajouter les informations manquantes</button><button onClick={()=>void applyCompletion('replace')}>Remplacer complètement</button><button className="secondary" onClick={()=>setCompletion(null)}>Ne rien modifier</button></div></section></div>}
  </div></div>,document.body)
}

function InlineIdentity({row,onSave}:{row:SmartImportLine;onSave:(row:SmartImportLine,title:string,artist:string)=>void}){
  const [title,setTitle]=useState(row.title),[artist,setArtist]=useState(row.artist)
  return <div className="smart-list-edit"><label>Titre<input value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Artiste<input value={artist} onChange={e=>setArtist(e.target.value)}/></label><button className="primary" onClick={()=>onSave(row,title,artist)}><Pencil/>Appliquer</button></div>
}

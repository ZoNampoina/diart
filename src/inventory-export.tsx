import { useEffect,useMemo,useRef,useState } from 'react'
import { FileImage,FileText,RefreshCw } from 'lucide-react'
import { toPng } from 'html-to-image'
import type { InventoryMaterial,InventoryProgram,InventoryStockItem,StageViewMode } from './types'
import type { IconRenderer } from './stage/StageScene'
import { StageDialog } from './stage/TemplateManager'
import { renderStagePng } from './stage/StageExport'
import { stagePngToPdf } from './stage/pdf'
import { layers,visible } from './stage/model'
import './inventory-extensions.css'

type Audience='owner'|'technician'|'provider'|'checklist'|'custom'
type SectionKey='event'|'scene'|'list'|'notes'|'missing'
type Row={id:string;itemId:string;name:string;category:string;quantity:number;provider:string;details:string;note:string}
type SectionFlags={event:boolean;scene:boolean;list:boolean;notes:boolean;missing:boolean;details:boolean;providers:boolean}

const safeName=(name:string)=>name.replace(/[\\/:*?"<>|]/g,'-').trim().slice(0,100)||'fiche-technique'
const labels:Record<SectionKey,string>={event:'Informations événement',scene:'Schéma de scène',list:'Liste du matériel',notes:'Note saisissable',missing:'Matériel manquant'}
const profiles:Record<Exclude<Audience,'custom'>,{title:string;view:StageViewMode;flags:SectionFlags}> = {
  owner:{title:'Fiche technique — propriétaire',view:'client',flags:{event:true,scene:true,list:true,notes:true,missing:true,details:false,providers:false}},
  technician:{title:'Fiche technique — technicien',view:'technical',flags:{event:true,scene:true,list:true,notes:true,missing:true,details:true,providers:true}},
  provider:{title:'Fiche technique — prestataire / musiciens',view:'hybrid',flags:{event:true,scene:true,list:true,notes:true,missing:true,details:false,providers:true}},
  checklist:{title:'Check-list matériel — manuscrite',view:'hybrid',flags:{event:true,scene:false,list:true,notes:true,missing:false,details:false,providers:false}}
}

function technicalText(source?:InventoryStockItem){
  if(!source)return ''
  const chars=(source.characteristics??[]).filter(value=>value.label.trim()||value.value.trim()).map(value=>value.label+': '+value.value)
  const ports=(source.ports??[]).map(port=>(port.label||port.direction.toUpperCase())+': '+port.count+' × '+port.connector)
  return [...chars,...ports].join(' · ')
}
function triggerData(url:string,name:string){const a=document.createElement('a');a.href=url;a.download=name;a.click()}
function triggerBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}

export function InventoryExportDialog({
  program,stock,selectedItems,missingItems,availableFor,categoryName,renderIcon,close
}:{
  program:InventoryProgram
  stock:InventoryStockItem[]
  selectedItems:InventoryMaterial[]
  missingItems:InventoryMaterial[]
  availableFor:(item:InventoryMaterial)=>number
  categoryName:(category:string)=>string
  renderIcon:IconRenderer
  close:()=>void
}){
  const sourceFor=(item:InventoryMaterial)=>item.stockItemId?stock.find(value=>value.id===item.stockItemId):undefined
  const makeRows=()=>selectedItems.map(item=>{const source=sourceFor(item);return {id:crypto.randomUUID(),itemId:item.id,name:item.name,category:item.category,quantity:item.quantity,provider:source?.provider??'À trouver',details:technicalText(source),note:''}})
  const [audience,setAudience]=useState<Audience>('technician')
  const [title,setTitle]=useState(profiles.technician.title)
  const [recipient,setRecipient]=useState('')
  const [meta,setMeta]=useState({date:program.date,location:program.location,start:program.startTime??'',end:program.endTime??''})
  const [note,setNote]=useState(program.notes)
  const [flags,setFlags]=useState<SectionFlags>(profiles.technician.flags)
  const [order,setOrder]=useState<SectionKey[]>(['event','scene','list','notes','missing'])
  const [rows,setRows]=useState<Row[]>(makeRows)
  const [missingNotes,setMissingNotes]=useState<Record<string,string>>({})
  const [sceneImage,setSceneImage]=useState('')
  const [sceneBusy,setSceneBusy]=useState(false)
  const [busy,setBusy]=useState<'png'|'pdf'|''>('')
  const [error,setError]=useState('')
  const preview=useRef<HTMLDivElement>(null)

  const view=audience==='custom'?'hybrid':profiles[audience].view
  const applyAudience=(next:Audience)=>{
    setAudience(next)
    if(next==='custom')return
    setTitle(profiles[next].title);setFlags({...profiles[next].flags})
  }
  useEffect(()=>{
    let active=true
    const plan=program.installation
    if(!flags.scene||!plan?.nodes?.length){setSceneImage('');return()=>{active=false}}
    setSceneBusy(true);setError('')
    const chosen=layers(plan).filter(id=>visible(plan,id))
    void renderStagePng(plan,stock,renderIcon,program.name,{
      layers:chosen,grid:false,measures:view==='technical',legend:false,viewMode:view,
      cables:view!=='client',references:view==='technical',providers:view==='technical',channels:view==='technical',sheet:false
    }).then(url=>{if(active)setSceneImage(url)}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Schéma indisponible.')}).finally(()=>{if(active)setSceneBusy(false)})
    return()=>{active=false}
  },[flags.scene,audience,program.installation,program.name,stock])

  const missing=useMemo(()=>rows.flatMap(row=>{
    const item=selectedItems.find(value=>value.id===row.itemId)
    if(!item)return []
    const available=availableFor(item),quantity=Math.max(0,row.quantity-available)
    return quantity>0?[{...row,available,missing:quantity}]:[]
  }),[rows,selectedItems,missingItems,availableFor])

  const move=(key:SectionKey,delta:number)=>{
    setOrder(current=>{const index=current.indexOf(key),next=index+delta;if(index<0||next<0||next>=current.length)return current;const copy=[...current];[copy[index],copy[next]]=[copy[next],copy[index]];return copy})
  }
  const updateRow=(id:string,patch:Partial<Row>)=>setRows(current=>current.map(row=>row.id===id?{...row,...patch}:row))
  const exportFile=async(format:'png'|'pdf')=>{
    if(!preview.current||busy)return
    setBusy(format);setError('')
    try{
      const png=await toPng(preview.current,{pixelRatio:2,backgroundColor:'#ffffff',cacheBust:false})
      const base=safeName(program.name)+'-'+safeName(title)
      if(format==='png')triggerData(png,base+'.png')
      else triggerBlob(await stagePngToPdf(png),base+'.pdf')
    }catch(e){setError(e instanceof Error?e.message:'Export impossible.')}
    finally{setBusy('')}
  }

  const renderSection=(key:SectionKey)=>{
    if(!flags[key])return null
    if(key==='event')return <section className="inventory-export-section export-event" key={key}><h2>Événement</h2><div className="inventory-export-meta">
      <span><small>Date</small><b>{meta.date||'—'}</b></span><span><small>Horaire</small><b>{meta.start||'—'}{meta.end?' → '+meta.end:''}</b></span><span><small>Lieu</small><b>{meta.location||'—'}</b></span>
    </div></section>
    if(key==='scene')return <section className="inventory-export-section export-scene" key={key}><h2>Schéma de scène</h2>{sceneBusy?<div className="inventory-export-placeholder"><RefreshCw/>Préparation du schéma…</div>:sceneImage?<img src={sceneImage} alt="Schéma de scène"/>:<div className="inventory-export-placeholder">Aucun schéma de scène enregistré.</div>}</section>
    if(key==='list')return <section className="inventory-export-section" key={key}><h2>Liste du matériel</h2><table><thead><tr><th>Matériel</th><th>Catégorie</th>{flags.providers&&<th>Prestataire</th>}<th>Qté</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><b>{row.name}</b>{flags.details&&row.details&&<small>{row.details}</small>}{row.note&&<small>{row.note}</small>}</td><td>{categoryName(row.category)}</td>{flags.providers&&<td>{row.provider}</td>}<td className="qty">× {row.quantity}</td></tr>)}</tbody></table></section>
    if(key==='notes')return <section className="inventory-export-section export-note" key={key}><h2>Notes</h2><p>{note.trim()||'Aucune note particulière.'}</p></section>
    if(key==='missing')return <section className="inventory-export-section export-missing" key={key}><h2>Matériel manquant</h2>{missing.length?<table><thead><tr><th>Matériel</th><th>Disponible</th><th>Manque</th></tr></thead><tbody>{missing.map(row=><tr key={row.id}><td><b>{row.name}</b>{missingNotes[row.itemId]&&<small>{missingNotes[row.itemId]}</small>}</td><td>{row.available}</td><td className="missing-count">{row.missing}</td></tr>)}</tbody></table>:<p className="inventory-export-ok">Tout le matériel prévu est couvert par le stock disponible.</p>}</section>
    return null
  }

  return <StageDialog title="Personnaliser l’export inventaire" close={close} wide><div className="inventory-export-layout">
    <aside className="inventory-export-controls">
      <label className="stage-field"><span>Destinataire / profil</span><select value={audience} onChange={e=>applyAudience(e.target.value as Audience)}><option value="owner">Propriétaire / organisateur</option><option value="technician">Technicien</option><option value="provider">Prestataire / musiciens</option><option value="checklist">Check-list manuscrite</option><option value="custom">Personnalisé</option></select></label>
      <label className="stage-field"><span>Titre</span><input value={title} onChange={e=>{setTitle(e.target.value);setAudience('custom')}}/></label>
      <label className="stage-field"><span>Destinataire</span><input value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="Nom, équipe, prestataire…"/></label>
      <details open><summary>Sections affichées</summary>{order.map((key,index)=><div className="inventory-export-section-control" key={key}><label><input type="checkbox" checked={flags[key]} onChange={e=>{setFlags({...flags,[key]:e.target.checked});setAudience('custom')}}/>{labels[key]}</label><span><button disabled={index===0} onClick={()=>move(key,-1)}>↑</button><button disabled={index===order.length-1} onClick={()=>move(key,1)}>↓</button></span></div>)}
        <label className="stage-check"><input type="checkbox" checked={flags.details} onChange={e=>{setFlags({...flags,details:e.target.checked});setAudience('custom')}}/>Caractéristiques techniques</label>
        <label className="stage-check"><input type="checkbox" checked={flags.providers} onChange={e=>{setFlags({...flags,providers:e.target.checked});setAudience('custom')}}/>Prestataires / propriétaires</label>
      </details>
      <details><summary>Informations modifiables</summary>
        <label className="stage-field"><span>Date</span><input type="date" value={meta.date} onChange={e=>setMeta({...meta,date:e.target.value})}/></label>
        <label className="stage-field"><span>Lieu</span><input value={meta.location} onChange={e=>setMeta({...meta,location:e.target.value})}/></label>
        <div className="inventory-export-inline"><label className="stage-field"><span>Début</span><input type="time" value={meta.start} onChange={e=>setMeta({...meta,start:e.target.value})}/></label><label className="stage-field"><span>Fin</span><input type="time" value={meta.end} onChange={e=>setMeta({...meta,end:e.target.value})}/></label></div>
        <label className="stage-field"><span>Note de la fiche</span><textarea rows={4} value={note} onChange={e=>setNote(e.target.value)} placeholder="Consignes adaptées au destinataire…"/></label>
      </details>
      <details><summary>Modifier la liste exportée</summary><div className="inventory-export-row-editor">{rows.map(row=><div className="inventory-export-edit-row" key={row.id}>
        <input value={row.name} onChange={e=>updateRow(row.id,{name:e.target.value})}/><input className="qty" type="number" min="0" value={row.quantity} onChange={e=>updateRow(row.id,{quantity:Math.max(0,Number(e.target.value)||0)})}/>
        <input value={row.provider} onChange={e=>updateRow(row.id,{provider:e.target.value})} placeholder="Prestataire"/><input value={row.category} onChange={e=>updateRow(row.id,{category:e.target.value})} placeholder="Catégorie"/>
        <textarea rows={2} value={row.details} onChange={e=>updateRow(row.id,{details:e.target.value})} placeholder="Caractéristiques techniques"/>
        <input value={row.note} onChange={e=>updateRow(row.id,{note:e.target.value})} placeholder="Note pour cette ligne"/>
      </div>)}</div></details>
      {missing.length>0&&<details><summary>Notes sur les manquants</summary>{missing.map(row=><label className="stage-field" key={row.itemId}><span>{row.name}</span><input value={missingNotes[row.itemId]??''} onChange={e=>setMissingNotes({...missingNotes,[row.itemId]:e.target.value})} placeholder="À louer, apporté par…, confirmé…"/></label>)}</details>}
      <div className="inventory-export-actions"><button className="primary" disabled={!!busy} onClick={()=>void exportFile('png')}><FileImage/>{busy==='png'?'Export…':'Image PNG'}</button><button className="primary" disabled={!!busy} onClick={()=>void exportFile('pdf')}><FileText/>{busy==='pdf'?'Export…':'PDF'}</button></div>
      {error&&<p className="stage-error">{error}</p>}
    </aside>
    <main className="inventory-export-preview"><div ref={preview} className="inventory-export-sheet">
      <header><div><small>DI’ART · FICHE TECHNIQUE</small><h1>{title||'Fiche technique'}</h1><p>{program.name}{recipient?' · '+recipient:''}</p></div><span>{new Date().toLocaleDateString('fr-FR')}</span></header>
      {order.map(renderSection)}
      <footer><span>DI’ART</span><span>{program.name}</span><span>{new Date().toLocaleDateString('fr-FR')}</span></footer>
    </div></main>
  </div></StageDialog>
}

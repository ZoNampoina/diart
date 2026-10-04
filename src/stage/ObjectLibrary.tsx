import { useEffect,useRef,useState } from 'react'
import { X,Upload,Trash2,Pencil,Search } from 'lucide-react'
import type { InventoryProgram } from '../types'
import { db } from '../db'
import { OBJECTS,OBJECT_CATEGORIES,normalizeSearch,objectById,inferIllustration } from './catalog'
import { ObjectThumbnail } from './StageSymbols'
import { StageDialog } from './TemplateManager'
import { ToolButton } from './StageToolbar'
import { importIllustration } from './assets'
import { metrics,selectionPlan,uid,type Plan } from './model'

export type LibraryChoice={id:string;name:string;plan?:Plan}
export async function savePersonalObject(plan:Plan,ids:string[],name:string,category:string){
  const installation=selectionPlan(plan,ids),stamp=new Date().toISOString()
  const used=new Set(installation.nodes.map(n=>n.appearance?.imageId).filter(Boolean))
  installation.assets=Object.fromEntries(Object.entries(installation.assets??{}).filter(([id])=>used.has(id)))
  installation.backgroundImage=undefined;installation.presentation=undefined
  const entry:InventoryProgram={id:uid(),name:name.trim()||'Mon objet',date:'',location:'',notes:'',items:[],isTemplate:true,templateKind:ids.length>1?'block':'object',libraryCategory:category,installation,createdAt:stamp,updatedAt:stamp,deletedAt:null}
  await db.programs.add(entry);return entry
}
export function ObjectLibrary({close,choose,onChanged}:{close:()=>void;choose:(choice:LibraryChoice,drag?:boolean)=>void;onChanged:()=>void}){
  const [tab,setTab]=useState<'catalog'|'personal'>('catalog'),[category,setCategory]=useState(''),[query,setQuery]=useState(''),[personal,setPersonal]=useState<InventoryProgram[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const file=useRef<HTMLInputElement>(null)
  const load=async()=>setPersonal((await db.programs.toArray()).filter(p=>p.isTemplate&&p.templateKind&&p.templateKind!=='installation'&&!p.deletedAt).sort((a,b)=>a.name.localeCompare(b.name,'fr')))
  useEffect(()=>{void load().catch(()=>setError('Bibliothèque indisponible.'))},[])
  const run=async(action:()=>Promise<void>)=>{setError('');setBusy(true);try{await action();await load();onChanged()}catch(e){setError(e instanceof Error?e.message:'Enregistrement impossible.')}finally{setBusy(false)}}
  const pick=(value:LibraryChoice)=>{choose(value);close()}
  const matches=(name:string,cat:string,keywords='')=>(!category||cat===category)&&normalizeSearch(name+' '+keywords).includes(normalizeSearch(query))
  const drag=(e:React.DragEvent,choice:LibraryChoice)=>{e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('application/x-diart-object',choice.id);choose(choice,true)}
  return <aside className="stage-object-library" aria-label="Éléments de scène"><div className="stage-panel-heading"><div><b>Éléments de scène</b><small>Composer votre installation</small></div><ToolButton label="Fermer la bibliothèque" onClick={close}><X/></ToolButton></div>
    <div className="stage-library-tabs"><button className={tab==='catalog'?'active':''} onClick={()=>setTab('catalog')}>Bibliothèque</button><button className={tab==='personal'?'active':''} onClick={()=>setTab('personal')}>Mes objets</button></div>
    <div className="stage-library-search"><Search size={16}/><input aria-label="Rechercher un objet" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Chaise, piano, micro…"/></div>
    <div className="stage-category-chips"><button className={!category?'active':''} onClick={()=>setCategory('')}>Tout</button>{OBJECT_CATEGORIES.map(c=><button key={c} className={category===c?'active':''} onClick={()=>setCategory(c)}>{c}</button>)}</div>
    <div className="stage-object-grid">
      {tab==='catalog'?OBJECTS.filter(d=>matches(d.name,d.category,d.keywords)).map(d=><button key={d.id} draggable onDragStart={e=>drag(e,{id:d.id,name:d.name})} className="stage-object-card" onClick={()=>pick({id:d.id,name:d.name})} title={`${d.name} · ${d.width} × ${d.height} m`}><ObjectThumbnail id={d.id}/><b>{d.name}</b><small>{d.category}</small></button>):
        personal.filter(p=>matches(p.name,p.libraryCategory??'')).map(p=>{const n=p.installation?.nodes[0],id=n?inferIllustration(n):'generic',image=p.installation?.assets?.[n?.appearance?.imageId??'']?.dataUrl,choice={id:'personal:'+p.id,name:p.name,plan:p.installation};return <div className="stage-personal-card" key={p.id}><button draggable className="stage-object-card" onDragStart={e=>drag(e,choice)} onClick={()=>pick(choice)}><ObjectThumbnail id={id} color={n?.appearance?.color} image={image}/><b>{p.name}</b><small>{p.templateKind==='block'?`${p.installation?.nodes.length} objets · bloc`:p.libraryCategory}</small></button><label className="stage-personal-category"><select aria-label={'Catégorie de '+p.name} value={p.libraryCategory??'Décoration'} disabled={busy} onChange={e=>{const category=e.target.value;void run(async()=>{await db.programs.update(p.id,{libraryCategory:category,updatedAt:new Date().toISOString()})})}}>{OBJECT_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label><div className="stage-row-actions"><ToolButton label={'Renommer '+p.name} disabled={busy} onClick={()=>{const name=window.prompt('Nom de l’objet',p.name);if(name?.trim())void run(async()=>{await db.programs.update(p.id,{name:name.trim(),updatedAt:new Date().toISOString()})})}}><Pencil/></ToolButton><ToolButton label={'Supprimer '+p.name} disabled={busy} onClick={()=>void run(async()=>{await db.programs.update(p.id,{deletedAt:new Date().toISOString(),updatedAt:new Date().toISOString()})})}><Trash2/></ToolButton></div></div>})}
      {tab==='personal'&&!personal.length&&<p className="stage-library-empty">Importez une illustration ou enregistrez une sélection depuis ses propriétés pour la retrouver dans chaque événement.</p>}
    </div>
    {error&&<p className="stage-error" role="alert">{error}</p>}
    <footer><input ref={file} type="file" accept=".svg,.png,.webp,.jpg,.jpeg" hidden onChange={e=>{const f=e.target.files?.[0];if(f)void run(async()=>{const asset=await importIllustration(f),node={id:uid(),name:asset.name,kind:'visual' as const,visualOnly:true,x:0,y:0,width:80,height:80*asset.height/asset.width,layerId:'scenery',appearance:{illustration:'imported',imageId:asset.id,lockAspect:true,shortLabel:asset.name}},plan:Plan={nodes:[node],links:[],assets:{[asset.id]:asset},stagePixelsPerMeter:80};await savePersonalObject(plan,[node.id],asset.name,category||'Décoration');setTab('personal');setQuery('')});e.target.value=''}}/>
      <button className="stage-wide-button" disabled={busy} onClick={()=>file.current?.click()}><Upload/>{busy?'Import…':'Importer une illustration'}</button><small>Glissez vers la scène ou choisissez un objet puis son emplacement. SVG, PNG, WebP · 8 Mo max.</small>
    </footer>
  </aside>
}
export function SaveObjectDialog({plan,selected,close,onSaved}:{plan:Plan;selected:string[];close:()=>void;onSaved:()=>void}){
  const group=plan.groups?.find(g=>g.nodeIds.every(id=>selected.includes(id))),[name,setName]=useState(group?.name??(selected.length===1?plan.nodes.find(n=>n.id===selected[0])?.name:'Mon bloc')??''),[category,setCategory]=useState('Décoration'),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  return <StageDialog title="Enregistrer dans Mes objets" close={close}><form className="stage-dialog-body stage-copy-form" onSubmit={async e=>{e.preventDefault();setBusy(true);try{await savePersonalObject(plan,selected,name,category);onSaved();close()}catch{setError('Impossible d’enregistrer ce bloc.');setBusy(false)}}}><label>Nom de l’objet ou du bloc<input autoFocus aria-label="Nom du bloc" value={name} onChange={e=>setName(e.target.value)}/></label><label>Catégorie<select aria-label="Catégorie du bloc" value={category} onChange={e=>setCategory(e.target.value)}>{OBJECT_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label><p className="stage-note">{selected.length} objet(s), leurs apparences et leurs liaisons internes seront réutilisables dans vos autres événements.</p><button className="primary" disabled={busy||!name.trim()}>Enregistrer le bloc</button>{error&&<p role="alert">{error}</p>}</form></StageDialog>
}
export function createVisualNode(id:string,plan:Plan,point:{x:number;y:number}){
  const d=objectById(id);if(!d)return undefined
  const ppm=metrics(plan).ppm,step=(plan.snapStep??0)*ppm,snap=(v:number)=>step?Math.round(v/step)*step:v
  return {id:uid(),name:d.name,kind:d.family==='text'?'text' as const:d.family==='zone'?'zone' as const:d.category==='Formes & annotations'?'shape' as const:'visual' as const,visualOnly:true,layerId:d.category==='Formes & annotations'?'annotations':'scenery',category:d.category,x:snap(point.x),y:snap(point.y),width:Math.max(8,d.width*ppm),height:Math.max(8,d.height*ppm),rotation:0,appearance:{illustration:id,color:d.color,shortLabel:d.name,lockAspect:!['shape','zone','line','text','platform'].includes(d.family),labelHorizontal:true}}
}

import { useEffect,useRef,useState,type ReactNode } from 'react'
import { Copy,Star,Trash2,X,Plus,Save,RotateCcw } from 'lucide-react'
import { db } from '../db'
import type { InventoryProgram } from '../types'
import { clone,copyProgram,planVersion,restoreVersion,uid,type CopyMode,type Plan } from './model'
import { Field } from './PropertiesInspector'
import { ToolButton } from './StageToolbar'

export function StageDialog({title,close,children,wide=false}:{title:string;close:()=>void;children:ReactNode;wide?:boolean}){
  const panel=useRef<HTMLElement>(null)
  useEffect(()=>{panel.current?.querySelector<HTMLElement>('input,button')?.focus();return()=>{queueMicrotask(()=>document.querySelector<HTMLElement>('.stage-editor')?.focus({preventScroll:true}))}},[])
  return <div className="stage-dialog-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)close()}}><section ref={panel} role="dialog" aria-modal="true" aria-label={title} className={'stage-dialog '+(wide?'wide':'')} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape')close();if(e.key==='Tab'){const items=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')??[]),first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}}}><div className="stage-panel-heading"><h3>{title}</h3><ToolButton label="Fermer la fenêtre" onClick={close}><X/></ToolButton></div>{children}</section></div>
}
export function VersionsPanel({plan,commit,close}:{plan:Plan;commit:(plan:Plan)=>void;close:()=>void}){
  const [name,setName]=useState('')
  return <StageDialog title="Historique / Versions" close={close}><div className="stage-dialog-body"><p className="stage-note">Sauvegardes durables du plan complet. Annuler / Rétablir reste disponible pour les actions récentes.</p>
    <form className="stage-inline-form" onSubmit={e=>{e.preventDefault();commit({...plan,snapshots:[...(plan.snapshots??[]),planVersion(plan,name.trim()||'Plan '+((plan.snapshots?.length??0)+1))]});setName('')}}><input aria-label="Nom de la version" value={name} onChange={e=>setName(e.target.value)} placeholder="Plan concert"/><button className="primary"><Save/>Enregistrer une version</button></form>
    {(plan.snapshots??[]).slice().reverse().map(version=><article key={version.id} className="stage-version-row"><div><Field label="Nom de version" value={version.name} onCommit={name=>commit({...plan,snapshots:plan.snapshots?.map(v=>v.id===version.id?{...v,name}:v)})}/><small>{new Date(version.createdAt).toLocaleString('fr-FR')}{version.author?' · '+version.author:''}</small></div><div className="stage-row-actions"><ToolButton label={'Restaurer '+version.name} onClick={()=>commit(restoreVersion(plan,version))}><RotateCcw/></ToolButton><ToolButton label={'Dupliquer la version '+version.name} onClick={()=>commit({...plan,snapshots:[...(plan.snapshots??[]),{...clone(version),id:uid(),name:version.name+' — copie',createdAt:new Date().toISOString()}]})}><Copy/></ToolButton><ToolButton label={'Supprimer la version '+version.name} onClick={()=>commit({...plan,snapshots:plan.snapshots?.filter(v=>v.id!==version.id)})}><Trash2/></ToolButton></div></article>)}
    {!plan.snapshots?.length&&<p>Aucune version enregistrée pour le moment.</p>}
  </div></StageDialog>
}

function preset(name:string,names:string[]):InventoryProgram{
  const stamp=new Date().toISOString(),nodes=names.map((name,i)=>({id:uid(),name,x:100+(i%4)*190,y:110+Math.floor(i/4)*200,width:120,height:84,layerId:'materials'}))
  const mixer=nodes.find(n=>/MR18|Régie/.test(n.name))
  const links=mixer?nodes.filter(n=>n.id!==mixer.id).map(n=>({id:uid(),fromNodeId:n.id,toNodeId:mixer.id,kind:'audio' as const,layerId:'audio'})):[]
  return {id:uid(),name,date:'',location:'',notes:'',isTemplate:true,items:[],installation:{nodes,links,stageWidth:960,stageHeight:640,stageWidthMeters:12,stageDepthMeters:8,stagePixelsPerMeter:80},createdAt:stamp,updatedAt:stamp,deletedAt:null}
}
export function TemplateManager({mode,program,plan,onCreated,onChanged,close,flush}:{mode:'duplicate'|'templates';program:InventoryProgram;plan:Plan;onCreated:(id:string)=>void;onChanged:()=>void;close:()=>void;flush:()=>Promise<void>}){
  const [templates,setTemplates]=useState<InventoryProgram[]>([]),[source,setSource]=useState<InventoryProgram|null>(mode==='duplicate'?{...program,installation:clone(plan)}:null)
  const [name,setName]=useState(program.name+' — copie'),[date,setDate]=useState(''),[copyMode,setCopyMode]=useState<CopyMode>('plan'),[templateName,setTemplateName]=useState(program.name),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const load=async()=>setTemplates((await db.programs.toArray()).filter(p=>p.isTemplate&&(!p.templateKind||p.templateKind==='installation')&&!p.deletedAt).sort((a,b)=>Number(!!b.templateFavorite)-Number(!!a.templateFavorite)||a.name.localeCompare(b.name,'fr')))
  useEffect(()=>{void load().catch(()=>setError('Impossible de charger les modèles.'))},[])
  const run=async(action:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');try{await action();onChanged()}catch(e){setError(e instanceof Error?e.message:'Enregistrement impossible.')}finally{setBusy(false)}}
  const create=()=>run(async()=>{if(!source||!name.trim())return;await flush();const copy=copyProgram(source,name.trim(),date,copyMode);await db.programs.add(copy);onCreated(copy.id)})
  const saveTemplate=()=>run(async()=>{if(!templateName.trim())return;await flush();await db.programs.add(copyProgram({...program,installation:plan},templateName.trim(),'','complete',true));await load()})
  return <StageDialog title={mode==='duplicate'?'Dupliquer l’installation':'Modèles d’installation'} close={close} wide><div className="stage-dialog-body">
    {mode==='templates'&&!source&&<>
      <div className="stage-template-save"><label>Enregistrer ce plan comme modèle<input aria-label="Nom du modèle" value={templateName} onChange={e=>setTemplateName(e.target.value)}/></label><button className="primary" disabled={busy||!templateName.trim()} onClick={()=>void saveTemplate()}><Save/>Enregistrer le modèle</button><small>Un modèle ne réserve aucun matériel et n’apparaît pas parmi les événements actifs.</small></div>
      <h4>Vos modèles</h4>
      {templates.length?templates.map(t=><article className="stage-template-row" key={t.id}><div><Field label="Nom du modèle enregistré" value={t.name} onCommit={name=>void run(async()=>{await db.programs.update(t.id,{name,updatedAt:new Date().toISOString()});await load()})}/><small>{t.installation?.nodes.length??0} objets · {t.installation?.links.length??0} liaisons</small></div><div className="stage-row-actions"><ToolButton label={'Favori '+t.name} active={t.templateFavorite} onClick={()=>void run(async()=>{await db.programs.update(t.id,{templateFavorite:!t.templateFavorite,updatedAt:new Date().toISOString()});await load()})}><Star/></ToolButton><ToolButton label={'Dupliquer le modèle '+t.name} onClick={()=>void run(async()=>{await db.programs.add(copyProgram(t,t.name+' — copie','','complete',true));await load()})}><Copy/></ToolButton><ToolButton label={'Supprimer le modèle '+t.name} onClick={()=>void run(async()=>{await db.programs.update(t.id,{deletedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});await load()})}><Trash2/></ToolButton><button onClick={()=>{setSource(t);setName(t.name);setCopyMode('materials')}}>Utiliser</button></div></article>):<p className="stage-note">Enregistrez un premier modèle pour le réutiliser lors de vos prochains événements.</p>}
      <h4>Points de départ</h4><div className="stage-presets">{[
        ['Scène répétition',['Clavier','Guitare','Basse','Batterie','Micro','Régie']],['Concert église',['Piano','Saxophone','Micro chœur','Basse','Batterie','MR18']],['Piano solo',['Piano','Sustain','Micro']],['Groupe complet',['Clavier','Guitare','Basse','Batterie','Micro','MR18','Retour gauche','Retour droit']],['Conférence',['Micro orateur','Micro invité','Régie','Enceinte gauche','Enceinte droite']],['MR18 + retours',['Micro 1','Micro 2','MR18','Retour 1','Retour 2']]
      ].map(([label,names])=><button key={label as string} onClick={()=>{const t=preset(label as string,names as string[]);setSource(t);setName(t.name)}}><Plus/>{label}</button>)}</div>
    </>}
    {source&&<div className="stage-copy-form"><p>À partir de <b>{source.name}</b></p><label>Nom du nouveau programme<input aria-label="Nom du nouveau programme" value={name} onChange={e=>setName(e.target.value)} autoFocus/></label><label>Date du nouvel événement<input type="date" aria-label="Date du nouvel événement" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Contenu à copier<select aria-label="Contenu à copier" value={copyMode} onChange={e=>setCopyMode(e.target.value as CopyMode)}><option value="plan">Plan seulement</option><option value="materials">Plan + liste de matériels</option><option value="complete">Plan + matériels + configuration complète</option></select></label><p className="stage-note">La copie possède ses propres objets, câbles et versions. Les quantités physiques du stock restent inchangées ; les cases chargé/retourné sont réinitialisées.</p><button className="primary" disabled={busy||!name.trim()} onClick={()=>void create()}><Copy/>{busy?'Création…':'Créer le nouveau programme'}</button>{mode==='templates'&&<button onClick={()=>setSource(null)}>Retour aux modèles</button>}</div>}
    {error&&<p className="stage-error" role="alert">{error}</p>}
  </div></StageDialog>
}

import { useEffect,useState } from 'react'
import { Copy,Trash2,Lock,Unlock,X,Plus } from 'lucide-react'
import type { InstallationLink,InstallationNode,InventoryStockItem } from '../types'
import { alignSelection,cableDistance,CABLE_STYLES,changeMetrics,fmt,geometry,layers,layerName,linkLayer,linkLocked,linkPoints,metrics,nodeLayer,nodeLocked,type Alignment,type Plan } from './model'
import { ToolButton } from './StageToolbar'

export function Field({label,value,onCommit,type='text',min,step,disabled=false}:{label:string;value:string|number;onCommit:(value:string)=>void;type?:string;min?:number;step?:number;disabled?:boolean}){
  const [draft,setDraft]=useState(String(value))
  useEffect(()=>setDraft(String(value)),[value])
  const finish=()=>{if(draft!==String(value)){if(type==='number'&&(!draft.trim()||!Number.isFinite(Number(draft)))){setDraft(String(value));return}onCommit(draft)}}
  return <label className="stage-field"><span>{label}</span><input aria-label={label} type={type} min={min} step={step} value={draft} disabled={disabled} onChange={e=>setDraft(e.target.value)} onBlur={finish} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){setDraft(String(value));e.stopPropagation()}}}/></label>
}
export function setRouteMode(plan:Plan,link:InstallationLink,mode:InstallationLink['routeMode']){
  const points=linkPoints(plan,link),a=points[0],b=points[points.length-1]
  if(!a||!b)return link
  return {...link,routeMode:mode,route:mode==='straight'?[]:mode==='zigzag'?[{x:(a.x+b.x)/2,y:a.y},{x:(a.x+b.x)/2,y:b.y}]:link.route?.length?link.route:[{x:(a.x+b.x)/2,y:(a.y+b.y)/2-60}]}
}
export function addBend(plan:Plan,link:InstallationLink){
  const points=linkPoints(plan,link);if(points.length<2)return link
  const a=points[points.length-2],b=points[points.length-1]
  return {...link,route:[...(link.route??[]),{x:(a.x+b.x)/2,y:(a.y+b.y)/2}]}
}
export function PropertiesInspector({plan,stock,selected,linkId,commit,duplicate,remove,close}:{plan:Plan;stock:InventoryStockItem[];selected:string[];linkId:string;commit:(plan:Plan)=>void;duplicate:()=>void;remove:()=>void;close:()=>void}){
  const m=metrics(plan),node=selected.length===1?plan.nodes.find(n=>n.id===selected[0]):undefined,link=plan.links.find(l=>l.id===linkId)
  const [dimensions,setDimensions]=useState({width:m.metersW,depth:m.metersH,ppm:m.ppm})
  useEffect(()=>setDimensions({width:m.metersW,depth:m.metersH,ppm:m.ppm}),[m.metersW,m.metersH,m.ppm])
  const order=layers(plan),locked=node?nodeLocked(plan,node):link?linkLocked(plan,link):false
  const updateNode=(patch:Partial<InstallationNode>)=>{if(!node||locked)return;commit({...plan,nodes:plan.nodes.map(n=>n.id===node.id?{...n,...patch}:n)})}
  const updateLink=(patch:Partial<InstallationLink>)=>{if(!link||locked)return;commit({...plan,links:plan.links.map(l=>l.id===link.id?{...l,...patch}:l)})}
  const layerSelect=(value:string,onChange:(id:string)=>void)=><label className="stage-field"><span>Calque</span><select aria-label="Calque de la sélection" value={value} disabled={locked} onChange={e=>onChange(e.target.value)}>{!value&&<option value="" disabled>Choisir un calque…</option>}{order.map(id=><option key={id} value={id}>{layerName(plan,id)}</option>)}</select></label>
  return <aside className="stage-inspector" aria-label="Propriétés contextuelles"><div className="stage-panel-heading"><b>{selected.length>1?`${selected.length} éléments`:node?'Propriétés de l’objet':link?'Propriétés du câble':'Scène & mesures'}</b><ToolButton label="Fermer les propriétés" onClick={close}><X/></ToolButton></div>
    <div className="stage-inspector-content">
    {node&&(()=>{const g=geometry(node,plan.nodes.indexOf(node)),source=stock.find(s=>s.id===node.stockItemId);return <>
      <Field label={node.kind==='text'?'Texte':'Nom'} value={node.name} disabled={locked} onCommit={name=>updateNode({name})}/>
      <Field label="Catégorie" value={node.category??source?.category??'Équipement libre'} disabled={locked} onCommit={category=>updateNode({category})}/>
      {source&&<p className="stage-note">{source.provider??'Mon stock'} · stock physique : {source.quantity}</p>}
      {layerSelect(nodeLayer(node),layerId=>updateNode({layerId}))}
      <div className="stage-field-grid">
        <Field label="X (m)" value={Number((g.x/m.ppm).toFixed(3))} type="number" step={.05} disabled={locked} onCommit={v=>updateNode({x:Number(v)*m.ppm})}/>
        <Field label="Y (m)" value={Number((g.y/m.ppm).toFixed(3))} type="number" step={.05} disabled={locked} onCommit={v=>updateNode({y:Number(v)*m.ppm})}/>
        <Field label="Largeur (m)" value={Number((g.width/m.ppm).toFixed(3))} type="number" min={.05} step={.05} disabled={locked} onCommit={v=>updateNode({width:Math.max(8,Number(v)*m.ppm)})}/>
        <Field label="Profondeur (m)" value={Number((g.height/m.ppm).toFixed(3))} type="number" min={.05} step={.05} disabled={locked} onCommit={v=>updateNode({height:Math.max(8,Number(v)*m.ppm)})}/>
      </div>
      <Field label="Rotation (°)" type="number" step={1} value={g.rotation} disabled={locked} onCommit={v=>updateNode({rotation:Number(v)})}/>
      <Field label="Zone" value={node.zone??'Scène'} disabled={locked} onCommit={zone=>updateNode({zone})}/>
      {source?.ports?.length?<div className="stage-port-list">{source.ports.map(port=><span key={port.id}>{port.count} × {port.connector} · {port.direction}</span>)}</div>:null}
      <button className="stage-wide-button" disabled={!!plan.layerLocks?.[nodeLayer(node)]} onClick={()=>commit({...plan,nodes:plan.nodes.map(n=>n.id===node.id?{...n,locked:!n.locked}:n)})}>{node.locked?<Unlock/>:<Lock/>}{node.locked?'Déverrouiller':'Verrouiller'}</button>
      <button className="stage-wide-button" onClick={duplicate}><Copy/>Dupliquer l’objet</button>
      <button className="stage-wide-button danger" disabled={locked} onClick={remove}><Trash2/>Supprimer l’objet</button>
      <small className="stage-note">Les copies graphiques ne modifient pas le stock. Utilisez Réserver pour vérifier les besoins.</small>
    </>})()}
    {selected.length>1&&<>
      {layerSelect('',layerId=>commit({...plan,nodes:plan.nodes.map(n=>selected.includes(n.id)&&!nodeLocked(plan,n)?{...n,layerId}:n)}))}
      <div className="stage-align-grid">{([['left','Gauche'],['center','Centre'],['right','Droite'],['top','Haut'],['middle','Milieu'],['bottom','Bas'],['horizontal','Espacer ↔'],['vertical','Espacer ↕']] as [Alignment,string][]).map(([id,label])=><button key={id} onClick={()=>commit(alignSelection(plan,selected,id))}>{label}</button>)}</div>
      <button className="stage-wide-button" onClick={duplicate}><Copy/>Dupliquer la sélection</button>
      <button className="stage-wide-button" onClick={()=>commit({...plan,nodes:plan.nodes.map(n=>selected.includes(n.id)&&!plan.layerLocks?.[nodeLayer(n)]?{...n,locked:!plan.nodes.filter(n=>selected.includes(n.id)).every(n=>n.locked)}:n)})}><Lock/>Verrouiller / déverrouiller</button>
      <button className="stage-wide-button danger" onClick={remove}><Trash2/>Supprimer la sélection</button>
    </>}
    {link&&(()=>{const distance=cableDistance(plan,link),margin=link.marginPercent??20,recommended=Math.ceil(distance*(1+margin/100)),from=plan.nodes.find(n=>n.id===link.fromNodeId),to=plan.nodes.find(n=>n.id===link.toNodeId);return <>
      <label className="stage-field"><span>Source</span><select aria-label="Source du câble" disabled={locked} value={link.fromNodeId} onChange={e=>updateLink({fromNodeId:e.target.value,fromPort:undefined})}>{plan.nodes.filter(n=>n.id!==link.toNodeId&&(!n.kind||n.kind==='equipment')).map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
      <label className="stage-field"><span>Destination</span><select aria-label="Destination du câble" disabled={locked} value={link.toNodeId} onChange={e=>updateLink({toNodeId:e.target.value,toPort:undefined})}>{plan.nodes.filter(n=>n.id!==link.fromNodeId&&(!n.kind||n.kind==='equipment')).map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
      {(['from','to'] as const).map(side=>{const equipment=side==='from'?from:to,ports=stock.find(s=>s.id===equipment?.stockItemId)?.ports??[];return ports.length?<label key={side} className="stage-field"><span>{side==='from'?'Port source':'Port destination'}</span><select disabled={locked} value={(side==='from'?link.fromPort:link.toPort)??''} onChange={e=>updateLink(side==='from'?{fromPort:e.target.value}:{toPort:e.target.value})}><option value="">Automatique</option>{ports.map(port=><option key={port.id} value={port.id}>{port.label} · {port.connector}</option>)}</select></label>:null})}
      <label className="stage-field"><span>Type de câble</span><select aria-label="Type de câble" value={link.kind??'unknown'} disabled={locked} onChange={e=>updateLink({kind:e.target.value as InstallationLink['kind']})}>{Object.entries(CABLE_STYLES).map(([id,s])=><option key={id} value={id}>{s.label}</option>)}</select></label>
      {layerSelect(linkLayer(link),layerId=>updateLink({layerId}))}
      <div className="stage-route-options">{([['straight','Droit'],['zigzag','90°'],['curve','Courbe']] as const).map(([mode,label])=><button key={mode} className={(link.routeMode??'straight')===mode?'active':''} disabled={locked} onClick={()=>updateLink(setRouteMode(plan,link,mode))}>{label}</button>)}</div>
      <button className="stage-wide-button" disabled={locked} onClick={()=>updateLink(addBend(plan,link))}><Plus/>Ajouter un point</button>
      {(link.route??[]).map((q,i)=><div className="stage-route-point" key={i}><span>Point {i+1} · {fmt(q.x/m.ppm)} / {fmt(q.y/m.ppm)} m</span><ToolButton label={'Supprimer le point '+(i+1)} disabled={locked} onClick={()=>updateLink({route:link.route?.filter((_,j)=>j!==i)})}><X/></ToolButton></div>)}
      <p className="stage-note">Poignées blanches : points. Poignées bleues : segments.</p>
      <div className="stage-distance"><small>Distance du trajet sur le plan</small><b>{fmt(distance)} m</b><label className="stage-field"><span>Marge (%)</span><input aria-label="Marge du câble (%)" type="number" min="0" max="500" value={margin} disabled={locked} onChange={e=>updateLink({marginPercent:Math.max(0,Math.min(500,Number(e.target.value)))})}/></label><span>Longueur recommandée : <b>{recommended} m</b></span><button disabled={locked} onClick={()=>{if(link.lengthMeters&&link.lengthMeters!==recommended&&!window.confirm('Remplacer la longueur saisie manuellement par '+recommended+' m ?'))return;updateLink({lengthMeters:recommended})}}>Utiliser {recommended} m</button></div>
      <Field label="Longueur retenue (m)" type="number" min={0} step={.5} value={link.lengthMeters??0} disabled={locked} onCommit={v=>updateLink({lengthMeters:Math.max(0,Number(v))})}/>
      <Field label="Étiquette" value={link.label??''} disabled={locked} onCommit={label=>updateLink({label})}/>
      <label className="stage-check"><input type="checkbox" checked={link.showLabel??plan.cableLabels??false} disabled={locked} onChange={e=>updateLink({showLabel:e.target.checked})}/>Afficher l’étiquette</label>
      <label className="stage-field"><span>Couleur</span><input aria-label="Couleur du câble" type="color" value={link.color??CABLE_STYLES[link.kind??'unknown'].color} disabled={locked} onChange={e=>updateLink({color:e.target.value})}/></label>
      <Field label="Opacité (%)" type="number" min={10} value={Math.round((link.opacity??1)*100)} disabled={locked} onCommit={v=>updateLink({opacity:Math.max(.1,Math.min(1,Number(v)/100))})}/>
      <button className="stage-wide-button danger" disabled={locked} onClick={remove}><Trash2/>Supprimer le câble</button>
    </>})()}
    {!node&&!link&&selected.length<2&&<>
      <div className="stage-field-grid"><Field label="Largeur scène (m)" type="number" min={.25} step={.25} value={dimensions.width} onCommit={v=>setDimensions({...dimensions,width:Number(v)})}/><Field label="Profondeur scène (m)" type="number" min={.25} step={.25} value={dimensions.depth} onCommit={v=>setDimensions({...dimensions,depth:Number(v)})}/></div>
      <Field label="Échelle (px/m)" type="number" min={10} step={5} value={Number(dimensions.ppm.toFixed(2))} onCommit={v=>setDimensions({...dimensions,ppm:Number(v)})}/>
      <button className="stage-wide-button primary" onClick={()=>commit(changeMetrics(plan,dimensions.width,dimensions.depth,dimensions.ppm,true))}>Adapter le plan actuel</button><small className="stage-note">Positions, tailles et points des câbles suivent les nouvelles proportions.</small>
      <button className="stage-wide-button" onClick={()=>commit(changeMetrics(plan,dimensions.width,dimensions.depth,dimensions.ppm,false))}>Changer seulement la mesure</button><small className="stage-note">Les objets gardent leurs coordonnées et leurs dimensions graphiques.</small>
      <label className="stage-field"><span>Grille</span><select aria-label="Subdivision de grille" value={plan.gridStep??1} onChange={e=>commit({...plan,gridStep:Number(e.target.value)})}><option value="1">1 carreau = 1 m</option><option value="0.5">1 carreau = 0,5 m</option><option value="0.25">1 carreau = 0,25 m</option></select></label>
      <label className="stage-field"><span>Magnétisme</span><select aria-label="Pas du magnétisme" value={plan.snapStep??0} onChange={e=>commit({...plan,snapStep:Number(e.target.value)})}><option value="0">Aucun</option><option value="1">1 m</option><option value="0.5">0,5 m</option><option value="0.25">0,25 m</option></select></label>
      <label className="stage-field"><span>Côté public</span><select value={plan.audience??'bottom'} onChange={e=>commit({...plan,audience:e.target.value as 'top'|'bottom'})}><option value="bottom">En bas</option><option value="top">En haut</option></select></label>
      <label className="stage-field"><span>Fond de scène</span><input type="color" aria-label="Fond de scène" value={plan.background??'#f6fafb'} onChange={e=>commit({...plan,background:e.target.value})}/></label>
      <label className="stage-check"><input type="checkbox" checked={plan.cableLabels??false} onChange={e=>commit({...plan,cableLabels:e.target.checked})}/>Étiquettes des câbles</label>
      <div className="stage-shortcuts"><b>Raccourcis</b><span>Ctrl+Z / Ctrl+Y · Annuler / rétablir</span><span>Ctrl+D · Dupliquer</span><span>Ctrl+C / Ctrl+V · Copier / coller</span><span>Maj + clic · Sélection multiple</span><span>Suppr · Supprimer</span><span>G · Grille / S · Magnétisme</span><span>F · Adapter à l’écran</span></div>
    </>}
    {locked&&<p className="stage-lock-notice"><Lock size={14}/>Objet ou calque verrouillé</p>}
    </div>
  </aside>
}

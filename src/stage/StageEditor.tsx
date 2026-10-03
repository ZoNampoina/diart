import { useEffect,useRef,useState } from 'react'
import { Plus,X,Copy,Trash2,Lock,ArrowUpToLine,ArrowDownToLine } from 'lucide-react'
import type { InstallationLink,InstallationNode,InventoryProgram,InventoryStockItem } from '../types'
import { clone,clamp,duplicateSelection,fmt,geometry,layers,layerName,linkLocked,metrics,nodeLayer,nodeLocked,uid,visible,type Plan,type Point } from './model'
import { useStageDocument } from './useStageDocument'
import { StageToolbar,StageTools,ToolButton } from './StageToolbar'
import { StageViewport,type MenuTarget,type Tool,type View } from './StageViewport'
import { LayerPanel } from './LayerPanel'
import { PropertiesInspector,addBend,setRouteMode } from './PropertiesInspector'
import { TemplateManager,VersionsPanel } from './TemplateManager'
import { StageExport } from './StageExport'
import type { IconRenderer } from './StageScene'
import './stage.css'

type Props={program:InventoryProgram;stock:InventoryStockItem[];onSave:(plan:Plan)=>Promise<void>;onDraftChange:(plan:Plan)=>void;onCreated:(id:string)=>void;onChanged:()=>void;toast:(message:string)=>void;renderIcon:IconRenderer}
export function StageEditor(p:Props){
  const doc=useStageDocument(p.program.installation??{nodes:[],links:[]},p.onSave,p.onDraftChange),plan=doc.plan,m=metrics(plan)
  const root=useRef<HTMLDivElement>(null),clipboard=useRef<Plan|null>(null)
  const [tool,setTool]=useState<Tool>('select'),[selected,setSelected]=useState<string[]>([]),[linkId,setLinkId]=useState(''),[activeLayer,setActiveLayer]=useState('materials')
  const [showLayers,setShowLayers]=useState(false),[showInspector,setShowInspector]=useState(()=>window.innerWidth>=1100),[fullscreen,setFullscreen]=useState(false)
  const [view,setView]=useState<View>({x:30,y:30,zoom:1}),[fitToken,setFitToken]=useState(0),[cursor,setCursor]=useState<Point>({x:0,y:0})
  const [dialog,setDialog]=useState(''),[picker,setPicker]=useState(false),[query,setQuery]=useState(''),[provider,setProvider]=useState(''),[chosenStock,setChosenStock]=useState(''),[freeName,setFreeName]=useState('')
  const [menu,setMenu]=useState<MenuTarget|null>(null),[connectFrom,setConnectFrom]=useState('')
  useEffect(()=>{setSelected(ids=>ids.filter(id=>plan.nodes.some(n=>n.id===id)));if(linkId&&!plan.links.some(l=>l.id===linkId))setLinkId('')},[plan.nodes,plan.links])
  useEffect(()=>{
    if(!fullscreen)return
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden'
    return()=>{document.body.style.overflow=overflow}
  },[fullscreen])
  const commit=(next:Plan)=>doc.commit({...next,suggestions:[],aiSummary:'',analyzedAt:undefined,analysisMode:undefined})
  const zoomBy=(factor:number)=>{
    const rect=root.current?.querySelector('.stage-viewport')?.getBoundingClientRect(),x=(rect?.width??800)/2,y=(rect?.height??500)/2,z=clamp(view.zoom*factor,.03,8)
    setView({zoom:z,x:x-(x-view.x)*z/view.zoom,y:y-(y-view.y)*z/view.zoom})
  }
  const duplicate=()=>{
    if(!selected.length)return
    const result=duplicateSelection(plan,selected);commit(result.plan);setSelected(result.ids);setLinkId('');p.toast('Sélection dupliquée · stock inchangé.')
  }
  const remove=()=>{
    const ids=new Set(plan.nodes.filter(n=>selected.includes(n.id)&&!nodeLocked(plan,n)).map(n=>n.id))
    const next={...plan,nodes:plan.nodes.filter(n=>!ids.has(n.id)),links:plan.links.filter(l=>!ids.has(l.fromNodeId)&&!ids.has(l.toNodeId)&&!(l.id===linkId&&!linkLocked(plan,l)))}
    commit(next);setSelected([]);setLinkId('')
  }
  const copy=()=>{clipboard.current=clone({...plan,nodes:plan.nodes.filter(n=>selected.includes(n.id)),links:plan.links.filter(l=>selected.includes(l.fromNodeId)&&selected.includes(l.toNodeId))});p.toast('Sélection copiée.')}
  const paste=(point?:Point)=>{
    const source=clipboard.current;if(!source?.nodes.length)return
    const first=geometry(source.nodes[0]),delta=point?{x:point.x-first.x,y:point.y-first.y}:{x:24,y:24},result=duplicateSelection(source,source.nodes.map(n=>n.id),delta)
    const newNodes=result.plan.nodes.filter(n=>result.ids.includes(n.id)),old=new Set(source.links.map(l=>l.id))
    commit({...plan,nodes:[...plan.nodes,...newNodes],links:[...plan.links,...result.plan.links.filter(l=>!old.has(l.id))],customLayers:[...(plan.customLayers??[]),...(source.customLayers??[]).filter(l=>!(plan.customLayers??[]).some(p=>p.id===l.id))]});setSelected(result.ids);setLinkId('')
  }
  const select=(ids:string[])=>{setSelected(ids);if(ids.length&&window.innerWidth>=1100)setShowInspector(true)}
  const selectLink=(id:string)=>{setLinkId(id);if(id&&window.innerWidth>=1100)setShowInspector(true)}
  const toggleGrid=()=>commit({...plan,gridVisible:plan.gridVisible===false})
  const toggleSnap=()=>commit({...plan,snapStep:(plan.snapStep??0)>0?0:.5})
  const activate=(next:Tool)=>{setMenu(null);setTool(next);setConnectFrom('');setPicker(next==='equipment'||next==='accessory');if(next==='accessory'){setActiveLayer('accessories');setChosenStock('');setFreeName('')}if(next==='text'||next==='zone'){setChosenStock('');setFreeName(next==='text'?'Annotation':'Zone')}}
  const place=(point:Point)=>{
    const source=p.stock.find(s=>s.id===chosenStock),name=source?.name||freeName.trim()
    if(!name){setPicker(true);return}
    const layerId=tool==='text'||tool==='zone'?'annotations':source?.category==='accessoire'||tool==='accessory'?'accessories':activeLayer
    if(plan.layerLocks?.[layerId]){p.toast('Déverrouillez le calque avant d’ajouter un objet.');return}
    const step=(plan.snapStep??0)*m.ppm,snap=(v:number)=>step?Math.round(v/step)*step:v
    const node:InstallationNode={id:uid(),name,stockItemId:source?.id,category:source?.category,kind:tool==='text'?'text':tool==='zone'?'zone':'equipment',layerId,x:snap(point.x),y:snap(point.y),width:tool==='zone'?240:tool==='text'?180:110,height:tool==='zone'?160:tool==='text'?40:84,rotation:0}
    commit({...plan,nodes:[...plan.nodes,node],layers:{...plan.layers,[layerId]:true}});setSelected([node.id]);setLinkId('');setTool('select');setPicker(false);if(window.innerWidth>=1100)setShowInspector(true)
  }
  const cable=(id:string)=>{
    if(!connectFrom){setConnectFrom(id);return}if(connectFrom===id){setConnectFrom('');return}
    const kind:InstallationLink['kind']=['audio','power','network','accessory'].includes(tool)?tool as InstallationLink['kind']:'audio',defaultLayer=kind==='audio'?'audio':kind==='power'?'power':kind==='accessory'?'accessories':'connectivity'
    const layerId=activeLayer.startsWith('custom-')?activeLayer:defaultLayer
    if(plan.layerLocks?.[layerId]){p.toast('Ce calque est verrouillé.');return}
    const link:InstallationLink={id:uid(),fromNodeId:connectFrom,toNodeId:id,kind,layerId,routeMode:'straight'}
    commit({...plan,links:[...plan.links,link],layers:{...plan.layers,[layerId]:true}});setConnectFrom('');setLinkId(link.id);setSelected([]);setShowInspector(window.innerWidth>=1100)
  }
  const open=(panel:string)=>{
    setMenu(null)
    if(panel==='layers'){setShowLayers(!showLayers);return}if(panel==='inspector'){setShowInspector(!showInspector);return}
    if(panel==='scene'){setSelected([]);setLinkId('');setShowInspector(true);return}
    setDialog(panel)
  }
  const order=(front:boolean)=>{
    if(menu?.linkId){const item=plan.links.find(l=>l.id===menu.linkId);if(item&&!linkLocked(plan,item))commit({...plan,links:front?[...plan.links.filter(l=>l.id!==item.id),item]:[item,...plan.links.filter(l=>l.id!==item.id)]})}
    else {const chosen=plan.nodes.filter(n=>selected.includes(n.id)&&!nodeLocked(plan,n)),rest=plan.nodes.filter(n=>!chosen.includes(n));commit({...plan,nodes:front?[...rest,...chosen]:[...chosen,...rest]})}
  }
  const providers=Array.from(new Set(p.stock.map(s=>s.provider??'Mon stock')))
  return <div ref={root} className={'stage-editor '+(fullscreen?'is-fullscreen':'')} tabIndex={-1} onPointerDown={()=>{}} onKeyDown={e=>{
    e.stopPropagation()
    if((e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]'))return
    const key=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey
    if(mod&&key==='z'){e.preventDefault();if(e.shiftKey)doc.redo();else doc.undo()}
    else if(mod&&key==='y'){e.preventDefault();doc.redo()}
    else if(mod&&key==='d'){e.preventDefault();duplicate()}
    else if(mod&&key==='c'){e.preventDefault();copy()}
    else if(mod&&key==='v'){e.preventDefault();paste()}
    else if(mod&&key==='a'){e.preventDefault();select(plan.nodes.filter(n=>visible(plan,nodeLayer(n))).map(n=>n.id));setLinkId('')}
    else if(mod&&key==='s'){e.preventDefault();void doc.flush()}
    else if(key==='delete'||key==='backspace'){e.preventDefault();remove()}
    else if(key==='escape'){e.preventDefault();doc.cancel();setMenu(null);setPicker(false);setSelected([]);setLinkId('');setConnectFrom('');setTool('select');if(fullscreen)setFullscreen(false)}
    else if(!mod&&key==='g'){e.preventDefault();toggleGrid()}
    else if(!mod&&key==='s'){e.preventDefault();toggleSnap()}
    else if(!mod&&key==='f'){e.preventDefault();setFitToken(v=>v+1)}
    else if(key==='+'||key==='='){e.preventDefault();zoomBy(1.2)}
    else if(key==='-'){e.preventDefault();zoomBy(1/1.2)}
  }}>
    <StageToolbar name={p.program.name} status={doc.status} canUndo={doc.canUndo} canRedo={doc.canRedo} undo={doc.undo} redo={doc.redo} save={()=>void doc.flush()} open={open} zoom={view.zoom} zoomBy={zoomBy} fit={()=>setFitToken(v=>v+1)} grid={plan.gridVisible!==false} toggleGrid={toggleGrid} snap={!!plan.snapStep} toggleSnap={toggleSnap} fullscreen={fullscreen} toggleFullscreen={()=>{setFullscreen(!fullscreen);setTimeout(()=>setFitToken(v=>v+1),50)}} layers={showLayers} inspector={showInspector}/>
    <div className="stage-editor-body">
      <StageTools tool={tool} onTool={activate}/>
      {showLayers&&<LayerPanel plan={plan} active={activeLayer} setActive={setActiveLayer} commit={commit} close={()=>setShowLayers(false)}/>}
      <StageViewport doc={doc} stock={p.stock} renderIcon={p.renderIcon} tool={tool} selected={selected} setSelected={select} linkId={linkId} setLinkId={selectLink} view={view} setView={setView} fitToken={fitToken} onPlace={place} onCable={cable} connectFrom={connectFrom} onMenu={setMenu} onCursor={setCursor}/>
      {showInspector&&<PropertiesInspector plan={plan} stock={p.stock} selected={selected} linkId={linkId} commit={commit} duplicate={duplicate} remove={remove} close={()=>setShowInspector(false)}/>}
      {picker&&<div className="stage-equipment-picker"><div className="stage-panel-heading"><b>Ajouter sur le plan</b><ToolButton label="Fermer le choix de matériel" onClick={()=>setPicker(false)}><X/></ToolButton></div><input aria-label="Rechercher un matériel" placeholder="Rechercher dans le stock…" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Prestataire du matériel" value={provider} onChange={e=>setProvider(e.target.value)}><option value="">Tous les prestataires</option>{providers.map(v=><option key={v}>{v}</option>)}</select><div className="stage-picker-list">{p.stock.filter(s=>!s.deletedAt&&(tool!=='accessory'||s.category==='accessoire')&&(!provider||(s.provider??'Mon stock')===provider)&&s.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(s=><button key={s.id} onClick={()=>{setChosenStock(s.id);setFreeName('');setPicker(false);setTool(tool==='accessory'?'accessory':'equipment');p.toast(s.name+' : cliquez sur la scène pour le placer.')}}><span>{p.renderIcon({id:s.id,name:s.name},s)}</span><div><b>{s.name}</b><small>{s.provider??'Mon stock'} · stock {s.quantity}</small></div><Plus/></button>)}</div><form onSubmit={e=>{e.preventDefault();if(freeName.trim()){setChosenStock('');setTool(tool==='accessory'?'accessory':'equipment');setPicker(false)}}}><input aria-label="Nom de l’équipement libre" placeholder="Équipement libre…" value={freeName} onChange={e=>setFreeName(e.target.value)}/><button disabled={!freeName.trim()} aria-label="Placer un équipement libre"><Plus/></button></form></div>}
    </div>
    <footer className="stage-status"><span>{fmt(m.metersW)} × {fmt(m.metersH)} m</span><span>{fmt(m.ppm)} px/m</span><span>Zoom {Math.round(view.zoom*100)} %</span><span>1 carreau = {fmt(plan.gridStep??1)} m</span><span>Snap {plan.snapStep?fmt(plan.snapStep)+' m':'inactif'}</span><span className="stage-cursor">X {fmt(cursor.x/m.ppm)} · Y {fmt(cursor.y/m.ppm)} m</span><span>{selected.length+(linkId?1:0)} sélectionné(s)</span></footer>
    {menu&&<><div className="stage-menu-dismiss" onPointerDown={()=>setMenu(null)}/><div role="menu" className="stage-context-menu" style={{left:Math.max(8,Math.min(menu.x,window.innerWidth-248)),top:Math.max(8,Math.min(menu.y,window.innerHeight-440))}}>
      {menu.nodeId?<><button onClick={()=>{setShowInspector(true);setMenu(null)}}>Modifier les propriétés</button><button onClick={()=>{duplicate();setMenu(null)}}><Copy/>Dupliquer</button><button onClick={()=>{const n=plan.nodes.find(n=>n.id===menu.nodeId)!;if(!plan.layerLocks?.[nodeLayer(n)])commit({...plan,nodes:plan.nodes.map(v=>v.id===n.id?{...v,locked:!v.locked}:v)});setMenu(null)}}><Lock/>Verrouiller / déverrouiller</button><label>Changer de calque<select value={nodeLayer(plan.nodes.find(n=>n.id===menu.nodeId)!)} onChange={e=>{commit({...plan,nodes:plan.nodes.map(n=>selected.includes(n.id)&&!nodeLocked(plan,n)?{...n,layerId:e.target.value}:n)});setMenu(null)}}>{layers(plan).map(id=><option key={id} value={id}>{layerName(plan,id)}</option>)}</select></label></>:
        menu.linkId?<>{(['straight','zigzag','curve'] as const).map(mode=><button key={mode} onClick={()=>{const link=plan.links.find(l=>l.id===menu.linkId)!;if(!linkLocked(plan,link))commit({...plan,links:plan.links.map(l=>l.id===link.id?setRouteMode(plan,l,mode):l)});setMenu(null)}}>{mode==='straight'?'Droit':mode==='zigzag'?'90°':'Courbe'}</button>)}<button onClick={()=>{const link=plan.links.find(l=>l.id===menu.linkId)!;if(!linkLocked(plan,link))commit({...plan,links:plan.links.map(l=>l.id===link.id?addBend(plan,l):l)});setMenu(null)}}>Ajouter un point</button><button onClick={()=>{setShowInspector(true);setMenu(null)}}>Type, longueur et propriétés</button></>:
        <><button disabled={!clipboard.current?.nodes.length} onClick={()=>{paste(menu.point);setMenu(null)}}>Coller</button><button onClick={()=>activate('equipment')}>Ajouter équipement</button><button onClick={()=>activate('text')}>Ajouter annotation</button><button onClick={()=>open('scene')}>Paramètres de scène</button></>}
      {(menu.nodeId||menu.linkId)&&<><button onClick={()=>{order(true);setMenu(null)}}><ArrowUpToLine/>Mettre devant dans le calque</button><button onClick={()=>{order(false);setMenu(null)}}><ArrowDownToLine/>Mettre derrière dans le calque</button><button className="danger" onClick={()=>{remove();setMenu(null)}}><Trash2/>Supprimer</button></>}
    </div></>}
    {dialog==='versions'&&<VersionsPanel plan={plan} commit={commit} close={()=>setDialog('')}/>}
    {(dialog==='duplicate'||dialog==='templates')&&<TemplateManager mode={dialog} program={p.program} plan={plan} onCreated={id=>{setDialog('');p.onCreated(id)}} onChanged={p.onChanged} close={()=>setDialog('')} flush={doc.flush}/>}
    {dialog==='export'&&<StageExport plan={plan} stock={p.stock} program={p.program} renderIcon={p.renderIcon} close={()=>setDialog('')}/>}
  </div>
}

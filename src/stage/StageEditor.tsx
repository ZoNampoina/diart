import { useEffect,useRef,useState } from 'react'
import { Plus,X,Copy,Trash2,Lock,ArrowUpToLine,ArrowDownToLine,PackagePlus } from 'lucide-react'
import type { InstallationLink,InstallationNode,InventoryProgram,InventoryStockItem } from '../types'
import { clone,clamp,expandGroups,groupSelection,selectionPlan,insertBlock,duplicateSelection,fmt,geometry,layers,layerName,linkLocked,metrics,nodeLayer,nodeLocked,uid,visible,type Plan,type Point } from './model'
import { useStageDocument } from './useStageDocument'
import { StageToolbar,StageTools,ToolButton } from './StageToolbar'
import { StageViewport,type MenuTarget,type Tool,type View } from './StageViewport'
import { LayerPanel } from './LayerPanel'
import { PropertiesInspector,addBend,setRouteMode } from './PropertiesInspector'
import { TemplateManager,VersionsPanel } from './TemplateManager'
import { StageExport } from './StageExport'
import { ObjectLibrary,SaveObjectDialog,createVisualNode,type LibraryChoice } from './ObjectLibrary'
import { SeriesDialog } from './SeriesDialog'
import { StageDialog } from './TemplateManager'
import { ObjectThumbnail } from './StageSymbols'
import { inferIllustration,objectById } from './catalog'
import type { IconRenderer } from './StageScene'
import './stage.css'

type Props={program:InventoryProgram;stock:InventoryStockItem[];onSave:(plan:Plan)=>Promise<void>;onDraftChange:(plan:Plan)=>void;onCreated:(id:string)=>void;onChanged:()=>void;onCreateStock?:(draft:{name:string;category:string;provider?:string;quantity:number})=>Promise<InventoryStockItem>;toast:(message:string)=>void;renderIcon:IconRenderer}
export function StageEditor(p:Props){
  const doc=useStageDocument(p.program.installation??{nodes:[],links:[]},p.onSave,p.onDraftChange),plan=doc.plan,m=metrics(plan)
  const root=useRef<HTMLDivElement>(null),clipboard=useRef<Plan|null>(null)
  const [tool,setTool]=useState<Tool>('select'),[selected,setSelected]=useState<string[]>([]),[linkId,setLinkId]=useState(''),[activeLayer,setActiveLayer]=useState('materials')
  const [showLayers,setShowLayers]=useState(false),[showInspector,setShowInspector]=useState(()=>window.innerWidth>=1100),[fullscreen,setFullscreen]=useState(false)
  const [view,setView]=useState<View>({x:30,y:30,zoom:1}),[fitToken,setFitToken]=useState(0),[cursor,setCursor]=useState<Point>({x:0,y:0})
  const [dialog,setDialog]=useState(''),[picker,setPicker]=useState(false),[query,setQuery]=useState(''),[provider,setProvider]=useState(''),[chosenStock,setChosenStock]=useState(''),[freeName,setFreeName]=useState('')
  const [freeCategory,setFreeCategory]=useState('instrument'),[freeQuantity,setFreeQuantity]=useState(1),[creatingStock,setCreatingStock]=useState(false)
  const [library,setLibrary]=useState(false),[pendingObject,setPendingObject]=useState<LibraryChoice|null>(null),[calibration,setCalibration]=useState<Point[]|null>(null),[knownDistance,setKnownDistance]=useState(5)
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
    commit({...next,groups:next.groups?.map(g=>({...g,nodeIds:g.nodeIds.filter(id=>!ids.has(id))})).filter(g=>g.nodeIds.length>1)});setSelected([]);setLinkId('')
  }
  const copy=()=>{clipboard.current=selectionPlan(plan,selected);p.toast('Sélection copiée.')}
  const paste=(point?:Point)=>{
    const source=clipboard.current;if(!source?.nodes.length)return
    const g=geometry(source.nodes[0]),result=insertBlock(plan,source,point??{x:g.x+24,y:g.y+24})
    commit(result.plan);setSelected(result.ids);setLinkId('')
  }
  const select=(ids:string[])=>{setSelected(ids);if(ids.length&&window.innerWidth>=1100)setShowInspector(true)}
  const selectLink=(id:string)=>{setLinkId(id);if(id&&window.innerWidth>=1100)setShowInspector(true)}
  const toggleGrid=()=>commit(plan.viewMode==='client'?{...plan,clientGrid:!plan.clientGrid}:{...plan,gridVisible:plan.gridVisible===false})
  const toggleSnap=()=>commit({...plan,snapStep:(plan.snapStep??0)>0?0:.5})
  const activate=(next:Tool)=>{setMenu(null);setTool(next);setLibrary(next==='visual');if(next==='visual')setFitToken(v=>v+1);setConnectFrom('');setPicker(next==='equipment'||next==='accessory');if(next==='accessory'){setActiveLayer('accessories');setChosenStock('');setFreeName('')}if(next==='text'||next==='zone'){setChosenStock('');setFreeName(next==='text'?'Annotation':'Zone')}}
  const place=(point:Point)=>{
    if(tool==='visual'&&pendingObject){
      const n=createVisualNode(pendingObject.id,plan,point)
      if(n&&plan.layerLocks?.[n.layerId]){p.toast('Déverrouillez le calque avant d’ajouter un objet.');return}
      if(pendingObject.plan){const result=insertBlock(plan,pendingObject.plan,point);if(result.plan.nodes.some(n=>result.ids.includes(n.id)&&plan.layerLocks?.[nodeLayer(n)])){p.toast('Déverrouillez les calques de ce bloc.');return}commit(result.plan);select(result.ids)}
      else if(n){commit({...plan,nodes:[...plan.nodes,n],layers:{...plan.layers,[n.layerId]:true}});select([n.id])}
      setLinkId('');setTool('select');setLibrary(false);return
    }
    const source=p.stock.find(s=>s.id===chosenStock),name=source?.name||freeName.trim()
    if(!name){setPicker(true);return}
    const layerId=tool==='text'||tool==='zone'?'annotations':source?.category==='accessoire'||tool==='accessory'?'accessories':activeLayer
    if(plan.layerLocks?.[layerId]){p.toast('Déverrouillez le calque avant d’ajouter un objet.');return}
    const step=(plan.snapStep??0)*m.ppm,snap=(v:number)=>step?Math.round(v/step)*step:v
    const illustration=tool==='text'?'text':tool==='zone'?'zone':inferIllustration({id:'',name},source),definition=objectById(illustration)
    const width=tool==='zone'?240:tool==='text'?180:definition?Math.max(8,definition.width*m.ppm):110,height=tool==='zone'?160:tool==='text'?40:definition?Math.max(8,definition.height*m.ppm):84
    const node:InstallationNode={id:uid(),name,stockItemId:source?.id,category:source?.category,kind:tool==='text'?'text':tool==='zone'?'zone':'equipment',layerId,x:snap(point.x),y:snap(point.y),width,height,rotation:0,appearance:{illustration,labelHorizontal:true,lockAspect:tool!=='text'&&tool!=='zone'},visualOnly:tool==='text'||tool==='zone'}
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
    if(panel==='calibrate'){if(plan.backgroundImage){setTool('calibrate');setShowInspector(false);p.toast('Cliquez deux points de distance connue sur le plan de salle.')}return}
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
    else if(mod&&key==='g'){e.preventDefault();commit(e.shiftKey?{...plan,groups:plan.groups?.filter(g=>!g.nodeIds.some(id=>selected.includes(id)))}:groupSelection(plan,selected,'Nouveau groupe'))}
    else if(mod&&key==='a'){e.preventDefault();select(plan.nodes.filter(n=>visible(plan,nodeLayer(n))).map(n=>n.id));setLinkId('')}
    else if(mod&&key==='s'){e.preventDefault();void doc.flush()}
    else if(key==='delete'||key==='backspace'){e.preventDefault();remove()}
    else if(key==='escape'){e.preventDefault();doc.cancel();setMenu(null);setPicker(false);setLibrary(false);setSelected([]);setLinkId('');setConnectFrom('');setTool('select');if(fullscreen)setFullscreen(false)}
    else if(!mod&&key==='g'){e.preventDefault();toggleGrid()}
    else if(!mod&&key==='s'){e.preventDefault();toggleSnap()}
    else if(!mod&&key==='f'){e.preventDefault();setFitToken(v=>v+1)}
    else if(key==='+'||key==='='){e.preventDefault();zoomBy(1.2)}
    else if(key==='-'){e.preventDefault();zoomBy(1/1.2)}
  }}>
    <StageToolbar name={p.program.name} status={doc.status} canUndo={doc.canUndo} canRedo={doc.canRedo} undo={doc.undo} redo={doc.redo} save={()=>void doc.flush()} open={open} zoom={view.zoom} zoomBy={zoomBy} fit={()=>setFitToken(v=>v+1)} grid={plan.viewMode==='client'?!!plan.clientGrid:plan.gridVisible!==false} toggleGrid={()=>plan.viewMode==='client'?commit({...plan,clientGrid:!plan.clientGrid}):toggleGrid()} snap={!!plan.snapStep} toggleSnap={toggleSnap} fullscreen={fullscreen} toggleFullscreen={()=>{setFullscreen(!fullscreen);setTimeout(()=>setFitToken(v=>v+1),50)}} layers={showLayers} inspector={showInspector}/>
    <div className="stage-mode-bar"><div className="stage-view-modes" aria-label="Mode d’affichage">{([['technical','Technique'],['hybrid','Hybride'],['client','Présentation client']] as const).map(([id,label])=><button key={id} aria-pressed={(plan.viewMode??'technical')===id} className={(plan.viewMode??'technical')===id?'active':''} onClick={()=>{commit({...plan,viewMode:id});setLinkId('');setConnectFrom('');setTool('select')}}>{label}</button>)}</div>
      {plan.viewMode==='client'&&<label className="stage-client-cables">Câbles<select aria-label="Câbles en présentation" value={plan.clientCables??'hidden'} onChange={e=>commit({...plan,clientCables:e.target.value as Plan['clientCables']})}><option value="hidden">Masqués</option><option value="muted">Atténués</option><option value="visible">Affichés</option></select></label>}
      <button className="stage-client-export" onClick={()=>setDialog('export-client')}>Aperçu client</button>
    </div>
    <div className="stage-editor-body">
      <StageTools tool={tool} onTool={activate}/>
      {library&&<ObjectLibrary close={()=>setLibrary(false)} choose={(choice,drag)=>{setPendingObject(choice);setTool('visual');if(!drag)p.toast(choice.name+' : cliquez sur son emplacement.')}} onChanged={p.onChanged}/>}
      {showLayers&&<LayerPanel plan={plan} active={activeLayer} setActive={setActiveLayer} commit={commit} close={()=>setShowLayers(false)}/>}
      <StageViewport doc={doc} stock={p.stock} renderIcon={p.renderIcon} tool={tool} selected={selected} setSelected={select} linkId={linkId} setLinkId={selectLink} view={view} setView={setView} fitToken={fitToken} onPlace={place} onCable={cable} connectFrom={connectFrom} onMenu={setMenu} onCursor={setCursor} onDropItem={point=>place(point)} onCalibration={points=>{setCalibration(points);setTool('select')}}/>
      {showInspector&&<PropertiesInspector plan={plan} stock={p.stock} selected={selected} linkId={linkId} commit={commit} duplicate={duplicate} remove={remove} close={()=>setShowInspector(false)} open={open}/>}
      {picker&&<div className="stage-equipment-picker"><div className="stage-panel-heading"><b>Ajouter sur le plan</b><ToolButton label="Fermer le choix de matériel" onClick={()=>setPicker(false)}><X/></ToolButton></div><input aria-label="Rechercher un matériel" placeholder="Rechercher dans le stock…" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Prestataire du matériel" value={provider} onChange={e=>setProvider(e.target.value)}><option value="">Tous les prestataires</option>{providers.map(v=><option key={v}>{v}</option>)}</select><div className="stage-picker-list">{p.stock.filter(s=>!s.deletedAt&&(tool!=='accessory'||s.category==='accessoire')&&(!provider||(s.provider??'Mon stock')===provider)&&s.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(s=><button key={s.id} onClick={()=>{setChosenStock(s.id);setFreeName('');setPicker(false);setTool(tool==='accessory'?'accessory':'equipment');p.toast(s.name+' : cliquez sur la scène pour le placer.')}}><ObjectThumbnail id={inferIllustration({id:s.id,name:s.name},s)}/><div><b>{s.name}</b><small>{s.provider??'Mon stock'} · stock {s.quantity}</small></div><Plus/></button>)}</div><div className="stage-free-stock">
        <form onSubmit={e=>{e.preventDefault();if(freeName.trim()){setChosenStock('');setTool(tool==='accessory'?'accessory':'equipment');setPicker(false)}}}>
          <input aria-label="Nom de l’équipement libre" placeholder="Équipement libre…" value={freeName} onChange={e=>setFreeName(e.target.value)}/>
          <button disabled={!freeName.trim()} aria-label="Placer un équipement libre" title="Placer sans ajouter au stock"><Plus/></button>
        </form>
        {p.onCreateStock&&<div className="stage-free-stock-create">
          <select aria-label="Catégorie du nouveau matériel" value={freeCategory} onChange={e=>setFreeCategory(e.target.value)}>
            <option value="cable">Câble</option><option value="prise">Prise / alimentation</option><option value="instrument">Instrument</option><option value="adaptateur">Adaptateur</option><option value="accessoire">Accessoire</option>
          </select>
          <input aria-label="Quantité du nouveau matériel" type="number" min="1" max="999" value={freeQuantity} onChange={e=>setFreeQuantity(Math.max(1,Number(e.target.value)||1))}/>
          <button type="button" className="stage-wide-button" disabled={!freeName.trim()||creatingStock} onClick={async()=>{
            if(!p.onCreateStock||!freeName.trim())return
            setCreatingStock(true)
            try{
              const created=await p.onCreateStock({name:freeName.trim(),category:freeCategory,provider:provider||'Mon stock',quantity:freeQuantity})
              setChosenStock(created.id);setFreeName('');setPicker(false);setTool(created.category==='accessoire'?'accessory':'equipment')
              p.toast(created.name+' ajouté au stock · cliquez sur la scène pour le placer.')
            }catch{p.toast('Création du matériel impossible.')}finally{setCreatingStock(false)}
          }}><PackagePlus/>{creatingStock?'Création…':'Créer dans le stock'}</button>
        </div>}
      </div></div>}
    </div>
    <footer className="stage-status"><span>{fmt(m.metersW)} × {fmt(m.metersH)} m</span><span>{fmt(m.ppm)} px/m</span><span>Zoom {Math.round(view.zoom*100)} %</span><span>1 carreau = {fmt(plan.gridStep??1)} m</span><span>Snap {plan.snapStep?fmt(plan.snapStep)+' m':'inactif'}</span><span className="stage-cursor">X {fmt(cursor.x/m.ppm)} · Y {fmt(cursor.y/m.ppm)} m</span><span>{selected.length+(linkId?1:0)} sélectionné(s)</span></footer>
    {menu&&<><div className="stage-menu-dismiss" onPointerDown={()=>setMenu(null)}/><div role="menu" className="stage-context-menu" style={{left:Math.max(8,Math.min(menu.x,window.innerWidth-248)),top:Math.max(8,Math.min(menu.y,window.innerHeight-440))}}>
      {menu.nodeId?<><button onClick={()=>{setShowInspector(true);setMenu(null)}}>Modifier les propriétés</button><button onClick={()=>{duplicate();setMenu(null)}}><Copy/>Dupliquer</button><button onClick={()=>open('series')}>Dupliquer en série</button><button onClick={()=>open('save-object')}>Enregistrer dans Mes objets</button><button onClick={()=>{const n=plan.nodes.find(n=>n.id===menu.nodeId)!;if(!plan.layerLocks?.[nodeLayer(n)])commit({...plan,nodes:plan.nodes.map(v=>v.id===n.id?{...v,locked:!v.locked}:v)});setMenu(null)}}><Lock/>Verrouiller / déverrouiller</button><label>Changer de calque<select value={nodeLayer(plan.nodes.find(n=>n.id===menu.nodeId)!)} onChange={e=>{commit({...plan,nodes:plan.nodes.map(n=>selected.includes(n.id)&&!nodeLocked(plan,n)?{...n,layerId:e.target.value}:n)});setMenu(null)}}>{layers(plan).map(id=><option key={id} value={id}>{layerName(plan,id)}</option>)}</select></label></>:
        menu.linkId?<>{(['straight','zigzag','curve'] as const).map(mode=><button key={mode} onClick={()=>{const link=plan.links.find(l=>l.id===menu.linkId)!;if(!linkLocked(plan,link))commit({...plan,links:plan.links.map(l=>l.id===link.id?setRouteMode(plan,l,mode):l)});setMenu(null)}}>{mode==='straight'?'Droit':mode==='zigzag'?'90°':'Courbe'}</button>)}<button onClick={()=>{const link=plan.links.find(l=>l.id===menu.linkId)!;if(!linkLocked(plan,link))commit({...plan,links:plan.links.map(l=>l.id===link.id?addBend(plan,l):l)});setMenu(null)}}>Ajouter un point</button><button onClick={()=>{setShowInspector(true);setMenu(null)}}>Type, longueur et propriétés</button></>:
        <><button disabled={!clipboard.current?.nodes.length} onClick={()=>{paste(menu.point);setMenu(null)}}>Coller</button><button onClick={()=>activate('visual')}>Ajouter un objet visuel</button><button onClick={()=>activate('equipment')}>Ajouter équipement</button><button onClick={()=>activate('text')}>Ajouter annotation</button><button onClick={()=>open('scene')}>Paramètres de scène</button></>}
      {(menu.nodeId||menu.linkId)&&<><button onClick={()=>{order(true);setMenu(null)}}><ArrowUpToLine/>Mettre devant dans le calque</button><button onClick={()=>{order(false);setMenu(null)}}><ArrowDownToLine/>Mettre derrière dans le calque</button><button className="danger" onClick={()=>{remove();setMenu(null)}}><Trash2/>Supprimer</button></>}
    </div></>}
    {dialog==='save-object'&&<SaveObjectDialog plan={plan} selected={selected} close={()=>setDialog('')} onSaved={()=>{p.onChanged();p.toast('Enregistré dans Mes objets.')}}/>}
    {dialog==='series'&&<SeriesDialog plan={plan} selected={selected} stock={p.stock} renderIcon={p.renderIcon} close={()=>setDialog('')} apply={(next,ids)=>{commit(next);select(ids)}}/>}
    {calibration&&<StageDialog title="Calibrer le plan de salle" close={()=>setCalibration(null)}><div className="stage-dialog-body stage-copy-form"><label>Distance réelle entre les deux points (m)<input aria-label="Distance connue (m)" type="number" min="0.01" step="0.1" value={knownDistance} onChange={e=>setKnownDistance(Number(e.target.value))}/></label><p className="stage-note">La photo sera redimensionnée autour du premier point. Les objets de la scène gardent leurs positions.</p><button className="primary" disabled={!Number.isFinite(knownDistance)||knownDistance<=0||Math.hypot(calibration[1].x-calibration[0].x,calibration[1].y-calibration[0].y)<1} onClick={()=>{const b=plan.backgroundImage;if(b){const scale=knownDistance*m.ppm/Math.hypot(calibration[1].x-calibration[0].x,calibration[1].y-calibration[0].y),anchor=calibration[0];commit({...plan,backgroundImage:{...b,x:anchor.x+(b.x-anchor.x)*scale,y:anchor.y+(b.y-anchor.y)*scale,width:b.width*scale,height:b.height*scale}})}setCalibration(null)}}>Appliquer la calibration</button></div></StageDialog>}
    {dialog==='versions' &&<VersionsPanel plan={plan} commit={commit} close={()=>setDialog('')}/>}
    {(dialog==='duplicate'||dialog==='templates')&&<TemplateManager mode={dialog} program={p.program} plan={plan} onCreated={id=>{setDialog('');p.onCreated(id)}} onChanged={p.onChanged} close={()=>setDialog('')} flush={doc.flush}/>}
    {(dialog==='export'||dialog==='export-client')&&<StageExport client={dialog==='export-client'} commit={commit} plan={plan} stock={p.stock} program={p.program} renderIcon={p.renderIcon} close={()=>setDialog('')}/>}
  </div>
}

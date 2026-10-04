import { useEffect,useRef,useState,type PointerEvent as ReactPointerEvent } from 'react'
import type { InstallationNode,InventoryStockItem } from '../types'
import { StageScene,cableVisibility,type IconRenderer } from './StageScene'
import { cablePath,clamp,clone,expandGroups,fmt,geometry,linkLayer,linkLocked,linkPoints,metrics,moveSelection,nodeLayer,nodeLocked,visible,type Plan,type Point } from './model'
import type { useStageDocument } from './useStageDocument'

export type Tool='select'|'pan'|'equipment'|'audio'|'power'|'network'|'accessory'|'text'|'zone'|'measure'|'visual'|'calibrate'
export type View={x:number;y:number;zoom:number}
export type MenuTarget={x:number;y:number;point:Point;nodeId?:string;linkId?:string}
type Drag={kind:'pan'|'move'|'box'|'resize'|'rotate'|'point'|'segment';start:Point;client:Point;plan:Plan;ids:string[];node?:InstallationNode;handle?:string;linkId?:string;pointIndex?:number;route?:Point[];view:View}
type Props={doc:ReturnType<typeof useStageDocument>;stock:InventoryStockItem[];renderIcon:IconRenderer;tool:Tool;selected:string[];setSelected:(ids:string[])=>void;linkId:string;setLinkId:(id:string)=>void;view:View;setView:(view:View)=>void;fitToken:number;onPlace:(point:Point)=>void;onCable:(id:string)=>void;connectFrom:string;onMenu:(target:MenuTarget)=>void;onCursor:(point:Point)=>void;onDropItem:(point:Point)=>void;onCalibration:(points:Point[])=>void}
export function StageViewport(p:Props){
  const {doc,view,tool,selected,linkId}=p,plan=doc.plan,m=metrics(plan)
  const root=useRef<HTMLDivElement>(null),drag=useRef<Drag|null>(null),space=useRef(false)
  const props=useRef(p);props.current=p
  const [box,setBox]=useState<{a:Point;b:Point}|null>(null),[guides,setGuides]=useState<Point|null>(null),[measurement,setMeasurement]=useState<Point[]>([])
  const [cursor,setCursor]=useState<Point>({x:0,y:0})
  const fit=()=>{
    const el=root.current;if(!el||el.clientWidth<20)return
    const {plan}=props.current.doc,mm=metrics(plan)
    const zoom=clamp(Math.min((el.clientWidth-64)/mm.width,(el.clientHeight-64)/mm.height),.03,4)
    props.current.setView({x:(el.clientWidth-mm.width*zoom)/2,y:(el.clientHeight-mm.height*zoom)/2,zoom})
  }
  useEffect(()=>{fit()},[p.fitToken])
  useEffect(()=>{
    const el=root.current;if(!el)return
    let fitted=false
    const resize=new ResizeObserver(()=>{if(!fitted&&el.clientWidth>20){fit();fitted=true}});resize.observe(el)
    const wheel=(e:WheelEvent)=>{e.preventDefault();const {view,setView}=props.current,rect=el.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,z=clamp(view.zoom*Math.exp(-e.deltaY*.0018),.03,8);setView({zoom:z,x:x-(x-view.x)*z/view.zoom,y:y-(y-view.y)*z/view.zoom})}
    el.addEventListener('wheel',wheel,{passive:false})
    const up=()=>{space.current=false}
    const key=(e:KeyboardEvent)=>{if((e.target as HTMLElement)?.closest('input,textarea,select'))return;if(e.code==='Space'&&root.current?.closest('.stage-editor')?.contains(document.activeElement)){space.current=e.type==='keydown';e.preventDefault()}if(e.key==='Escape')setMeasurement([])}
    window.addEventListener('keydown',key,true);window.addEventListener('keyup',key,true);window.addEventListener('blur',up)
    return()=>{resize.disconnect();el.removeEventListener('wheel',wheel);window.removeEventListener('keydown',key,true);window.removeEventListener('keyup',key,true);window.removeEventListener('blur',up)}
  },[])
  useEffect(()=>{if(tool!=='measure'&&tool!=='calibrate')setMeasurement([])},[tool])
  const at=(e:{clientX:number;clientY:number})=>{const r=root.current!.getBoundingClientRect();return {x:(e.clientX-r.left-view.x)/view.zoom,y:(e.clientY-r.top-view.y)/view.zoom}}
  const down=(e:ReactPointerEvent)=>{
    if(e.button===2)return
    root.current?.focus({preventScroll:true});e.preventDefault()
    const point=at(e),el=e.target as Element,nodeId=el.closest('[data-node]')?.getAttribute('data-node'),wireId=el.closest('[data-link]')?.getAttribute('data-link')
    const handle=el.getAttribute('data-handle'),wirePoint=el.getAttribute('data-point'),segment=el.getAttribute('data-segment')
    const hitNode=wireId&&!handle&&wirePoint===null&&segment===null?plan.nodes.slice().reverse().find(n=>{
      if(!visible(plan,nodeLayer(n)))return false
      const g=geometry(n,plan.nodes.indexOf(n)),a=-g.rotation*Math.PI/180,dx=point.x-g.cx,dy=point.y-g.cy
      return Math.abs(dx*Math.cos(a)-dy*Math.sin(a))<=g.width/2&&Math.abs(dx*Math.sin(a)+dy*Math.cos(a))<=g.height/2
    }):undefined
    const node=plan.nodes.find(n=>n.id===nodeId)??hitNode,link=plan.links.find(l=>l.id===(wireId??linkId))
    let kind:Drag['kind']='box',ids=selected
    if(tool==='pan'||space.current||e.button===1)kind='pan'
    else if(tool==='calibrate'){if(measurement.length===1){p.onCalibration([measurement[0],point]);setMeasurement([])}else setMeasurement([point]);return}
    else if(tool==='measure'){setMeasurement(current=>[...current,point]);return}
    else if(['equipment','accessory','text','zone','visual'].includes(tool)){p.onPlace(point);return}
    else if(['audio','power','network'].includes(tool)){if(node&&!['text','zone','shape'].includes(node.kind??'equipment'))p.onCable(node.id);return}
    else if(handle&&node){if(nodeLocked(plan,node))return;kind=handle==='rotate'?'rotate':'resize';ids=[node.id]}
    else if(wirePoint!==null&&link){if(linkLocked(plan,link))return;kind='point'}
    else if(segment!==null&&link){if(linkLocked(plan,link))return;kind='segment'}
    else if(node){
      if(e.shiftKey){ids=selected.includes(node.id)?selected.filter(id=>!expandGroups(plan,[node.id]).includes(id)):expandGroups(plan,[...selected,node.id]);p.setSelected(ids);p.setLinkId('');return}
      ids=selected.includes(node.id)?selected:expandGroups(plan,[node.id]);p.setSelected(ids);p.setLinkId('');if(nodeLocked(plan,node))return;kind='move'
    }else if(wireId){p.setLinkId(wireId);p.setSelected([]);return}
    else {if(!e.shiftKey){p.setSelected([]);p.setLinkId('');ids=[]}setBox({a:point,b:point})}
    drag.current={kind,start:point,client:{x:e.clientX,y:e.clientY},plan:clone(plan),ids,node,handle:handle??undefined,linkId:link?.id,pointIndex:Number(wirePoint??segment),route:link?.route?clone(link.route):[],view}
    if(!['pan','box'].includes(kind))doc.begin()
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move=(e:ReactPointerEvent)=>{
    const point=at(e);p.onCursor(point);setCursor(point)
    const d=drag.current;if(!d)return
    if(d.kind==='pan'){p.setView({...d.view,x:d.view.x+e.clientX-d.client.x,y:d.view.y+e.clientY-d.client.y});return}
    if(d.kind==='box'){setBox({a:d.start,b:point});return}
    const delta={x:point.x-d.start.x,y:point.y-d.start.y},step=(d.plan.snapStep??0)*m.ppm
    if(d.kind==='move'){
      const anchor=d.plan.nodes.find(n=>d.ids.includes(n.id)&&!nodeLocked(d.plan,n))
      if(!anchor)return
      const g=geometry(anchor,d.plan.nodes.indexOf(anchor))
      if(step){delta.x=Math.round((g.x+delta.x)/step)*step-g.x;delta.y=Math.round((g.y+delta.y)/step)*step-g.y}
      let gx=NaN,gy=NaN
      if(step){
        const others=d.plan.nodes.filter(n=>!d.ids.includes(n.id)&&visible(d.plan,nodeLayer(n)))
        const xs=[0,m.width/2,m.width,...others.map(n=>geometry(n,d.plan.nodes.indexOf(n)).cx)],ys=[0,m.height/2,m.height,...others.map(n=>geometry(n,d.plan.nodes.indexOf(n)).cy)]
        for(const x of xs)if(Math.abs(g.cx+delta.x-x)<6/view.zoom){delta.x=x-g.cx;gx=x;break}
        for(const y of ys)if(Math.abs(g.cy+delta.y-y)<6/view.zoom){delta.y=y-g.cy;gy=y;break}
      }
      setGuides({x:gx,y:gy});doc.preview(moveSelection(d.plan,d.ids,delta));return
    }
    if(d.kind==='resize'&&d.node){
      const g=geometry(d.node,d.plan.nodes.indexOf(d.node)),a=-g.rotation*Math.PI/180,dx=delta.x*Math.cos(a)-delta.y*Math.sin(a),dy=delta.x*Math.sin(a)+delta.y*Math.cos(a),h=d.handle!
      let w=g.width,hg=g.height,l=0,t=0
      if(h.includes('e'))w=Math.max(16,g.width+dx);if(h.includes('s'))hg=Math.max(16,g.height+dy)
      if(h.includes('w')){w=Math.max(16,g.width-dx);l=g.width-w}if(h.includes('n')){hg=Math.max(16,g.height-dy);t=g.height-hg}
      if(d.node.appearance?.lockAspect){
        const ratio=g.width/g.height
        if(h==='n'||h==='s')w=hg*ratio;else hg=w/ratio
        l=h.includes('w')?g.width-w:0;t=h.includes('n')?g.height-hg:0
      }
      const centerLocal={x:l+(w-g.width)/2,y:t+(hg-g.height)/2},r=g.rotation*Math.PI/180
      const cx=g.cx+centerLocal.x*Math.cos(r)-centerLocal.y*Math.sin(r),cy=g.cy+centerLocal.x*Math.sin(r)+centerLocal.y*Math.cos(r)
      doc.preview({...d.plan,nodes:d.plan.nodes.map(n=>n.id===d.node!.id?{...n,x:cx-w/2,y:cy-hg/2,width:w,height:hg}:n)});return
    }
    if(d.kind==='rotate'&&d.node){const g=geometry(d.node,d.plan.nodes.indexOf(d.node)),angle=Math.atan2(point.y-g.cy,point.x-g.cx)*180/Math.PI+90;doc.preview({...d.plan,nodes:d.plan.nodes.map(n=>n.id===d.node!.id?{...n,rotation:e.shiftKey?Math.round(angle/15)*15:Math.round(angle)}:n)});return}
    if(d.kind==='point'){
      const q=step?{x:Math.round(point.x/step)*step,y:Math.round(point.y/step)*step}:point
      doc.preview({...d.plan,links:d.plan.links.map(l=>l.id===d.linkId?{...l,route:l.route?.map((r,i)=>i===d.pointIndex?q:r)}:l)});return
    }
    if(d.kind==='segment'){
      doc.preview({...d.plan,links:d.plan.links.map(l=>l.id===d.linkId?{...l,route:(d.route??[]).map((r,i)=>i===d.pointIndex||i===d.pointIndex!+1?{x:r.x+delta.x,y:r.y+delta.y}:r)}:l)})
    }
  }
  const up=(e:ReactPointerEvent)=>{
    const d=drag.current;if(!d)return
    if(d.kind==='box'){
      const end=at(e),x=Math.min(end.x,d.start.x),y=Math.min(end.y,d.start.y),w=Math.abs(end.x-d.start.x),h=Math.abs(end.y-d.start.y)
      const hits=d.plan.nodes.filter((n,i)=>{const g=geometry(n,i);return visible(plan,nodeLayer(n))&&g.x<=x+w&&g.x+g.width>=x&&g.y<=y+h&&g.y+g.height>=y}).map(n=>n.id)
      p.setSelected(expandGroups(plan,Array.from(new Set([...d.ids,...hits]))))
    }else if(d.kind!=='pan')doc.finish()
    drag.current=null;setBox(null);setGuides(null)
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)
  }
  const selectedLink=plan.links.find(l=>l.id===linkId)
  const measurePoints=measurement.length?[...measurement,cursor]:[]
  const measureDistance=measurePoints.reduce((sum,p,i)=>i?sum+Math.hypot(p.x-measurePoints[i-1].x,p.y-measurePoints[i-1].y)/m.ppm:sum,0)
  return <div className={'stage-viewport tool-'+tool} ref={root} tabIndex={0} aria-label="Plan de scène" onDragOver={e=>{if(e.dataTransfer.types.includes('application/x-diart-object')){e.preventDefault();e.dataTransfer.dropEffect='copy'}}} onDrop={e=>{if(e.dataTransfer.getData('application/x-diart-object')){e.preventDefault();p.onDropItem(at(e))}}} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{doc.cancel();drag.current=null;setBox(null);setGuides(null)}} onContextMenu={e=>{e.preventDefault();const el=e.target as Element,point=at(e);let n=el.closest('[data-node]')?.getAttribute('data-node')??undefined,l=el.closest('[data-link]')?.getAttribute('data-link')??undefined;if(!n&&l){n=plan.nodes.slice().reverse().find(node=>{if(!visible(plan,nodeLayer(node)))return false;const g=geometry(node,plan.nodes.indexOf(node)),r=-g.rotation*Math.PI/180,dx=point.x-g.cx,dy=point.y-g.cy;return Math.abs(dx*Math.cos(r)-dy*Math.sin(r))<=g.width/2&&Math.abs(dx*Math.sin(r)+dy*Math.cos(r))<=g.height/2})?.id;if(n)l=undefined}if(n&&!selected.includes(n))p.setSelected(expandGroups(plan,[n]));if(l){p.setLinkId(l);p.setSelected([])}p.onMenu({x:e.clientX,y:e.clientY,point:at(e),nodeId:n,linkId:l})}}>
    <svg className="stage-world" width={m.width} height={m.height} viewBox={`0 0 ${m.width} ${m.height}`} style={{transform:`translate(${view.x}px, ${view.y}px) scale(${view.zoom})`}}>
      <StageScene plan={plan} stock={p.stock} renderIcon={p.renderIcon} interactive/>
      <g fill="none" stroke="#1494b4" strokeWidth={1.5/view.zoom}>
        {plan.nodes.map((n,i)=>{
          if(!selected.includes(n.id)||!visible(plan,nodeLayer(n)))return null
          const g=geometry(n,i),locked=nodeLocked(plan,n),s=8/view.zoom
          return <g key={n.id} data-node={n.id} transform={`translate(${g.x} ${g.y}) rotate(${g.rotation} ${g.width/2} ${g.height/2})`}>
            <rect x={-3/view.zoom} y={-3/view.zoom} width={g.width+6/view.zoom} height={g.height+6/view.zoom} strokeDasharray={locked?'4 3':undefined} pointerEvents="none"/>
            {selected.length===1&&!locked&&<>
              <path d={`M ${g.width/2} 0 v ${-26/view.zoom}`} pointerEvents="none"/>
              <circle data-handle="rotate" cx={g.width/2} cy={-26/view.zoom} r={6/view.zoom} fill="white" style={{cursor:'grab'}}/>
              {(['nw','n','ne','e','se','s','sw','w'] as const).map(h=>{const x=h.includes('w')?0:h.includes('e')?g.width:g.width/2,y=h.includes('n')?0:h.includes('s')?g.height:g.height/2;return <rect key={h} data-handle={h} x={x-s/2} y={y-s/2} width={s} height={s} fill="white" style={{cursor:h+'-resize'}}/>})}
            </>}
          </g>
        })}
        {selectedLink&&cableVisibility(plan,selectedLink)>0&&visible(plan,linkLayer(selectedLink))&&<g data-link={selectedLink.id}>
          <path d={cablePath(linkPoints(plan,selectedLink),selectedLink.routeMode)} strokeWidth={7/view.zoom} strokeOpacity=".3" pointerEvents="none"/>
          {!linkLocked(plan,selectedLink)&&(selectedLink.route??[]).map((q,i)=><g key={i}>
            {i<(selectedLink.route?.length??0)-1&&<circle data-segment={i} cx={(q.x+selectedLink.route![i+1].x)/2} cy={(q.y+selectedLink.route![i+1].y)/2} r={5/view.zoom} fill="#b6e9f6" style={{cursor:'move'}}/>}
            <circle data-point={i} cx={q.x} cy={q.y} r={6/view.zoom} fill="white" style={{cursor:'move'}}/>
          </g>)}
        </g>}
        {['audio','power','network'].includes(tool)&&plan.nodes.filter(n=>!['text','zone','shape'].includes(n.kind??'equipment')&&visible(plan,nodeLayer(n))).map(n=>{const g=geometry(n,plan.nodes.indexOf(n));return <circle key={n.id} data-node={n.id} cx={g.cx} cy={g.cy} r={8/view.zoom} fill={p.connectFrom===n.id?'#16a3be':'white'}/>})}
        {box&&<rect x={Math.min(box.a.x,box.b.x)} y={Math.min(box.a.y,box.b.y)} width={Math.abs(box.a.x-box.b.x)} height={Math.abs(box.a.y-box.b.y)} fill="#159abc" fillOpacity=".12" pointerEvents="none"/>}
        {guides&&<g stroke="#bd7f2e" strokeDasharray="5 5" pointerEvents="none">{Number.isFinite(guides.x)&&<path d={`M ${guides.x} 0 V ${m.height}`}/>} {Number.isFinite(guides.y)&&<path d={`M 0 ${guides.y} H ${m.width}`}/>}</g>}
      </g>
      {measurePoints.length>1&&<g pointerEvents="none"><polyline points={measurePoints.map(q=>`${q.x},${q.y}`).join(' ')} stroke="#b34c6b" strokeWidth={2/view.zoom} fill="none"/>{measurement.map((q,i)=><circle key={i} cx={q.x} cy={q.y} r={4/view.zoom} fill="#b34c6b"/>)}<text x={cursor.x+10/view.zoom} y={cursor.y-12/view.zoom} fontSize={14/view.zoom} fill="#922d4d" stroke="white" strokeWidth={3/view.zoom} paintOrder="stroke" fontFamily="Arial">{fmt(measureDistance)} m</text></g>}
    </svg>
    {plan.nodes.length===0&&<div className="stage-empty-hint"><b>Votre scène est prête</b><span>Ajoutez du matériel ou partez d’un modèle.</span></div>}
    <div className="stage-view-hint">{tool==='calibrate'?'Calibration : cliquez deux points de distance connue':tool==='measure'?'Cliquez pour mesurer · Échap pour effacer':p.connectFrom?'Choisissez la destination':tool==='pan'?'Glissez pour déplacer la vue':tool==='select'?'Molette : zoom · Espace + glisser : vue · Maj + clic : sélection':'Cliquez sur la scène pour placer'}</div>
  </div>
}

import type { InstallationLink, InstallationNode, InstallationSnapshot, InventoryInstallation, InventoryProgram } from '../types'

export type Point = {x:number;y:number}
export type Plan = InventoryInstallation
export const BUILTIN_LAYERS:Record<string,string> = {scenery:'Scénographie',materials:'Matos',audio:'Audio',power:'Électricité',connectivity:'Réseau / connectique',accessories:'Accessoires',annotations:'Annotations'}
export const clone = <T,>(value:T):T => structuredClone(value)
export const uid = ():string => crypto.randomUUID()
export const fmt = (n:number) => new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(n)
export const finite = (n:number|undefined,fallback:number) => typeof n==='number'&&Number.isFinite(n)?n:fallback
export const clamp = (n:number,min:number,max:number) => Math.max(min,Math.min(max,n))
export function metrics(plan:Plan){
  const width=Math.max(1,finite(plan.stageWidth,980)),height=Math.max(1,finite(plan.stageHeight,650))
  const metersW=Math.max(.25,finite(plan.stageWidthMeters,12)),metersH=Math.max(.25,finite(plan.stageDepthMeters,8))
  const ppm=Math.max(1,finite(plan.stagePixelsPerMeter,Math.min(width/metersW,height/metersH)))
  return {width,height,metersW,metersH,ppm}
}
export function geometry(node:InstallationNode,index=0){
  const width=Math.max(8,finite(node.width,110*finite(node.scale,1))),height=Math.max(8,finite(node.height,84*finite(node.scale,1)))
  const x=finite(node.x,70+(index%4)*180),y=finite(node.y,85+Math.floor(index/4)*135)
  return {x,y,width,height,cx:x+width/2,cy:y+height/2,rotation:finite(node.rotation,0)}
}
export const nodeLayer=(node:InstallationNode)=>node.layerId??(node.kind==='text'||node.kind==='zone'?'annotations':node.role==='accessory'||node.category==='accessoire'||/sustain|pied|support|stand/i.test(node.name)?'accessories':'materials')
export const linkLayer=(link:InstallationLink)=>link.layerId??(link.kind==='power'?'power':link.kind==='audio'?'audio':link.kind==='accessory'?'accessories':'connectivity')
export function layers(plan:Plan){return Array.from(new Set([...(plan.layerOrder??[]),...Object.keys(BUILTIN_LAYERS),...(plan.customLayers??[]).map(l=>l.id)]))}
export const layerName=(plan:Plan,id:string)=>plan.layerNames?.[id]??plan.customLayers?.find(l=>l.id===id)?.name??BUILTIN_LAYERS[id]??id
export const visible=(plan:Plan,id:string)=>plan.layers?.[id]!==false
export const nodeLocked=(plan:Plan,node:InstallationNode)=>!!(node.locked||plan.layerLocks?.[nodeLayer(node)]||plan.groups?.some(g=>g.locked&&g.nodeIds.includes(node.id)))
export const linkLocked=(plan:Plan,link:InstallationLink)=>!!(link.locked||plan.layerLocks?.[linkLayer(link)]||plan.groups?.some(g=>g.locked&&g.nodeIds.includes(link.fromNodeId)&&g.nodeIds.includes(link.toNodeId)))
export function stockNeeds(plan:Plan){
  const counts=new Map<string,number>()
  for(const n of plan.nodes)if(n.stockItemId&&!n.visualOnly)counts.set(n.stockItemId,(counts.get(n.stockItemId)??0)+Math.max(1,Math.round(finite(n.quantity,1))))
  return counts
}
export function linkPoints(plan:Plan,link:InstallationLink):Point[]{
  const a=plan.nodes.findIndex(n=>n.id===link.fromNodeId),b=plan.nodes.findIndex(n=>n.id===link.toNodeId)
  if(a<0||b<0)return []
  const from=geometry(plan.nodes[a],a),to=geometry(plan.nodes[b],b)
  const points=[{x:from.cx,y:from.cy},...(link.route??[]),{x:to.cx,y:to.cy}]
  if(link.routeMode!=='zigzag')return points
  // Orthogonal elbows are derived from anchors, so moving an endpoint stays at 90°.
  return points.flatMap((p,i)=>i&&points[i-1].x!==p.x&&points[i-1].y!==p.y?[{x:p.x,y:points[i-1].y},p]:[p])
}
export function cablePath(points:Point[],mode:InstallationLink['routeMode']='straight'){
  if(!points.length)return ''
  if(mode!=='curve'||points.length<3)return points.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' ')
  let path=`M ${points[0].x} ${points[0].y}`
  for(let i=1;i<points.length-1;i++){
    const p=points[i],q=points[i+1]
    path+=` Q ${p.x} ${p.y} ${(p.x+q.x)/2} ${(p.y+q.y)/2}`
  }
  const p=points[points.length-2],q=points[points.length-1]
  return path+` Q ${p.x} ${p.y} ${q.x} ${q.y}`
}
export function cableDistance(plan:Plan,link:InstallationLink){
  const points=linkPoints(plan,link)
  let samples=points
  if(link.routeMode==='curve'&&points.length>2){
    samples=[points[0]]
    let start=points[0]
    for(let i=1;i<points.length;i++){
      const control=points[Math.min(i,points.length-2)]
      const end=i<points.length-1?{x:(points[i].x+points[i+1].x)/2,y:(points[i].y+points[i+1].y)/2}:points[i]
      for(let j=1;j<=24;j++){
        const t=j/24,u=1-t
        samples.push({x:u*u*start.x+2*u*t*control.x+t*t*end.x,y:u*u*start.y+2*u*t*control.y+t*t*end.y})
      }
      start=end
    }
  }
  return samples.reduce((sum,p,i)=>i?sum+Math.hypot(p.x-samples[i-1].x,p.y-samples[i-1].y):sum,0)/metrics(plan).ppm
}
export const CABLE_STYLES:Record<string,{color:string;dash:string;label:string}>={
  audio:{color:'#087f92',dash:'',label:'Audio'},power:{color:'#bc7919',dash:'10 5',label:'Alimentation'},network:{color:'#6553bd',dash:'8 5',label:'Réseau'},
  midi:{color:'#a74399',dash:'5 4',label:'MIDI'},data:{color:'#3778ba',dash:'4 4',label:'Données'},accessory:{color:'#7c6b54',dash:'3 5',label:'Accessoires'},unknown:{color:'#68767e',dash:'',label:'Autre'}
}
export const cableStyle=(link:InstallationLink)=>({...CABLE_STYLES[link.kind??'unknown'],...(link.color?{color:link.color}:{}),opacity:link.opacity??1})
export function changeMetrics(plan:Plan,width:number,depth:number,ppm:number,adapt:boolean):Plan{
  const m=metrics(plan),w=clamp(finite(width,12),.25,100),h=clamp(finite(depth,8),.25,100),scale=clamp(finite(ppm,80),10,250)
  const next={...clone(plan),stageWidth:w*scale,stageHeight:h*scale,stageWidthMeters:w,stageDepthMeters:h,stagePixelsPerMeter:scale}
  if(!adapt)return {...next,stageWidth:m.width,stageHeight:m.height}
  const sx=next.stageWidth/m.width,sy=next.stageHeight/m.height
  next.nodes=next.nodes.map((n,i)=>{const g=geometry(n,i);return {...n,x:g.x*sx,y:g.y*sy,width:g.width*sx,height:g.height*sy}})
  next.links=next.links.map(l=>({...l,route:l.route?.map(p=>({x:p.x*sx,y:p.y*sy}))}))
  if(next.backgroundImage){const b=next.backgroundImage;next.backgroundImage={...b,x:b.x*sx,y:b.y*sy,width:b.width*sx,height:b.height*sy}}
  return next
}
export function planBounds(plan:Plan,allowed=layers(plan).filter(id=>visible(plan,id))){
  const m=metrics(plan),points:Point[]=[{x:0,y:0},{x:m.width,y:m.height}],set=new Set(allowed)
  plan.nodes.forEach((n,i)=>{if(!set.has(nodeLayer(n)))return;const g=geometry(n,i),a=g.rotation*Math.PI/180
    for(const x of [-g.width/2,g.width/2])for(const y of [-g.height/2,g.height/2])points.push({x:g.cx+x*Math.cos(a)-y*Math.sin(a),y:g.cy+x*Math.sin(a)+y*Math.cos(a)})
    if(n.appearance?.labelMode!=='none')points.push({x:g.cx-Math.max(g.width/2,100),y:g.cy+Math.hypot(g.width,g.height)/2+36},{x:g.cx+Math.max(g.width/2,100),y:g.y})
  })
  plan.links.filter(l=>set.has(linkLayer(l))).forEach(l=>points.push(...linkPoints(plan,l)))
  const x=Math.min(0,...points.map(p=>p.x-8)),y=Math.min(0,...points.map(p=>p.y-8)),right=Math.max(m.width,...points.map(p=>p.x+8)),bottom=Math.max(m.height,...points.map(p=>p.y+8))
  return {x,y,width:right-x,height:bottom-y}
}
export function duplicateSelection(plan:Plan,ids:string[],offset:Point={x:24,y:24}){
  const mapping=new Map<string,string>()
  const nodes=plan.nodes.filter(n=>ids.includes(n.id)).map(n=>{
    const g=geometry(n,plan.nodes.indexOf(n)),id=uid();mapping.set(n.id,id)
    return {...clone(n),id,x:g.x+offset.x,y:g.y+offset.y,locked:false}
  })
  const links=plan.links.filter(l=>mapping.has(l.fromNodeId)&&mapping.has(l.toNodeId)).map(l=>({...clone(l),id:uid(),fromNodeId:mapping.get(l.fromNodeId)!,toNodeId:mapping.get(l.toNodeId)!,locked:false,route:l.route?.map(p=>({x:p.x+offset.x,y:p.y+offset.y}))}))
  const groups=(plan.groups??[]).filter(g=>g.nodeIds.every(id=>mapping.has(id))).map(g=>({...clone(g),id:uid(),locked:false,nodeIds:g.nodeIds.map(id=>mapping.get(id)!)}))
  return {plan:{...plan,nodes:[...plan.nodes,...nodes],links:[...plan.links,...links],groups:[...(plan.groups??[]),...groups]},ids:nodes.map(n=>n.id)}
}
export function moveSelection(plan:Plan,ids:string[],delta:Point):Plan{
  const moved=new Set(plan.nodes.filter(n=>ids.includes(n.id)&&!nodeLocked(plan,n)).map(n=>n.id))
  return {...plan,nodes:plan.nodes.map((n,i)=>{if(!moved.has(n.id))return n;const g=geometry(n,i);return {...n,x:g.x+delta.x,y:g.y+delta.y}}),
    links:plan.links.map(l=>moved.has(l.fromNodeId)&&moved.has(l.toNodeId)&&!linkLocked(plan,l)?{...l,route:l.route?.map(p=>({x:p.x+delta.x,y:p.y+delta.y}))}:l)}
}
export type Alignment='left'|'center'|'right'|'top'|'middle'|'bottom'|'horizontal'|'vertical'
export function alignSelection(plan:Plan,ids:string[],mode:Alignment):Plan{
  const chosen=plan.nodes.map((n,i)=>({n,g:geometry(n,i)})).filter(({n})=>ids.includes(n.id)&&!nodeLocked(plan,n))
  if(chosen.length<2)return plan
  const minX=Math.min(...chosen.map(v=>v.g.x)),maxX=Math.max(...chosen.map(v=>v.g.x+v.g.width)),minY=Math.min(...chosen.map(v=>v.g.y)),maxY=Math.max(...chosen.map(v=>v.g.y+v.g.height))
  const sorted=[...chosen].sort((a,b)=>mode==='horizontal'?a.g.x-b.g.x:a.g.y-b.g.y)
  const gapX=(maxX-minX-chosen.reduce((s,v)=>s+v.g.width,0))/(chosen.length-1),gapY=(maxY-minY-chosen.reduce((s,v)=>s+v.g.height,0))/(chosen.length-1)
  const map=new Map<string,InstallationNode>();let cursor=mode==='horizontal'?minX:minY
  for(const {n,g} of sorted){let x=g.x,y=g.y
    if(mode==='left')x=minX;if(mode==='center')x=(minX+maxX-g.width)/2;if(mode==='right')x=maxX-g.width
    if(mode==='top')y=minY;if(mode==='middle')y=(minY+maxY-g.height)/2;if(mode==='bottom')y=maxY-g.height
    if(mode==='horizontal'){x=cursor;cursor+=g.width+gapX}if(mode==='vertical'){y=cursor;cursor+=g.height+gapY}
    map.set(n.id,{...n,x,y})
  }
  return {...plan,nodes:plan.nodes.map(n=>map.get(n.id)??n)}
}
export function planVersion(plan:Plan,name:string):InstallationSnapshot{
  const {snapshots:_,...data}=clone(plan)
  return {id:uid(),name,createdAt:new Date().toISOString(),nodes:clone(data.nodes),links:clone(data.links),layers:clone(data.layers),layerOrder:clone(data.layerOrder),customLayers:clone(data.customLayers),plan:data}
}
export function restoreVersion(plan:Plan,version:InstallationSnapshot):Plan{
  const data=version.plan??{nodes:version.nodes,links:version.links,layers:version.layers??plan.layers,layerOrder:version.layerOrder??plan.layerOrder,customLayers:version.customLayers??plan.customLayers}
  return {...plan,...clone(data),snapshots:plan.snapshots}
}
export type CopyMode='plan'|'materials'|'complete'
export function copyProgram(source:InventoryProgram,name:string,date:string,mode:CopyMode,template=false):InventoryProgram{
  const stamp=new Date().toISOString(),original=source.installation??{nodes:[],links:[]}
  const next=clone(original)
  // Full copies preserve locks and every optional property; all graph IDs are independent.
  const map=new Map(original.nodes.map(n=>[n.id,uid()]))
  next.nodes=clone(original.nodes).map(n=>({...n,id:map.get(n.id)!}))
  next.links=clone(original.links).map(l=>({...l,id:uid(),fromNodeId:map.get(l.fromNodeId)??l.fromNodeId,toNodeId:map.get(l.toNodeId)??l.toNodeId}))
  next.groups=original.groups?.map(g=>({...clone(g),id:uid(),nodeIds:g.nodeIds.map(id=>map.get(id)!).filter(Boolean)}))
  next.snapshots=(original.snapshots??[]).map(s=>({...clone(s),id:uid()}))
  return {id:uid(),name,date:template?'':date,location:mode==='complete'?source.location:'',notes:mode==='complete'?source.notes:'',
    startTime:mode==='complete'?source.startTime:'',endTime:mode==='complete'?source.endTime:'',frequency:template?'once':mode==='complete'?source.frequency:'once',weekday:date?new Date(date+'T12:00:00').getDay():null,
    items:mode==='plan'?[]:clone(source.items).map(i=>({...i,id:uid(),loaded:false,returned:false})),installation:next,
    isTemplate:template,isPublic:false,createdAt:stamp,updatedAt:stamp,deletedAt:null}
}

/** Expand a click to the whole persistent group; groups never nest. */
export function expandGroups(plan:Plan,ids:string[]){
  const expanded=new Set(ids)
  for(const group of plan.groups??[])if(group.nodeIds.some(id=>expanded.has(id)))group.nodeIds.forEach(id=>expanded.add(id))
  return [...expanded].filter(id=>plan.nodes.some(n=>n.id===id))
}
export function groupSelection(plan:Plan,ids:string[],name:string):Plan{
  const chosen=expandGroups(plan,ids).filter(id=>{const n=plan.nodes.find(n=>n.id===id);return n&&!nodeLocked(plan,n)})
  if(chosen.length<2)return plan
  return {...plan,groups:[...(plan.groups??[]).filter(g=>!g.nodeIds.some(id=>chosen.includes(id))),{id:uid(),name:name.trim()||'Groupe',nodeIds:chosen}]}
}
export function selectionPlan(plan:Plan,ids:string[]):Plan{
  return {...clone(plan),nodes:clone(plan.nodes.filter(n=>ids.includes(n.id))),links:clone(plan.links.filter(l=>ids.includes(l.fromNodeId)&&ids.includes(l.toNodeId))),groups:clone((plan.groups??[]).filter(g=>g.nodeIds.every(id=>ids.includes(id)))),snapshots:[]}
}
/** Inserting a block remaps nodes, cables, groups and assets; no source is mutated. */
export function insertBlock(plan:Plan,source:Plan,point:Point):{plan:Plan;ids:string[]}{
  if(!source.nodes.length)return {plan,ids:[]}
  const minX=Math.min(...source.nodes.map((n,i)=>geometry(n,i).x)),minY=Math.min(...source.nodes.map((n,i)=>geometry(n,i).y))
  const ratio=metrics(plan).ppm/metrics(source).ppm,scaled=clone(source)
  scaled.nodes=source.nodes.map((n,i)=>{const g=geometry(n,i);return {...clone(n),x:(g.x-minX)*ratio+point.x,y:(g.y-minY)*ratio+point.y,width:g.width*ratio,height:g.height*ratio}})
  scaled.links=source.links.map(l=>({...clone(l),route:l.route?.map(p=>({x:(p.x-minX)*ratio+point.x,y:(p.y-minY)*ratio+point.y}))}))
  const copy=duplicateSelection(scaled,scaled.nodes.map(n=>n.id),{x:0,y:0}),newIds=new Set(copy.ids),oldLinks=new Set(scaled.links.map(l=>l.id)),oldGroups=new Set(scaled.groups?.map(g=>g.id))
  const imageIds=new Map(Object.keys(source.assets??{}).map(id=>[id,uid()])),assets={...plan.assets}
  for(const [id,img] of Object.entries(source.assets??{})){const key=imageIds.get(id)!;assets[key]={...clone(img),id:key}}
  const nodes=copy.plan.nodes.filter(n=>newIds.has(n.id)).map(n=>({...n,appearance:n.appearance?{...n.appearance,imageId:imageIds.get(n.appearance.imageId??'')??n.appearance.imageId}:undefined}))
  return {plan:{...plan,nodes:[...plan.nodes,...nodes],links:[...plan.links,...copy.plan.links.filter(l=>!oldLinks.has(l.id))],groups:[...(plan.groups??[]),...(copy.plan.groups??[]).filter(g=>!oldGroups.has(g.id))],assets,customLayers:[...(plan.customLayers??[]),...(source.customLayers??[]).filter(l=>!(plan.customLayers??[]).some(p=>p.id===l.id))],layers:{...plan.layers,...Object.fromEntries(nodes.map(n=>[nodeLayer(n),true]))}},ids:copy.ids}
}
export type SeriesOptions={count:number;layout:'line'|'column'|'grid'|'arc'|'circle';columns:number;gapX:number;gapY:number;rotation:number;radius:number;arc:number}
export function seriesSelection(plan:Plan,ids:string[],options:SeriesOptions):{plan:Plan;ids:string[]}{
  if(plan.nodes.some(n=>ids.includes(n.id)&&nodeLocked(plan,n)))return {plan,ids}
  const source=selectionPlan(plan,ids.filter(id=>{const n=plan.nodes.find(n=>n.id===id);return n&&!nodeLocked(plan,n)}))
  if(!source.nodes.length)return {plan,ids:[]}
  const count=clamp(Math.round(options.count),1,200),ppm=metrics(plan).ppm,gs=source.nodes.map((n,i)=>geometry(n,i)),left=Math.min(...gs.map(g=>g.x)),top=Math.min(...gs.map(g=>g.y)),width=Math.max(...gs.map(g=>g.x+g.width))-left,height=Math.max(...gs.map(g=>g.y+g.height))-top
  const cx=left+width/2,cy=top+height/2,columns=clamp(Math.round(options.columns),1,count),angle=options.rotation*Math.PI/180
  let next:Plan={...plan,nodes:plan.nodes.filter(n=>!ids.includes(n.id)),links:plan.links.filter(l=>!source.links.some(s=>s.id===l.id)),groups:plan.groups?.filter(g=>!g.nodeIds.some(id=>ids.includes(id)))}
  const resultIds:string[]=[]
  for(let i=0;i<count;i++){
    let x=0,y=0,rotation=options.rotation
    if(options.layout==='line')x=i*(width+options.gapX*ppm)
    if(options.layout==='column')y=i*(height+options.gapY*ppm)
    if(options.layout==='grid'){x=(i%columns)*(width+options.gapX*ppm);y=Math.floor(i/columns)*(height+options.gapY*ppm)}
    if(options.layout==='circle'||options.layout==='arc'){
      const span=options.layout==='circle'?360:options.arc,t=(options.layout==='circle'?i/count:count===1?.5:i/(count-1))*span-span/2,r=t*Math.PI/180
      x=options.radius*ppm*Math.sin(r);y=options.radius*ppm*(1-Math.cos(r));rotation+=t
    }
    const dx=x*Math.cos(angle)-y*Math.sin(angle),dy=x*Math.sin(angle)+y*Math.cos(angle),a=rotation*Math.PI/180
    const transform=(p:Point)=>({x:cx+(p.x-cx)*Math.cos(a)-(p.y-cy)*Math.sin(a)+dx,y:cy+(p.x-cx)*Math.sin(a)+(p.y-cy)*Math.cos(a)+dy})
    const sample={...source,nodes:source.nodes.map((n,j)=>{const g=gs[j],p=transform({x:g.cx,y:g.cy});return {...clone(n),x:p.x-g.width/2,y:p.y-g.height/2,rotation:g.rotation+rotation}}),links:source.links.map(l=>({...clone(l),route:l.route?.map(transform)}))}
    const copy=i===0?{plan:sample,ids:sample.nodes.map(n=>n.id)}:duplicateSelection(sample,sample.nodes.map(n=>n.id),{x:0,y:0})
    const nodes=copy.plan.nodes.filter(n=>copy.ids.includes(n.id)),links=i===0?sample.links:copy.plan.links.filter(l=>!sample.links.some(s=>s.id===l.id)),groups=i===0?sample.groups:copy.plan.groups?.filter(g=>!sample.groups?.some(s=>s.id===g.id))
    next={...next,nodes:[...next.nodes,...nodes],links:[...next.links,...links],groups:[...(next.groups??[]),...(groups??[])]};resultIds.push(...copy.ids)
  }
  return {plan:next,ids:resultIds}
}
export class HistoryManager {
  past:Plan[]=[];future:Plan[]=[]
  constructor(public limit=80){}
  record(before:Plan,after:Plan){if(JSON.stringify(before)===JSON.stringify(after))return false;this.past.push(clone(before));if(this.past.length>this.limit)this.past.shift();this.future=[];return true}
  undo(current:Plan){const previous=this.past.pop();if(!previous)return current;this.future.push(clone(current));return clone(previous)}
  redo(current:Plan){const next=this.future.pop();if(!next)return current;this.past.push(clone(current));return clone(next)}
}

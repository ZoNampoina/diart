import { memo,type ReactNode } from 'react'
import type { InstallationLink,InstallationNode, InventoryStockItem,StageViewMode } from '../types'
import { cablePath,cableStyle,geometry,layers,linkLayer,linkPoints,metrics,nodeLayer,visible,type Plan } from './model'
import { inferIllustration,nodeLabel,objectById } from './catalog'
import { SymbolDrawing } from './StageSymbols'

export type IconRenderer=(node:InstallationNode,stock?:InventoryStockItem)=>ReactNode
export function MetricGrid({plan,measures=true}:{plan:Plan;measures?:boolean}){
  const m=metrics(plan),step=Math.max(.25,plan.gridStep??1)*m.ppm
  return <g pointerEvents="none">
    {plan.gridVisible!==false&&<g stroke="#c9d7db" strokeWidth=".65" fill="none">
      {Array.from({length:Math.min(450,Math.ceil(m.width/step))},(_,i)=><path key={'x'+i} d={`M ${i*step} 0 V ${m.height}`}/>)}
      {Array.from({length:Math.min(450,Math.ceil(m.height/step))},(_,i)=><path key={'y'+i} d={`M 0 ${i*step} H ${m.width}`}/>)}
    </g>}
    {measures&&<g fill="#61747c" fontSize="11" fontFamily="Arial, sans-serif">
      {Array.from({length:Math.min(101,Math.ceil(m.width/m.ppm))},(_,i)=><text x={i*m.ppm+4} y="14" key={'x'+i}>{i} m</text>)}
      {Array.from({length:Math.min(101,Math.ceil(m.height/m.ppm))},(_,i)=>i>0?<text x="4" y={i*m.ppm+12} key={'y'+i}>{i} m</text>:null)}
      <path d={`M 20 ${m.height-26} v 6 h ${m.ppm} v -6`} stroke="#49636c" strokeWidth="2" fill="none"/>
      <text x={20+m.ppm/2} y={m.height-28} textAnchor="middle">1 m</text>
    </g>}
    <rect x="1" y="1" width={Math.max(1,Math.min(m.width,m.metersW*m.ppm)-2)} height={Math.max(1,Math.min(m.height,m.metersH*m.ppm)-2)} stroke="#91a9b3" strokeWidth="2" fill="none"/>
    <text x={m.width/2} y={plan.audience==='top'?32:m.height-12} textAnchor="middle" fill="#758993" fontFamily="Arial, sans-serif" fontSize="12" letterSpacing="4">PUBLIC</text>
  </g>
}

export function cableVisibility(plan:Plan,link:InstallationLink){
  if(plan.viewMode==='client')return plan.clientCables==='visible'?1:plan.clientCables==='muted'?.18:0
  if(plan.viewMode==='hybrid')return link.kind==='accessory'?0:.5
  return 1
}
export function cableCaption(plan:Plan,link:InstallationLink,channels=false){
  const technical=(plan.viewMode??'technical')==='technical'
  const base=technical&&(link.showLabel??plan.cableLabels)?(link.label||cableStyle(link).label)+(link.lengthMeters?' · '+link.lengthMeters+' m':''):''
  return [base,channels?link.assignedChannel:''].filter(Boolean).join(' · ')
}
function labelLines(text:string,max:number){
  const lines:string[]=[];let line=''
  for(const word of text.split(/\s+/)){if(line&&(line+' '+word).length>max){lines.push(line);line=word}else line+=(line?' ':'')+word}
  if(line)lines.push(line)
  return lines.slice(0,3).map((s,i)=>i===2&&lines.length>3?s.slice(0,max-1)+'…':s.slice(0,max+12))
}
export function SceneObject({node,index,plan,source,interactive,mode,references,providers}:{node:InstallationNode;index:number;plan:Plan;source?:InventoryStockItem;interactive?:boolean;mode:StageViewMode;references?:boolean;providers?:boolean}){
  const g=geometry(node,index),a=node.appearance??{},id=inferIllustration(node,source),definition=objectById(id),asset=plan.assets?.[a.imageId??'']
  const shape=['zone','zone-circle','rectangle','circle','text','note','dimension'].includes(id),zone=id.startsWith('zone'),isText=id==='text',dark=/^#(?:0[0-9a-f]|1[0-9a-f]|2[0-9a-f]|000)/i.test(plan.background??'')
  const label=isText||zone||id==='note'?a.customLabel||node.name:id==='dimension'?(a.customLabel||`${(g.width/metrics(plan).ppm).toLocaleString('fr-FR',{maximumFractionDigits:2})} m`):nodeLabel(node,source,mode,references,providers)
  const size=a.labelSize??(isText?Math.max(12,Math.min(36,g.height*.6)):Math.max(9,Math.min(14,g.width*.19))),lines=labelLines(label,Math.max(14,Math.floor(Math.max(80,g.width)/(size*.55))))
  const angle=g.rotation*Math.PI/180,below=g.cy+(a.labelHorizontal===false?g.height/2:(Math.abs(g.width*Math.sin(angle))+Math.abs(g.height*Math.cos(angle)))/2)+size+4
  return <g data-node={interactive?node.id:undefined} data-illustration={id} opacity={a.opacity??1} style={interactive?{cursor:'inherit'}:undefined}>
    <title>{label||definition?.name||node.name}</title>
    <g transform={`translate(${g.x} ${g.y}) rotate(${g.rotation} ${g.width/2} ${g.height/2})`}>
      {interactive&&<rect width={g.width} height={g.height} fill="transparent" stroke="none"/>}
      {asset?<image href={asset.dataUrl} width={g.width} height={g.height} preserveAspectRatio="xMidYMid meet"/>:
        !isText&&<svg width={g.width} height={g.height} viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible" style={!shape&&mode!=='technical'&&a.shadow!==false?{filter:'drop-shadow(1px 2px 1.5px #1d343329)'}:undefined}>
          <g opacity={zone?.18:1}><SymbolDrawing id={id} color={a.color??node.color}/></g>
          {zone&&<path d={id==='zone-circle'?'M50 2 A48 48 0 1 0 50 98 A48 48 0 1 0 50 2':'M1 1H99V99H1Z'} stroke={a.stroke??a.color??'#618c8b'} fill="none" strokeWidth="1.1" strokeDasharray="3 2"/>}
          {shape&&!zone&&a.stroke&&<path d={id==='circle'?'M50 2 A48 48 0 1 0 50 98 A48 48 0 1 0 50 2':'M1 1H99V99H1Z'} stroke={a.stroke} fill="none" strokeWidth="1.5"/>}
        </svg>}
      {(isText||zone||id==='note')&&a.labelMode!=='none'&&<text x={g.width/2} y={g.height/2-(lines.length-1)*size*.62} textAnchor="middle" dominantBaseline="middle" fill={isText?(a.color??(dark?'#e3ebec':'#294652')):(a.stroke??'#365563')} fontFamily="Arial,sans-serif" fontSize={size} fontWeight={zone?600:500} transform={a.labelHorizontal!==false?`rotate(${-g.rotation} ${g.width/2} ${g.height/2})`:undefined}>{lines.map((line,i)=><tspan key={i} x={g.width/2} dy={i?size*1.25:0}>{line}</tspan>)}</text>}
    </g>
    {label&&!isText&&!zone&&id!=='note'&&<g pointerEvents="none" transform={a.labelHorizontal===false?`rotate(${g.rotation} ${g.cx} ${g.cy})`:undefined}>
      <text x={g.cx} y={below} textAnchor="middle" fill={dark?'#e9eff0':'#294652'} stroke={dark?'#1a242c':'#ffffff'} strokeWidth="3" paintOrder="stroke" strokeLinejoin="round" fontFamily="Arial,sans-serif" fontWeight="500" fontSize={size}>{lines.map((line,i)=><tspan key={i} x={g.cx} dy={i?size*1.22:0}>{line}</tspan>)}</text>
    </g>}
  </g>
}

/** Editor and export render the same SVG scene. View modes never change coordinates. */
export const StageScene=memo(function StageScene({plan,stock,measures,interactive=false,references=false,providers=false,channels=false}:{plan:Plan;stock:InventoryStockItem[];renderIcon:IconRenderer;measures?:boolean;interactive?:boolean;references?:boolean;providers?:boolean;channels?:boolean}){
  const m=metrics(plan),mode=plan.viewMode??'technical',stockMap=new Map(stock.map(s=>[s.id,s])),bg=plan.backgroundImage,background=bg&&plan.assets?.[bg.imageId]
  const render=(node:InstallationNode,index:number)=><SceneObject key={node.id} node={node} index={index} plan={plan} source={stockMap.get(node.stockItemId??'')} interactive={interactive} mode={mode} references={references} providers={providers}/>
  const behind=(n:InstallationNode)=>['zone','zone-circle','riser','podium'].includes(inferIllustration(n,stockMap.get(n.stockItemId??'')))
  return <>
    <rect width={m.width} height={m.height} fill={plan.background??'#f6fafb'}/>
    {background&&<svg width={m.width} height={m.height} overflow="hidden" pointerEvents="none"><image href={background.dataUrl} x={bg.x} y={bg.y} width={bg.width} height={bg.height} opacity={bg.opacity} preserveAspectRatio="none" pointerEvents="none"/></svg>}
    <MetricGrid plan={mode==='client'?{...plan,gridVisible:plan.clientGrid??false}:plan} measures={measures??mode!=='client'}/>
    {plan.nodes.map((n,i)=>behind(n)&&visible(plan,nodeLayer(n))?render(n,i):null)}
    {layers(plan).filter(id=>visible(plan,id)).map(id=><g key={id} data-stage-layer={id}>
      <g data-cables={id} fill="none">
        {plan.links.filter(l=>linkLayer(l)===id).map(link=>{
          const points=linkPoints(plan,link),style=cableStyle(link),d=cablePath(points,link.routeMode),opacity=cableVisibility(plan,link)
          if(!points.length||!opacity)return null
          const middle=points[Math.floor(points.length/2)]
          return <g key={link.id} data-link={interactive?link.id:undefined}>
            <path d={d} stroke={style.color} strokeWidth="3" strokeDasharray={style.dash} strokeOpacity={style.opacity*opacity} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            {interactive&&<path d={d} stroke="transparent" strokeWidth="16" fill="none" pointerEvents="stroke"/>}
            {cableCaption(plan,link,channels)&&<text x={middle.x+7} y={middle.y-8} fill={style.color} stroke="none" fontFamily="Arial, sans-serif" fontSize="12">{cableCaption(plan,link,channels)}</text>}
          </g>
        })}
      </g>
      {plan.nodes.map((node,index)=>nodeLayer(node)===id&&!behind(node)?render(node,index):null)}
    </g>)}
  </>
})

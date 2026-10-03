import type { ReactNode } from 'react'
import type { InstallationNode, InventoryStockItem } from '../types'
import { cablePath,cableStyle,geometry,layers,linkLayer,linkPoints,metrics,nodeLayer,visible,type Plan } from './model'

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

/** All appearance is explicit SVG, shared verbatim by the editor and the exporter. */
export function StageScene({plan,stock,renderIcon,measures=true,interactive=false}:{plan:Plan;stock:InventoryStockItem[];renderIcon:IconRenderer;measures?:boolean;interactive?:boolean}){
  const m=metrics(plan)
  return <>
    <rect width={m.width} height={m.height} fill={plan.background??'#f6fafb'}/>
    <MetricGrid plan={plan} measures={measures}/>
    {layers(plan).filter(id=>visible(plan,id)).map(id=><g key={id} data-stage-layer={id}>
      <g data-cables={id} fill="none">
        {plan.links.filter(l=>linkLayer(l)===id).map(link=>{
          const points=linkPoints(plan,link),style=cableStyle(link),d=cablePath(points,link.routeMode)
          if(!points.length)return null
          const middle=points[Math.floor(points.length/2)]
          return <g key={link.id} data-link={interactive?link.id:undefined}>
            <path d={d} stroke={style.color} strokeWidth="3" strokeDasharray={style.dash} strokeOpacity={style.opacity} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            {interactive&&<path d={d} stroke="transparent" strokeWidth="16" fill="none" pointerEvents="stroke"/>}
            {(link.showLabel??plan.cableLabels)&&<text x={middle.x+7} y={middle.y-8} fill={style.color} stroke="none" fontFamily="Arial, sans-serif" fontSize="12">{link.label||style.label}</text>}
          </g>
        })}
      </g>
      {plan.nodes.map((node,index)=>{
        if(nodeLayer(node)!==id)return null
        const g=geometry(node,index),source=stock.find(s=>s.id===node.stockItemId)
        const text=node.name.length>Math.max(10,Math.floor(g.width/6))?node.name.slice(0,Math.max(10,Math.floor(g.width/6))-1)+'…':node.name
        return <g key={node.id} data-node={interactive?node.id:undefined} transform={`translate(${g.x} ${g.y}) rotate(${g.rotation} ${g.width/2} ${g.height/2})`} style={interactive?{cursor:'inherit'}:undefined}>
          {node.kind==='zone'?<><rect width={g.width} height={g.height} rx="4" fill={node.color??'#0f91a7'} fillOpacity=".08" stroke={node.color??'#0f91a7'} strokeWidth="1.5" strokeDasharray="6 4"/><text x="8" y="20" fill={node.color??'#287488'} fontFamily="Arial, sans-serif" fontSize="14">{text}</text></>:
            node.kind==='text'?<><rect width={g.width} height={g.height} fill="transparent"/><text x="6" y={g.height/2+5} fill={node.color??'#28444f'} fontFamily="Arial, sans-serif" fontSize={Math.max(12,Math.min(28,g.height/2))}>{node.name}</text></>:
            <>
              <rect y="2" width={g.width} height={g.height} rx="7" fill="#133640" fillOpacity=".09"/>
              <rect width={g.width} height={g.height} rx="7" fill="#ffffff" stroke={node.color??'#829da9'} strokeWidth="1.4"/>
              <svg x={g.width*.22} y="6" width={g.width*.56} height={Math.max(8,g.height-32)} viewBox="0 0 32 32" color={node.color??'#28546a'}>{renderIcon(node,source)}</svg>
              <text x={g.width/2} y={g.height-9} textAnchor="middle" fill="#24404c" fontFamily="Arial, sans-serif" fontSize="12" fontWeight="600">{text}</text>
            </>}
        </g>
      })}
    </g>)}
  </>
}

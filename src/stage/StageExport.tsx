import { useEffect,useRef,useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Download,RefreshCw } from 'lucide-react'
import type { InventoryProgram,InventoryStockItem } from '../types'
import { StageDialog } from './TemplateManager'
import { StageScene,type IconRenderer } from './StageScene'
import { cablePath,cableStyle,clone,layers,layerName,linkLayer,linkPoints,metrics,planBounds,visible,type Plan } from './model'

const loadImage=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Impossible de rasteriser le plan.'));img.src=src})
const safeName=(name:string)=>name.replace(/[\\/:*?"<>|]/g,'-').trim().slice(0,100)||'plan-de-scene'
export async function renderStagePng(plan:Plan,stock:InventoryStockItem[],renderIcon:IconRenderer,title:string,options:{layers:string[];grid:boolean;measures:boolean;legend:boolean}){
  const m=metrics(plan),allowed=new Set(options.layers),bounds=planBounds(plan,options.layers),width=bounds.width,height=bounds.height
  const exported={...clone(plan),layers:Object.fromEntries(layers(plan).map(id=>[id,allowed.has(id)])),gridVisible:options.grid}
  const ratio=Math.min(2,8192/Math.max(width,height+180),Math.sqrt(24_000_000/(width*(height+180))))
  const markup=renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`${bounds.x} ${bounds.y} ${width} ${height}`}><rect x={bounds.x} y={bounds.y} width={width} height={height} fill="#dce5e9"/><StageScene plan={exported} stock={stock} renderIcon={renderIcon} measures={options.measures}/></svg>)
  const xml=new DOMParser().parseFromString(markup,'image/svg+xml')
  // Rasterize each cable layer with stroke(Path2D), never fill. This deliberately
  // avoids the SVG/html-to-image fill inheritance that produced black polygons.
  for(const group of Array.from(xml.querySelectorAll('[data-cables]'))){
    const layer=group.getAttribute('data-cables'),canvas=document.createElement('canvas')
    canvas.width=Math.max(1,Math.ceil(width*ratio));canvas.height=Math.max(1,Math.ceil(height*ratio))
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas indisponible.')
    ctx.scale(ratio,ratio);ctx.translate(-bounds.x,-bounds.y);ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round'
    for(const link of exported.links.filter(l=>linkLayer(l)===layer)){
      const points=linkPoints(exported,link);if(!points.length)continue
      const style=cableStyle(link),path=new Path2D(cablePath(points,link.routeMode))
      ctx.strokeStyle=style.color;ctx.globalAlpha=style.opacity;ctx.setLineDash(style.dash?style.dash.split(' ').map(Number):[]);ctx.stroke(path)
      if(link.showLabel??exported.cableLabels){const q=points[Math.floor(points.length/2)];ctx.globalAlpha=1;ctx.fillStyle=style.color;ctx.font='12px Arial';ctx.fillText(link.label||style.label,q.x+7,q.y-8)}
    }
    const img=xml.createElementNS('http://www.w3.org/2000/svg','image')
    img.setAttribute('x',String(bounds.x));img.setAttribute('y',String(bounds.y));img.setAttribute('width',String(width));img.setAttribute('height',String(height));img.setAttribute('href',canvas.toDataURL('image/png'));group.replaceWith(img)
    canvas.width=1;canvas.height=1
  }
  const blob=new Blob([new XMLSerializer().serializeToString(xml.documentElement)],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob)
  try{
    const scene=await loadImage(url),canvas=document.createElement('canvas'),header=64
    const kinds=Array.from(new Set(exported.links.filter(l=>allowed.has(linkLayer(l))).map(l=>l.kind??'unknown')))
    const columns=Math.max(1,Math.floor(width/175)),legendHeight=options.legend?Math.ceil(kinds.length/columns)*28+16:0,footer=38+legendHeight
    canvas.width=Math.max(1,Math.ceil(width*ratio));canvas.height=Math.max(1,Math.ceil((height+header+footer)*ratio))
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas indisponible.')
    ctx.scale(ratio,ratio);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height+header+footer)
    ctx.fillStyle='#254453';ctx.font='bold 16px Arial';let heading='FICHE TECHNIQUE — '+title;while(heading.length>3&&ctx.measureText(heading).width>width-36)heading=heading.slice(0,-2);ctx.fillText(heading.length<('FICHE TECHNIQUE — '+title).length?heading+'…':heading,18,26)
    ctx.fillStyle='#637e89';ctx.font='12px Arial';ctx.fillText(`${m.metersW} × ${m.metersH} m · ${Math.round(m.ppm)} px/m`,18,46)
    ctx.drawImage(scene,0,header,width,height)
    if(options.legend)kinds.forEach((kind,i)=>{const style=cableStyle({id:'',fromNodeId:'',toNodeId:'',kind}),x=18+(i%columns)*175,y=header+height+24+Math.floor(i/columns)*28;ctx.strokeStyle=style.color;ctx.lineWidth=3;ctx.setLineDash(style.dash?style.dash.split(' ').map(Number):[]);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+25,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#294753';ctx.font='12px Arial';ctx.fillText(style.label,x+32,y+4)})
    ctx.fillStyle='#637e89';ctx.font='11px Arial';ctx.fillText('DI’ART · '+new Date().toLocaleDateString('fr-FR'),18,height+header+footer-14)
    const result=canvas.toDataURL('image/png');canvas.width=1;canvas.height=1;return result
  }finally{URL.revokeObjectURL(url)}
}

export function StageExport({plan,stock,program,renderIcon,close}:{plan:Plan;stock:InventoryStockItem[];program:InventoryProgram;renderIcon:IconRenderer;close:()=>void}){
  const order=layers(plan),[chosen,setChosen]=useState(order.filter(id=>visible(plan,id))),[grid,setGrid]=useState(plan.gridVisible!==false),[measures,setMeasures]=useState(true),[legend,setLegend]=useState(true)
  const [mode,setMode]=useState<'combined'|'separate'>('combined'),[context,setContext]=useState(true),[images,setImages]=useState<{name:string;url:string}[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const generation=useRef(0)
  useEffect(()=>{setImages([]);generation.current++},[chosen,grid,measures,legend,mode,context])
  const generate=async()=>{
    const version=++generation.current;setBusy(true);setError('')
    try{
      const groups=mode==='combined'?[{name:'plan',ids:chosen}]:chosen.map(id=>({name:layerName(plan,id),ids:context&&id!=='materials'?[id,'materials']:[id]}))
      const results=[]
      for(const group of groups)results.push({name:group.name,url:await renderStagePng(plan,stock,renderIcon,program.name+(program.date?' · '+program.date:''),{layers:group.ids,grid,measures,legend})})
      if(version===generation.current)setImages(results)
    }catch(e){setError(e instanceof Error?e.message:'Export impossible.')}finally{setBusy(false)}
  }
  return <StageDialog title="Aperçu avant export" close={close} wide><div className="stage-export-layout"><div className="stage-export-options"><b>Calques à exporter</b><button onClick={()=>setChosen(order)}>Tous les calques</button><button onClick={()=>setChosen(order.filter(id=>visible(plan,id)))}>Calques visibles</button>{order.map(id=><label className="stage-check" key={id}><input type="checkbox" checked={chosen.includes(id)} onChange={e=>setChosen(e.target.checked?[...chosen,id]:chosen.filter(l=>l!==id))}/>{layerName(plan,id)}</label>)}<hr/>
    <label className="stage-check"><input type="checkbox" checked={grid} onChange={e=>setGrid(e.target.checked)}/>Grille</label><label className="stage-check"><input type="checkbox" checked={measures} onChange={e=>setMeasures(e.target.checked)}/>Mesures et repère 1 m</label><label className="stage-check"><input type="checkbox" checked={legend} onChange={e=>setLegend(e.target.checked)}/>Légende des câbles</label>
    <select aria-label="Mode d’export" value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="combined">Calques combinés</option><option value="separate">Une image par calque</option></select>{mode==='separate'&&<label className="stage-check"><input type="checkbox" checked={context} onChange={e=>setContext(e.target.checked)}/>Garder le matériel en contexte</label>}
    <button className="primary" disabled={busy||!chosen.length} onClick={()=>void generate()}><RefreshCw/>{busy?'Préparation…':'Générer l’aperçu'}</button>{error&&<p role="alert" className="stage-error">{error}</p>}
    </div><div className="stage-export-preview">{images.length?images.map(img=><figure key={img.name}><img src={img.url} alt={'Aperçu final — '+img.name}/><figcaption><span>{img.name}</span><a className="stage-download" href={img.url} download={safeName(program.name)+'-'+safeName(img.name)+'.png'}><Download size={16}/>Télécharger PNG</a></figcaption></figure>):<div className="stage-preview-placeholder">Choisissez les options et générez l’aperçu.<small>Le fichier téléchargé sera exactement cette image.</small></div>}</div></div></StageDialog>
}

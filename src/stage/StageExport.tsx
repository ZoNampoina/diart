import { useEffect,useRef,useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Download,RefreshCw,Upload } from 'lucide-react'
import type { InventoryProgram,InventoryStockItem,StagePresentation,StageViewMode } from '../types'
import { StageDialog } from './TemplateManager'
import { StageScene,cableVisibility,cableCaption,type IconRenderer } from './StageScene'
import { SymbolDrawing } from './StageSymbols'
import { inferIllustration,nodeLabel,objectById } from './catalog'
import { importIllustration,loadImage } from './assets'
import { stagePngToPdf } from './pdf'
import { cablePath,cableStyle,clone,layers,layerName,linkLayer,linkPoints,metrics,nodeLayer,planBounds,visible,type Plan } from './model'

const safeName=(name:string)=>name.replace(/[\\/:*?"<>|]/g,'-').trim().slice(0,100)||'plan-de-scene'
export type ExportOptions={layers:string[];grid:boolean;measures:boolean;legend:boolean;viewMode?:StageViewMode;cables?:boolean;references?:boolean;providers?:boolean;channels?:boolean;sheet?:boolean;presentation?:StagePresentation}
function textFit(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,width:number){
  let result=text
  while(result.length&&ctx.measureText(result).width>width)result=result.slice(0,-1)
  ctx.fillText(result===text?result:result.slice(0,-1)+'…',x,y)
}
export async function renderStagePng(plan:Plan,stock:InventoryStockItem[],renderIcon:IconRenderer,title:string,options:ExportOptions){
  const m=metrics(plan),allowed=new Set(options.layers),mode=options.viewMode??plan.viewMode??'technical'
  const exported:Plan={...clone(plan),viewMode:mode,layers:Object.fromEntries(layers(plan).map(id=>[id,allowed.has(id)])),gridVisible:options.grid,clientGrid:options.grid,
    clientCables:options.cables===false?'hidden':mode==='client'?options.cables?'visible':plan.clientCables??'hidden':plan.clientCables}
  if(options.cables===false)exported.links=[]
  const bounds=planBounds(exported,options.layers),width=bounds.width,height=bounds.height
  const ratio=Math.min(4,8192/Math.max(width,height),Math.sqrt(24_000_000/(width*height)))
  const markup=renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`${bounds.x} ${bounds.y} ${width} ${height}`}><rect x={bounds.x} y={bounds.y} width={width} height={height} fill={plan.background??'#f6fafb'}/><StageScene plan={exported} stock={stock} renderIcon={renderIcon} measures={options.measures} references={options.references} providers={options.providers} channels={options.channels}/></svg>)
  const xml=new DOMParser().parseFromString(markup,'image/svg+xml')
  // Stroke rasterization avoids fill inheritance and keeps paths identical in every export.
  for(const group of Array.from(xml.querySelectorAll('[data-cables]'))){
    if(!group.childElementCount){group.remove();continue}
    const layer=group.getAttribute('data-cables'),canvas=document.createElement('canvas')
    canvas.width=Math.max(1,Math.ceil(width*ratio));canvas.height=Math.max(1,Math.ceil(height*ratio))
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas indisponible.')
    ctx.scale(ratio,ratio);ctx.translate(-bounds.x,-bounds.y);ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round'
    for(const link of exported.links.filter(l=>linkLayer(l)===layer)){
      const points=linkPoints(exported,link),opacity=cableVisibility(exported,link);if(!points.length||!opacity)continue
      const style=cableStyle(link),path=new Path2D(cablePath(points,link.routeMode))
      ctx.strokeStyle=style.color;ctx.globalAlpha=style.opacity*opacity;ctx.setLineDash(style.dash?style.dash.split(' ').map(Number):[]);ctx.stroke(path)
      const caption=cableCaption(exported,link,options.channels)
      if(caption){
        const q=points[Math.floor(points.length/2)];ctx.globalAlpha=1;ctx.fillStyle=style.color;ctx.font='12px Arial'
        ctx.fillText(caption,q.x+7,q.y-8)
      }
    }
    const img=xml.createElementNS('http://www.w3.org/2000/svg','image')
    img.setAttribute('x',String(bounds.x));img.setAttribute('y',String(bounds.y));img.setAttribute('width',String(width));img.setAttribute('height',String(height));img.setAttribute('href',canvas.toDataURL('image/png'));group.replaceWith(img)
    canvas.width=1;canvas.height=1
  }
  // Pixel dimensions are explicit so the intermediate SVG also decodes at HD resolution.
  xml.documentElement.setAttribute('width',String(Math.ceil(width*ratio)));xml.documentElement.setAttribute('height',String(Math.ceil(height*ratio)))
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(xml.documentElement)],{type:'image/svg+xml;charset=utf-8'}))
  try{
    const scene=await loadImage(url),canvas=document.createElement('canvas')
    if(options.sheet===false){canvas.width=scene.naturalWidth;canvas.height=scene.naturalHeight;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas indisponible.');ctx.drawImage(scene,0,0);const result=canvas.toDataURL('image/png');canvas.width=1;canvas.height=1;return result}
    const W=1600,H=1132,pad=64,meta=options.presentation??plan.presentation??{}
    canvas.width=W*2;canvas.height=H*2
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas indisponible.')
    ctx.scale(2,2);ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H)
    ctx.fillStyle='#426e75';ctx.fillRect(pad,39,36,4);ctx.font='600 13px Arial';textFit(ctx,(meta.title||(mode==='client'?'PRÉSENTATION DE SCÈNE':mode==='hybrid'?'PLAN D’IMPLANTATION':'FICHE TECHNIQUE')).toLocaleUpperCase('fr'),pad+48,46,1180)
    ctx.fillStyle='#203e49';ctx.font='bold 34px Arial';textFit(ctx,title,pad,91,1240)
    const metadata=[['CLIENT',meta.client||''],['DATE',meta.date||''],['LIEU',meta.location||'']].filter(([,v])=>v)
    metadata.forEach(([label,value],i)=>{const x=pad+i*380;ctx.fillStyle='#819293';ctx.font='11px Arial';ctx.fillText(label,x,128);ctx.fillStyle='#41565e';ctx.font='15px Arial';textFit(ctx,value,x,151,350)})
    const logo=plan.assets?.[meta.logoId??'']
    if(logo){const image=await loadImage(logo.dataUrl),scale=Math.min(150/image.width,100/image.height);ctx.drawImage(image,W-pad-image.width*scale,43,image.width*scale,image.height*scale)}
    ctx.strokeStyle='#d9e1df';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad,171);ctx.lineTo(W-pad,171);ctx.stroke()
    const box={x:pad,y:194,width:W-pad*2,height:options.legend?720:814},scale=Math.min(box.width/width,box.height/height),drawW=width*scale,drawH=height*scale
    ctx.fillStyle='#f5f7f4';ctx.fillRect(box.x,box.y,box.width,box.height)
    ctx.drawImage(scene,box.x+(box.width-drawW)/2,box.y+(box.height-drawH)/2,drawW,drawH)
    ctx.fillStyle='#5f767b';ctx.font='12px Arial';ctx.fillText(`SCÈNE  ${m.metersW} × ${m.metersH} m  ·  Vue du dessus`,pad,box.y+box.height+25)
    ctx.textAlign='right';ctx.fillText(mode==='client'?'Implantation indicative':mode==='hybrid'?'Vue hybride':'Vue technique',W-pad,box.y+box.height+25);ctx.textAlign='left'
    if(options.legend){
      const unique=new Map<string,{id:string;name:string;color?:string;image?:string}>()
      for(const n of exported.nodes){if(!allowed.has(nodeLayer(n))||n.kind==='zone'||n.kind==='text'||n.kind==='shape')continue;const source=stock.find(s=>s.id===n.stockItemId),id=inferIllustration(n,source),key=id+':'+(n.appearance?.imageId??'');if(!unique.has(key))unique.set(key,{id,name:nodeLabel(n,source,'client',options.references,options.providers)||n.appearance?.shortLabel||objectById(id)?.name||'Illustration',color:n.appearance?.color,image:plan.assets?.[n.appearance?.imageId??'']?.dataUrl})}
      const entries=[...unique.values()].slice(0,14)
      const thumbs=await Promise.all(entries.map(async item=>({item,image:await loadImage(item.image??'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 100 100"><SymbolDrawing id={item.id} color={item.color}/></svg>)))})))
      thumbs.forEach(({item,image},i)=>{const x=pad+(i%7)*211,y=966+Math.floor(i/7)*40;ctx.drawImage(image,x,y-15,28,28);ctx.fillStyle='#445d64';ctx.font='12px Arial';textFit(ctx,item.name,x+36,y+3,164)})
    }
    ctx.strokeStyle='#d9e1df';ctx.beginPath();ctx.moveTo(pad,H-62);ctx.lineTo(W-pad,H-62);ctx.stroke()
    ctx.fillStyle='#6f8588';ctx.font='11px Arial';ctx.fillText('DI’ART  /  PLAN DE SCÈNE',pad,H-34)
    ctx.textAlign='right';textFit(ctx,`Version ${meta.version||plan.versionName||'1'} · ${new Date().toLocaleDateString('fr-FR')}`,W-pad,H-34,500)
    const result=canvas.toDataURL('image/png');canvas.width=1;canvas.height=1;return result
  }finally{URL.revokeObjectURL(url)}
}

type Preview={name:string;url:string;pdf:string}
export function StageExport({plan,stock,program,renderIcon,close,client=false,commit}:{plan:Plan;stock:InventoryStockItem[];program:InventoryProgram;renderIcon:IconRenderer;close:()=>void;client?:boolean;commit?:(p:Plan)=>void}){
  const order=layers(plan),[chosen,setChosen]=useState(order.filter(id=>visible(plan,id))),[grid,setGrid]=useState(client?false:plan.gridVisible!==false),[measures,setMeasures]=useState(!client),[legend,setLegend]=useState(true)
  const [viewMode,setViewMode]=useState<StageViewMode>(client?'client':plan.viewMode??'technical'),[sheet,setSheet]=useState(true),[cables,setCables]=useState(!client),[references,setReferences]=useState(!client),[providers,setProviders]=useState(false),[channels,setChannels]=useState(false)
  const [meta,setMeta]=useState<StagePresentation>({title:client?'Présentation de scène':'Plan de scène',client:'',date:program.date,location:program.location,version:plan.versionName||'1',...plan.presentation}),[assets,setAssets]=useState(plan.assets)
  const [mode,setMode]=useState<'combined'|'separate'>('combined'),[context,setContext]=useState(true),[images,setImages]=useState<Preview[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const generation=useRef(0),file=useRef<HTMLInputElement>(null)
  useEffect(()=>{setImages([]);generation.current++},[chosen,grid,measures,legend,mode,context,viewMode,sheet,cables,references,providers,channels,meta,assets])
  useEffect(()=>()=>{images.forEach(img=>URL.revokeObjectURL(img.pdf))},[images])
  useEffect(()=>()=>{generation.current++},[])
  const generate=async()=>{
    const version=++generation.current;setBusy(true);setError('');const results:Preview[]=[]
    try{
      const groups=mode==='combined'?[{name:viewMode==='client'?'presentation-client':'plan',ids:chosen}]:chosen.map(id=>({name:layerName(plan,id),ids:context&&id!=='materials'?[id,'materials','scenery']:[id]}))
      const complete={...plan,assets,presentation:meta};commit?.(complete)
      for(const group of groups){const png=await renderStagePng(complete,stock,renderIcon,program.name,{layers:group.ids,grid,measures,legend,viewMode,cables,references,providers,channels,sheet,presentation:meta});const pdf=URL.createObjectURL(await stagePngToPdf(png));results.push({name:group.name,url:png,pdf})}
      if(version===generation.current)setImages(results);else results.forEach(img=>URL.revokeObjectURL(img.pdf))
    }catch(e){results.forEach(img=>URL.revokeObjectURL(img.pdf));setError(e instanceof Error?e.message:'Export impossible.')}finally{setBusy(false)}
  }
  const check=(label:string,value:boolean,set:(v:boolean)=>void)=><label className="stage-check"><input type="checkbox" checked={value} onChange={e=>set(e.target.checked)}/>{label}</label>
  return <StageDialog title={client?'Aperçu client':'Aperçu avant export'} close={close} wide><div className="stage-export-layout"><div className="stage-export-options">
    <label className="stage-field"><span>Présentation</span><select aria-label="Vue exportée" value={viewMode} onChange={e=>{const v=e.target.value as StageViewMode;setViewMode(v);if(v==='client'){setCables(false);setGrid(false);setMeasures(false);setReferences(false);setProviders(false);setChannels(false)}}}><option value="technical">Technique</option><option value="hybrid">Hybride</option><option value="client">Présentation client</option></select></label>
    <select aria-label="Composition de l’export" value={sheet?'sheet':'plan'} onChange={e=>setSheet(e.target.value==='sheet')}><option value="sheet">Fiche présentation</option><option value="plan">Plan uniquement</option></select>
    {sheet&&<details open><summary>Cartouche & logo</summary>{([['title','Titre'],['client','Client'],['date','Date'],['location','Lieu'],['version','Version']] as const).map(([key,label])=><label className="stage-field" key={key}><span>{label}</span><input aria-label={'Export · '+label} value={meta[key]??''} onChange={e=>setMeta({...meta,[key]:e.target.value})}/></label>)}
      <input ref={file} hidden type="file" accept=".svg,.png,.webp,.jpg,.jpeg" onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;setError('');try{const asset=await importIllustration(f);setAssets({...assets,[asset.id]:asset});setMeta({...meta,logoId:asset.id})}catch(e){setError(e instanceof Error?e.message:'Logo illisible.')}}}/>
      <button className="stage-wide-button" onClick={()=>file.current?.click()}><Upload/>Importer un logo</button>{assets?.[meta.logoId??'']&&<><img className="stage-logo-preview" src={assets[meta.logoId!].dataUrl} alt="Logo de la présentation"/><button className="stage-text-button" onClick={()=>setMeta({...meta,logoId:undefined})}>Retirer le logo</button></>}
    </details>}
    <b>Éléments visibles</b>{check('Câbles',cables,setCables)}{check('Grille',grid,setGrid)}{check('Mesures et repère 1 m',measures,setMeasures)}{check('Légende visuelle',legend,setLegend)}{check('Références techniques',references,setReferences)}{check('Noms prestataires',providers,setProviders)}{check('Numéros de canaux',channels,setChannels)}
    <details><summary>Calques à exporter</summary><button className="stage-wide-button" onClick={()=>setChosen(order)}>Tous les calques</button><button className="stage-wide-button" onClick={()=>setChosen(order.filter(id=>visible(plan,id)))}>Calques visibles</button>{order.map(id=><label className="stage-check" key={id}><input type="checkbox" checked={chosen.includes(id)} onChange={e=>setChosen(e.target.checked?[...chosen,id]:chosen.filter(l=>l!==id))}/>{layerName(plan,id)}</label>)}</details>
    <select aria-label="Mode d’export" value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="combined">Calques combinés</option><option value="separate">Une image par calque</option></select>{mode==='separate'&&check('Garder le matériel en contexte',context,setContext)}
    <button className="primary" disabled={busy||!chosen.length} onClick={()=>void generate()}><RefreshCw/>{busy?'Préparation…':'Générer l’aperçu'}</button>{error&&<p role="alert" className="stage-error">{error}</p>}
    </div><div className="stage-export-preview">{images.length?images.map(img=><figure key={img.name}><img src={img.url} alt={'Aperçu final — '+img.name}/><figcaption><span>{img.name}</span><div className="stage-export-formats"><a className="stage-download" href={img.url} download={safeName(program.name)+'-'+safeName(img.name)+'.png'}><Download size={16}/>Télécharger PNG</a><a className="stage-download" href={img.pdf} download={safeName(program.name)+'-'+safeName(img.name)+'.pdf'}><Download size={16}/>Télécharger PDF</a></div></figcaption></figure>):<div className="stage-preview-placeholder">Préparez votre présentation.<small>Générez l’aperçu pour vérifier la composition. Le PNG et le PDF contiendront exactement cette image.</small></div>}</div></div></StageDialog>
}

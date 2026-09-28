import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle, Archive, Boxes, CalendarDays, Check, ChevronDown, ChevronRight, ChevronUp,
  ClipboardCheck, Eye, History, ImageDown, LayoutGrid, Minus, PackageCheck, PackagePlus,
  PackageSearch, Plus, Repeat2, Save, Trash2, Wrench, X
} from 'lucide-react'
import { db, logActivity } from './db'
import type {
  ActivityEntry, InventoryCategory, InventoryFrequency, InventoryKit, InventoryMaterial,
  InventoryProgram, InventoryStockItem, InventoryStockStatus
} from './types'

const CATEGORY_ORDER: InventoryCategory[] = ['cable','prise','instrument','adaptateur']
const CATEGORY_LABELS: Record<InventoryCategory,string> = {
  cable:'Câbles',
  prise:'Prises / alimentations',
  instrument:'Instruments',
  adaptateur:'Adaptateurs'
}
const WEEKDAYS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi']
const DEFAULT_PROVIDER = 'Mon stock'
const INVENTORY_KITS_KEY = 'inventoryKitsV1'
const STOCK_STATUS_LABELS:Record<InventoryStockStatus,string>={
  available:'Disponible',
  reserved:'Réservé',
  in_use:'En utilisation',
  repair:'En panne',
  maintenance:'Maintenance',
  unavailable:'Indisponible'
}
const BLOCKING_STOCK_STATUSES:InventoryStockStatus[]=['reserved','in_use','repair','maintenance','unavailable']

const DEFAULT_CATALOG: Record<InventoryCategory,string[]> = {
  cable:[
    'XLR-XLR','XLR(M) - JACK','XLR(F) - JACK','JACK-JACK','minijack-JACK',
    'Speakon-Speakon','USB-A - USB-B','USB-C - USB-C','Ethernet RJ45'
  ],
  prise:[
    'Alimentation','Prise multiple','Alim PC','Alim Clavier','Chargeur téléphone',
    'Rallonge électrique','Adaptateur secteur universel','Câble IEC'
  ],
  instrument:[
    'Piano','Guitare','Basse','Batterie','Pad','Micro','Saxophone','Clavier maître','Cajón'
  ],
  adaptateur:[
    'minijack to JACK','RCA to JACK','RCA to minijack','JACK to minijack',
    'RCA to RCA','Multi-JACK','Multi-minijack','XLR to JACK','USB-C to USB-A','USB-C to minijack'
  ]
}

const now = () => new Date().toISOString()
const clampQuantity = (value:number) => Math.max(0,Math.min(999,Math.floor(Number.isFinite(value)?value:0)))

function normalizeProvider(value:unknown):string{
  const provider=String(value??'').trim()
  return provider||DEFAULT_PROVIDER
}

function normalizeStockItem(item:InventoryStockItem):InventoryStockItem{
  return {
    ...item,
    category:normalizeCategory(item.category,item.name),
    provider:normalizeProvider(item.provider),
    status:item.status??'available'
  }
}

function normalizeCategory(value:unknown,name=''):InventoryCategory{
  if(value==='cable'||value==='prise'||value==='instrument'||value==='adaptateur')return value
  const key=name.trim().toLowerCase()
  if(/xlr|jack|speakon|usb|ethernet|câble|cable/.test(key))return 'cable'
  if(/alim|prise|chargeur|rallonge|iec|secteur/.test(key))return 'prise'
  if(/piano|guitare|basse|batterie|pad|micro|saxo|clavier|caj/.test(key))return 'instrument'
  return 'adaptateur'
}

function normalizeProgram(program:InventoryProgram):InventoryProgram{
  return {
    ...program,
    startTime:program.startTime??'',
    endTime:program.endTime??'',
    frequency:program.frequency??'once',
    weekday:program.weekday??(program.date?new Date(program.date+'T00:00:00').getDay():null),
    items:(program.items??[]).map(item=>({
      ...item,
      category:normalizeCategory(item.category,item.name),
      loaded:item.loaded??false,
      returned:item.returned??false
    }))
  }
}

function statusBlocksAvailability(status:InventoryStockStatus|undefined):boolean{
  return BLOCKING_STOCK_STATUSES.includes(status??'available')
}

function timeMinutes(value:string|undefined,fallback:number):number{
  if(!value||!/^(\d{2}):(\d{2})$/.test(value))return fallback
  const [h,m]=value.split(':').map(Number)
  return h*60+m
}

function timeRangesOverlap(a:InventoryProgram,b:InventoryProgram):boolean{
  const aStart=timeMinutes(a.startTime,0)
  const aEnd=timeMinutes(a.endTime,24*60)
  const bStart=timeMinutes(b.startTime,0)
  const bEnd=timeMinutes(b.endTime,24*60)
  return aStart<(bEnd||24*60)&&bStart<(aEnd||24*60)
}

function programOccursOnDate(program:InventoryProgram,dateKey:string):boolean{
  const frequency=program.frequency??'once'
  if(frequency==='once')return Boolean(program.date)&&program.date===dateKey
  const date=new Date(dateKey+'T00:00:00')
  if(Number.isNaN(date.getTime()))return false
  if(program.date&&dateKey<program.date)return false
  if(frequency==='weekly'){
    const weekday=program.weekday??(program.date?new Date(program.date+'T00:00:00').getDay():null)
    return weekday!==null&&weekday!==undefined&&date.getDay()===weekday
  }
  if(frequency==='monthly'){
    const day=program.date?new Date(program.date+'T00:00:00').getDate():1
    return date.getDate()===day
  }
  return false
}

function dateKey(date:Date):string{
  const y=date.getFullYear()
  const m=String(date.getMonth()+1).padStart(2,'0')
  const d=String(date.getDate()).padStart(2,'0')
  return y+'-'+m+'-'+d
}

function programsOverlap(a:InventoryProgram,b:InventoryProgram):boolean{
  if(a.id===b.id||a.deletedAt||b.deletedAt||!timeRangesOverlap(a,b))return false
  const fa=a.frequency??'once',fb=b.frequency??'once'
  if(fa==='once'&&fb==='once')return Boolean(a.date&&b.date&&a.date===b.date)
  if(fa==='once')return Boolean(a.date&&programOccursOnDate(b,a.date))
  if(fb==='once')return Boolean(b.date&&programOccursOnDate(a,b.date))
  const today=new Date();today.setHours(0,0,0,0)
  const starts=[a.date,b.date].filter(Boolean).sort()
  const start=starts.length?new Date((starts[starts.length-1] as string)+'T00:00:00'):today
  if(start<today)start.setTime(today.getTime())
  for(let i=0;i<370;i++){
    const d=new Date(start);d.setDate(start.getDate()+i)
    const key=dateKey(d)
    if(programOccursOnDate(a,key)&&programOccursOnDate(b,key))return true
  }
  return false
}

function programsHaveStockShortage(a:InventoryProgram,b:InventoryProgram,stock:InventoryStockItem[]):boolean{
  if(!programsOverlap(a,b))return false
  for(const item of a.items.filter(value=>value.quantity>0&&value.stockItemId)){
    const source=stock.find(value=>value.id===item.stockItemId)
    if(!source)continue
    const otherQuantity=b.items.filter(value=>value.stockItemId===item.stockItemId).reduce((sum,value)=>sum+value.quantity,0)
    if(otherQuantity<=0)continue
    if(statusBlocksAvailability(source.status)||item.quantity+otherQuantity>source.quantity)return true
  }
  return false
}

function conflictingReservation(stockItemId:string,current:InventoryProgram,programs:InventoryProgram[]):{quantity:number;programs:InventoryProgram[]}{
  const conflicts=programs.filter(other=>programsOverlap(current,other)&&other.items.some(item=>item.stockItemId===stockItemId&&item.quantity>0))
  return {
    quantity:conflicts.reduce((sum,other)=>sum+other.items.filter(item=>item.stockItemId===stockItemId).reduce((n,item)=>n+item.quantity,0),0),
    programs:conflicts
  }
}

function effectiveStockQuantity(stockItem:InventoryStockItem,current:InventoryProgram,programs:InventoryProgram[]):number{
  if(statusBlocksAvailability(stockItem.status))return 0
  const reserved=conflictingReservation(stockItem.id,current,programs).quantity
  return Math.max(0,stockItem.quantity-reserved)
}

async function loadInventoryKits():Promise<InventoryKit[]>{
  const row=await db.settings.get(INVENTORY_KITS_KEY)
  if(!row?.value)return []
  try{
    const parsed=JSON.parse(row.value) as InventoryKit[]
    return Array.isArray(parsed)?parsed:[]
  }catch{return []}
}

async function saveInventoryKits(kits:InventoryKit[]):Promise<void>{
  await db.settings.put({key:INVENTORY_KITS_KEY,value:JSON.stringify(kits)})
}

function stableCatalogUuid(category:InventoryCategory,name:string):string{
  const source=category+':'+name.toLowerCase()
  const seeds=[2166136261,2246822519,3266489917,668265263]
  const chunks=seeds.map(seed=>{
    let h=seed>>>0
    for(let i=0;i<source.length;i++){
      h^=source.charCodeAt(i)
      h=Math.imul(h,16777619)>>>0
      h^=h>>>13
    }
    return h.toString(16).padStart(8,'0')
  }).join('')
  return chunks.slice(0,8)+'-'+chunks.slice(8,12)+'-4'+chunks.slice(13,16)+'-a'+chunks.slice(17,20)+'-'+chunks.slice(20,32)
}

function catalogMaterials(quantity=0):InventoryMaterial[]{
  return CATEGORY_ORDER.flatMap(category=>DEFAULT_CATALOG[category].map(name=>({
    id:crypto.randomUUID(),name,quantity,category
  })))
}

async function ensureStockSeed():Promise<void>{
  const seeded=await db.settings.get('inventoryStockSeedV1')
  if(seeded)return
  const stamp=now()
  const existing=await db.inventoryStock.toArray()
  const existingNames=new Set(existing.map(item=>normalizeProvider(item.provider)+'|'+normalizeCategory(item.category,item.name)+':'+item.name.trim().toLowerCase()))
  const rows:InventoryStockItem[]=[]
  for(const category of CATEGORY_ORDER){
    for(const name of DEFAULT_CATALOG[category]){
      const key=DEFAULT_PROVIDER+'|'+category+':'+name.toLowerCase()
      if(existingNames.has(key))continue
      rows.push({
        id:stableCatalogUuid(category,name),
        name,category,quantity:0,provider:DEFAULT_PROVIDER,status:'available',notes:'',
        createdAt:stamp,updatedAt:'1970-01-01T00:00:00.000Z',deletedAt:null
      })
    }
  }
  if(rows.length)await db.inventoryStock.bulkPut(rows)
  await db.settings.put({key:'inventoryStockSeedV1',value:'1'})
}

async function createProgram(name:string):Promise<InventoryProgram>{
  const stamp=now()
  const program:InventoryProgram={
    id:crypto.randomUUID(),
    name:name.trim()||'Nouvel événement',
    date:'',
    startTime:'',
    endTime:'',
    frequency:'once',
    weekday:null,
    location:'',
    notes:'',
    items:catalogMaterials(0),
    createdAt:stamp,
    updatedAt:stamp,
    deletedAt:null
  }
  await db.programs.add(program)
  return program
}

function recurrenceText(program:InventoryProgram):string{
  const frequency=program.frequency??'once'
  if(frequency==='weekly'){
    const day=program.weekday??(program.date?new Date(program.date+'T00:00:00').getDay():null)
    return day===null?'Chaque semaine':'Tous les '+WEEKDAYS[day]+'s'
  }
  if(frequency==='monthly'){
    if(program.date){
      const d=new Date(program.date+'T00:00:00').getDate()
      return 'Tous les mois · le '+d
    }
    return 'Tous les mois'
  }
  return program.date?'Événement ponctuel':'Une fois'
}

function sanitizeFilename(value:string):string{
  return value.trim().replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').slice(0,80)||'fiche-technique'
}

function wrapCanvasText(ctx:CanvasRenderingContext2D,text:string,maxWidth:number):string[]{
  const words=text.trim().split(/\s+/).filter(Boolean)
  const lines:string[]=[]
  let line=''
  for(const word of words){
    const next=line?line+' '+word:word
    if(ctx.measureText(next).width<=maxWidth||!line)line=next
    else{lines.push(line);line=word}
  }
  if(line)lines.push(line)
  return lines
}

export async function exportTechnicalSheetImage(program:InventoryProgram,stock:InventoryStockItem[]):Promise<void>{
  const normalized=normalizeProgram(program)
  const selected=normalized.items.filter(item=>item.quantity>0)
  const grouped=CATEGORY_ORDER.map(category=>({
    category,
    rows:selected.filter(item=>item.category===category)
  })).filter(group=>group.rows.length)
  const rowCount=Math.max(1,selected.length)
  const categoryCount=Math.max(1,grouped.length)
  const width=1600
  const rowHeight=76
  const notesLinesEstimate=normalized.notes.trim()?Math.max(2,Math.ceil(normalized.notes.length/70)):0
  const height=Math.max(1120,650+rowCount*rowHeight+categoryCount*62+notesLinesEstimate*42+170)
  const canvas=document.createElement('canvas')
  canvas.width=width;canvas.height=height
  const ctx=canvas.getContext('2d')
  if(!ctx)throw new Error('Export image indisponible sur cet appareil.')

  ctx.fillStyle='#f8fbfb';ctx.fillRect(0,0,width,height)
  ctx.fillStyle='#0f2f33';ctx.fillRect(0,0,width,24)

  const left=120,right=width-120
  let y=100
  ctx.fillStyle='#0f2f33';ctx.font='700 32px system-ui, -apple-system, Segoe UI, sans-serif'
  ctx.fillText("DI'ART by ARIZONA",left,y)
  ctx.fillStyle='#558087';ctx.font='700 20px system-ui, -apple-system, Segoe UI, sans-serif';ctx.textAlign='right'
  ctx.fillText('FICHE TECHNIQUE · INVENTAIRE',right,y);ctx.textAlign='left'

  y+=86
  ctx.fillStyle='#0b2024';ctx.font='800 58px system-ui, -apple-system, Segoe UI, sans-serif'
  const titleLines=wrapCanvasText(ctx,normalized.name||'Événement',right-left)
  for(const line of titleLines.slice(0,2)){ctx.fillText(line,left,y);y+=68}

  const meta=[
    normalized.date?new Date(normalized.date+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'}):'',
    normalized.startTime?(normalized.startTime+(normalized.endTime?'–'+normalized.endTime:'')):'',
    recurrenceText(normalized),
    normalized.location.trim()
  ].filter(Boolean).join('  ·  ')
  ctx.fillStyle='#58757a';ctx.font='500 25px system-ui, -apple-system, Segoe UI, sans-serif'
  const metaLines=wrapCanvasText(ctx,meta,right-left)
  for(const line of metaLines){ctx.fillText(line,left,y);y+=34}
  y+=32

  if(!selected.length){
    ctx.fillStyle='#e5eeee';ctx.fillRect(left,y,right-left,86)
    ctx.fillStyle='#58757a';ctx.font='600 26px system-ui, -apple-system, Segoe UI, sans-serif'
    ctx.fillText('Aucun matériel renseigné',left+26,y+54);y+=86
  }else{
    for(const group of grouped){
      y+=18
      ctx.fillStyle='#dce9eb';ctx.fillRect(left,y,right-left,52)
      ctx.fillStyle='#0f2f33';ctx.font='800 22px system-ui, -apple-system, Segoe UI, sans-serif'
      ctx.fillText(CATEGORY_LABELS[group.category].toUpperCase(),left+24,y+34)
      ctx.textAlign='right';ctx.fillText('QTÉ',right-24,y+34);ctx.textAlign='left';y+=52

      group.rows.forEach((item,index)=>{
        ctx.fillStyle=index%2?'#f1f6f6':'#ffffff';ctx.fillRect(left,y,right-left,rowHeight)
        const stockItem=item.stockItemId?stock.find(s=>s.id===item.stockItemId&&!s.deletedAt):undefined
        ctx.fillStyle='#17383d';ctx.font='650 27px system-ui, -apple-system, Segoe UI, sans-serif'
        ctx.fillText(item.name,left+24,y+48)
        if(stockItem){
          ctx.fillStyle=item.quantity>stockItem.quantity?'#b34d45':'#5f7c80'
          ctx.font='600 18px system-ui, -apple-system, Segoe UI, sans-serif'
          ctx.fillText(normalizeProvider(stockItem.provider)+' · Stock '+stockItem.quantity,left+720,y+47)
        }
        ctx.fillStyle='#0f6f78';ctx.font='800 30px system-ui, -apple-system, Segoe UI, sans-serif';ctx.textAlign='right'
        ctx.fillText(String(item.quantity),right-30,y+50);ctx.textAlign='left'
        ctx.strokeStyle='#d8e5e7';ctx.beginPath();ctx.moveTo(left,y+rowHeight);ctx.lineTo(right,y+rowHeight);ctx.stroke()
        y+=rowHeight
      })
    }
  }

  if(normalized.notes.trim()){
    y+=50;ctx.fillStyle='#0f2f33';ctx.font='800 24px system-ui, -apple-system, Segoe UI, sans-serif';ctx.fillText('NOTES',left,y);y+=40
    ctx.fillStyle='#4d6f74';ctx.font='500 23px system-ui, -apple-system, Segoe UI, sans-serif'
    for(const line of wrapCanvasText(ctx,normalized.notes,right-left)){ctx.fillText(line,left,y);y+=37}
  }

  ctx.fillStyle='#789096';ctx.font='500 18px system-ui, -apple-system, Segoe UI, sans-serif'
  ctx.fillText('Généré avec DI’ART · '+new Date().toLocaleDateString('fr-FR'),left,height-70)

  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Création de l’image impossible.')),'image/png',1))
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a');a.href=url;a.download=sanitizeFilename(normalized.name)+'-fiche-technique.png';a.click()
  setTimeout(()=>URL.revokeObjectURL(url),0)
}

function CategorySection({category,open,onToggle,children,count}:{category:InventoryCategory;open:boolean;onToggle:()=>void;children:ReactNode;count:number}){
  return <section className="inventory-category">
    <button type="button" className="inventory-category-head" onClick={onToggle}>
      <span><b>{CATEGORY_LABELS[category]}</b><small>{count} élément{count>1?'s':''}</small></span>
      {open?<ChevronUp/>:<ChevronDown/>}
    </button>
    {open&&<div className="inventory-category-body">{children}</div>}
  </section>
}

export function InventoryPage({onOpen,onChanged,toast}:{onOpen:(id:string)=>void;onChanged:()=>void;toast:(text:string)=>void}){
  const [programs,setPrograms]=useState<InventoryProgram[]>([])
  const [stock,setStock]=useState<InventoryStockItem[]>([])
  const [history,setHistory]=useState<ActivityEntry[]>([])
  const [tab,setTab]=useState<'programs'|'stock'>('programs')
  const [stockView,setStockView]=useState<'provider'|'global'|'history'>('provider')
  const [name,setName]=useState('')
  const [stockName,setStockName]=useState('')
  const [stockCategory,setStockCategory]=useState<InventoryCategory>('cable')
  const [providerName,setProviderName]=useState('')
  const [stockProvider,setStockProvider]=useState(DEFAULT_PROVIDER)
  const [busy,setBusy]=useState(false)
  const [openCategories,setOpenCategories]=useState<Record<InventoryCategory,boolean>>({cable:true,prise:true,instrument:true,adaptateur:true})

  const refresh=async()=>{
    await ensureStockSeed()
    const [p,s,h]=await Promise.all([
      db.programs.toArray(),
      db.inventoryStock.toArray(),
      db.activity.orderBy('createdAt').reverse().limit(180).toArray()
    ])
    setPrograms(p.filter(item=>!item.deletedAt).map(normalizeProgram).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)))
    setStock(s.filter(item=>!item.deletedAt).map(normalizeStockItem).sort((a,b)=>a.name.localeCompare(b.name,'fr')))
    setHistory(h.filter(item=>item.source==='inventory'))
  }
  useEffect(()=>{void refresh()},[])

  const changed=async()=>{await refresh();onChanged()}
  const providers=useMemo(()=>Array.from(new Set([DEFAULT_PROVIDER,...stock.map(item=>normalizeProvider(item.provider))])).sort((a,b)=>a===DEFAULT_PROVIDER?-1:b===DEFAULT_PROVIDER?1:a.localeCompare(b,'fr')),[stock])
  const stockUnits=stock.reduce((sum,item)=>sum+item.quantity,0)
  const unavailableUnits=stock.filter(item=>statusBlocksAvailability(item.status)).reduce((sum,item)=>sum+item.quantity,0)

  const globalStock=useMemo(()=>{
    const map=new Map<string,{category:InventoryCategory;name:string;total:number;providers:{provider:string;quantity:number;status:InventoryStockStatus;id:string}[]}>()
    for(const item of stock){
      const key=item.category+'|'+item.name.trim().toLowerCase()
      const row=map.get(key)??{category:item.category,name:item.name,total:0,providers:[]}
      row.total+=item.quantity
      row.providers.push({provider:normalizeProvider(item.provider),quantity:item.quantity,status:item.status??'available',id:item.id})
      map.set(key,row)
    }
    return Array.from(map.values()).sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name,'fr'))
  },[stock])

  const create=async()=>{
    if(!name.trim()||busy)return
    setBusy(true)
    try{
      const item=await createProgram(name);setName('');await changed();toast('Programme créé.');onOpen(item.id)
    }finally{setBusy(false)}
  }

  const createProvider=async()=>{
    const value=providerName.trim()
    if(!value)return
    const existing=providers.find(provider=>provider.toLowerCase()===value.toLowerCase())
    if(existing){
      setStockProvider(existing);setProviderName('');toast('Ce prestataire existe déjà.')
      return
    }
    const stamp=now()
    const rows:InventoryStockItem[]=CATEGORY_ORDER.flatMap(category=>DEFAULT_CATALOG[category].map(name=>({
      id:crypto.randomUUID(),name,category,quantity:0,provider:value,status:'available' as InventoryStockStatus,notes:'',createdAt:stamp,updatedAt:stamp,deletedAt:null
    })))
    await db.inventoryStock.bulkAdd(rows)
    await logActivity('create','Nouveau stockage',value,{source:'inventory',inventoryProvider:value})
    setProviderName('');setStockProvider(value);await changed();toast('Prestataire ajouté.')
  }

  const addStock=async()=>{
    const value=stockName.trim()
    if(!value)return
    const existing=stock.find(item=>normalizeProvider(item.provider)===stockProvider&&item.category===stockCategory&&item.name.trim().toLowerCase()===value.toLowerCase())
    if(existing){
      await db.inventoryStock.update(existing.id,{quantity:existing.quantity+1,provider:stockProvider,updatedAt:now()})
      await logActivity('update','Entrée stock',value+' · +1',{source:'inventory',inventoryStockItemId:existing.id,inventoryProvider:stockProvider,inventoryDelta:1})
    }else{
      const stamp=now()
      const id=crypto.randomUUID()
      await db.inventoryStock.add({id,name:value,category:stockCategory,quantity:1,provider:stockProvider,status:'available',notes:'',createdAt:stamp,updatedAt:stamp,deletedAt:null})
      await logActivity('create','Ajout matériel',value+' · +1',{source:'inventory',inventoryStockItemId:id,inventoryProvider:stockProvider,inventoryDelta:1})
    }
    setStockName('');await changed()
  }

  const setStockQuantity=async(item:InventoryStockItem,quantity:number)=>{
    const next=clampQuantity(quantity)
    const delta=next-item.quantity
    if(!delta)return
    await db.inventoryStock.update(item.id,{quantity:next,updatedAt:now()})
    await logActivity('update',delta>0?'Entrée stock':'Sortie stock',item.name+' · '+(delta>0?'+':'')+delta,{
      source:'inventory',inventoryStockItemId:item.id,inventoryProvider:normalizeProvider(item.provider),inventoryDelta:delta
    })
    await changed()
  }

  const setStockStatus=async(item:InventoryStockItem,status:InventoryStockStatus)=>{
    if((item.status??'available')===status)return
    await db.inventoryStock.update(item.id,{status,updatedAt:now()})
    await logActivity('update','État matériel',item.name+' · '+STOCK_STATUS_LABELS[status],{
      source:'inventory',inventoryStockItemId:item.id,inventoryProvider:normalizeProvider(item.provider)
    })
    await changed()
  }

  const deleteStock=async(item:InventoryStockItem)=>{
    await db.inventoryStock.update(item.id,{deletedAt:now(),updatedAt:now()})
    await logActivity('delete','Matériel retiré',item.name+' · '+item.quantity+' u.',{
      source:'inventory',inventoryStockItemId:item.id,inventoryProvider:normalizeProvider(item.provider),inventoryDelta:-item.quantity
    })
    await changed();toast('Élément retiré du stock.')
  }

  const toggleCategory=(category:InventoryCategory)=>setOpenCategories(value=>({...value,[category]:!value[category]}))

  return <>
    <section className="inventory-hero panel compact-inventory-hero">
      <div><span className="eyebrow">Organisation matérielle</span><h1>Inventaire</h1><p>Programmes, stock multi-prestataires, réservations et suivi opérationnel.</p></div>
      <div className="inventory-tabs">
        <button className={tab==='programs'?'active':''} onClick={()=>setTab('programs')}><CalendarDays/>Programmes <span>{programs.length}</span></button>
        <button className={tab==='stock'?'active':''} onClick={()=>setTab('stock')}><Archive/>Stock <span>{stockUnits}</span></button>
      </div>
    </section>

    {tab==='programs'?<>
      <div className="inventory-inline-create">
        <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void create()}} placeholder="Nouvel événement / programme"/>
        <button className="primary" disabled={!name.trim()||busy} onClick={()=>void create()}><Plus/>Créer</button>
      </div>
      <div className="compact-program-list">
        {programs.length?programs.map(program=>{
          const active=program.items.filter(item=>item.quantity>0)
          const total=active.reduce((sum,item)=>sum+item.quantity,0)
          const conflicts=programs.filter(other=>programsHaveStockShortage(program,other,stock))
          return <button className={'compact-program-row '+(conflicts.length?'has-conflict':'')} key={program.id} onClick={()=>onOpen(program.id)}>
            <CalendarDays/>
            <b>{program.name}</b>
            <span className="program-row-frequency"><Repeat2/>{recurrenceText(program)}</span>
            {program.date&&<span>{new Date(program.date+'T00:00:00').toLocaleDateString('fr-FR')}</span>}
            <span>{active.length} réf. · {total} u.{conflicts.length?' · '+conflicts.length+' conflit'+(conflicts.length>1?'s':''):''}</span>
            <ChevronRight/>
          </button>
        }):<div className="panel inventory-empty"><PackagePlus/><b>Aucun programme</b><span>Créez votre premier événement.</span></div>}
      </div>
    </>:<>
      <div className="stock-view-switch panel">
        <button className={stockView==='provider'?'active':''} onClick={()=>setStockView('provider')}><Archive/>Par stockage</button>
        <button className={stockView==='global'?'active':''} onClick={()=>setStockView('global')}><LayoutGrid/>Vue globale</button>
        <button className={stockView==='history'?'active':''} onClick={()=>setStockView('history')}><History/>Mouvements</button>
        <span>{stockUnits} u. · {providers.length} stockage{providers.length>1?'s':''}{unavailableUnits?' · '+unavailableUnits+' indisponibles':''}</span>
      </div>

      {stockView==='provider'&&<>
        <div className="stock-toolbar panel">
          <select value={stockProvider} onChange={e=>setStockProvider(e.target.value)}>
            {providers.map(provider=><option value={provider} key={provider}>{provider}</option>)}
          </select>
          <input value={providerName} onChange={e=>setProviderName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void createProvider()}} placeholder="Nouveau prestataire / stockage…"/>
          <button className="secondary" disabled={!providerName.trim()} onClick={()=>void createProvider()}><Plus/>Prestataire</button>
        </div>
        <div className="stock-toolbar panel">
          <select value={stockCategory} onChange={e=>setStockCategory(e.target.value as InventoryCategory)}>
            {CATEGORY_ORDER.map(category=><option value={category} key={category}>{CATEGORY_LABELS[category]}</option>)}
          </select>
          <input value={stockName} onChange={e=>setStockName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void addStock()}} placeholder={'Ajouter chez '+stockProvider+'…'}/>
          <button className="primary" disabled={!stockName.trim()} onClick={()=>void addStock()}><Plus/>Ajouter</button>
        </div>
        <div className="inventory-category-stack planned-material-list">
          {CATEGORY_ORDER.map(category=>{
            const items=stock.filter(item=>normalizeProvider(item.provider)===stockProvider&&item.category===category)
            return <CategorySection category={category} key={category} open={openCategories[category]} onToggle={()=>toggleCategory(category)} count={items.length}>
              {items.map(item=><div className={'stock-row stock-row-with-status '+(item.quantity>0?'active':'empty-stock')} key={item.id}>
                <b>{item.name}</b>
                <select className={'stock-status-select status-'+(item.status??'available')} value={item.status??'available'} onChange={e=>void setStockStatus(item,e.target.value as InventoryStockStatus)}>
                  {Object.entries(STOCK_STATUS_LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}
                </select>
                <div className="compact-qty">
                  <button disabled={item.quantity<=0} onClick={()=>void setStockQuantity(item,item.quantity-1)}><Minus/></button>
                  <input type="number" min="0" max="999" inputMode="numeric" value={item.quantity} onChange={e=>void setStockQuantity(item,Number(e.target.value))}/>
                  <button onClick={()=>void setStockQuantity(item,item.quantity+1)}><Plus/></button>
                </div>
                <button className="bare-action danger-icon compact-delete" aria-label={'Supprimer '+item.name} onClick={()=>void deleteStock(item)}><Trash2/></button>
              </div>)}
            </CategorySection>
          })}
        </div>
      </>}

      {stockView==='global'&&<div className="global-stock-dashboard">
        {CATEGORY_ORDER.map(category=>{
          const rows=globalStock.filter(row=>row.category===category)
          if(!rows.length)return null
          return <section className="panel global-stock-category" key={category}>
            <div className="global-stock-category-head"><b>{CATEGORY_LABELS[category]}</b><span>{rows.reduce((sum,row)=>sum+row.total,0)} unités</span></div>
            {rows.map(row=><div className="global-stock-row" key={category+'-'+row.name}>
              <div><b>{row.name}</b><small>{row.providers.length} stockage{row.providers.length>1?'s':''}</small></div>
              <div className="global-stock-providers">{row.providers.map(part=><span className={'provider-stock-chip status-'+part.status} key={part.id}><em>{part.provider}</em><b>{part.quantity}</b><small>{STOCK_STATUS_LABELS[part.status]}</small></span>)}</div>
              <strong>{row.total}</strong>
            </div>)}
          </section>
        })}
      </div>}

      {stockView==='history'&&<section className="panel inventory-movement-history">
        <div className="inventory-history-head"><div><h2>Mouvements du stock</h2><small>Entrées, sorties, changements d’état et opérations de programme.</small></div><History/></div>
        {history.length?history.map(entry=><div className="inventory-history-row" key={entry.id}>
          <span><b>{entry.label}</b><small>{entry.details}{entry.inventoryProvider?' · '+entry.inventoryProvider:''}</small></span>
          {typeof entry.inventoryDelta==='number'&&entry.inventoryDelta!==0&&<strong className={entry.inventoryDelta>0?'positive':'negative'}>{entry.inventoryDelta>0?'+':''}{entry.inventoryDelta}</strong>}
          <time>{new Date(entry.createdAt).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</time>
        </div>):<div className="inventory-overview-empty">Aucun mouvement enregistré pour le moment.</div>}
      </section>}
    </>}
  </>
}
export function InventoryProgramPage({programId,onBack,onChanged,toast}:{programId:string;onBack:()=>void;onChanged:()=>void;toast:(text:string)=>void}){
  const [program,setProgram]=useState<InventoryProgram|null>(null)
  const [programs,setPrograms]=useState<InventoryProgram[]>([])
  const [stock,setStock]=useState<InventoryStockItem[]>([])
  const [kits,setKits]=useState<InventoryKit[]>([])
  const [stockProvider,setStockProvider]=useState(DEFAULT_PROVIDER)
  const [overviewOpen,setOverviewOpen]=useState(false)
  const [overviewGroupMode,setOverviewGroupMode]=useState<'category'|'provider'>('category')
  const [detailsOpen,setDetailsOpen]=useState(false)
  const [summaryOpen,setSummaryOpen]=useState(false)
  const [stockPickerOpen,setStockPickerOpen]=useState(false)
  const [kitPanelOpen,setKitPanelOpen]=useState(false)
  const [checklistOpen,setChecklistOpen]=useState(false)
  const [missingOnly,setMissingOnly]=useState(false)
  const [customName,setCustomName]=useState('')
  const [customCategory,setCustomCategory]=useState<InventoryCategory>('cable')
  const [kitName,setKitName]=useState('')
  const [exporting,setExporting]=useState(false)
  const [confirmDelete,setConfirmDelete]=useState(false)
  const [openCategories,setOpenCategories]=useState<Record<InventoryCategory,boolean>>({cable:true,prise:true,instrument:true,adaptateur:true})
  const [stockPickerCategories,setStockPickerCategories]=useState<Record<InventoryCategory,boolean>>({cable:true,prise:false,instrument:false,adaptateur:false})

  const refresh=async()=>{
    await ensureStockSeed()
    const [p,s,allPrograms,savedKits]=await Promise.all([
      db.programs.get(programId),
      db.inventoryStock.toArray(),
      db.programs.toArray(),
      loadInventoryKits()
    ])
    const normalizedProgram=p?normalizeProgram(p):null
    const normalizedStock=s.filter(item=>!item.deletedAt).map(normalizeStockItem).sort((a,b)=>a.name.localeCompare(b.name,'fr'))
    setProgram(normalizedProgram)
    setPrograms(allPrograms.filter(item=>!item.deletedAt).map(normalizeProgram))
    setStock(normalizedStock)
    setKits(savedKits)
    setStockProvider(current=>{
      if(normalizedStock.some(item=>normalizeProvider(item.provider)===current&&item.quantity>0))return current
      return normalizeProvider(normalizedStock.find(item=>item.quantity>0)?.provider)
    })
  }
  useEffect(()=>{void refresh()},[programId])

  const persist=async(patch:Partial<Omit<InventoryProgram,'id'|'createdAt'>>)=>{
    if(!program)return
    const updatedAt=now()
    const next=normalizeProgram({...program,...patch,updatedAt})
    setProgram(next)
    setPrograms(list=>list.map(item=>item.id===program.id?next:item))
    await db.programs.update(program.id,{...patch,updatedAt})
    onChanged()
  }

  const items=program?.items??[]
  const stockProviders=useMemo(()=>Array.from(new Set(stock.map(item=>normalizeProvider(item.provider)))).sort((a,b)=>a===DEFAULT_PROVIDER?-1:b===DEFAULT_PROVIDER?1:a.localeCompare(b,'fr')),[stock])
  const selectedItems=useMemo(()=>items.filter(item=>item.quantity>0),[items])
  const totalQuantity=useMemo(()=>selectedItems.reduce((sum,item)=>sum+item.quantity,0),[selectedItems])
  const loadedCount=useMemo(()=>selectedItems.filter(item=>item.loaded).length,[selectedItems])
  const returnedCount=useMemo(()=>selectedItems.filter(item=>item.returned).length,[selectedItems])

  const stockFor=(item:InventoryMaterial)=>item.stockItemId?stock.find(value=>value.id===item.stockItemId):undefined
  const availableFor=(item:InventoryMaterial)=>{
    if(!program)return 0
    const source=stockFor(item)
    return source?effectiveStockQuantity(source,program,programs):0
  }
  const missingItems=useMemo(()=>{
    if(!program)return []
    return selectedItems.filter(item=>{
      const source=item.stockItemId?stock.find(value=>value.id===item.stockItemId):undefined
      return !source||item.quantity>effectiveStockQuantity(source,program,programs)
    })
  },[selectedItems,stock,program,programs])

  const overlappingPrograms=useMemo(()=>{
    if(!program)return []
    return programs.filter(other=>programsOverlap(program,other))
  },[program,programs])

  const conflictReservations=useMemo(()=>{
    if(!program)return []
    return selectedItems.flatMap(item=>{
      if(!item.stockItemId)return []
      const source=stock.find(value=>value.id===item.stockItemId)
      if(!source)return []
      const reserved=conflictingReservation(source.id,program,programs)
      if(!reserved.quantity)return []
      return [{item,source,reserved:reserved.quantity,programs:reserved.programs,available:effectiveStockQuantity(source,program,programs)}]
    })
  },[selectedItems,stock,program,programs])

  const overviewGroups=useMemo(()=>{
    if(overviewGroupMode==='category'){
      return CATEGORY_ORDER.map(category=>({
        key:category,
        label:CATEGORY_LABELS[category],
        items:selectedItems.filter(item=>item.category===category)
      })).filter(group=>group.items.length)
    }
    const map=new Map<string,InventoryMaterial[]>()
    for(const item of selectedItems){
      const source=item.stockItemId?stock.find(value=>value.id===item.stockItemId):undefined
      const provider=source?normalizeProvider(source.provider):'À trouver'
      map.set(provider,[...(map.get(provider)??[]),item])
    }
    return Array.from(map.entries()).map(([provider,group])=>({key:provider,label:provider,items:group}))
  },[overviewGroupMode,selectedItems,stock])

  const setQuantity=(id:string,quantity:number)=>{
    const next=items.map(item=>item.id===id?{
      ...item,
      quantity:clampQuantity(quantity),
      loaded:clampQuantity(quantity)>0?item.loaded:false,
      returned:clampQuantity(quantity)>0?item.returned:false
    }:item)
    void persist({items:next})
  }

  const addCustom=()=>{
    const value=customName.trim()
    if(!value||!program)return
    const existing=items.find(item=>item.category===customCategory&&item.name.trim().toLowerCase()===value.toLowerCase())
    const next=existing
      ?items.map(item=>item.id===existing.id?{...item,quantity:item.quantity+1,returned:false}:item)
      :[...items,{id:crypto.randomUUID(),name:value,quantity:1,category:customCategory,loaded:false,returned:false}]
    setCustomName('');void persist({items:next})
  }

  const addFromStock=(stockItem:InventoryStockItem)=>{
    if(!program)return
    const available=effectiveStockQuantity(stockItem,program,programs)
    if(available<=0){toast('Ce matériel n’est pas disponible sur ce créneau.');return}
    const existing=items.find(item=>item.stockItemId===stockItem.id)
    const byName=items.find(item=>!item.stockItemId&&item.category===stockItem.category&&item.name.trim().toLowerCase()===stockItem.name.trim().toLowerCase())
    let next:InventoryMaterial[]
    if(existing)next=items.map(item=>item.id===existing.id?{...item,quantity:item.quantity+1,returned:false}:item)
    else if(byName)next=items.map(item=>item.id===byName.id?{...item,stockItemId:stockItem.id,quantity:Math.max(1,item.quantity),returned:false}:item)
    else next=[...items,{id:crypto.randomUUID(),name:stockItem.name,category:stockItem.category,quantity:1,stockItemId:stockItem.id,loaded:false,returned:false}]
    void persist({items:next})
  }

  const changeSource=(itemId:string,stockItemId:string)=>{
    const source=stock.find(value=>value.id===stockItemId)
    if(!source)return
    void persist({items:items.map(item=>item.id===itemId?{...item,stockItemId:source.id,name:source.name,category:source.category}:item)})
    toast('Source du matériel modifiée.')
  }

  const alternativesFor=(item:InventoryMaterial)=>stock.filter(candidate=>
    candidate.id!==item.stockItemId&&
    candidate.category===item.category&&
    candidate.name.trim().toLowerCase()===item.name.trim().toLowerCase()&&
    program&&effectiveStockQuantity(candidate,program,programs)>0
  ).sort((a,b)=>(program?effectiveStockQuantity(b,program,programs)-effectiveStockQuantity(a,program,programs):0))

  const removeItem=(id:string)=>void persist({items:items.filter(item=>item.id!==id)})

  const restoreDefaults=()=>{
    const existing=new Set(items.map(item=>item.category+':'+item.name.trim().toLowerCase()))
    const missing=CATALOG_FLAT().filter(item=>!existing.has(item.category+':'+item.name.toLowerCase())).map(item=>({...item,id:crypto.randomUUID(),quantity:0,loaded:false,returned:false}))
    if(!missing.length){toast('Tous les matériels par défaut sont déjà présents.');return}
    void persist({items:[...items,...missing]});toast('Matériels par défaut restaurés.')
  }

  const saveKit=async()=>{
    if(!kitName.trim()||!selectedItems.length)return
    const stamp=now()
    const kit:InventoryKit={
      id:crypto.randomUUID(),name:kitName.trim(),
      items:selectedItems.map(item=>({name:item.name,quantity:item.quantity,category:item.category,stockItemId:item.stockItemId})),
      createdAt:stamp,updatedAt:stamp
    }
    const next=[...kits,kit]
    setKits(next);setKitName('')
    await saveInventoryKits(next)
    toast('Kit enregistré.')
  }

  const applyKit=(kit:InventoryKit)=>{
    let next=[...items]
    for(const kitItem of kit.items){
      const existing=next.find(item=>(kitItem.stockItemId&&item.stockItemId===kitItem.stockItemId)||(!kitItem.stockItemId&&item.category===kitItem.category&&item.name.trim().toLowerCase()===kitItem.name.trim().toLowerCase()))
      if(existing)next=next.map(item=>item.id===existing.id?{...item,quantity:item.quantity+kitItem.quantity,returned:false}:item)
      else next.push({id:crypto.randomUUID(),name:kitItem.name,category:kitItem.category,quantity:kitItem.quantity,stockItemId:kitItem.stockItemId,loaded:false,returned:false})
    }
    void persist({items:next})
    toast('Kit « '+kit.name+' » ajouté au programme.')
  }

  const deleteKit=async(id:string)=>{
    const next=kits.filter(kit=>kit.id!==id)
    setKits(next);await saveInventoryKits(next);toast('Kit supprimé.')
  }

  const setChecklistState=async(id:string,field:'loaded'|'returned',checked:boolean)=>{
    if(!program)return
    const target=items.find(item=>item.id===id)
    if(!target)return
    const next=items.map(item=>{
      if(item.id!==id)return item
      if(field==='loaded')return {...item,loaded:checked,returned:checked?item.returned:false}
      return {...item,returned:checked,loaded:checked?true:item.loaded}
    })
    await persist({items:next})
    await logActivity('complete',field==='loaded'?(checked?'Matériel chargé':'Chargement annulé'):(checked?'Matériel retourné':'Retour annulé'),target.name,{
      source:'inventory',inventoryProgramId:program.id,inventoryStockItemId:target.stockItemId
    })
  }

  const markAllChecklist=async(field:'loaded'|'returned',checked:boolean)=>{
    if(!program)return
    const next=items.map(item=>item.quantity>0?(
      field==='loaded'?{...item,loaded:checked,returned:checked?item.returned:false}:{...item,returned:checked,loaded:checked?true:item.loaded}
    ):item)
    await persist({items:next})
    await logActivity('complete',field==='loaded'?(checked?'Programme chargé':'Chargement réinitialisé'):(checked?'Programme retourné':'Retours réinitialisés'),program.name,{
      source:'inventory',inventoryProgramId:program.id
    })
  }

  const removeProgram=async()=>{
    if(!program)return
    await db.programs.update(program.id,{deletedAt:now(),updatedAt:now()})
    await logActivity('delete','Programme supprimé',program.name,{source:'inventory',inventoryProgramId:program.id})
    onChanged();toast('Programme supprimé.');onBack()
  }

  const updateDate=(date:string)=>{
    const weekday=date?new Date(date+'T00:00:00').getDay():program?.weekday??null
    void persist({date,weekday})
  }

  if(!program)return <section className="panel inventory-empty"><span>Chargement du programme…</span></section>

  return <>
    <section className="program-detail-head panel compact-program-head">
      <div className="program-title-block">
        <span className="eyebrow">Programme · événement</span>
        <input className="program-title-input" value={program.name} onChange={e=>setProgram({...program,name:e.target.value})} onBlur={()=>void persist({name:program.name.trim()||'Événement'})}/>
        <div className="program-summary">
          <span>{selectedItems.length} réf.</span>
          <span>{totalQuantity} unité{totalQuantity>1?'s':''}</span>
          <span>{recurrenceText(program)}</span>
          {missingItems.length>0&&<span className="summary-warning">{missingItems.length} manquant{missingItems.length>1?'s':''}</span>}
        </div>
      </div>
      <div className="program-head-actions">
        <button className={'secondary '+(overviewOpen?'active':'')} onClick={()=>setOverviewOpen(value=>!value)}><Eye/>{overviewOpen?'Fermer la vue':'Vue globale'}</button>
        <button className="secondary" disabled={exporting} onClick={()=>{
          setExporting(true)
          void exportTechnicalSheetImage(program,stock).then(()=>toast('Fiche technique exportée en image.')).catch(error=>toast(error instanceof Error?error.message:'Export impossible.')).finally(()=>setExporting(false))
        }}><ImageDown/>{exporting?'Export…':'Exporter'}</button>
        <button className="bare-action danger-icon" aria-label="Supprimer le programme" onClick={()=>setConfirmDelete(true)}><Trash2/></button>
      </div>
    </section>

    {overviewOpen&&<section className="panel inventory-overview">
      <div className="inventory-overview-head">
        <div><span className="eyebrow">Vue globale</span><h2>{program.name}</h2><p>Vue d’ensemble du programme sans export.</p></div>
        <div className="inventory-overview-tools">
          <div className="overview-mode-switch">
            <button className={overviewGroupMode==='category'?'active':''} onClick={()=>setOverviewGroupMode('category')}>Par catégorie</button>
            <button className={overviewGroupMode==='provider'?'active':''} onClick={()=>setOverviewGroupMode('provider')}>Par prestataire</button>
          </div>
          <div className="inventory-overview-metrics"><span><b>{selectedItems.length}</b> références</span><span><b>{totalQuantity}</b> unités</span><span className={missingItems.length?'warning':''}><b>{missingItems.length}</b> manquants</span></div>
        </div>
      </div>
      <div className="inventory-overview-meta">
        <div><small>Date</small><b>{program.date?new Date(program.date+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'}):'Non définie'}</b></div>
        <div><small>Horaire</small><b>{program.startTime||'—'}{program.endTime?' → '+program.endTime:''}</b></div>
        <div><small>Fréquence</small><b>{recurrenceText(program)}</b></div>
        <div><small>Lieu</small><b>{program.location||'Non défini'}</b></div>
      </div>
      <div className="inventory-overview-groups">
        {overviewGroups.map(group=><section className="inventory-overview-group" key={group.key}>
          <div className="inventory-overview-category"><b>{group.label}</b><span>{group.items.reduce((sum,item)=>sum+item.quantity,0)} u.</span></div>
          {group.items.map(item=>{
            const source=stockFor(item)
            const available=availableFor(item)
            const shortage=!source||item.quantity>available
            return <div className={'inventory-overview-row '+(shortage?'shortage':'')} key={item.id}>
              <span><b>{item.name}</b><small>{source?normalizeProvider(source.provider)+' · disponible '+available:'Source non attribuée'} · {item.loaded?'chargé':'non chargé'}{item.returned?' · retourné':''}</small></span>
              <strong>× {item.quantity}</strong>
            </div>
          })}
        </section>)}
        {!selectedItems.length&&<div className="inventory-overview-empty">Aucun matériel sélectionné dans ce programme.</div>}
      </div>
      {program.notes.trim()&&<div className="inventory-overview-notes"><small>Notes</small><p>{program.notes}</p></div>}
    </section>}

    <section className="panel collapsible-program-details">
      <button className="collapsible-program-head" onClick={()=>setDetailsOpen(value=>!value)}>
        <span><b>Détails de l’événement</b><small>{program.date?new Date(program.date+'T00:00:00').toLocaleDateString('fr-FR'):'Date non définie'} · {program.startTime||'horaire non défini'} · {recurrenceText(program)}{program.location?' · '+program.location:''}</small></span>
        {detailsOpen?<ChevronUp/>:<ChevronDown/>}
      </button>
      {detailsOpen&&<div className="program-fields compact-program-fields expanded-program-fields">
        <label><span>Date / début</span><input type="date" value={program.date} onChange={e=>updateDate(e.target.value)}/></label>
        <label><span>Heure début</span><input type="time" value={program.startTime??''} onChange={e=>void persist({startTime:e.target.value})}/></label>
        <label><span>Heure fin</span><input type="time" value={program.endTime??''} onChange={e=>void persist({endTime:e.target.value})}/></label>
        <label><span>Fréquence</span><select value={program.frequency??'once'} onChange={e=>void persist({frequency:e.target.value as InventoryFrequency})}><option value="once">Une fois</option><option value="weekly">Chaque semaine</option><option value="monthly">Chaque mois</option></select></label>
        {(program.frequency??'once')==='weekly'&&<label><span>Jour fixe</span><select value={program.weekday??5} onChange={e=>void persist({weekday:Number(e.target.value)})}>{WEEKDAYS.map((day,index)=><option value={index} key={day}>{day[0].toUpperCase()+day.slice(1)}</option>)}</select></label>}
        <label><span>Lieu</span><input value={program.location} onChange={e=>setProgram({...program,location:e.target.value})} onBlur={()=>void persist({location:program.location})} placeholder="Lieu"/></label>
        <label className="program-notes-field"><span>Notes</span><textarea value={program.notes} onChange={e=>setProgram({...program,notes:e.target.value})} onBlur={()=>void persist({notes:program.notes})} rows={2} placeholder="Consignes, remarques…"/></label>
      </div>}
    </section>

    {conflictReservations.length>0&&<section className="panel inventory-conflict-panel">
      <div className="inventory-alert-head"><AlertTriangle/><span><b>Réservations concurrentes</b><small>{Array.from(new Set(conflictReservations.flatMap(conflict=>conflict.programs.map(item=>item.id)))).length} programme{Array.from(new Set(conflictReservations.flatMap(conflict=>conflict.programs.map(item=>item.id)))).length>1?'s':''} utilise{Array.from(new Set(conflictReservations.flatMap(conflict=>conflict.programs.map(item=>item.id)))).length>1?'nt':''} aussi ce matériel sur le créneau.</small></span></div>
      {conflictReservations.map(conflict=><div className={'inventory-conflict-row '+(conflict.item.quantity>conflict.available?'danger':'')} key={conflict.item.id}>
        <span><b>{conflict.item.name}</b><small>{conflict.programs.map(item=>item.name).join(', ')}</small></span>
        <span>Réservé ailleurs <b>{conflict.reserved}</b></span>
        <span>Disponible ici <b>{conflict.available}</b></span>
      </div>)}
    </section>}

    <section className="panel inventory-material-panel compact-material-panel">
      <div className="inventory-material-toolbar">
        <div><h2>Matériels du programme</h2><small>Disponibilité calculée selon stock, état et autres programmes</small></div>
        <div className="inventory-material-actions">
          <button className={'secondary '+(stockPickerOpen?'active':'')} onClick={()=>setStockPickerOpen(value=>!value)}><PackageCheck/>Stock</button>
          <button className={'secondary '+(kitPanelOpen?'active':'')} onClick={()=>setKitPanelOpen(value=>!value)}><Boxes/>Kits</button>
          <button className={'secondary '+(missingOnly?'active':'')+(missingItems.length?' warning':'')} onClick={()=>setMissingOnly(value=>!value)}><PackageSearch/>Manquants {missingItems.length||''}</button>
          <button className={'secondary '+(checklistOpen?'active':'')} onClick={()=>setChecklistOpen(value=>!value)}><ClipboardCheck/>Check-list</button>
          <button className="secondary" onClick={restoreDefaults}><Plus/>Défauts</button>
        </div>
      </div>

      {stockPickerOpen&&<div className="stock-picker">
        <div className="stock-zone-label available"><span>MATÉRIELS DISPONIBLES</span><small>Disponibilité réelle sur le créneau choisi</small></div>
        <div className="stock-picker-title"><Archive/><span><b>Prendre depuis un stockage</b><small>Les réservations concurrentes sont déjà déduites.</small></span><select value={stockProvider} onChange={e=>setStockProvider(e.target.value)}>{stockProviders.map(provider=><option value={provider} key={provider}>{provider}</option>)}</select></div>
        {CATEGORY_ORDER.map(category=>{
          const group=stock.filter(item=>normalizeProvider(item.provider)===stockProvider&&item.category===category&&effectiveStockQuantity(item,program,programs)>0)
          return <CategorySection category={category} key={category} open={stockPickerCategories[category]} onToggle={()=>setStockPickerCategories(v=>({...v,[category]:!v[category]}))} count={group.length}>
            {group.length?group.map(item=>{
              const planned=items.find(p=>p.stockItemId===item.id)?.quantity??0
              const available=effectiveStockQuantity(item,program,programs)
              return <button className="stock-pick-row" key={item.id} onClick={()=>addFromStock(item)}>
                <b>{item.name}</b><span>Dispo {available}/{item.quantity}</span>{planned>0&&<span>Prévu {planned}</span>}<Plus/>
              </button>
            }):<div className="stock-picker-empty">Aucun élément disponible dans cette catégorie sur ce créneau.</div>}
          </CategorySection>
        })}
      </div>}

      {kitPanelOpen&&<div className="inventory-kit-panel">
        <div className="inventory-kit-create">
          <input value={kitName} onChange={e=>setKitName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void saveKit()}} placeholder="Nom du kit / configuration…"/>
          <button className="primary" disabled={!kitName.trim()||!selectedItems.length} onClick={()=>void saveKit()}><Save/>Enregistrer la sélection</button>
        </div>
        <div className="inventory-kit-list">
          {kits.length?kits.map(kit=><div className="inventory-kit-row" key={kit.id}>
            <span><b>{kit.name}</b><small>{kit.items.length} réf. · {kit.items.reduce((sum,item)=>sum+item.quantity,0)} u.</small></span>
            <button className="secondary" onClick={()=>applyKit(kit)}><Plus/>Ajouter</button>
            <button className="bare-action danger-icon" aria-label={'Supprimer '+kit.name} onClick={()=>void deleteKit(kit.id)}><Trash2/></button>
          </div>):<div className="stock-picker-empty">Aucun kit enregistré. Sélectionnez du matériel puis enregistrez la configuration.</div>}
        </div>
      </div>}

      {missingOnly&&<div className="inventory-missing-panel">
        <div className="inventory-alert-head"><PackageSearch/><span><b>Matériel à trouver</b><small>{missingItems.length?missingItems.length+' référence'+(missingItems.length>1?'s':'')+' à compléter':'Tout le matériel est couvert.'}</small></span></div>
        {missingItems.map(item=>{
          const source=stockFor(item)
          const available=availableFor(item)
          const missing=Math.max(0,item.quantity-available)
          const alternatives=alternativesFor(item)
          return <div className="missing-material-row" key={item.id}>
            <span><b>{item.name}</b><small>{source?normalizeProvider(source.provider):'Aucune source'} · besoin {item.quantity} · disponible {available}</small></span>
            <strong>Manque {missing||item.quantity}</strong>
            <div className="missing-alternatives">{alternatives.length?alternatives.slice(0,3).map(candidate=><button key={candidate.id} onClick={()=>changeSource(item.id,candidate.id)}>{normalizeProvider(candidate.provider)} · {effectiveStockQuantity(candidate,program,programs)}</button>):<small>Aucune alternative disponible</small>}</div>
          </div>
        })}
      </div>}

      {checklistOpen&&<div className="inventory-checklist-panel">
        <div className="checklist-head">
          <span><b>Check-list événement</b><small>{loadedCount}/{selectedItems.length} chargés · {returnedCount}/{selectedItems.length} retournés</small></span>
          <div><button className="secondary" onClick={()=>void markAllChecklist('loaded',true)}><Check/>Tout chargé</button><button className="secondary" onClick={()=>void markAllChecklist('returned',true)}><Check/>Tout retourné</button></div>
        </div>
        {selectedItems.map(item=><div className="checklist-row" key={item.id}>
          <span><b>{item.name}</b><small>× {item.quantity}{stockFor(item)?' · '+normalizeProvider(stockFor(item)?.provider):''}</small></span>
          <label className={item.loaded?'checked':''}><input type="checkbox" checked={Boolean(item.loaded)} onChange={e=>void setChecklistState(item.id,'loaded',e.target.checked)}/><span><Check/>Chargé</span></label>
          <label className={item.returned?'checked':''}><input type="checkbox" checked={Boolean(item.returned)} onChange={e=>void setChecklistState(item.id,'returned',e.target.checked)}/><span><Check/>Retourné</span></label>
        </div>)}
      </div>}

      <div className="stock-zone-label selected"><span>DANS CET INVENTAIRE</span><small>{missingOnly?'Affichage des éléments à compléter uniquement':'Quantités prévues pour le programme'}</small></div>
      <div className="material-add-row compact-material-add">
        <select value={customCategory} onChange={e=>setCustomCategory(e.target.value as InventoryCategory)}>{CATEGORY_ORDER.map(category=><option value={category} key={category}>{CATEGORY_LABELS[category]}</option>)}</select>
        <input value={customName} onChange={e=>setCustomName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addCustom()}} placeholder="Ajouter un matériel…"/>
        <button className="primary" disabled={!customName.trim()} onClick={addCustom}><Plus/>Ajouter</button>
      </div>

      <div className="inventory-category-stack planned-material-list">
        {CATEGORY_ORDER.map(category=>{
          const baseGroup=items.filter(item=>normalizeCategory(item.category,item.name)===category)
          const group=missingOnly?baseGroup.filter(item=>item.quantity>0&&missingItems.some(missing=>missing.id===item.id)):baseGroup
          return <CategorySection category={category} key={category} open={openCategories[category]} onToggle={()=>setOpenCategories(value=>({...value,[category]:!value[category]}))} count={group.length}>
            {group.map(item=>{
              const source=stockFor(item)
              const available=availableFor(item)
              const reservation=source?conflictingReservation(source.id,program,programs).quantity:0
              const shortage=item.quantity>0&&(!source||item.quantity>available)
              return <div className={'program-material-row '+(item.quantity>0?'active ':'')+(shortage?'shortage':'')} key={item.id}>
                <b>{item.name}</b>
                <span className="program-material-source">{source?normalizeProvider(source.provider)+' · dispo '+available+(reservation?' · réservé '+reservation:''):'Sans source'}</span>
                <div className="compact-qty">
                  <button disabled={item.quantity<=0} onClick={()=>setQuantity(item.id,item.quantity-1)}><Minus/></button>
                  <input type="number" min="0" max="999" inputMode="numeric" value={item.quantity} onChange={e=>setQuantity(item.id,Number(e.target.value))}/>
                  <button onClick={()=>setQuantity(item.id,item.quantity+1)}><Plus/></button>
                </div>
                <button className="bare-action danger-icon compact-delete" aria-label={'Supprimer '+item.name} onClick={()=>removeItem(item.id)}><Trash2/></button>
              </div>
            })}
          </CategorySection>
        })}
      </div>
    </section>

    <section className="panel technical-summary compact-technical-summary">
      <button className="collapsible-program-head" onClick={()=>setSummaryOpen(value=>!value)}>
        <span><b>Aperçu fiche technique</b><small>{selectedItems.length} référence{selectedItems.length>1?'s':''} · {totalQuantity} unité{totalQuantity>1?'s':''} · {missingItems.length} manquant{missingItems.length>1?'s':''}</small></span>
        {summaryOpen?<ChevronUp/>:<ChevronDown/>}
      </button>
      {summaryOpen&&<div className="technical-summary-list">
        {selectedItems.length?selectedItems.map(item=><div key={item.id}><span><em>{CATEGORY_LABELS[item.category]}</em>{item.name}{stockFor(item)&&<small>{normalizeProvider(stockFor(item)?.provider)}</small>}</span><b>× {item.quantity}</b></div>):<span className="muted-copy">Aucune quantité renseignée.</span>}
      </div>}
    </section>

    {confirmDelete&&<div className="inventory-confirm-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setConfirmDelete(false)}}>
      <div className="inventory-confirm panel"><button className="bare-action inventory-confirm-close" onClick={()=>setConfirmDelete(false)}><X/></button><h3>Supprimer ce programme ?</h3><p>Le programme sera retiré de la liste Inventaire.</p><div className="modal-actions"><button className="secondary" onClick={()=>setConfirmDelete(false)}>Annuler</button><button className="danger" onClick={()=>void removeProgram()}><Trash2/>Supprimer</button></div></div>
    </div>}
  </>
}
function CATALOG_FLAT():{name:string;category:InventoryCategory}[]{
  return CATEGORY_ORDER.flatMap(category=>DEFAULT_CATALOG[category].map(name=>({name,category})))
}

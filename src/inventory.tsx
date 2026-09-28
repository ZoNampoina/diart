import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Archive, CalendarDays, ChevronDown, ChevronRight, ChevronUp, Eye, ImageDown, MapPin,
  Minus, PackageCheck, PackagePlus, Plus, Repeat2, Trash2, X
} from 'lucide-react'
import { db } from './db'
import type {
  InventoryCategory, InventoryFrequency, InventoryMaterial, InventoryProgram, InventoryStockItem
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
  return {...item,category:normalizeCategory(item.category,item.name),provider:normalizeProvider(item.provider)}
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
    frequency:program.frequency??'once',
    weekday:program.weekday??(program.date?new Date(program.date+'T00:00:00').getDay():null),
    items:(program.items??[]).map(item=>({...item,category:normalizeCategory(item.category,item.name)}))
  }
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
        name,category,quantity:0,provider:DEFAULT_PROVIDER,notes:'',
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
  const [tab,setTab]=useState<'programs'|'stock'>('programs')
  const [name,setName]=useState('')
  const [stockName,setStockName]=useState('')
  const [stockCategory,setStockCategory]=useState<InventoryCategory>('cable')
  const [providerName,setProviderName]=useState('')
  const [stockProvider,setStockProvider]=useState(DEFAULT_PROVIDER)
  const [busy,setBusy]=useState(false)
  const [openCategories,setOpenCategories]=useState<Record<InventoryCategory,boolean>>({cable:true,prise:true,instrument:true,adaptateur:true})

  const refresh=async()=>{
    await ensureStockSeed()
    const [p,s]=await Promise.all([db.programs.toArray(),db.inventoryStock.toArray()])
    setPrograms(p.filter(item=>!item.deletedAt).map(normalizeProgram).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)))
    setStock(s.filter(item=>!item.deletedAt).map(normalizeStockItem).sort((a,b)=>a.name.localeCompare(b.name,'fr')))
  }
  useEffect(()=>{void refresh()},[])

  const changed=async()=>{await refresh();onChanged()}
  const providers=useMemo(()=>Array.from(new Set([DEFAULT_PROVIDER,...stock.map(item=>normalizeProvider(item.provider))])).sort((a,b)=>a===DEFAULT_PROVIDER?-1:b===DEFAULT_PROVIDER?1:a.localeCompare(b,'fr')),[stock])

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
      id:crypto.randomUUID(),name,category,quantity:0,provider:value,notes:'',createdAt:stamp,updatedAt:stamp,deletedAt:null
    })))
    await db.inventoryStock.bulkAdd(rows)
    setProviderName('');setStockProvider(value);await changed();toast('Prestataire ajouté.')
  }

  const addStock=async()=>{
    const value=stockName.trim()
    if(!value)return
    const existing=stock.find(item=>normalizeProvider(item.provider)===stockProvider&&item.category===stockCategory&&item.name.trim().toLowerCase()===value.toLowerCase())
    if(existing){
      await db.inventoryStock.update(existing.id,{quantity:existing.quantity+1,provider:stockProvider,updatedAt:now()})
    }else{
      const stamp=now()
      await db.inventoryStock.add({id:crypto.randomUUID(),name:value,category:stockCategory,quantity:1,provider:stockProvider,notes:'',createdAt:stamp,updatedAt:stamp,deletedAt:null})
    }
    setStockName('');await changed()
  }

  const setStockQuantity=async(item:InventoryStockItem,quantity:number)=>{
    await db.inventoryStock.update(item.id,{quantity:clampQuantity(quantity),updatedAt:now()});await changed()
  }

  const deleteStock=async(item:InventoryStockItem)=>{
    await db.inventoryStock.update(item.id,{deletedAt:now(),updatedAt:now()});await changed();toast('Élément retiré du stock.')
  }

  const toggleCategory=(category:InventoryCategory)=>setOpenCategories(value=>({...value,[category]:!value[category]}))
  const stockUnits=stock.reduce((sum,item)=>sum+item.quantity,0)

  return <>
    <section className="inventory-hero panel compact-inventory-hero">
      <div><span className="eyebrow">Organisation matérielle</span><h1>Inventaire</h1><p>Programmes d’événements et stock réel au même endroit.</p></div>
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
          return <button className="compact-program-row" key={program.id} onClick={()=>onOpen(program.id)}>
            <CalendarDays/>
            <b>{program.name}</b>
            <span className="program-row-frequency"><Repeat2/>{recurrenceText(program)}</span>
            {program.date&&<span>{new Date(program.date+'T00:00:00').toLocaleDateString('fr-FR')}</span>}
            <span>{active.length} réf. · {total} u.</span>
            <ChevronRight/>
          </button>
        }):<div className="panel inventory-empty"><PackagePlus/><b>Aucun programme</b><span>Créez votre premier événement.</span></div>}
      </div>
    </>:<>
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
            {items.map(item=><div className={'stock-row '+(item.quantity>0?'active':'empty-stock')} key={item.id}>
              <b>{item.name}</b>
              <span className="stock-status">{item.quantity>0?'En stock':'0'}</span>
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
  </>
}

export function InventoryProgramPage({programId,onBack,onChanged,toast}:{programId:string;onBack:()=>void;onChanged:()=>void;toast:(text:string)=>void}){
  const [program,setProgram]=useState<InventoryProgram|null>(null)
  const [stock,setStock]=useState<InventoryStockItem[]>([])
  const [stockProvider,setStockProvider]=useState(DEFAULT_PROVIDER)
  const [overviewOpen,setOverviewOpen]=useState(false)
  const [detailsOpen,setDetailsOpen]=useState(false)
  const [summaryOpen,setSummaryOpen]=useState(false)
  const [stockPickerOpen,setStockPickerOpen]=useState(false)
  const [customName,setCustomName]=useState('')
  const [customCategory,setCustomCategory]=useState<InventoryCategory>('cable')
  const [exporting,setExporting]=useState(false)
  const [confirmDelete,setConfirmDelete]=useState(false)
  const [openCategories,setOpenCategories]=useState<Record<InventoryCategory,boolean>>({cable:true,prise:true,instrument:true,adaptateur:true})
  const [stockPickerCategories,setStockPickerCategories]=useState<Record<InventoryCategory,boolean>>({cable:true,prise:false,instrument:false,adaptateur:false})

  const refresh=async()=>{
    await ensureStockSeed()
    const [p,s]=await Promise.all([db.programs.get(programId),db.inventoryStock.toArray()])
    setProgram(p?normalizeProgram(p):null)
    const normalizedStock=s.filter(item=>!item.deletedAt).map(normalizeStockItem).sort((a,b)=>a.name.localeCompare(b.name,'fr'))
    setStock(normalizedStock)
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
    await db.programs.update(program.id,{...patch,updatedAt})
    onChanged()
  }

  const items=program?.items??[]
  const stockProviders=useMemo(()=>Array.from(new Set(stock.map(item=>normalizeProvider(item.provider)))).sort((a,b)=>a===DEFAULT_PROVIDER?-1:b===DEFAULT_PROVIDER?1:a.localeCompare(b,'fr')),[stock])
  const selectedItems=useMemo(()=>items.filter(item=>item.quantity>0),[items])
  const totalQuantity=useMemo(()=>selectedItems.reduce((sum,item)=>sum+item.quantity,0),[selectedItems])

  const setQuantity=(id:string,quantity:number)=>{
    const next=items.map(item=>item.id===id?{...item,quantity:clampQuantity(quantity)}:item)
    void persist({items:next})
  }

  const addCustom=()=>{
    const value=customName.trim()
    if(!value||!program)return
    const existing=items.find(item=>item.category===customCategory&&item.name.trim().toLowerCase()===value.toLowerCase())
    const next=existing
      ?items.map(item=>item.id===existing.id?{...item,quantity:item.quantity+1}:item)
      :[...items,{id:crypto.randomUUID(),name:value,quantity:1,category:customCategory}]
    setCustomName('');void persist({items:next})
  }

  const addFromStock=(stockItem:InventoryStockItem)=>{
    const existing=items.find(item=>item.stockItemId===stockItem.id)
    const byName=items.find(item=>!item.stockItemId&&item.category===stockItem.category&&item.name.trim().toLowerCase()===stockItem.name.trim().toLowerCase())
    let next:InventoryMaterial[]
    if(existing)next=items.map(item=>item.id===existing.id?{...item,quantity:item.quantity+1}:item)
    else if(byName)next=items.map(item=>item.id===byName.id?{...item,stockItemId:stockItem.id,quantity:Math.max(1,item.quantity)}:item)
    else next=[...items,{id:crypto.randomUUID(),name:stockItem.name,category:stockItem.category,quantity:1,stockItemId:stockItem.id}]
    void persist({items:next})
  }

  const removeItem=(id:string)=>void persist({items:items.filter(item=>item.id!==id)})

  const restoreDefaults=()=>{
    const existing=new Set(items.map(item=>item.category+':'+item.name.trim().toLowerCase()))
    const missing=CATALOG_FLAT().filter(item=>!existing.has(item.category+':'+item.name.toLowerCase())).map(item=>({...item,id:crypto.randomUUID(),quantity:0}))
    if(!missing.length){toast('Tous les matériels par défaut sont déjà présents.');return}
    void persist({items:[...items,...missing]});toast('Matériels par défaut restaurés.')
  }

  const removeProgram=async()=>{
    if(!program)return
    await db.programs.update(program.id,{deletedAt:now(),updatedAt:now()})
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
        <div className="program-summary"><span>{selectedItems.length} réf.</span><span>{totalQuantity} unité{totalQuantity>1?'s':''}</span><span>{recurrenceText(program)}</span></div>
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
        <div className="inventory-overview-metrics"><span><b>{selectedItems.length}</b> références</span><span><b>{totalQuantity}</b> unités</span></div>
      </div>
      <div className="inventory-overview-meta">
        <div><small>Date</small><b>{program.date?new Date(program.date+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'}):'Non définie'}</b></div>
        <div><small>Fréquence</small><b>{recurrenceText(program)}</b></div>
        <div><small>Lieu</small><b>{program.location||'Non défini'}</b></div>
      </div>
      <div className="inventory-overview-groups">
        {CATEGORY_ORDER.map(category=>{
          const group=selectedItems.filter(item=>normalizeCategory(item.category,item.name)===category)
          if(!group.length)return null
          return <section className="inventory-overview-group" key={category}>
            <div className="inventory-overview-category"><b>{CATEGORY_LABELS[category]}</b><span>{group.reduce((sum,item)=>sum+item.quantity,0)} u.</span></div>
            {group.map(item=>{
              const stockItem=item.stockItemId?stock.find(value=>value.id===item.stockItemId):undefined
              const shortage=Boolean(stockItem&&item.quantity>stockItem.quantity)
              return <div className={'inventory-overview-row '+(shortage?'shortage':'')} key={item.id}>
                <span><b>{item.name}</b>{stockItem&&<small>{normalizeProvider(stockItem.provider)} · disponible {stockItem.quantity}</small>}</span>
                <strong>× {item.quantity}</strong>
              </div>
            })}
          </section>
        })}
        {!selectedItems.length&&<div className="inventory-overview-empty">Aucun matériel sélectionné dans ce programme.</div>}
      </div>
      {program.notes.trim()&&<div className="inventory-overview-notes"><small>Notes</small><p>{program.notes}</p></div>}
    </section>}

    <section className="panel collapsible-program-details">
      <button className="collapsible-program-head" onClick={()=>setDetailsOpen(value=>!value)}>
        <span><b>Détails de l’événement</b><small>{program.date?new Date(program.date+'T00:00:00').toLocaleDateString('fr-FR'):'Date non définie'} · {recurrenceText(program)}{program.location?' · '+program.location:''}</small></span>
        {detailsOpen?<ChevronUp/>:<ChevronDown/>}
      </button>
      {detailsOpen&&<div className="program-fields compact-program-fields">
        <label><span>Date / début</span><input type="date" value={program.date} onChange={e=>updateDate(e.target.value)}/></label>
        <label><span>Fréquence</span><select value={program.frequency??'once'} onChange={e=>void persist({frequency:e.target.value as InventoryFrequency})}><option value="once">Une fois</option><option value="weekly">Chaque semaine</option><option value="monthly">Chaque mois</option></select></label>
        {(program.frequency??'once')==='weekly'&&<label><span>Jour fixe</span><select value={program.weekday??5} onChange={e=>void persist({weekday:Number(e.target.value)})}>{WEEKDAYS.map((day,index)=><option value={index} key={day}>{day[0].toUpperCase()+day.slice(1)}</option>)}</select></label>}
        <label><span>Lieu</span><input value={program.location} onChange={e=>setProgram({...program,location:e.target.value})} onBlur={()=>void persist({location:program.location})} placeholder="Lieu"/></label>
        <label className="program-notes-field"><span>Notes</span><textarea value={program.notes} onChange={e=>setProgram({...program,notes:e.target.value})} onBlur={()=>void persist({notes:program.notes})} rows={2} placeholder="Consignes, remarques…"/></label>
      </div>}
    </section>

    <section className="panel inventory-material-panel compact-material-panel">
      <div className="inventory-material-toolbar">
        <div><h2>Matériels du programme</h2><small>Liste actuellement prévue pour cet événement</small></div>
        <div className="inventory-material-actions">
          <button className={'secondary '+(stockPickerOpen?'active':'')} onClick={()=>setStockPickerOpen(value=>!value)}><PackageCheck/>Depuis le stock</button>
          <button className="secondary" onClick={restoreDefaults}><Plus/>Défauts</button>
        </div>
      </div>

      {stockPickerOpen&&<div className="stock-picker">
        <div className="stock-zone-label available"><span>MATÉRIELS DISPONIBLES</span><small>Cliquer pour ajouter au programme</small></div>
        <div className="stock-picker-title"><Archive/><span><b>Prendre depuis un stockage</b><small>Choisissez le prestataire ; l’ajout ne diminue pas le stock réel.</small></span><select value={stockProvider} onChange={e=>setStockProvider(e.target.value)}>{stockProviders.map(provider=><option value={provider} key={provider}>{provider}</option>)}</select></div>
        {CATEGORY_ORDER.map(category=>{
          const group=stock.filter(item=>normalizeProvider(item.provider)===stockProvider&&item.category===category&&item.quantity>0)
          return <CategorySection category={category} key={category} open={stockPickerCategories[category]} onToggle={()=>setStockPickerCategories(v=>({...v,[category]:!v[category]}))} count={group.length}>
            {group.length?group.map(item=>{
              const planned=items.find(p=>p.stockItemId===item.id)?.quantity??0
              return <button className="stock-pick-row" key={item.id} onClick={()=>addFromStock(item)}>
                <b>{item.name}</b><span>Stock {item.quantity}</span>{planned>0&&<span>Prévu {planned}</span>}<Plus/>
              </button>
            }):<div className="stock-picker-empty">Aucun élément disponible dans cette catégorie.</div>}
          </CategorySection>
        })}
      </div>}

      <div className="stock-zone-label selected"><span>DANS CET INVENTAIRE</span><small>Quantités prévues pour le programme</small></div>
      <div className="material-add-row compact-material-add">
        <select value={customCategory} onChange={e=>setCustomCategory(e.target.value as InventoryCategory)}>{CATEGORY_ORDER.map(category=><option value={category} key={category}>{CATEGORY_LABELS[category]}</option>)}</select>
        <input value={customName} onChange={e=>setCustomName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addCustom()}} placeholder="Ajouter un matériel…"/>
        <button className="primary" disabled={!customName.trim()} onClick={addCustom}><Plus/>Ajouter</button>
      </div>

      <div className="inventory-category-stack">
        {CATEGORY_ORDER.map(category=>{
          const group=items.filter(item=>normalizeCategory(item.category,item.name)===category)
          return <CategorySection category={category} key={category} open={openCategories[category]} onToggle={()=>setOpenCategories(value=>({...value,[category]:!value[category]}))} count={group.length}>
            {group.map(item=>{
              const stockItem=item.stockItemId?stock.find(s=>s.id===item.stockItemId):undefined
              const shortage=Boolean(stockItem&&item.quantity>stockItem.quantity)
              return <div className={'program-material-row '+(item.quantity>0?'active ':'')+(shortage?'shortage':'')} key={item.id}>
                <b>{item.name}</b>
                <span className="program-material-source">{stockItem?(normalizeProvider(stockItem.provider)+' · '+(shortage?'Stock insuffisant':'Stock '+stockItem.quantity)):''}</span>
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
        <span><b>Aperçu fiche technique</b><small>{selectedItems.length} référence{selectedItems.length>1?'s':''} · {totalQuantity} unité{totalQuantity>1?'s':''}</small></span>
        {summaryOpen?<ChevronUp/>:<ChevronDown/>}
      </button>
      {summaryOpen&&<div className="technical-summary-list">
        {selectedItems.length?selectedItems.map(item=><div key={item.id}><span><em>{CATEGORY_LABELS[item.category]}</em>{item.name}</span><b>× {item.quantity}</b></div>):<span className="muted-copy">Aucune quantité renseignée.</span>}
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

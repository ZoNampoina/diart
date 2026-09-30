import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle, Archive, Boxes, BrainCircuit, CalendarDays, Check, ChevronDown, ChevronRight, ChevronUp,
  ClipboardCheck, Eye, History, ImageDown, LayoutGrid, Link2, Minus, Network, PackageCheck, PackagePlus,
  PackageSearch, Plus, Repeat2, Save, Settings2, Trash2, Wifi, WifiOff, X, Globe2, Share2
} from 'lucide-react'
import { db, logActivity } from './db'
import { analyzeInventoryInstallationWithAI } from './cloud'
import type {
  ActivityEntry, InstallationLink, InstallationSuggestion, InventoryCategory, InventoryCharacteristic, InventoryFrequency,
  InventoryKit, InventoryMaterial, InventoryPhantomMode, InventoryPort, InventoryPortDirection,
  InventoryProgram, InventorySignalLevel, InventoryStockItem, InventoryStockStatus
} from './types'

type InventoryCategoryDef={id:InventoryCategory;label:string}
const DEFAULT_CATEGORIES:InventoryCategoryDef[]=[
  {id:'cable',label:'Câbles'},
  {id:'prise',label:'Prises / alimentations'},
  {id:'instrument',label:'Instruments'},
  {id:'adaptateur',label:'Adaptateurs'},
  {id:'accessoire',label:'Accessoires'}
]
const DEFAULT_CATEGORY_ORDER:InventoryCategory[]=DEFAULT_CATEGORIES.map(item=>item.id)
const DEFAULT_CATEGORY_LABELS:Record<string,string>=Object.fromEntries(DEFAULT_CATEGORIES.map(item=>[item.id,item.label]))
const WEEKDAYS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi']
const DEFAULT_PROVIDER = 'Mon stock'
const INVENTORY_KITS_KEY = 'inventoryKitsV1'
const INVENTORY_CATEGORIES_KEY = 'inventoryCategoriesV1'
const CONNECTOR_OPTIONS=['XLR(F)','XLR(M)','JACK','minijack','RCA','Speakon','USB-A','USB-B','USB-C','Ethernet RJ45','IEC','MIDI DIN','HDMI','Autre']
const STOCK_STATUS_LABELS:Record<InventoryStockStatus,string>={
  available:'Disponible',
  reserved:'Réservé',
  in_use:'En utilisation',
  repair:'En panne',
  maintenance:'Maintenance',
  unavailable:'Indisponible'
}
const BLOCKING_STOCK_STATUSES:InventoryStockStatus[]=['reserved','in_use','repair','maintenance','unavailable']

const DEFAULT_CATALOG: Record<string,string[]> = {
  cable:[
    'XLR-XLR','XLR(M) - JACK','XLR(F) - JACK','JACK-JACK','minijack-JACK',
    'Speakon-Speakon','USB-A - USB-B','USB-C - USB-C','Ethernet RJ45'
  ],
  prise:[
    'Alimentation','Prise multiple','Alim PC','Alim Clavier','Chargeur téléphone',
    'Rallonge électrique','Adaptateur secteur universel','Câble IEC'
  ],
  instrument:[
    'Piano','Guitare','Basse','Batterie','Pad','Micro','Saxophone','Clavier maître','Cajón','Table de mixage'
  ],
  adaptateur:[
    'minijack to JACK','RCA to JACK','RCA to minijack','JACK to minijack',
    'RCA to RCA','Multi-JACK','Multi-minijack','XLR to JACK','USB-C to USB-A','USB-C to minijack','DI Box'
  ],
  accessoire:[
    'Pied de micro','Pied de clavier','Pupitre','Stand guitare / basse','Support tablette',
    'Pince micro','Flight case','Housse','Velcro / attache câble','Gaffer'
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
  const raw=String(value??'').trim()
  if(raw)return raw
  const key=name.trim().toLowerCase()
  if(/pied|stand|pupitre|support|pince|flight|housse|velcro|gaffer/.test(key))return 'accessoire'
  if(/xlr|jack|speakon|usb|ethernet|câble|cable/.test(key))return 'cable'
  if(/alim|prise|chargeur|rallonge|iec|secteur/.test(key))return 'prise'
  if(/piano|guitare|basse|batterie|pad|micro|saxo|clavier|caj/.test(key))return 'instrument'
  return 'adaptateur'
}

function categoryLabel(category:InventoryCategory,defs:InventoryCategoryDef[]=DEFAULT_CATEGORIES):string{
  return defs.find(item=>item.id===category)?.label??DEFAULT_CATEGORY_LABELS[category]??category.replace(/[-_]+/g,' ').replace(/^./,c=>c.toUpperCase())
}

function categorySlug(label:string):string{
  return label.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'classe'
}

async function loadInventoryCategories():Promise<InventoryCategoryDef[]>{
  const row=await db.settings.get(INVENTORY_CATEGORIES_KEY)
  if(!row?.value)return DEFAULT_CATEGORIES
  try{
    const saved=JSON.parse(row.value) as InventoryCategoryDef[]
    const map=new Map<string,InventoryCategoryDef>(DEFAULT_CATEGORIES.map(item=>[item.id,item]))
    for(const item of Array.isArray(saved)?saved:[])if(item?.id&&item?.label)map.set(item.id,item)
    return Array.from(map.values())
  }catch{return DEFAULT_CATEGORIES}
}

async function saveInventoryCategories(defs:InventoryCategoryDef[]):Promise<void>{
  await db.settings.put({key:INVENTORY_CATEGORIES_KEY,value:JSON.stringify(defs)})
}

function defaultTechnicalProfile(name:string):{characteristics:InventoryCharacteristic[];ports:InventoryPort[]}{
  const key=name.trim().toLowerCase()
  if(/\bbasse\b|guitare bass/.test(key))return {
    characteristics:[{id:crypto.randomUUID(),label:'Sortie principale',value:'JACK 6,35 mm · niveau instrument'}],
    ports:[{id:crypto.randomUUID(),label:'Sortie instrument',connector:'JACK',direction:'output',count:1,signalLevel:'instrument',balanced:false,stereo:false,phantom:'blocked'}]
  }
  if(/\bguitare\b/.test(key))return {
    characteristics:[{id:crypto.randomUUID(),label:'Sortie principale',value:'JACK 6,35 mm · niveau instrument'}],
    ports:[{id:crypto.randomUUID(),label:'Sortie instrument',connector:'JACK',direction:'output',count:1,signalLevel:'instrument',balanced:false,stereo:false,phantom:'blocked'}]
  }
  if(/micro/.test(key))return {
    characteristics:[{id:crypto.randomUUID(),label:'Connexion audio',value:'XLR · niveau micro'}],
    ports:[{id:crypto.randomUUID(),label:'Sortie micro',connector:'XLR(M)',direction:'output',count:1,signalLevel:'mic',balanced:true,stereo:false,phantom:'none'}]
  }
  if(/di box|bo[iî]te de direct/.test(key))return {
    characteristics:[{id:crypto.randomUUID(),label:'Conversion',value:'Instrument / ligne asymétrique → micro XLR symétrique'}],
    ports:[
      {id:crypto.randomUUID(),label:'Entrée instrument',connector:'JACK',direction:'input',count:1,signalLevel:'instrument',balanced:false,stereo:false,phantom:'blocked'},
      {id:crypto.randomUUID(),label:'Sortie XLR',connector:'XLR(M)',direction:'output',count:1,signalLevel:'mic',balanced:true,stereo:false,phantom:'supported'}
    ]
  }
  if(/table de mix|console/.test(key))return {
    characteristics:[
      {id:crypto.randomUUID(),label:'Entrées XLR',value:'18 × XLR(F)'},
      {id:crypto.randomUUID(),label:'Sorties AUX',value:'6 × XLR(M)'},
      {id:crypto.randomUUID(),label:'Sorties MAIN',value:'2 × XLR(M)'}
    ],
    ports:[
      {id:crypto.randomUUID(),label:'Entrées micro',connector:'XLR(F)',direction:'input',count:18,signalLevel:'mic',balanced:true,stereo:false,phantom:'supported'},
      {id:crypto.randomUUID(),label:'AUX',connector:'XLR(M)',direction:'output',count:6,signalLevel:'line',balanced:true,stereo:false,phantom:'none'},
      {id:crypto.randomUUID(),label:'MAIN',connector:'XLR(M)',direction:'output',count:2,signalLevel:'line',balanced:true,stereo:false,phantom:'none'}
    ]
  }
  return {characteristics:[],ports:[]}
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
    })),
    installation:{
      nodes:program.installation?.nodes??[],
      links:program.installation?.links??[],
      suggestions:program.installation?.suggestions??[],
      aiSummary:program.installation?.aiSummary??'',
      analyzedAt:program.installation?.analyzedAt,
      analysisMode:program.installation?.analysisMode
    }
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

function programHasStockShortage(current:InventoryProgram,programs:InventoryProgram[],stock:InventoryStockItem[]):boolean{
  for(const item of current.items.filter(value=>value.quantity>0&&value.stockItemId)){
    const source=stock.find(value=>value.id===item.stockItemId)
    if(!source)return true
    if(statusBlocksAvailability(source.status))return true
    const reserved=programs
      .filter(other=>programsOverlap(current,other))
      .reduce((sum,other)=>sum+other.items.filter(value=>value.stockItemId===item.stockItemId).reduce((n,value)=>n+value.quantity,0),0)
    if(item.quantity+reserved>source.quantity)return true
  }
  return current.items.some(item=>item.quantity>0&&!item.stockItemId)
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

function connectorKey(value:string):string{
  return value.trim().toLowerCase().replace(/\s+/g,'')
}
function cableSuggestionName(fromConnector:string,toConnector:string):{kind:InstallationSuggestion['kind'];name:string}{
  const a=connectorKey(fromConnector),b=connectorKey(toConnector)
  const pair=[a,b].sort().join('|')
  if(a.startsWith('xlr')&&b.startsWith('xlr'))return {kind:'cable',name:'XLR-XLR'}
  if(pair==='jack|minijack')return {kind:'cable',name:'minijack-JACK'}
  if(a==='jack'&&b==='jack')return {kind:'cable',name:'JACK-JACK'}
  if(pair==='jack|rca')return {kind:'adapter',name:'RCA to JACK'}
  if(pair==='minijack|rca')return {kind:'adapter',name:'RCA to minijack'}
  if(a.includes('speakon')&&b.includes('speakon'))return {kind:'cable',name:'Speakon-Speakon'}
  if(a.includes('usb-a')&&b.includes('usb-b'))return {kind:'cable',name:'USB-A - USB-B'}
  if(a.includes('usb-c')&&b.includes('usb-c'))return {kind:'cable',name:'USB-C - USB-C'}
  if(a.includes('ethernet')&&b.includes('ethernet'))return {kind:'cable',name:'Ethernet RJ45'}
  if(a===b)return {kind:'cable',name:fromConnector+' - '+toConnector}
  return {kind:'adapter',name:fromConnector+' vers '+toConnector}
}
function stockCableLengthMeters(item:InventoryStockItem):number|undefined{
  const characteristic=(item.characteristics??[]).find(entry=>/longueur|distance/i.test(entry.label))
  const text=(characteristic?.value??'')+' '+item.name
  const match=text.match(/(\d+(?:[.,]\d+)?)\s*m(?:\b|ètre)/i)
  return match?Number(match[1].replace(',','.')):undefined
}
function findSuggestedStock(name:string,stock:InventoryStockItem[],requiredLength?:number):InventoryStockItem|undefined{
  const key=name.toLowerCase().replace(/[^a-z0-9]+/g,' ')
  const words=key.split(/\s+/).filter(Boolean)
  const matches=stock.filter(item=>{
    const target=item.name.toLowerCase().replace(/[^a-z0-9]+/g,' ')
    return words.every(word=>target.includes(word))||item.name.toLowerCase().includes(name.toLowerCase())
  })
  const usable=matches.filter(item=>item.quantity>0&&!statusBlocksAvailability(item.status))
  const pool=usable.length?usable:matches
  if(requiredLength&&requiredLength>0){
    const adequate=pool
      .map(item=>({item,length:stockCableLengthMeters(item)}))
      .filter(value=>value.length!==undefined&&value.length>=requiredLength)
      .sort((a,b)=>(a.length??9999)-(b.length??9999))
    if(adequate[0])return adequate[0].item
  }
  return pool[0]
}
function inferredSignalLevel(port:InventoryPort):InventorySignalLevel{
  if(port.signalLevel)return port.signalLevel
  const key=(port.label+' '+port.connector).toLowerCase()
  if(/midi/.test(key))return 'midi'
  if(/usb|ethernet|hdmi/.test(key))return 'digital'
  if(/speakon|speaker|haut.?parleur/.test(key))return 'speaker'
  if(port.direction==='power'||/iec|secteur|power|alim/.test(key))return 'power'
  if(/micro|mic/.test(key))return 'mic'
  if(/instrument|guitare|basse/.test(key))return 'instrument'
  if(/line|aux|main|rca/.test(key))return 'line'
  return 'unknown'
}
function isMixerItem(item:InventoryStockItem|undefined):boolean{
  if(!item)return false
  return /table de mix|console|mixer/i.test(item.name)||(item.ports??[]).some(port=>port.direction==='input'&&port.count>4)
}
function autoAssignInstallationChannels(program:InventoryProgram,stock:InventoryStockItem[]){
  const installation=program.installation??{nodes:[],links:[]}
  const inputUse=new Map<string,number>()
  const outputUse=new Map<string,number>()
  const nodeStock=(nodeId:string)=>{
    const node=installation.nodes.find(item=>item.id===nodeId)
    return node?.stockItemId?stock.find(item=>item.id===node.stockItemId):undefined
  }
  return installation.links.map(link=>{
    const source=nodeStock(link.fromNodeId)
    const target=nodeStock(link.toNodeId)
    const fromPort=(source?.ports??[]).find(port=>port.id===link.fromPort)??(source?.ports??[]).find(port=>port.direction==='output'||port.direction==='bidirectional')
    const toPort=(target?.ports??[]).find(port=>port.id===link.toPort)??(target?.ports??[]).find(port=>port.direction==='input'||port.direction==='bidirectional')
    const labels:string[]=[]
    if(toPort&&(isMixerItem(target)||toPort.count>1)){
      const key=link.toNodeId+'|'+toPort.id
      const index=(inputUse.get(key)??0)+1
      inputUse.set(key,index)
      if(index<=Math.max(1,toPort.count))labels.push('CH '+index)
      else labels.push('CH ? (capacité dépassée)')
    }
    if(fromPort&&(isMixerItem(source)||fromPort.count>1)){
      const key=link.fromNodeId+'|'+fromPort.id
      const index=(outputUse.get(key)??0)+1
      outputUse.set(key,index)
      const label=fromPort.label.toLowerCase()
      if(/aux|monitor|bus/.test(label))labels.push('AUX '+index)
      else if(/main|master/.test(label)&&fromPort.count===2)labels.push(index===1?'MAIN L':index===2?'MAIN R':'MAIN '+index)
      else labels.push(fromPort.label+' '+index)
    }
    return {...link,assignedChannel:labels.join(' → ')||link.assignedChannel||''}
  })
}
function installationLinkKind(link:InstallationLink,program:InventoryProgram,stock:InventoryStockItem[]):InstallationLink['kind']{
  const installation=program.installation??{nodes:[],links:[]}
  const fromNode=installation.nodes.find(item=>item.id===link.fromNodeId)
  const toNode=installation.nodes.find(item=>item.id===link.toNodeId)
  const fromStock=fromNode?.stockItemId?stock.find(item=>item.id===fromNode.stockItemId):undefined
  const toStock=toNode?.stockItemId?stock.find(item=>item.id===toNode.stockItemId):undefined
  const fromPort=(fromStock?.ports??[]).find(port=>port.id===link.fromPort)
  const toPort=(toStock?.ports??[]).find(port=>port.id===link.toPort)
  const connector=((fromPort?.connector??'')+' '+(toPort?.connector??'')).toLowerCase()
  const levels=[fromPort?.signalLevel,toPort?.signalLevel]
  if(levels.includes('power')||fromPort?.direction==='power'||toPort?.direction==='power'||/iec|secteur|alimentation|power/.test(connector))return 'power'
  if(/rj45|ethernet|wifi|réseau|network/.test(connector+' '+(fromNode?.name??'')+' '+(toNode?.name??'').toLowerCase()))return 'network'
  if(levels.includes('midi')||/midi/.test(connector))return 'midi'
  if(levels.includes('digital')||/usb|hdmi/.test(connector))return 'data'
  if(levels.some(level=>level==='mic'||level==='line'||level==='instrument'||level==='speaker')||/xlr|jack|rca|speakon/.test(connector))return 'audio'
  if(/sustain|pédale|pedale/.test(((fromNode?.name??'')+' '+(toNode?.name??'')).toLowerCase()))return 'accessory'
  return link.kind??'unknown'
}

function linkCompatibility(link:InstallationLink,program:InventoryProgram,stock:InventoryStockItem[]):{
  compatibility:'ok'|'adapter'|'di'|'phantom'|'warning'
  notes:string[]
  suggestions:Array<Omit<InstallationSuggestion,'id'>>
}{
  const installation=program.installation??{nodes:[],links:[]}
  const fromNode=installation.nodes.find(item=>item.id===link.fromNodeId)
  const toNode=installation.nodes.find(item=>item.id===link.toNodeId)
  const fromStock=fromNode?.stockItemId?stock.find(item=>item.id===fromNode.stockItemId):undefined
  const toStock=toNode?.stockItemId?stock.find(item=>item.id===toNode.stockItemId):undefined
  const fromPort=(fromStock?.ports??[]).find(port=>port.id===link.fromPort)??(fromStock?.ports??[]).find(port=>port.direction==='output'||port.direction==='bidirectional')
  const toPort=(toStock?.ports??[]).find(port=>port.id===link.toPort)??(toStock?.ports??[]).find(port=>port.direction==='input'||port.direction==='bidirectional')
  const notes:string[]=[]
  const suggestions:Array<Omit<InstallationSuggestion,'id'>>=[]
  if(!fromPort||!toPort)return {compatibility:'warning',notes:['Connectiques ou sens de port à préciser.'],suggestions}
  const fromLevel=inferredSignalLevel(fromPort),toLevel=inferredSignalLevel(toPort)
  let compatibility:'ok'|'adapter'|'di'|'phantom'|'warning'='ok'

  if(connectorKey(fromPort.connector)!==connectorKey(toPort.connector)){
    const cable=cableSuggestionName(fromPort.connector,toPort.connector)
    if(cable.kind==='adapter'){compatibility='adapter';notes.push('Adaptation de connecteur nécessaire.')}
  }
  if(fromLevel==='instrument'&&(toLevel==='mic'||toLevel==='line')){
    const di=findSuggestedStock('DI Box',stock)
    compatibility='di'
    notes.push('Niveau instrument : DI Box recommandée pour adaptation niveau/impédance et symétrisation.')
    suggestions.push({kind:'equipment',name:'DI Box',quantity:1,reason:(fromNode?.name??'Instrument')+' → '+(toNode?.name??'entrée console'),category:'adaptateur',matchedStockItemId:di?.id,channelAssignment:link.assignedChannel})
  }
  if(fromLevel==='line'&&toLevel==='mic'){
    compatibility=compatibility==='ok'?'warning':compatibility
    notes.push('Niveau ligne vers entrée micro : prévoir PAD/atténuation pour éviter la saturation.')
    suggestions.push({kind:'equipment',name:'PAD / atténuateur ligne',quantity:1,reason:'Adapter niveau ligne vers préampli micro',category:'adaptateur',channelAssignment:link.assignedChannel})
  }
  if(fromLevel==='mic'&&toLevel==='line'){
    compatibility='warning'
    notes.push('Niveau micro vers entrée ligne : préamplification nécessaire.')
    suggestions.push({kind:'equipment',name:'Préampli micro',quantity:1,reason:'Élever le niveau micro vers niveau ligne',category:'adaptateur',channelAssignment:link.assignedChannel})
  }
  if(fromLevel==='speaker'&&toLevel!=='speaker'){
    compatibility='warning'
    notes.push('Signal haut-parleur vers entrée non prévue : connexion potentiellement dangereuse.')
  }
  if((fromLevel==='digital')!==(toLevel==='digital')&&(fromLevel==='digital'||toLevel==='digital')){
    compatibility='warning'
    notes.push('Conversion numérique/analogique nécessaire.')
    suggestions.push({kind:'equipment',name:'Convertisseur audio numérique / analogique',quantity:1,reason:'Formats de signal incompatibles',category:'adaptateur',channelAssignment:link.assignedChannel})
  }
  if(fromPort.stereo===true&&toPort.stereo===false){
    compatibility='warning'
    notes.push('Source stéréo vers entrée mono : utiliser une sommation adaptée, pas un simple Y passif.')
    suggestions.push({kind:'equipment',name:'Sommateur stéréo vers mono',quantity:1,reason:'Préserver la source stéréo sans court-circuiter les sorties',category:'adaptateur',channelAssignment:link.assignedChannel})
  }
  if(fromPort.balanced===false&&toPort.balanced===true&&(link.lengthMeters??0)>=6){
    if(compatibility==='ok')compatibility='di'
    notes.push('Liaison asymétrique longue : symétrisation recommandée pour réduire le bruit.')
    const di=findSuggestedStock('DI Box',stock)
    suggestions.push({kind:'equipment',name:'DI Box',quantity:1,reason:'Liaison asymétrique de '+link.lengthMeters+' m',category:'adaptateur',matchedStockItemId:di?.id,channelAssignment:link.assignedChannel})
  }
  if(fromPort.phantom==='required'){
    if(toPort.phantom==='supported'){
      if(compatibility==='ok')compatibility='phantom'
      notes.push('Activer l’alimentation phantom 48 V sur '+(link.assignedChannel||'ce canal')+'.')
      suggestions.push({kind:'warning',name:'Activer 48 V',quantity:1,reason:(fromNode?.name??'Source')+' nécessite une alimentation phantom',channelAssignment:link.assignedChannel})
    }else{
      compatibility='warning'
      notes.push('La source nécessite 48 V mais l’entrée ne le fournit pas.')
      suggestions.push({kind:'equipment',name:'Alimentation phantom 48 V externe',quantity:1,reason:'Phantom requis mais non disponible sur l’entrée',category:'prise',channelAssignment:link.assignedChannel})
    }
  }
  return {compatibility,notes,suggestions}
}
function enrichInstallationLinks(program:InventoryProgram,stock:InventoryStockItem[]){
  const assigned=autoAssignInstallationChannels(program,stock)
  const temp={...program,installation:{...(program.installation??{nodes:[],links:[]}),links:assigned}}
  return assigned.map(link=>{
    const result=linkCompatibility(link,temp,stock)
    return {...link,compatibility:result.compatibility,compatibilityNotes:result.notes}
  })
}
function localInstallationAnalysis(program:InventoryProgram,stock:InventoryStockItem[]):{summary:string;suggestions:InstallationSuggestion[]}{
  const installation=program.installation??{nodes:[],links:[]}
  const suggestions:InstallationSuggestion[]=[]
  const add=(entry:Omit<InstallationSuggestion,'id'>)=>{
    const existing=suggestions.find(item=>item.kind===entry.kind&&item.name.toLowerCase()===entry.name.toLowerCase()&&item.matchedStockItemId===entry.matchedStockItemId&&item.lengthMeters===entry.lengthMeters)
    if(existing){existing.quantity+=entry.quantity;existing.reason+=' · '+entry.reason;return}
    suggestions.push({id:crypto.randomUUID(),...entry})
  }
  const nodeStock=(nodeId:string)=>{
    const node=installation.nodes.find(item=>item.id===nodeId)
    return node?.stockItemId?stock.find(item=>item.id===node.stockItemId):undefined
  }
  for(const link of installation.links){
    const fromNode=installation.nodes.find(item=>item.id===link.fromNodeId)
    const toNode=installation.nodes.find(item=>item.id===link.toNodeId)
    if(!fromNode||!toNode)continue
    const fromStock=nodeStock(link.fromNodeId)
    const toStock=nodeStock(link.toNodeId)
    const fromPort=(fromStock?.ports??[]).find(port=>port.id===link.fromPort)??(fromStock?.ports??[]).find(port=>port.direction==='output'||port.direction==='bidirectional')
    const toPort=(toStock?.ports??[]).find(port=>port.id===link.toPort)??(toStock?.ports??[]).find(port=>port.direction==='input'||port.direction==='bidirectional')
    if(!fromPort||!toPort){
      add({kind:'warning',name:'Connectique à préciser',quantity:1,reason:'Préciser les ports entre '+fromNode.name+' et '+toNode.name,channelAssignment:link.assignedChannel})
      continue
    }
    const recommendation=cableSuggestionName(fromPort.connector,toPort.connector)
    const requiredLength=(link.lengthMeters??0)>0?link.lengthMeters:undefined
    const match=findSuggestedStock(recommendation.name,stock,requiredLength)
    const matchLength=match?stockCableLengthMeters(match):undefined
    add({
      kind:recommendation.kind,name:recommendation.name,quantity:1,
      reason:fromNode.name+' ('+fromPort.connector+') → '+toNode.name+' ('+toPort.connector+')'+(requiredLength?' · '+requiredLength+' m':'')+(link.assignedChannel?' · '+link.assignedChannel:''),
      category:recommendation.kind==='cable'?'cable':'adaptateur',matchedStockItemId:match?.id,
      lengthMeters:requiredLength,channelAssignment:link.assignedChannel
    })
    if(requiredLength&&match&&matchLength!==undefined&&matchLength<requiredLength){
      add({kind:'warning',name:'Câble trop court',quantity:1,reason:match.name+' = '+matchLength+' m, besoin '+requiredLength+' m',channelAssignment:link.assignedChannel})
    }
    const compatibility=linkCompatibility(link,program,stock)
    compatibility.suggestions.forEach(add)
    if(compatibility.notes.length&&compatibility.compatibility==='warning'){
      add({kind:'warning',name:'Compatibilité audio à vérifier',quantity:1,reason:compatibility.notes.join(' · '),channelAssignment:link.assignedChannel})
    }
  }
  for(const node of installation.nodes){
    const key=node.name.toLowerCase()
    const accessory=/micro/.test(key)?'Pied de micro':/piano|clavier/.test(key)?'Pied de clavier':/guitare|basse/.test(key)?'Stand guitare / basse':''
    if(accessory){
      const match=findSuggestedStock(accessory,stock)
      add({kind:'accessory',name:accessory,quantity:1,reason:'Support conseillé pour '+node.name,category:'accessoire',matchedStockItemId:match?.id})
    }
  }
  const powered=installation.nodes.filter(node=>{
    const item=node.stockItemId?stock.find(value=>value.id===node.stockItemId):undefined
    return (item?.ports??[]).some(port=>port.direction==='power')
  }).length
  if(powered>=2){
    const match=findSuggestedStock('Prise multiple',stock)
    add({kind:'power',name:'Prise multiple',quantity:Math.max(1,Math.ceil(powered/6)),reason:powered+' appareils alimentés dans le schéma',category:'prise',matchedStockItemId:match?.id})
  }
  const warningCount=suggestions.filter(item=>item.kind==='warning').length
  return {
    summary:installation.links.length
      ?installation.links.length+' liaison'+(installation.links.length>1?'s':'')+' · '+suggestions.length+' proposition'+(suggestions.length>1?'s':'')+(warningCount?' · '+warningCount+' point'+(warningCount>1?'s':'')+' à vérifier':'')
      :'Ajoutez des liaisons entre les équipements pour obtenir des propositions automatiques.',
    suggestions
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
  return DEFAULT_CATEGORY_ORDER.flatMap(category=>(DEFAULT_CATALOG[category]??[]).map(name=>({
    id:crypto.randomUUID(),name,quantity,category
  })))
}

async function ensureStockSeed():Promise<void>{
  const seeded=await db.settings.get('inventoryStockSeedV2')
  if(seeded)return
  const stamp=now()
  const existing=await db.inventoryStock.toArray()
  const existingNames=new Set(existing.map(item=>normalizeProvider(item.provider)+'|'+normalizeCategory(item.category,item.name)+':'+item.name.trim().toLowerCase()))
  const rows:InventoryStockItem[]=[]
  for(const category of DEFAULT_CATEGORY_ORDER){
    for(const name of DEFAULT_CATALOG[category]??[]){
      const key=DEFAULT_PROVIDER+'|'+category+':'+name.toLowerCase()
      if(existingNames.has(key))continue
      const technical=defaultTechnicalProfile(name)
      rows.push({
        id:stableCatalogUuid(category,name),
        name,category,quantity:0,provider:DEFAULT_PROVIDER,status:'available',
        characteristics:technical.characteristics,ports:technical.ports,notes:'',
        createdAt:stamp,updatedAt:'1970-01-01T00:00:00.000Z',deletedAt:null
      })
    }
  }
  if(rows.length)await db.inventoryStock.bulkPut(rows)
  await db.settings.put({key:'inventoryStockSeedV2',value:'1'})
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
  const exportCategoryOrder=Array.from(new Set([...DEFAULT_CATEGORY_ORDER,...selected.map(item=>item.category)]))
  const grouped=exportCategoryOrder.map(category=>({
    category,
    rows:selected.filter(item=>item.category===category)
  })).filter(group=>group.rows.length)
  const rowCount=Math.max(1,selected.length)
  const categoryCount=Math.max(1,grouped.length)
  const exportLinks=enrichInstallationLinks(normalized,stock)
  const exportInstallation={...(normalized.installation??{nodes:[],links:[]}),links:exportLinks}
  const diagramRows=Math.ceil((exportInstallation.nodes?.length??0)/4)
  const diagramHeight=exportInstallation.nodes?.length?170+diagramRows*160+exportLinks.length*48:0
  const width=1600
  const rowHeight=76
  const notesLinesEstimate=normalized.notes.trim()?Math.max(2,Math.ceil(normalized.notes.length/70)):0
  const height=Math.max(1120,650+rowCount*rowHeight+categoryCount*62+diagramHeight+notesLinesEstimate*42+210)
  const canvas=document.createElement('canvas')
  canvas.width=width;canvas.height=height
  const ctx=canvas.getContext('2d')
  if(!ctx)throw new Error('Export image indisponible sur cet appareil.')

  ctx.fillStyle='#f8fbfb';ctx.fillRect(0,0,width,height)
  ctx.fillStyle='#0f2f33';ctx.fillRect(0,0,width,24)

  const left=120,right=width-120
  let y=105
  ctx.fillStyle='#0f2f33';ctx.font='850 29px system-ui, -apple-system, Segoe UI, sans-serif'
  ctx.fillText('FICHE TECHNIQUE-INVENTAIRE',left,y)
  ctx.strokeStyle='#b9cacc';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(left,y+28);ctx.lineTo(right,y+28);ctx.stroke()

  y+=105
  ctx.fillStyle='#0b2024';ctx.font='850 58px system-ui, -apple-system, Segoe UI, sans-serif'
  const titleLines=wrapCanvasText(ctx,normalized.name||'Événement',right-left)
  for(const line of titleLines.slice(0,2)){ctx.fillText(line,left,y);y+=68}

  const meta=[
    normalized.date?'Date : '+new Date(normalized.date+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'}):'Date : non définie',
    normalized.startTime?'Horaire : '+normalized.startTime+(normalized.endTime?' – '+normalized.endTime:''):'',
    'Fréquence : '+recurrenceText(normalized),
    normalized.location.trim()?'Lieu : '+normalized.location.trim():''
  ].filter(Boolean)
  y+=8
  ctx.fillStyle='#58757a';ctx.font='600 23px system-ui, -apple-system, Segoe UI, sans-serif'
  for(const metaItem of meta){
    const metaLines=wrapCanvasText(ctx,metaItem,right-left)
    for(const line of metaLines){ctx.fillText(line,left,y);y+=32}
  }
  y+=28

  if(!selected.length){
    ctx.fillStyle='#e5eeee';ctx.fillRect(left,y,right-left,86)
    ctx.fillStyle='#58757a';ctx.font='600 26px system-ui, -apple-system, Segoe UI, sans-serif'
    ctx.fillText('Aucun matériel renseigné',left+26,y+54);y+=86
  }else{
    for(const group of grouped){
      y+=18
      ctx.fillStyle='#dce9eb';ctx.fillRect(left,y,right-left,52)
      ctx.fillStyle='#0f2f33';ctx.font='800 22px system-ui, -apple-system, Segoe UI, sans-serif'
      ctx.fillText(categoryLabel(group.category).toUpperCase(),left+24,y+34)
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

  if(exportInstallation.nodes?.length){
    y+=58
    ctx.fillStyle='#0f2f33';ctx.font='850 27px system-ui, -apple-system, Segoe UI, sans-serif'
    ctx.fillText('SCHÉMA TECHNIQUE',left,y)
    y+=28
    ctx.fillStyle='#6a858a';ctx.font='500 18px system-ui, -apple-system, Segoe UI, sans-serif'
    ctx.fillText('Chaîne de connexion · canaux · longueurs · compatibilité',left,y)
    y+=34

    const cols=4,nodeWidth=280,nodeHeight=92,hGap=((right-left)-cols*nodeWidth)/(cols-1),vGap=64
    const positions=new Map<string,{x:number;y:number;cx:number;cy:number}>()
    exportInstallation.nodes.forEach((node,index)=>{
      const col=index%cols,row=Math.floor(index/cols)
      const x=left+col*(nodeWidth+hGap),py=y+row*(nodeHeight+vGap)
      positions.set(node.id,{x,y:py,cx:x+nodeWidth/2,cy:py+nodeHeight/2})
    })

    ctx.lineWidth=3
    exportLinks.forEach(link=>{
      const a=positions.get(link.fromNodeId),b=positions.get(link.toNodeId)
      if(!a||!b)return
      ctx.strokeStyle=link.compatibility==='warning'?'#b34d45':link.compatibility==='di'||link.compatibility==='adapter'?'#b57b1a':'#6f969b'
      ctx.beginPath();ctx.moveTo(a.cx,a.cy);ctx.lineTo(b.cx,b.cy);ctx.stroke()
      const angle=Math.atan2(b.cy-a.cy,b.cx-a.cx),size=11
      const ax=b.cx-Math.cos(angle)*nodeWidth/2*.78,ay=b.cy-Math.sin(angle)*nodeHeight/2*.78
      ctx.fillStyle=ctx.strokeStyle
      ctx.beginPath()
      ctx.moveTo(ax,ay)
      ctx.lineTo(ax-Math.cos(angle-Math.PI/6)*size,ay-Math.sin(angle-Math.PI/6)*size)
      ctx.lineTo(ax-Math.cos(angle+Math.PI/6)*size,ay-Math.sin(angle+Math.PI/6)*size)
      ctx.closePath();ctx.fill()
    })

    exportInstallation.nodes.forEach(node=>{
      const pos=positions.get(node.id);if(!pos)return
      const source=node.stockItemId?stock.find(item=>item.id===node.stockItemId):undefined
      ctx.fillStyle='#ffffff';ctx.strokeStyle='#a9c2c6';ctx.lineWidth=2
      ctx.fillRect(pos.x,pos.y,nodeWidth,nodeHeight);ctx.strokeRect(pos.x,pos.y,nodeWidth,nodeHeight)
      ctx.fillStyle='#0f2f33';ctx.font='800 20px system-ui, -apple-system, Segoe UI, sans-serif'
      const nodeLines=wrapCanvasText(ctx,node.name,nodeWidth-28)
      nodeLines.slice(0,2).forEach((line,i)=>ctx.fillText(line,pos.x+14,pos.y+30+i*23))
      if(source){
        ctx.fillStyle='#6b858a';ctx.font='600 14px system-ui, -apple-system, Segoe UI, sans-serif'
        ctx.fillText(normalizeProvider(source.provider),pos.x+14,pos.y+78)
      }
    })
    y+=diagramRows*(nodeHeight+vGap)+18

    ctx.fillStyle='#dce9eb';ctx.fillRect(left,y,right-left,46)
    ctx.fillStyle='#0f2f33';ctx.font='800 19px system-ui, -apple-system, Segoe UI, sans-serif'
    ctx.fillText('PATCH / CONNEXIONS',left+18,y+30);y+=46
    exportLinks.forEach((link,index)=>{
      const from=exportInstallation.nodes.find(node=>node.id===link.fromNodeId)
      const to=exportInstallation.nodes.find(node=>node.id===link.toNodeId)
      const fromStock=from?.stockItemId?stock.find(item=>item.id===from.stockItemId):undefined
      const toStock=to?.stockItemId?stock.find(item=>item.id===to.stockItemId):undefined
      const fromPort=(fromStock?.ports??[]).find(port=>port.id===link.fromPort)??(fromStock?.ports??[]).find(port=>port.direction==='output'||port.direction==='bidirectional')
      const toPort=(toStock?.ports??[]).find(port=>port.id===link.toPort)??(toStock?.ports??[]).find(port=>port.direction==='input'||port.direction==='bidirectional')
      const cable=fromPort&&toPort?cableSuggestionName(fromPort.connector,toPort.connector).name:'Connectique à préciser'
      ctx.fillStyle=index%2?'#f1f6f6':'#ffffff';ctx.fillRect(left,y,right-left,48)
      ctx.fillStyle='#17383d';ctx.font='650 16px system-ui, -apple-system, Segoe UI, sans-serif'
      ctx.fillText((from?.name??'?')+' → '+(to?.name??'?'),left+16,y+30)
      ctx.fillStyle='#56757a';ctx.font='600 14px system-ui, -apple-system, Segoe UI, sans-serif'
      const detail=[link.assignedChannel,cable,link.lengthMeters?link.lengthMeters+' m':null].filter(Boolean).join(' · ')
      ctx.fillText(detail,left+610,y+30)
      ctx.textAlign='right'
      ctx.fillStyle=link.compatibility==='warning'?'#b34d45':link.compatibility==='di'||link.compatibility==='adapter'?'#9a6814':'#0f6f78'
      ctx.fillText(link.compatibility==='di'?'DI':link.compatibility==='phantom'?'48V':link.compatibility==='adapter'?'ADAPT.':link.compatibility==='warning'?'À VÉRIFIER':'OK',right-16,y+30)
      ctx.textAlign='left';y+=48
    })
  }

  if(normalized.notes.trim()){
    y+=50;ctx.fillStyle='#0f2f33';ctx.font='800 24px system-ui, -apple-system, Segoe UI, sans-serif';ctx.fillText('NOTES',left,y);y+=40
    ctx.fillStyle='#4d6f74';ctx.font='500 23px system-ui, -apple-system, Segoe UI, sans-serif'
    for(const line of wrapCanvasText(ctx,normalized.notes,right-left)){ctx.fillText(line,left,y);y+=37}
  }

  ctx.strokeStyle='#d4e0e2';ctx.beginPath();ctx.moveTo(left,height-105);ctx.lineTo(right,height-105);ctx.stroke()
  ctx.fillStyle='#789096';ctx.font='600 18px system-ui, -apple-system, Segoe UI, sans-serif'
  const exportedAt=new Date()
  ctx.fillText('DI’ART',left,height-70)
  ctx.textAlign='right'
  ctx.fillText('Exporté le '+exportedAt.toLocaleDateString('fr-FR')+' à '+exportedAt.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}),right,height-70)
  ctx.textAlign='left'

  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Création de l’image impossible.')),'image/png',1))
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a');a.href=url;a.download=sanitizeFilename(normalized.name)+'-fiche-technique.png';a.click()
  setTimeout(()=>URL.revokeObjectURL(url),0)
}

function CategorySection({category,label,open,onToggle,children,count}:{category:InventoryCategory;label?:string;open:boolean;onToggle:()=>void;children:ReactNode;count:number}){
  return <section className="inventory-category">
    <button type="button" className="inventory-category-head" onClick={onToggle}>
      <span><b>{label??categoryLabel(category)}</b><small>{count} élément{count>1?'s':''}</small></span>
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
  const [categories,setCategories]=useState<InventoryCategoryDef[]>(DEFAULT_CATEGORIES)
  const [newCategoryName,setNewCategoryName]=useState('')
  const [techDraft,setTechDraft]=useState<InventoryStockItem|null>(null)
  const [busy,setBusy]=useState(false)
  const [openCategories,setOpenCategories]=useState<Record<InventoryCategory,boolean>>(
    Object.fromEntries(DEFAULT_CATEGORY_ORDER.map(category=>[category,true]))
  )

  const refresh=async()=>{
    await ensureStockSeed()
    const [p,s,h,defs]=await Promise.all([
      db.programs.toArray(),
      db.inventoryStock.toArray(),
      db.activity.orderBy('createdAt').reverse().limit(180).toArray(),
      loadInventoryCategories()
    ])
    setPrograms(p.filter(item=>!item.deletedAt).map(normalizeProgram).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)))
    setStock(s.filter(item=>!item.deletedAt).map(normalizeStockItem).sort((a,b)=>a.name.localeCompare(b.name,'fr')))
    setHistory(h.filter(item=>item.source==='inventory'))
    setCategories(defs)
    setOpenCategories(current=>({...Object.fromEntries(defs.map(item=>[item.id,true])),...current}))
  }
  useEffect(()=>{void refresh()},[])

  const changed=async()=>{await refresh();onChanged()}
  const providers=useMemo(()=>Array.from(new Set([DEFAULT_PROVIDER,...stock.map(item=>normalizeProvider(item.provider))])).sort((a,b)=>a===DEFAULT_PROVIDER?-1:b===DEFAULT_PROVIDER?1:a.localeCompare(b,'fr')),[stock])
  const categoryOrder=useMemo(()=>Array.from(new Set([...categories.map(item=>item.id),...stock.map(item=>item.category)])),[categories,stock])

  const createCategory=async()=>{
    const label=newCategoryName.trim()
    if(!label)return
    let id=categorySlug(label)
    let suffix=2
    while(categories.some(item=>item.id===id)){id=categorySlug(label)+'-'+suffix;suffix++}
    const next=[...categories,{id,label}]
    setCategories(next);setNewCategoryName('');setStockCategory(id)
    setOpenCategories(current=>({...current,[id]:true}))
    await saveInventoryCategories(next)
    toast('Classe « '+label+' » ajoutée.')
  }

  const saveTechnicalDraft=async()=>{
    if(!techDraft)return
    await db.inventoryStock.update(techDraft.id,{
      name:techDraft.name.trim()||'Matériel',
      category:techDraft.category,
      provider:normalizeProvider(techDraft.provider),
      notes:techDraft.notes??'',
      characteristics:(techDraft.characteristics??[]).filter(item=>item.label.trim()||item.value.trim()),
      ports:(techDraft.ports??[]).filter(item=>item.label.trim()||item.connector.trim()),
      updatedAt:now()
    })
    await logActivity('update','Matériel modifié',techDraft.name,{source:'inventory',inventoryStockItemId:techDraft.id,inventoryProvider:normalizeProvider(techDraft.provider)})
    setTechDraft(null);await changed();toast('Matériel modifié.')
  }
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
    const rows:InventoryStockItem[]=DEFAULT_CATEGORY_ORDER.flatMap(category=>(DEFAULT_CATALOG[category]??[]).map(name=>{
      const technical=defaultTechnicalProfile(name)
      return {
        id:crypto.randomUUID(),name,category,quantity:0,provider:value,status:'available' as InventoryStockStatus,
        characteristics:technical.characteristics,ports:technical.ports,notes:'',createdAt:stamp,updatedAt:stamp,deletedAt:null
      }
    }))
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
      const technical=defaultTechnicalProfile(value)
      await db.inventoryStock.add({
        id,name:value,category:stockCategory,quantity:1,provider:stockProvider,status:'available',
        characteristics:technical.characteristics,ports:technical.ports,notes:'',createdAt:stamp,updatedAt:stamp,deletedAt:null
      })
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
          const conflicts=programHasStockShortage(program,programs,stock)?['stock']:[]
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
        <div className="stock-class-toolbar panel">
          <span><b>Classes de matériel</b><small>{categories.length} classes · Accessoires inclus</small></span>
          <div className="stock-class-chips">{categories.map(category=><button className={stockCategory===category.id?'active':''} key={category.id} onClick={()=>setStockCategory(category.id)}>{category.label}</button>)}</div>
          <input value={newCategoryName} onChange={e=>setNewCategoryName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void createCategory()}} placeholder="Nouvelle classe…"/>
          <button className="secondary" disabled={!newCategoryName.trim()} onClick={()=>void createCategory()}><Plus/>Classe</button>
        </div>
        <div className="stock-toolbar panel">
          <select value={stockCategory} onChange={e=>setStockCategory(e.target.value as InventoryCategory)}>
            {categoryOrder.map(category=><option value={category} key={category}>{categoryLabel(category,categories)}</option>)}
          </select>
          <input value={stockName} onChange={e=>setStockName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void addStock()}} placeholder={'Ajouter chez '+stockProvider+'…'}/>
          <button className="primary" disabled={!stockName.trim()} onClick={()=>void addStock()}><Plus/>Ajouter</button>
        </div>
        <div className="inventory-category-stack planned-material-list">
          {categoryOrder.map(category=>{
            const items=stock.filter(item=>normalizeProvider(item.provider)===stockProvider&&item.category===category)
            return <CategorySection category={category} label={categoryLabel(category,categories)} key={category} open={openCategories[category]??true} onToggle={()=>toggleCategory(category)} count={items.length}>
              {items.map(item=><div className="stock-item-wrap" key={item.id}>
                <div className={'stock-row stock-row-with-status stock-row-with-tech '+(item.quantity>0?'active':'empty-stock')}>
                  <b>{item.name}</b>
                  <select className={'stock-status-select status-'+(item.status??'available')} value={item.status??'available'} onChange={e=>void setStockStatus(item,e.target.value as InventoryStockStatus)}>
                    {Object.entries(STOCK_STATUS_LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}
                  </select>
                  <div className="compact-qty">
                    <button disabled={item.quantity<=0} onClick={()=>void setStockQuantity(item,item.quantity-1)}><Minus/></button>
                    <input type="number" min="0" max="999" inputMode="numeric" value={item.quantity} onChange={e=>void setStockQuantity(item,Number(e.target.value))}/>
                    <button onClick={()=>void setStockQuantity(item,item.quantity+1)}><Plus/></button>
                  </div>
                  <button className={'bare-action tech-action '+(techDraft?.id===item.id?'active':'')} title="Caractéristiques et connectiques" onClick={()=>setTechDraft(current=>current?.id===item.id?null:{...item,characteristics:[...(item.characteristics??[])],ports:[...(item.ports??[])]})}><Settings2/></button>
                  <button className="bare-action danger-icon compact-delete" aria-label={'Supprimer '+item.name} onClick={()=>void deleteStock(item)}><Trash2/></button>
                </div>
                {techDraft?.id===item.id&&<div className="stock-tech-editor">
                  <div className="stock-tech-head"><span><b>Caractéristiques · {item.name}</b><small>Décrivez les propriétés et les entrées/sorties utilisables dans les schémas.</small></span><button className="bare-action" onClick={()=>setTechDraft(null)}><X/></button></div>
                  <div className="stock-tech-section stock-general-editor">
                    <div className="stock-tech-section-head"><b>Informations générales</b></div>
                    <div className="stock-general-grid">
                      <label><span>Nom</span><input value={techDraft.name} onChange={e=>setTechDraft({...techDraft,name:e.target.value})}/></label>
                      <label><span>Classe</span><select value={techDraft.category} onChange={e=>setTechDraft({...techDraft,category:e.target.value})}>{categories.map(category=><option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
                      <label><span>Stockage</span><input value={normalizeProvider(techDraft.provider)} onChange={e=>setTechDraft({...techDraft,provider:e.target.value})}/></label>
                      <label className="span2"><span>Notes</span><input value={techDraft.notes??''} onChange={e=>setTechDraft({...techDraft,notes:e.target.value})} placeholder="Référence, usage, remarques…"/></label>
                    </div>
                  </div>
                  <div className="stock-tech-section">
                    <div className="stock-tech-section-head"><b>Caractéristiques</b><button className="secondary" onClick={()=>setTechDraft({...techDraft,characteristics:[...(techDraft.characteristics??[]),{id:crypto.randomUUID(),label:'',value:''}]})}><Plus/>Champ</button></div>
                    {(techDraft.characteristics??[]).map((characteristic,index)=><div className="stock-tech-pair" key={characteristic.id}>
                      <input value={characteristic.label} onChange={e=>setTechDraft({...techDraft,characteristics:(techDraft.characteristics??[]).map((value,i)=>i===index?{...value,label:e.target.value}:value)})} placeholder="Ex. Entrées XLR"/>
                      <input value={characteristic.value} onChange={e=>setTechDraft({...techDraft,characteristics:(techDraft.characteristics??[]).map((value,i)=>i===index?{...value,value:e.target.value}:value)})} placeholder="Ex. 18 × XLR(F)"/>
                      <button className="bare-action danger-icon" onClick={()=>setTechDraft({...techDraft,characteristics:(techDraft.characteristics??[]).filter((_,i)=>i!==index)})}><Trash2/></button>
                    </div>)}
                  </div>
                  <div className="stock-tech-section">
                    <div className="stock-tech-section-head"><b>Connectiques / ports</b><button className="secondary" onClick={()=>setTechDraft({...techDraft,ports:[...(techDraft.ports??[]),{id:crypto.randomUUID(),label:'',connector:'XLR(F)',direction:'input',count:1,signalLevel:'unknown',balanced:false,stereo:false,phantom:'none'}]})}><Plus/>Port</button></div>
                    {(techDraft.ports??[]).map((port,index)=><div className="stock-port-row advanced" key={port.id}>
                      <input value={port.label} onChange={e=>setTechDraft({...techDraft,ports:(techDraft.ports??[]).map((value,i)=>i===index?{...value,label:e.target.value}:value)})} placeholder="Ex. Entrées micro"/>
                      <select value={port.connector} onChange={e=>setTechDraft({...techDraft,ports:(techDraft.ports??[]).map((value,i)=>i===index?{...value,connector:e.target.value}:value)})}>{CONNECTOR_OPTIONS.map(value=><option value={value} key={value}>{value}</option>)}</select>
                      <select value={port.direction} onChange={e=>setTechDraft({...techDraft,ports:(techDraft.ports??[]).map((value,i)=>i===index?{...value,direction:e.target.value as InventoryPortDirection}:value)})}><option value="input">Entrée</option><option value="output">Sortie</option><option value="bidirectional">Bidirectionnel</option><option value="power">Alimentation</option></select>
                      <select value={port.signalLevel??'unknown'} onChange={e=>setTechDraft({...techDraft,ports:(techDraft.ports??[]).map((value,i)=>i===index?{...value,signalLevel:e.target.value as InventorySignalLevel}:value)})}><option value="unknown">Niveau ?</option><option value="mic">Micro</option><option value="line">Ligne</option><option value="instrument">Instrument</option><option value="speaker">HP</option><option value="digital">Numérique</option><option value="midi">MIDI</option><option value="power">Alim</option></select>
                      <select value={port.phantom??'none'} onChange={e=>setTechDraft({...techDraft,ports:(techDraft.ports??[]).map((value,i)=>i===index?{...value,phantom:e.target.value as InventoryPhantomMode}:value)})}><option value="none">48V : non</option><option value="required">48V requis</option><option value="supported">48V disponible</option><option value="blocked">48V interdit</option></select>
                      <label className="port-flag"><input type="checkbox" checked={Boolean(port.balanced)} onChange={e=>setTechDraft({...techDraft,ports:(techDraft.ports??[]).map((value,i)=>i===index?{...value,balanced:e.target.checked}:value)})}/><span>Sym.</span></label>
                      <label className="port-flag"><input type="checkbox" checked={Boolean(port.stereo)} onChange={e=>setTechDraft({...techDraft,ports:(techDraft.ports??[]).map((value,i)=>i===index?{...value,stereo:e.target.checked}:value)})}/><span>Stéréo</span></label>
                      <input className="port-count" type="number" min="1" max="999" value={port.count} onChange={e=>setTechDraft({...techDraft,ports:(techDraft.ports??[]).map((value,i)=>i===index?{...value,count:Math.max(1,Number(e.target.value)||1)}:value)})}/>
                      <button className="bare-action danger-icon" onClick={()=>setTechDraft({...techDraft,ports:(techDraft.ports??[]).filter((_,i)=>i!==index)})}><Trash2/></button>
                    </div>)}
                  </div>
                  <div className="stock-tech-actions"><button className="secondary" onClick={()=>setTechDraft(null)}>Annuler</button><button className="primary" onClick={()=>void saveTechnicalDraft()}><Save/>Enregistrer</button></div>
                </div>}
              </div>)}
            </CategorySection>
          })}
        </div>
      </>}

      {stockView==='global'&&<div className="global-stock-dashboard">
        {categoryOrder.map(category=>{
          const rows=globalStock.filter(row=>row.category===category)
          if(!rows.length)return null
          return <section className="panel global-stock-category" key={category}>
            <div className="global-stock-category-head"><b>{categoryLabel(category,categories)}</b><span>{rows.reduce((sum,row)=>sum+row.total,0)} unités</span></div>
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

export function InventoryProgramPage({programId,onBack,onChanged,toast,onShare}:{programId:string;onBack:()=>void;onChanged:()=>void;toast:(text:string)=>void;onShare:()=>void}){
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
  const [categories,setCategories]=useState<InventoryCategoryDef[]>(DEFAULT_CATEGORIES)
  const [programView,setProgramView]=useState<'materials'|'installation'>('materials')
  const [installationOpen,setInstallationOpen]=useState(true)
  const [installationNodeName,setInstallationNodeName]=useState('')
  const [installationStockId,setInstallationStockId]=useState('')
  const [installationProvider,setInstallationProvider]=useState(DEFAULT_PROVIDER)
  const [linkFromNode,setLinkFromNode]=useState('')
  const [linkToNode,setLinkToNode]=useState('')
  const [linkFromPort,setLinkFromPort]=useState('')
  const [linkToPort,setLinkToPort]=useState('')
  const [linkLengthMeters,setLinkLengthMeters]=useState('')
  const [aiAnalyzing,setAiAnalyzing]=useState(false)
  const [online,setOnline]=useState(typeof navigator==='undefined'?true:navigator.onLine)
  const [exporting,setExporting]=useState(false)
  const [confirmDelete,setConfirmDelete]=useState(false)
  const [openCategories,setOpenCategories]=useState<Record<InventoryCategory,boolean>>(Object.fromEntries(DEFAULT_CATEGORY_ORDER.map(category=>[category,true])))
  const [stockPickerCategories,setStockPickerCategories]=useState<Record<InventoryCategory,boolean>>(Object.fromEntries(DEFAULT_CATEGORY_ORDER.map((category,index)=>[category,index===0])))

  const refresh=async()=>{
    await ensureStockSeed()
    const [p,s,allPrograms,savedKits,defs]=await Promise.all([
      db.programs.get(programId),
      db.inventoryStock.toArray(),
      db.programs.toArray(),
      loadInventoryKits(),
      loadInventoryCategories()
    ])
    const normalizedProgram=p?normalizeProgram(p):null
    const normalizedStock=s.filter(item=>!item.deletedAt).map(normalizeStockItem).sort((a,b)=>a.name.localeCompare(b.name,'fr'))
    setProgram(normalizedProgram)
    setPrograms(allPrograms.filter(item=>!item.deletedAt).map(normalizeProgram))
    setStock(normalizedStock)
    setKits(savedKits)
    setCategories(defs)
    setOpenCategories(current=>({...Object.fromEntries(defs.map(item=>[item.id,true])),...current}))
    setStockPickerCategories(current=>({...Object.fromEntries(defs.map((item,index)=>[item.id,index===0])),...current}))
    setStockProvider(current=>{
      if(normalizedStock.some(item=>normalizeProvider(item.provider)===current&&item.quantity>0))return current
      return normalizeProvider(normalizedStock.find(item=>item.quantity>0)?.provider)
    })
  }
  useEffect(()=>{void refresh()},[programId])
  useEffect(()=>{
    const update=()=>setOnline(navigator.onLine)
    window.addEventListener('online',update);window.addEventListener('offline',update)
    return ()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}
  },[])

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
  useEffect(()=>{if(stockProviders.length&&!stockProviders.includes(installationProvider))setInstallationProvider(stockProviders[0])},[stockProviders,installationProvider])
  const categoryOrder=useMemo(()=>Array.from(new Set([...categories.map(item=>item.id),...stock.map(item=>item.category),...items.map(item=>item.category)])),[categories,stock,items])
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
      return categoryOrder.map(category=>({
        key:category,
        label:categoryLabel(category,categories),
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
  },[overviewGroupMode,selectedItems,stock,categoryOrder,categories])

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

  const addFromStock=async(stockItem:InventoryStockItem)=>{
    if(!program)return
    const available=effectiveStockQuantity(stockItem,program,programs)
    if(available<=0){toast('Ce matériel n’est pas disponible sur ce créneau.');return}
    const existing=items.find(item=>item.stockItemId===stockItem.id)
    const byName=items.find(item=>!item.stockItemId&&item.category===stockItem.category&&item.name.trim().toLowerCase()===stockItem.name.trim().toLowerCase())
    let next:InventoryMaterial[]
    if(existing)next=items.map(item=>item.id===existing.id?{...item,quantity:item.quantity+1,returned:false}:item)
    else if(byName)next=items.map(item=>item.id===byName.id?{...item,stockItemId:stockItem.id,quantity:Math.max(1,item.quantity),returned:false}:item)
    else next=[...items,{id:crypto.randomUUID(),name:stockItem.name,category:stockItem.category,quantity:1,stockItemId:stockItem.id,loaded:false,returned:false}]
    await persist({items:next})
    await logActivity('create','Réservation programme',stockItem.name+' · '+program.name,{
      source:'inventory',inventoryProgramId:program.id,inventoryStockItemId:stockItem.id,inventoryProvider:normalizeProvider(stockItem.provider)
    })
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

  const removeItem=async(id:string)=>{
    if(!program)return
    const target=items.find(item=>item.id===id)
    await persist({items:items.filter(item=>item.id!==id)})
    if(target?.stockItemId){
      const source=stock.find(value=>value.id===target.stockItemId)
      await logActivity('delete','Réservation retirée',target.name+' · '+program.name,{
        source:'inventory',inventoryProgramId:program.id,inventoryStockItemId:target.stockItemId,inventoryProvider:normalizeProvider(source?.provider)
      })
    }
  }

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

  const installation=program?.installation??{nodes:[],links:[],suggestions:[],aiSummary:'',analysisMode:undefined,analyzedAt:undefined}
  const stockByNode=(nodeId:string)=>{
    const node=installation.nodes.find(item=>item.id===nodeId)
    return node?.stockItemId?stock.find(item=>item.id===node.stockItemId):undefined
  }
  const addInstallationNode=()=>{
    if(!program)return
    const stockItem=installationStockId?stock.find(item=>item.id===installationStockId):undefined
    const name=(stockItem?.name??installationNodeName).trim()
    if(!name){toast('Choisissez un matériel ou saisissez un nom.');return}
    const index=installation.nodes.length
    const node={id:crypto.randomUUID(),name,stockItemId:stockItem?.id,x:40+(index%4)*210,y:40+Math.floor(index/4)*150,zone:'Scène'}
    void persist({installation:{...installation,nodes:[...installation.nodes,node]}})
    setInstallationNodeName('');setInstallationStockId('')
  }
  const updateInstallationNode=(id:string,patch:Partial<(typeof installation.nodes)[number]>)=>{
    void persist({installation:{...installation,nodes:installation.nodes.map(node=>node.id===id?{...node,...patch}:node)}})
  }
  const setInstallationNodePosition=(id:string,x:number,y:number,commit=false)=>{
    if(!program)return
    const nextInstallation={...installation,nodes:installation.nodes.map(node=>node.id===id?{...node,x:Math.max(8,Math.round(x)),y:Math.max(8,Math.round(y))}:node)}
    if(commit)void persist({installation:nextInstallation})
    else setProgram({...program,installation:nextInstallation})
  }
  const addInstallationTemplate=(kind:'piano'|'drums'|'mr18')=>{
    if(!program)return
    const definitions=kind==='piano'
      ?['Onduleur','Prise multiple','Alimentation piano','Piano','XLR-XLR','Table de mixage','XLR-XLR','Baffle','Sustain']
      :kind==='drums'
        ?['Batterie','Mic batterie','XLR batterie','Table de mixage']
        :['Prise','Alimentation MR18','MR18','RJ45','Répéteur Wi-Fi','Prise répéteur','Alimentation répéteur']
    const baseX=30,baseY=35
    const nodes=definitions.map((name,index)=>{
      const matched=stock.find(item=>normalizeProvider(item.provider)===installationProvider&&item.name.toLowerCase().includes(name.toLowerCase().replace('xlr-xlr','xlr')))
      return {id:crypto.randomUUID(),name:matched?.name??name,stockItemId:matched?.id,x:baseX+(index%4)*210,y:baseY+Math.floor(index/4)*150,zone:index<4?'Scène':'Régie'}
    })
    const links:InstallationLink[]=[]
    const connect=(a:number,b:number,linkKind:InstallationLink['kind']='unknown')=>{if(nodes[a]&&nodes[b])links.push({id:crypto.randomUUID(),fromNodeId:nodes[a].id,toNodeId:nodes[b].id,kind:linkKind})}
    if(kind==='piano'){connect(0,1,'power');connect(1,2,'power');connect(2,3,'power');connect(3,4,'audio');connect(4,5,'audio');connect(5,6,'audio');connect(6,7,'audio');connect(8,3,'accessory')}
    if(kind==='drums'){connect(0,1,'audio');connect(1,2,'audio');connect(2,3,'audio')}
    if(kind==='mr18'){connect(0,1,'power');connect(1,2,'power');connect(2,3,'network');connect(3,4,'network');connect(5,6,'power');connect(6,4,'power')}
    void persist({installation:{...installation,nodes:[...installation.nodes,...nodes],links:[...installation.links,...links],suggestions:[]}})
    toast('Modèle '+(kind==='piano'?'Piano':kind==='drums'?'Batterie':'MR18 + réseau')+' ajouté.')
  }
  const removeInstallationNode=(id:string)=>{
    void persist({installation:{
      ...installation,
      nodes:installation.nodes.filter(node=>node.id!==id),
      links:installation.links.filter(link=>link.fromNodeId!==id&&link.toNodeId!==id),
      suggestions:[]
    }})
  }
  const addInstallationLink=()=>{
    if(!program||!linkFromNode||!linkToNode||linkFromNode===linkToNode){toast('Choisissez deux équipements différents.');return}
    const length=Number(String(linkLengthMeters).replace(',','.'))
    const rawLink:InstallationLink={
      id:crypto.randomUUID(),fromNodeId:linkFromNode,toNodeId:linkToNode,
      fromPort:linkFromPort||undefined,toPort:linkToPort||undefined,
      lengthMeters:Number.isFinite(length)&&length>0?length:undefined
    }
    const link:InstallationLink={...rawLink,kind:installationLinkKind(rawLink,program,stock)}
    const draftProgram={...program,installation:{...installation,links:[...installation.links,link],suggestions:[]}}
    const links=enrichInstallationLinks(draftProgram,stock)
    void persist({installation:{...installation,links,suggestions:[],aiSummary:'',analyzedAt:undefined,analysisMode:undefined}})
    setLinkFromPort('');setLinkToPort('');setLinkLengthMeters('')
  }
  const updateInstallationLink=(id:string,patch:Partial<InstallationLink>)=>{
    if(!program)return
    const rawLinks=installation.links.map(link=>link.id===id?{...link,...patch}:link)
    const links=enrichInstallationLinks({...program,installation:{...installation,links:rawLinks}},stock)
    void persist({installation:{...installation,links,suggestions:[],aiSummary:'',analyzedAt:undefined,analysisMode:undefined}})
  }
  const removeInstallationLink=(id:string)=>void persist({installation:{...installation,links:installation.links.filter(link=>link.id!==id),suggestions:[],aiSummary:'',analyzedAt:undefined,analysisMode:undefined}})
  const autoAssignChannels=()=>{
    if(!program)return
    const links=enrichInstallationLinks(program,stock)
    void persist({installation:{...installation,links}})
    toast('Canaux affectés automatiquement.')
  }
  const runLocalInstallationAnalysis=async()=>{
    if(!program)return
    const links=enrichInstallationLinks(program,stock)
    const analyzedProgram={...program,installation:{...installation,links}}
    const result=localInstallationAnalysis(analyzedProgram,stock)
    await persist({installation:{...installation,links,suggestions:result.suggestions,aiSummary:result.summary,analyzedAt:now(),analysisMode:'local'}})
    toast('Analyse locale terminée.')
  }
  const runAIInstallationAnalysis=async()=>{
    if(!program)return
    if(!online){toast('Connexion requise pour l’analyse IA.');return}
    setAiAnalyzing(true)
    try{
      const links=enrichInstallationLinks(program,stock)
      const preparedInstallation={...installation,links}
      const preparedProgram={...program,installation:preparedInstallation}
      const baseline=localInstallationAnalysis(preparedProgram,stock)
      const data=await analyzeInventoryInstallationWithAI({
        program:{name:program.name,date:program.date,startTime:program.startTime,endTime:program.endTime,location:program.location},
        installation:preparedInstallation,
        stock:stock.map(item=>({
          id:item.id,name:item.name,category:item.category,provider:normalizeProvider(item.provider),
          quantity:item.quantity,status:item.status,characteristics:item.characteristics??[],ports:item.ports??[]
        })),
        currentItems:selectedItems.map(item=>({name:item.name,quantity:item.quantity,category:item.category,stockItemId:item.stockItemId}))
      })
      const raw=Array.isArray(data?.suggestions)?data.suggestions:[]
      const suggestions:InstallationSuggestion[]=raw.map((value:any)=>({
        id:crypto.randomUUID(),
        kind:['cable','adapter','power','accessory','equipment','warning'].includes(value?.kind)?value.kind:'warning',
        name:String(value?.name??'Suggestion'),
        quantity:Math.max(1,Number(value?.quantity)||1),
        reason:String(value?.reason??'Analyse IA'),
        category:value?.category?String(value.category):undefined,
        matchedStockItemId:value?.matchedStockItemId?String(value.matchedStockItemId):undefined,
        lengthMeters:Number(value?.lengthMeters)>0?Number(value.lengthMeters):undefined,
        channelAssignment:value?.channelAssignment?String(value.channelAssignment):undefined
      }))
      const merged=[...baseline.suggestions]
      for(const suggestion of suggestions){
        if(!merged.some(item=>item.name.toLowerCase()===suggestion.name.toLowerCase()&&item.reason===suggestion.reason))merged.push(suggestion)
      }
      await persist({installation:{...preparedInstallation,suggestions:merged,aiSummary:String(data?.summary??'Analyse IA terminée.'),analyzedAt:now(),analysisMode:'ai'}})
      toast('Analyse IA terminée.')
    }catch(error){
      const links=enrichInstallationLinks(program,stock)
      const fallbackProgram={...program,installation:{...installation,links}}
      const fallback=localInstallationAnalysis(fallbackProgram,stock)
      await persist({installation:{...installation,links,suggestions:fallback.suggestions,aiSummary:'IA distante indisponible · '+fallback.summary,analyzedAt:now(),analysisMode:'local'}})
      toast('IA distante indisponible : analyse locale utilisée.')
    }finally{setAiAnalyzing(false)}
  }
  const addInstallationSuggestion=async(suggestion:InstallationSuggestion)=>{
    if(!program)return
    const matched=suggestion.matchedStockItemId?stock.find(item=>item.id===suggestion.matchedStockItemId):undefined
    const source=(matched&&normalizeProvider(matched.provider)===installationProvider)
      ?matched
      :stock.find(item=>normalizeProvider(item.provider)===installationProvider&&item.name.trim().toLowerCase()===suggestion.name.trim().toLowerCase())
    if(source){
      let next=[...items]
      const existing=next.find(item=>item.stockItemId===source.id)
      if(existing)next=next.map(item=>item.id===existing.id?{...item,quantity:item.quantity+suggestion.quantity,returned:false}:item)
      else next.push({id:crypto.randomUUID(),name:source.name,category:source.category,quantity:suggestion.quantity,stockItemId:source.id,loaded:false,returned:false})
      await persist({items:next})
      toast(suggestion.name+' ajouté depuis le stock.')
      return
    }
    const category=suggestion.category??(suggestion.kind==='accessory'?'accessoire':suggestion.kind==='power'?'prise':suggestion.kind==='cable'?'cable':suggestion.kind==='adapter'?'adaptateur':'instrument')
    const existing=items.find(item=>!item.stockItemId&&item.category===category&&item.name.trim().toLowerCase()===suggestion.name.trim().toLowerCase())
    const next=existing
      ?items.map(item=>item.id===existing.id?{...item,quantity:item.quantity+suggestion.quantity}:item)
      :[...items,{id:crypto.randomUUID(),name:suggestion.name,category,quantity:suggestion.quantity,loaded:false,returned:false}]
    await persist({items:next})
    toast(suggestion.name+' ajouté au programme.')
  }

  if(!program)return <section className="panel inventory-empty"><span>Chargement du programme…</span></section>

  return <div className={'inventory-program-page view-'+programView}>
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
        <button className={'secondary mobile-icon-action '+(overviewOpen?'active':'')} aria-label="Voir" title="Voir" onClick={()=>setOverviewOpen(value=>!value)}><Eye/><span>{overviewOpen?'Fermer la vue':'Voir'}</span></button>
        <button className={'secondary mobile-icon-action '+(program.isPublic?'active':'')} aria-label={program.isPublic?'Rendre personnel':'Rendre public'} title={program.isPublic?'Rendre personnel':'Rendre public'} onClick={()=>void persist({isPublic:!program.isPublic}).then(()=>toast(program.isPublic?'Inventaire repassé en mode personnel.':'Inventaire rendu public.'))}><Globe2/><span>{program.isPublic?'Public':'Rendre public'}</span></button>
        <button className="secondary mobile-icon-action" aria-label="Partager" title="Partager" onClick={onShare}><Share2/><span>Partager</span></button>
        <button className="secondary mobile-icon-action" aria-label="Exporter" title="Exporter" disabled={exporting} onClick={()=>{
          setExporting(true)
          void exportTechnicalSheetImage(program,stock).then(()=>toast('Fiche technique exportée en image.')).catch(error=>toast(error instanceof Error?error.message:'Export impossible.')).finally(()=>setExporting(false))
        }}><ImageDown/><span>{exporting?'Export…':'Exporter'}</span></button>
        <button className="bare-action danger-icon" aria-label="Supprimer le programme" onClick={()=>setConfirmDelete(true)}><Trash2/></button>
      </div>
    </section>
    <div className="program-section-tabs panel">
      <button className={programView==='materials'?'active':''} onClick={()=>setProgramView('materials')}><Boxes/><span>Matériels</span></button>
      <button className={programView==='installation'?'active':''} onClick={()=>{setProgramView('installation');setInstallationOpen(true)}}><Network/><span>Installation avancée</span></button>
    </div>

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

    <section className="panel installation-advanced-panel">
      <button className="collapsible-program-head" onClick={()=>setInstallationOpen(value=>!value)}>
        <span><b>Installation avancée</b><small>Schéma des équipements, liaisons et proposition automatique des matériels nécessaires.</small></span>
        <span className="installation-mode-badges"><em>{online?<><Wifi/>En ligne</>:<><WifiOff/>Hors ligne</>}</em>{installation.analysisMode&&<em>{installation.analysisMode==='ai'?'IA':'Local'}</em>}{installationOpen?<ChevronUp/>:<ChevronDown/>}</span>
      </button>
      {installationOpen&&<div className="installation-advanced-body">
        <div className="installation-builder">
          <div className="installation-builder-head"><Network/><span><b>1. Équipements</b><small>Ajoutez les éléments de l’installation depuis le stock ou librement.</small></span></div>
          <div className="installation-template-bar">
            <span><b>Modèles rapides</b><small>Insérez une chaîne puis adaptez-la à votre installation.</small></span>
            <div><button className="secondary" onClick={()=>addInstallationTemplate('piano')}>Piano</button><button className="secondary" onClick={()=>addInstallationTemplate('drums')}>Batterie</button><button className="secondary" onClick={()=>addInstallationTemplate('mr18')}>MR18 + réseau</button></div>
          </div>
          <div className="installation-node-add">
            <select className="installation-provider-select" value={installationProvider} onChange={e=>{setInstallationProvider(e.target.value);setInstallationStockId('')}}>{stockProviders.map(provider=><option key={provider} value={provider}>{provider}</option>)}</select>
            <select value={installationStockId} onChange={e=>{setInstallationStockId(e.target.value);if(e.target.value)setInstallationNodeName('')}}>
              <option value="">Matériel du stock…</option>
              {stock.filter(item=>item.quantity>0&&!item.deletedAt&&normalizeProvider(item.provider)===installationProvider).map(item=><option value={item.id} key={item.id}>{item.name} · {normalizeProvider(item.provider)}</option>)}
            </select>
            <input value={installationNodeName} onChange={e=>{setInstallationNodeName(e.target.value);if(e.target.value)setInstallationStockId('')}} placeholder="Ou équipement libre…"/>
            <button className="primary" disabled={!installationStockId&&!installationNodeName.trim()} onClick={addInstallationNode}><Plus/>Ajouter</button>
          </div>
          <div className="installation-canvas installation-schematic">
            {installation.nodes.length&&<svg className="installation-wire-layer" aria-hidden="true">{installation.links.map(link=>{const from=installation.nodes.find(n=>n.id===link.fromNodeId),to=installation.nodes.find(n=>n.id===link.toNodeId);if(!from||!to)return null;const fi=installation.nodes.indexOf(from),ti=installation.nodes.indexOf(to);const fx=(from.x??40+(fi%4)*210)+90,fy=(from.y??40+Math.floor(fi/4)*150)+54,tx=(to.x??40+(ti%4)*210)+90,ty=(to.y??40+Math.floor(ti/4)*150)+54;const kind=link.kind??installationLinkKind(link,program,stock);return <line key={link.id} className={'wire-'+kind} x1={fx} y1={fy} x2={tx} y2={ty}/>})}</svg>}
            {installation.nodes.length?installation.nodes.map((node,index)=>{
              const source=node.stockItemId?stock.find(item=>item.id===node.stockItemId):undefined
              const x=node.x??40+(index%4)*210,y=node.y??40+Math.floor(index/4)*150
              return <div className={'installation-node draggable role-'+(node.role??'processing')} key={node.id} style={{left:x,top:y}} onPointerDown={e=>{if((e.target as HTMLElement).closest('button,input,select'))return;e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(!e.currentTarget.hasPointerCapture(e.pointerId))return;const rect=e.currentTarget.parentElement?.getBoundingClientRect();if(rect)setInstallationNodePosition(node.id,e.clientX-rect.left-90,e.clientY-rect.top-28,false)}} onPointerUp={e=>{const rect=e.currentTarget.parentElement?.getBoundingClientRect();if(rect)setInstallationNodePosition(node.id,e.clientX-rect.left-90,e.clientY-rect.top-28,true);try{e.currentTarget.releasePointerCapture(e.pointerId)}catch{}}}>
                <span className="installation-node-index">{index+1}</span>
                <input className="installation-node-name" value={node.name} onChange={e=>updateInstallationNode(node.id,{name:e.target.value})}/>
                <select className="installation-node-zone" value={node.zone??'Scène'} onChange={e=>updateInstallationNode(node.id,{zone:e.target.value})}><option>Scène</option><option>Scène gauche</option><option>Scène droite</option><option>Centre</option><option>Régie</option><option>Public</option><option>Backstage</option></select>
                <small>{source?normalizeProvider(source.provider)+' · '+categoryLabel(source.category,categories):'Équipement libre'}</small>
                {source&&((source.ports?.length??0)>0||source.characteristics?.length)&&<div className="installation-node-tech">
                  {(source.ports??[]).slice(0,5).map(port=><em key={port.id}>{port.count}× {port.connector} · {port.direction==='input'?'IN':port.direction==='output'?'OUT':port.direction==='power'?'POWER':'I/O'}</em>)}
                </div>}
                <button className="bare-action danger-icon" onClick={()=>removeInstallationNode(node.id)}><Trash2/></button>
              </div>
            }):<div className="installation-empty">Ajoutez les équipements de la scène ou de la chaîne audio.</div>}
          </div>
        </div>

        <div className="installation-builder">
          <div className="installation-builder-head"><Link2/><span><b>2. Liaisons</b><small>Reliez une sortie vers une entrée. Les connectiques renseignées sont utilisées automatiquement.</small></span></div>
          <div className="installation-link-add">
            <select value={linkFromNode} onChange={e=>{setLinkFromNode(e.target.value);setLinkFromPort('')}}><option value="">Depuis…</option>{installation.nodes.map(node=><option value={node.id} key={node.id}>{node.name}</option>)}</select>
            <select value={linkFromPort} onChange={e=>setLinkFromPort(e.target.value)} disabled={!linkFromNode}><option value="">Sortie auto</option>{(stockByNode(linkFromNode)?.ports??[]).filter(port=>port.direction==='output'||port.direction==='bidirectional').map(port=><option value={port.id} key={port.id}>{port.label||'Sortie'} · {port.connector} ×{port.count}</option>)}</select>
            <span className="installation-arrow">→</span>
            <select value={linkToNode} onChange={e=>{setLinkToNode(e.target.value);setLinkToPort('')}}><option value="">Vers…</option>{installation.nodes.map(node=><option value={node.id} key={node.id}>{node.name}</option>)}</select>
            <select value={linkToPort} onChange={e=>setLinkToPort(e.target.value)} disabled={!linkToNode}><option value="">Entrée auto</option>{(stockByNode(linkToNode)?.ports??[]).filter(port=>port.direction==='input'||port.direction==='bidirectional').map(port=><option value={port.id} key={port.id}>{port.label||'Entrée'} · {port.connector} ×{port.count}</option>)}</select>
            <label className="installation-length-field"><input type="number" min="0" step="0.5" inputMode="decimal" value={linkLengthMeters} onChange={e=>setLinkLengthMeters(e.target.value)} placeholder="Distance"/><span>m</span></label>
            <button className="primary" disabled={!linkFromNode||!linkToNode||linkFromNode===linkToNode} onClick={addInstallationLink}><Plus/>Relier</button>
          </div>
          <div className="installation-link-list">
            {installation.links.length?installation.links.map((link,index)=>{
              const from=installation.nodes.find(node=>node.id===link.fromNodeId)
              const to=installation.nodes.find(node=>node.id===link.toNodeId)
              const fromPort=(stockByNode(link.fromNodeId)?.ports??[]).find(port=>port.id===link.fromPort)
              const toPort=(stockByNode(link.toNodeId)?.ports??[]).find(port=>port.id===link.toPort)
              const kind=link.kind??installationLinkKind(link,program,stock)
              return <div className={'installation-link-row detailed compatibility-'+(link.compatibility??'ok')+' link-kind-'+kind} key={link.id}>
                <span>{index+1}</span>
                <div className="link-endpoint"><b>{from?.name??'?'}</b><small>{fromPort?.connector??'auto'}{fromPort?.signalLevel?' · '+fromPort.signalLevel:''}</small></div>
                <em>→</em>
                <div className="link-endpoint"><b>{to?.name??'?'}</b><small>{toPort?.connector??'auto'}{toPort?.signalLevel?' · '+toPort.signalLevel:''}</small></div>
                <label className="link-length-edit"><input type="number" min="0" step="0.5" value={link.lengthMeters??''} onChange={e=>updateInstallationLink(link.id,{lengthMeters:Number(e.target.value)>0?Number(e.target.value):undefined})}/><span>m</span></label>
                <span className="link-channel">{kind==='power'?'Alimentation':kind==='network'?'Réseau':kind==='midi'?'MIDI':kind==='data'?'Données':kind==='accessory'?'Accessoire':kind==='audio'?'Audio':'Liaison'} · {link.assignedChannel||'canal auto'}</span>
                <span className={'link-compat-badge '+(link.compatibility??'ok')}>{link.compatibility==='di'?'DI':link.compatibility==='phantom'?'48V':link.compatibility==='adapter'?'Adapt.':link.compatibility==='warning'?'À vérifier':'OK'}</span>
                <button className="bare-action danger-icon" onClick={()=>removeInstallationLink(link.id)}><Trash2/></button>
                {(link.compatibilityNotes?.length??0)>0&&<div className="link-compat-notes">{link.compatibilityNotes?.map((note,n)=><small key={n}>{note}</small>)}</div>}
              </div>
            }):<div className="installation-empty">Aucune liaison définie.</div>}
          </div>
        </div>

        <div className="installation-analysis">
          <div className="installation-analysis-head">
            <span><b>3. Analyse et proposition</b><small>L’analyse locale utilise les connectiques. L’IA en ligne peut aussi interpréter la chaîne complète et les besoins annexes.</small></span>
            <div>
              <button className="secondary" onClick={autoAssignChannels}><Network/>Affecter canaux</button>
              <button className="secondary" onClick={()=>void runLocalInstallationAnalysis()}><Settings2/>Analyse locale</button>
              <button className="primary" disabled={!online||aiAnalyzing} onClick={()=>void runAIInstallationAnalysis()}><BrainCircuit/>{aiAnalyzing?'Analyse…':'Analyse IA'}</button>
            </div>
          </div>
          {installation.aiSummary&&<div className={'installation-summary '+(installation.analysisMode==='ai'?'ai':'local')}><BrainCircuit/><span>{installation.aiSummary}</span></div>}
          <div className="installation-suggestions">
            {(installation.suggestions??[]).length?(installation.suggestions??[]).map(suggestion=><div className={'installation-suggestion kind-'+suggestion.kind} key={suggestion.id}>
              <span><b>{suggestion.name}</b><small>{suggestion.reason}</small>{(suggestion.lengthMeters||suggestion.channelAssignment)&&<small className="suggestion-tech-meta">{suggestion.lengthMeters?suggestion.lengthMeters+' m':''}{suggestion.lengthMeters&&suggestion.channelAssignment?' · ':''}{suggestion.channelAssignment??''}</small>}</span>
              <em>× {suggestion.quantity}</em>
              {suggestion.matchedStockItemId&&<small className="suggestion-stock">Stockage : {installationProvider}</small>}
              {suggestion.kind!=='warning'&&<button className="secondary" onClick={()=>void addInstallationSuggestion(suggestion)}><Plus/>Ajouter</button>}
            </div>):<div className="installation-empty">Lancez une analyse après avoir défini les liaisons.</div>}
          </div>
        </div>
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
        {categoryOrder.map(category=>{
          const group=stock.filter(item=>normalizeProvider(item.provider)===stockProvider&&item.category===category&&effectiveStockQuantity(item,program,programs)>0)
          return <CategorySection category={category} label={categoryLabel(category,categories)} key={category} open={stockPickerCategories[category]??false} onToggle={()=>setStockPickerCategories(v=>({...v,[category]:!v[category]}))} count={group.length}>
            {group.length?group.map(item=>{
              const planned=items.find(p=>p.stockItemId===item.id)?.quantity??0
              const available=effectiveStockQuantity(item,program,programs)
              return <button className="stock-pick-row" key={item.id} onClick={()=>void addFromStock(item)}>
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
        <select value={customCategory} onChange={e=>setCustomCategory(e.target.value as InventoryCategory)}>{categoryOrder.map(category=><option value={category} key={category}>{categoryLabel(category,categories)}</option>)}</select>
        <input value={customName} onChange={e=>setCustomName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addCustom()}} placeholder="Ajouter un matériel…"/>
        <button className="primary" disabled={!customName.trim()} onClick={addCustom}><Plus/>Ajouter</button>
      </div>

      <div className="inventory-category-stack planned-material-list">
        {categoryOrder.map(category=>{
          const baseGroup=items.filter(item=>normalizeCategory(item.category,item.name)===category)
          const group=missingOnly?baseGroup.filter(item=>item.quantity>0&&missingItems.some(missing=>missing.id===item.id)):baseGroup
          return <CategorySection category={category} label={categoryLabel(category,categories)} key={category} open={openCategories[category]??true} onToggle={()=>setOpenCategories(value=>({...value,[category]:!value[category]}))} count={group.length}>
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
                <button className="bare-action danger-icon compact-delete" aria-label={'Supprimer '+item.name} onClick={()=>void removeItem(item.id)}><Trash2/></button>
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
        {selectedItems.length?selectedItems.map(item=><div key={item.id}><span><em>{categoryLabel(item.category,categories)}</em>{item.name}{stockFor(item)&&<small>{normalizeProvider(stockFor(item)?.provider)}</small>}</span><b>× {item.quantity}</b></div>):<span className="muted-copy">Aucune quantité renseignée.</span>}
      </div>}
    </section>

    {confirmDelete&&<div className="inventory-confirm-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setConfirmDelete(false)}}>
      <div className="inventory-confirm panel"><button className="bare-action inventory-confirm-close" onClick={()=>setConfirmDelete(false)}><X/></button><h3>Supprimer ce programme ?</h3><p>Le programme sera retiré de la liste Inventaire.</p><div className="modal-actions"><button className="secondary" onClick={()=>setConfirmDelete(false)}>Annuler</button><button className="danger" onClick={()=>void removeProgram()}><Trash2/>Supprimer</button></div></div>
    </div>}
  </div>
}
function CATALOG_FLAT():{name:string;category:InventoryCategory}[]{
  return DEFAULT_CATEGORY_ORDER.flatMap(category=>(DEFAULT_CATALOG[category]??[]).map(name=>({name,category})))
}

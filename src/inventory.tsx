import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { toPng } from 'html-to-image'
import {
  AlertTriangle, Archive, Boxes, BrainCircuit, CalendarDays, Check, ChevronDown, ChevronRight, ChevronUp,
  ClipboardCheck, Eye, EyeOff, History, ImageDown, LayoutGrid, Link2, Minus, Network, PackageCheck, PackagePlus,
  PackageSearch, Plus, Repeat2, RotateCcw, Save, Settings2, Trash2, Wifi, WifiOff, X, Globe2, Share2, Zap, Copy,
  Search, List, Table2, Grid3X3, MapPin, CheckSquare
} from 'lucide-react'
import { db, logActivity } from './db'
import { StageEditor } from './stage/StageEditor'
import { InventoryExportDialog } from './inventory-export'
import { InventoryStructuredFields } from './inventory-structured'
import './inventory-workspace.css'
import { stockNeeds } from './stage/model'
import { analyzeInventoryInstallationWithAI } from './cloud'
import type {
  ActivityEntry, InstallationLink, InstallationNode, InstallationSuggestion, InventoryCategory, InventoryCharacteristic, InventoryChecklistState, InventoryFrequency,
  InventoryKit, InventoryMaterial, InventoryPhantomMode, InventoryPort, InventoryPortDirection,
  InventoryProgram, InventorySignalLevel, InventoryStockItem, InventoryStockStatus, InventoryTechnicalIcon
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
const BUILTIN_SCHEMA_LAYER_ORDER=['materials','audio','power','connectivity','accessories'] as const
const BUILTIN_SCHEMA_LAYER_LABELS:Record<string,string>={
  materials:'Matos',
  audio:'Câblage',
  power:'Électricité',
  connectivity:'Connectique',
  accessories:'Accessoires'
}

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
    status:item.status??'available',
    trackUnits:item.trackUnits??false,
    units:item.units??[]
  }
}

function stockStatusCount(item:InventoryStockItem,status:InventoryStockStatus):number{
  if(!item.trackUnits)return (item.status??'available')===status?item.quantity:0
  const activeUnits=(item.units??[]).slice(0,item.quantity)
  const tracked=activeUnits.filter(unit=>(unit.status??'available')===status).length
  const missing=Math.max(0,item.quantity-activeUnits.length)
  return tracked+((item.status??'available')===status?missing:0)
}

function stockAvailableCount(item:InventoryStockItem):number{
  return stockStatusCount(item,'available')
}


const TECH_ICON_OPTIONS:Array<{value:InventoryTechnicalIcon;label:string}>=[
  {value:'auto',label:'Auto'},
  {value:'guitar',label:'Guitare'},{value:'acoustic-guitar',label:'Guitare acoustique'},{value:'electric-guitar',label:'Guitare électrique'},{value:'bass',label:'Basse'},{value:'ukulele',label:'Ukulélé'},
  {value:'keyboard',label:'Piano / clavier'},{value:'drums',label:'Batterie'},{value:'saxophone',label:'Saxophone'},{value:'trumpet',label:'Trompette'},{value:'flute',label:'Flûte'},{value:'violin',label:'Violon'},{value:'cello',label:'Violoncelle'},
  {value:'microphone',label:'Micro'},{value:'mixer',label:'Table / console'},{value:'speaker',label:'Baffle / enceinte'},{value:'amplifier',label:'Ampli'},{value:'pedal',label:'Pédale / footswitch'},
  {value:'headphones',label:'Casque'},{value:'inear',label:'In-ear'},{value:'stand',label:'Pied'},{value:'tripod',label:'Trépied'},{value:'musicstand',label:'Pupitre'},
  {value:'dibox',label:'DI Box'},{value:'patchbay',label:'Patchbay'},{value:'stagebox',label:'Stagebox'},{value:'rack',label:'Rack'},{value:'case',label:'Flight case'},
  {value:'laptop',label:'Ordinateur portable'},{value:'tablet',label:'Tablette'},{value:'phone',label:'Téléphone'},{value:'camera',label:'Caméra'},{value:'projector',label:'Projecteur'},
  {value:'jack',label:'Jack 6,35'},{value:'trs',label:'Jack TRS'},{value:'ts',label:'Jack TS'},{value:'minijack',label:'Mini-jack 3,5'},{value:'xlr',label:'XLR'},{value:'rca',label:'RCA'},{value:'speakon',label:'Speakon'},
  {value:'rj45',label:'RJ45'},{value:'usb',label:'USB-A'},{value:'usbc',label:'USB-C'},{value:'hdmi',label:'HDMI'},{value:'optical',label:'Optique / Toslink'},{value:'lightning',label:'Lightning'},{value:'midi',label:'MIDI'},
  {value:'power',label:'Alimentation'},{value:'powerstrip',label:'Multiprise'},{value:'ups',label:'Onduleur'},{value:'charger',label:'Chargeur'},{value:'battery',label:'Batterie / pile'},
  {value:'cable',label:'Câble'},{value:'adapter',label:'Adaptateur'},{value:'network',label:'Réseau'},{value:'router',label:'Routeur'},{value:'switch',label:'Switch réseau'},{value:'wifi',label:'Wi-Fi'},{value:'bluetooth',label:'Bluetooth'},
  {value:'sdcard',label:'Carte SD'},{value:'harddrive',label:'Disque / SSD'},{value:'generic',label:'Générique'}
]

function technicalIconFromText(text:string):InventoryTechnicalIcon{
  const value=text.toLowerCase()
  if(/mini.?jack|3[,.]5/.test(value))return 'minijack'
  if(/speakon/.test(value))return 'speakon'
  if(/\btrs\b/.test(value))return 'trs'
  if(/\bts\b/.test(value))return 'ts'
  if(/usb.?c|type.?c/.test(value))return 'usbc'
  if(/hdmi/.test(value))return 'hdmi'
  if(/toslink|optique|optical/.test(value))return 'optical'
  if(/lightning/.test(value))return 'lightning'
  if(/xlr/.test(value))return 'xlr'
  if(/\brca\b/.test(value))return 'rca'
  if(/rj45|ethernet/.test(value))return 'rj45'
  if(/\busb\b/.test(value))return 'usb'
  if(/\bmidi\b/.test(value))return 'midi'
  if(/jack|6[,.]35/.test(value))return 'jack'
  if(/guitare basse|\bbasse\b/.test(value))return 'bass'
  if(/guitare électrique|guitare electrique|electric guitar/.test(value))return 'electric-guitar'
  if(/guitare acoustique|acoustic guitar/.test(value))return 'acoustic-guitar'
  if(/ukul[eé]l[eé]/.test(value))return 'ukulele'
  if(/guitare/.test(value))return 'guitar'
  if(/sax/.test(value))return 'saxophone'
  if(/trompette|trumpet/.test(value))return 'trumpet'
  if(/fl[uû]te|flute/.test(value))return 'flute'
  if(/violoncelle|cello/.test(value))return 'cello'
  if(/violon|violin/.test(value))return 'violin'
  if(/piano|clavier|keyboard|synth/.test(value))return 'keyboard'
  if(/batterie|drum|caisse|tom|cymbal/.test(value))return 'drums'
  if(/micro|mic\b/.test(value))return 'microphone'
  if(/di box|dibox|direct box/.test(value))return 'dibox'
  if(/stagebox|stage box/.test(value))return 'stagebox'
  if(/patchbay|patch bay/.test(value))return 'patchbay'
  if(/table de mix|console|mixer|mr18|xr18/.test(value))return 'mixer'
  if(/ampli|amplifier/.test(value))return 'amplifier'
  if(/baffle|enceinte|speaker|retour|monitor/.test(value))return 'speaker'
  if(/casque|headphone/.test(value))return 'headphones'
  if(/in.?ear|iem/.test(value))return 'inear'
  if(/pupitre|music stand/.test(value))return 'musicstand'
  if(/tr[eé]pied|tripod/.test(value))return 'tripod'
  if(/pied|stand/.test(value))return 'stand'
  if(/p[eé]dale|footswitch|pedal/.test(value))return 'pedal'
  if(/prise|alimentation|alim|secteur|onduleur|multiprise|iec/.test(value))return 'power'
  if(/routeur|répéteur|repeteur|wifi|réseau|network/.test(value))return 'network'
  if(/adaptateur|adapter|convertisseur/.test(value))return 'adapter'
  if(/câble|cable|speakon/.test(value))return 'cable'
  return 'generic'
}

function resolvedTechnicalIcon(icon:InventoryTechnicalIcon|undefined,text:string):InventoryTechnicalIcon{
  return !icon||icon==='auto'?technicalIconFromText(text):icon
}

function TechnicalIconPicker({value,text='',onChange,compact=false}:{value?:InventoryTechnicalIcon;text?:string;onChange:(value:InventoryTechnicalIcon)=>void;compact?:boolean}){
  const selected=value??'auto'
  const selectedOption=TECH_ICON_OPTIONS.find(option=>option.value===selected)??TECH_ICON_OPTIONS[0]
  return <details className={'technical-icon-picker '+(compact?'compact':'')}>
    <summary title="Choisir une icône">
      <span className="technical-icon-picker-current"><TechnicalIcon icon={selected} text={text}/></span>
      <span className="technical-icon-picker-current-label"><b>{selectedOption.label}</b>{selected==='auto'&&<small>Détection automatique</small>}</span>
      <ChevronDown/>
    </summary>
    <div className="technical-icon-picker-popover">
      <div className="technical-icon-picker-title"><b>Choisir une icône</b><small>{TECH_ICON_OPTIONS.length} représentations disponibles</small></div>
      <div className="technical-icon-picker-grid">
        {TECH_ICON_OPTIONS.map(option=><button type="button" key={option.value} className={selected===option.value?'active':''} onClick={event=>{
          onChange(option.value)
          event.currentTarget.closest('details')?.removeAttribute('open')
        }}>
          <span><TechnicalIcon icon={option.value} text={text}/></span>
          <small>{option.label}</small>
          {selected===option.value&&<Check/>}
        </button>)}
      </div>
    </div>
  </details>
}

function TechnicalIcon({icon,text='',className=''}:{icon?:InventoryTechnicalIcon;text?:string;className?:string}){
  const kind=resolvedTechnicalIcon(icon,text)
  const common={viewBox:'0 0 32 32',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,'aria-hidden':true}
  if(kind==='guitar'||kind==='bass')return <svg {...common} className={'technical-icon '+className}><path d="M13 18c-2.5-3.4-6.7-2.9-8.3-.2-1.7 2.8.2 6.5 3.4 6.7 2.4.2 3.8-1.6 5.2-3l2.2 2.2c1.7 1.7 4.4-.8 2.6-2.6l-2.2-2.2 7.8-7.8"/><path d="M22.5 7.5 27 3l2 2-4.5 4.5M19.7 10.3l4 4"/><circle cx="9.2" cy="20.4" r="1.7"/></svg>
  if(kind==='keyboard')return <svg {...common} className={'technical-icon '+className}><rect x="3" y="7" width="26" height="18" rx="2"/><path d="M7 11v10M11 11v10M15 11v10M19 11v10M23 11v10M27 11v10"/><path d="M9 11v5M13 11v5M21 11v5M25 11v5" strokeWidth="3"/></svg>
  if(kind==='drums')return <svg {...common} className={'technical-icon '+className}><ellipse cx="16" cy="18" rx="7" ry="6"/><circle cx="8" cy="10" r="4"/><circle cx="24" cy="10" r="4"/><path d="M6 24 4 29M26 24l2 5M16 12V5M11 5h10"/></svg>
  if(kind==='microphone')return <svg {...common} className={'technical-icon '+className}><rect x="11" y="3" width="10" height="17" rx="5"/><path d="M7 14a9 9 0 0 0 18 0M16 23v6M11 29h10"/></svg>
  if(kind==='mixer')return <svg {...common} className={'technical-icon '+className}><rect x="3" y="4" width="26" height="24" rx="2"/><path d="M8 8v16M13 8v16M18 8v16M23 8v16"/><circle cx="8" cy="13" r="1.5"/><circle cx="13" cy="19" r="1.5"/><circle cx="18" cy="11" r="1.5"/><circle cx="23" cy="16" r="1.5"/></svg>
  if(kind==='speaker')return <svg {...common} className={'technical-icon '+className}><rect x="7" y="3" width="18" height="26" rx="2"/><circle cx="16" cy="19" r="6"/><circle cx="16" cy="9" r="2"/></svg>
  if(kind==='xlr')return <svg {...common} className={'technical-icon '+className}><circle cx="16" cy="16" r="11"/><circle cx="16" cy="10" r="1.5" fill="currentColor"/><circle cx="11" cy="18" r="1.5" fill="currentColor"/><circle cx="21" cy="18" r="1.5" fill="currentColor"/></svg>
  if(kind==='rca')return <svg {...common} className={'technical-icon '+className}><circle cx="16" cy="16" r="10"/><circle cx="16" cy="16" r="4"/><path d="M3 16h5M24 16h5"/></svg>
  if(kind==='rj45')return <svg {...common} className={'technical-icon '+className}><path d="M6 9h20v15H6zM10 9V5h12v4"/><path d="M9 14h2M13 14h2M17 14h2M21 14h2M10 19h12"/></svg>
  if(kind==='usb')return <svg {...common} className={'technical-icon '+className}><path d="M16 28V6M16 6l-4 4M16 6l4 4M16 17l-6-4M10 13H6M16 21l6-4M22 17h4"/><circle cx="6" cy="13" r="2"/><rect x="24" y="15" width="4" height="4" rx="1"/></svg>
  if(kind==='midi')return <svg {...common} className={'technical-icon '+className}><circle cx="16" cy="16" r="11"/><circle cx="10" cy="13" r="1.2" fill="currentColor"/><circle cx="16" cy="10" r="1.2" fill="currentColor"/><circle cx="22" cy="13" r="1.2" fill="currentColor"/><circle cx="12" cy="20" r="1.2" fill="currentColor"/><circle cx="20" cy="20" r="1.2" fill="currentColor"/></svg>
  if(kind==='jack'||kind==='minijack')return <svg {...common} className={'technical-icon '+className}><path d="M5 19h14l6-6V8h4v8l-7 7H5z"/><path d="M9 19v4M13 19v4"/>{kind==='minijack'&&<path d="M23 10h6"/>}</svg>
  if(kind==='power')return <svg {...common} className={'technical-icon '+className}><path d="M13 3v11M19 3v11M10 12h12v4a6 6 0 0 1-6 6v7M11 29h10"/></svg>
  if(kind==='network')return <svg {...common} className={'technical-icon '+className}><circle cx="16" cy="16" r="3"/><circle cx="6" cy="7" r="2"/><circle cx="26" cy="7" r="2"/><circle cx="6" cy="25" r="2"/><circle cx="26" cy="25" r="2"/><path d="M14 14 8 9M18 14l6-5M14 18l-6 5M18 18l6 5"/></svg>
  if(kind==='adapter')return <svg {...common} className={'technical-icon '+className}><path d="M4 10h9l3 3 3-3h9M4 22h9l3-3 3 3h9"/><path d="M7 7v6M25 7v6M7 19v6M25 19v6"/></svg>
  if(kind==='cable')return <svg {...common} className={'technical-icon '+className}><path d="M4 8h7v5H8v5a6 6 0 0 0 12 0v-4h-3l5-6 5 6h-3v4a10 10 0 0 1-20 0v-5H4z"/></svg>
  if(kind==='saxophone')return <svg {...common} className={'technical-icon '+className}><path d="M20 4c-2 5-4 8-3 13 1 4 5 7 9 5 2-1 3-4 1-6-2-2-4 0-4 2"/><path d="M17 7h5M16 11h5M16 15h4M14 22c-3 3-7 4-10 1"/></svg>
  if(kind==='trumpet')return <svg {...common} className={'technical-icon '+className}><path d="M3 14h14l8-5v14l-8-5H3z"/><path d="M9 10v4M12 10v4M15 10v4"/></svg>
  if(kind==='flute')return <svg {...common} className={'technical-icon '+className}><path d="M4 18 26 9M7 17l-2-4M25 9l3 2"/><circle cx="11" cy="15" r="1"/><circle cx="16" cy="13" r="1"/><circle cx="21" cy="11" r="1"/></svg>
  if(kind==='violin'||kind==='cello')return <svg {...common} className={'technical-icon '+className}><path d="M16 4v7c-5 1-7 4-5 7-2 3 0 7 5 8 5-1 7-5 5-8 2-3 0-6-5-7"/><path d="M13 15h6M16 26v4"/>{kind==='cello'&&<path d="M16 30v2"/>}</svg>
  if(kind==='amplifier')return <svg {...common} className={'technical-icon '+className}><rect x="4" y="5" width="24" height="22" rx="2"/><circle cx="11" cy="17" r="5"/><circle cx="22" cy="17" r="3"/><path d="M8 9h2M13 9h2M18 9h2M23 9h2"/></svg>
  if(kind==='pedal')return <svg {...common} className={'technical-icon '+className}><path d="M8 5h16l3 22H5z"/><circle cx="16" cy="20" r="4"/><path d="M11 10h10"/></svg>
  if(kind==='headphones'||kind==='inear')return <svg {...common} className={'technical-icon '+className}><path d="M6 17v-3a10 10 0 0 1 20 0v3"/><rect x="4" y="16" width="6" height="10" rx="3"/><rect x="22" y="16" width="6" height="10" rx="3"/>{kind==='inear'&&<path d="M10 21c4 0 3 7 6 7s2-7 6-7"/>}</svg>
  if(kind==='stand'||kind==='tripod'||kind==='musicstand')return <svg {...common} className={'technical-icon '+className}><path d="M16 5v18M16 23 8 30M16 23l8 7"/>{kind==='tripod'&&<path d="M16 23v7"/>}{kind==='musicstand'&&<path d="M8 5h16l-2 10H10z"/>}</svg>
  if(kind==='dibox')return <svg {...common} className={'technical-icon '+className}><rect x="5" y="8" width="22" height="16" rx="3"/><path d="M9 16h5M18 12h5M18 16h5M18 20h5"/><circle cx="11" cy="16" r="2"/></svg>
  if(kind==='patchbay'||kind==='stagebox')return <svg {...common} className={'technical-icon '+className}><rect x="3" y="7" width="26" height="18" rx="2"/><circle cx="8" cy="12" r="1.5"/><circle cx="14" cy="12" r="1.5"/><circle cx="20" cy="12" r="1.5"/><circle cx="26" cy="12" r="1.5"/><circle cx="8" cy="20" r="1.5"/><circle cx="14" cy="20" r="1.5"/><circle cx="20" cy="20" r="1.5"/><circle cx="26" cy="20" r="1.5"/></svg>
  if(kind==='rack'||kind==='case')return <svg {...common} className={'technical-icon '+className}><rect x="6" y="3" width="20" height="26" rx="2"/><path d="M9 9h14M9 14h14M9 19h14M9 24h14"/>{kind==='case'&&<path d="M12 3V1h8v2M4 12h2M26 12h2"/>}</svg>
  if(kind==='laptop')return <svg {...common} className={'technical-icon '+className}><rect x="6" y="5" width="20" height="15" rx="2"/><path d="M3 24h26l-3 3H6z"/></svg>
  if(kind==='tablet'||kind==='phone')return <svg {...common} className={'technical-icon '+className}><rect x={kind==='phone'?10:7} y="3" width={kind==='phone'?12:18} height="26" rx="3"/><path d="M14 25h4"/></svg>
  if(kind==='camera')return <svg {...common} className={'technical-icon '+className}><rect x="4" y="9" width="24" height="17" rx="3"/><circle cx="16" cy="17" r="5"/><path d="M10 9l2-4h8l2 4"/></svg>
  if(kind==='projector')return <svg {...common} className={'technical-icon '+className}><rect x="4" y="9" width="24" height="15" rx="3"/><circle cx="21" cy="16" r="4"/><path d="M8 13h5M8 18h5M10 24v4M22 24v4"/></svg>
  if(kind==='speakon')return <svg {...common} className={'technical-icon '+className}><circle cx="16" cy="16" r="11"/><path d="M11 10h6v5h4v7H11z"/><path d="M18 8l4 2-2 4"/></svg>
  if(kind==='trs'||kind==='ts')return <svg {...common} className={'technical-icon '+className}><path d="M4 17h15l6-5V8h4v8l-7 6H4z"/><path d="M9 17v5M14 17v5"/>{kind==='trs'&&<path d="M19 13v8"/>}</svg>
  if(kind==='usbc')return <svg {...common} className={'technical-icon '+className}><rect x="4" y="10" width="24" height="12" rx="6"/><path d="M10 16h12"/></svg>
  if(kind==='hdmi')return <svg {...common} className={'technical-icon '+className}><path d="M5 11h22l-3 12H8z"/><path d="M10 15h12M11 19h10"/></svg>
  if(kind==='optical')return <svg {...common} className={'technical-icon '+className}><rect x="6" y="6" width="20" height="20" rx="3"/><circle cx="16" cy="16" r="5"/><path d="M16 8v3M16 21v3M8 16h3M21 16h3"/></svg>
  if(kind==='lightning')return <svg {...common} className={'technical-icon '+className}><path d="M18 2 8 18h7l-1 12 10-17h-7z"/></svg>
  if(kind==='powerstrip')return <svg {...common} className={'technical-icon '+className}><rect x="4" y="10" width="24" height="12" rx="4"/><circle cx="9" cy="16" r="2"/><circle cx="16" cy="16" r="2"/><circle cx="23" cy="16" r="2"/></svg>
  if(kind==='ups')return <svg {...common} className={'technical-icon '+className}><rect x="7" y="3" width="18" height="26" rx="3"/><path d="M11 8h10v6H11z"/><path d="m17 16-4 6h4l-2 5 5-7h-4z"/></svg>
  if(kind==='charger')return <svg {...common} className={'technical-icon '+className}><rect x="9" y="8" width="14" height="14" rx="3"/><path d="M13 8V3M19 8V3M16 22v7"/><path d="m17 11-4 6h4l-2 4 5-6h-4z"/></svg>
  if(kind==='battery')return <svg {...common} className={'technical-icon '+className}><rect x="5" y="9" width="22" height="14" rx="2"/><path d="M27 13h3v6h-3M10 16h5M12.5 13.5v5"/></svg>
  if(kind==='router'||kind==='switch')return <svg {...common} className={'technical-icon '+className}><rect x="4" y="12" width="24" height="12" rx="3"/><path d="M8 18h2M13 18h2M18 18h2M23 18h2"/>{kind==='router'&&<path d="M9 12V5M23 12V5"/>}</svg>
  if(kind==='wifi')return <svg {...common} className={'technical-icon '+className}><path d="M4 12a18 18 0 0 1 24 0M8 17a12 12 0 0 1 16 0M12 22a6 6 0 0 1 8 0"/><circle cx="16" cy="27" r="1.5" fill="currentColor"/></svg>
  if(kind==='bluetooth')return <svg {...common} className={'technical-icon '+className}><path d="M15 3 24 11l-9 8V3zm0 16 9 8-9 2V19M8 9l16 14M8 23l16-14"/></svg>
  if(kind==='sdcard')return <svg {...common} className={'technical-icon '+className}><path d="M9 3h14l5 5v21H4V8z"/><path d="M10 3v7M14 3v7M18 3v7M22 4v6"/></svg>
  if(kind==='harddrive')return <svg {...common} className={'technical-icon '+className}><rect x="5" y="5" width="22" height="22" rx="3"/><circle cx="16" cy="15" r="6"/><circle cx="16" cy="15" r="1.5"/><path d="m20 19 4 4"/></svg>
  return <svg {...common} className={'technical-icon '+className}><rect x="5" y="5" width="22" height="22" rx="5"/><path d="M10 16h12M16 10v12"/></svg>
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
    items:(program.items??[]).map((item,index)=>{
      const checkState:InventoryChecklistState=item.checkState??(item.returned?'returned':item.loaded?'loaded':'prepare')
      return {
        ...item,
        category:normalizeCategory(item.category,item.name),
        checkState,
        visualGroup:item.visualGroup??'',
        loaded:item.loaded??['loaded','onsite','returned'].includes(checkState),
        returned:item.returned??checkState==='returned',
        listOrder:Number.isFinite(item.listOrder)?item.listOrder:index
      }
    }),
    installation:{
      ...(program.installation??{nodes:[],links:[]}),
      nodes:program.installation?.nodes??[],
      links:program.installation?.links??[],
      suggestions:program.installation?.suggestions??[],
      aiSummary:program.installation?.aiSummary??'',
      analyzedAt:program.installation?.analyzedAt,
      analysisMode:program.installation?.analysisMode,
      snapshots:program.installation?.snapshots??[],
      layers:program.installation?.layers??{materials:true,audio:true,power:true,connectivity:true,accessories:true},
      layerOrder:program.installation?.layerOrder??[...BUILTIN_SCHEMA_LAYER_ORDER],
      customLayers:program.installation?.customLayers??[]
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
  if(a.isTemplate||b.isTemplate)return false
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
  const physicalAvailable=stockItem.trackUnits?stockAvailableCount(stockItem):(statusBlocksAvailability(stockItem.status)?0:stockItem.quantity)
  const reserved=conflictingReservation(stockItem.id,current,programs).quantity
  return Math.max(0,physicalAvailable-reserved)
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
function installationEquipmentType(name:string,category?:string):'keyboard'|'drums'|'mixer'|'speaker'|'microphone'|'power'|'network'|'cable'|'generic'{
  const value=(name+' '+(category??'')).toLowerCase()
  if(/piano|clavier|keyboard|synth/.test(value))return 'keyboard'
  if(/batterie|drum|caisse|tom|cymbal/.test(value))return 'drums'
  if(/table|mix|console|mr18|xr18|mixer/.test(value))return 'mixer'
  if(/baffle|enceinte|speaker|retour|monitor/.test(value))return 'speaker'
  if(/micro|mic\b/.test(value))return 'microphone'
  if(/prise|alim|onduleur|multiprise|power|secteur/.test(value))return 'power'
  if(/routeur|répéteur|repeteur|wifi|rj45|ethernet|switch réseau|network/.test(value))return 'network'
  if(/câble|cable|xlr|jack|rca|speakon|midi/.test(value))return 'cable'
  return 'generic'
}
function svgCablePath(points:Array<{x:number;y:number}>,mode:InstallationLink['routeMode']='straight'):string{
  if(!points.length)return ''
  if(points.length===1)return 'M '+points[0].x+' '+points[0].y
  if(mode!=='curve')return points.map((point,index)=>(index?'L ':'M ')+point.x+' '+point.y).join(' ')
  if(points.length===2)return 'M '+points[0].x+' '+points[0].y+' L '+points[1].x+' '+points[1].y
  let path='M '+points[0].x+' '+points[0].y
  for(let i=1;i<points.length-1;i++){
    const current=points[i],next=points[i+1]
    const mid={x:(current.x+next.x)/2,y:(current.y+next.y)/2}
    path+=' Q '+current.x+' '+current.y+' '+mid.x+' '+mid.y
  }
  const before=points[points.length-2],last=points[points.length-1]
  path+=' Q '+before.x+' '+before.y+' '+last.x+' '+last.y
  return path
}

function schemaLayerForLink(kind:InstallationLink['kind']):string{
  if(kind==='power')return 'power'
  if(kind==='audio')return 'audio'
  if(kind==='accessory')return 'accessories'
  return 'connectivity'
}
function schemaLayerForNode(node:{layerId?:string;role?:string},category?:string):string{
  if(node.layerId)return node.layerId
  if(node.role==='accessory'||category==='accessoire')return 'accessories'
  return 'materials'
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
    if(node.visualOnly||node.kind==='text'||node.kind==='zone'||node.kind==='shape')continue
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


function escapeSvgText(value:string):string{
  return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

async function exportInstallationSchemaImage(
  stage:HTMLElement,
  program:InventoryProgram,
  selectedLayers:string[],
  mode:'combined'|'separate',
  layerNames:Record<string,string>,
  keepMaterialsContext:boolean
):Promise<number>{
  if(!selectedLayers.length)throw new Error('Choisissez au moins une couche à exporter.')
  const safeBase=sanitizeFilename(program.name||'installation').toLowerCase().replace(/\s+/g,'-')
  const stageWidth=Math.max(1,Math.round(stage.getBoundingClientRect().width))
  const stageHeight=Math.max(1,Math.round(stage.getBoundingClientRect().height))
  const pixelRatio=3
  const installation=program.installation??{nodes:[],links:[]}
  const nodeCenter=(node:InstallationNode,index:number)=>{
    const scale=node.scale??1
    const width=node.width??110*scale,height=node.height??84*scale
    const x=node.x??70+(index%4)*180,y=node.y??85+Math.floor(index/4)*135
    return {x:x+width/2,y:y+height/2}
  }
  const layerForLink=(link:InstallationLink)=>{
    if(link.layerId)return link.layerId
    if(link.kind==='power')return 'power'
    if(link.kind==='audio')return 'audio'
    if(link.kind==='accessory')return 'accessories'
    return 'connectivity'
  }
  const cableStyle=(kind:InstallationLink['kind'])=>{
    if(kind==='power')return {stroke:'#d89a24',dash:[10,5]}
    if(kind==='network')return {stroke:'#6b73d6',dash:[8,5]}
    if(kind==='midi')return {stroke:'#9f6bc2',dash:[5,4]}
    if(kind==='data')return {stroke:'#4a84c6',dash:[4,4]}
    if(kind==='accessory')return {stroke:'#7d8b92',dash:[3,5]}
    return {stroke:'#0d93a7',dash:[] as number[]}
  }
  const render=async(layerIds:Set<string>,suffix:string)=>{
    const clone=stage.cloneNode(true) as HTMLElement
    clone.dataset.exporting='true'
    clone.style.position='fixed'
    clone.style.left='-20000px'
    clone.style.top='0'
    clone.style.width=stageWidth+'px'
    clone.style.height=stageHeight+'px'
    clone.style.minWidth=stageWidth+'px'
    clone.style.minHeight=stageHeight+'px'
    clone.style.maxWidth=stageWidth+'px'
    clone.style.maxHeight=stageHeight+'px'
    clone.style.overflow='hidden'
    clone.style.zIndex='-9999'
    clone.querySelectorAll<HTMLElement>('.schema-resize-handle,.schema-rotate-handle,.schema-route-handle,.schema-wire-hit').forEach(el=>el.remove())
    clone.querySelectorAll<HTMLElement>('[data-schema-layer]').forEach(el=>{
      const layer=el.getAttribute('data-schema-layer')
      if(layer&&!layerIds.has(layer)){el.remove();return}
      if(layer&&layerIds.has(layer)){el.style.removeProperty('display');el.removeAttribute('data-layer-hidden')}
    })
    const oldWire=clone.querySelector<SVGSVGElement>('.installation-wire-layer')
    if(oldWire){
      const wireCanvas=document.createElement('canvas')
      wireCanvas.className='installation-wire-layer'
      wireCanvas.width=stageWidth*pixelRatio
      wireCanvas.height=stageHeight*pixelRatio
      wireCanvas.style.position='absolute'
      wireCanvas.style.inset='0'
      wireCanvas.style.width=stageWidth+'px'
      wireCanvas.style.height=stageHeight+'px'
      wireCanvas.style.pointerEvents='none'
      wireCanvas.style.zIndex='1'
      const ctx=wireCanvas.getContext('2d')
      if(ctx){
        ctx.scale(pixelRatio,pixelRatio)
        ctx.lineWidth=3.5
        ctx.lineCap='round'
        ctx.lineJoin='round'
        for(const link of installation.links){
          if(!layerIds.has(layerForLink(link)))continue
          const from=installation.nodes.find(n=>n.id===link.fromNodeId),to=installation.nodes.find(n=>n.id===link.toNodeId)
          if(!from||!to)continue
          const a=nodeCenter(from,installation.nodes.indexOf(from)),b=nodeCenter(to,installation.nodes.indexOf(to))
          const points=[a,...(link.route??[]),b]
          const path=new Path2D(svgCablePath(points,link.routeMode??((link.route?.length??0)>0?'zigzag':'straight')))
          const style=cableStyle(link.kind)
          ctx.strokeStyle=style.stroke
          ctx.setLineDash(style.dash)
          ctx.stroke(path)
        }
      }
      oldWire.replaceWith(wireCanvas)
    }
    document.body.appendChild(clone)
    try{
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))
      const dataUrl=await toPng(clone,{
        cacheBust:true,
        pixelRatio,
        backgroundColor:'#f8fbfb',
        width:stageWidth,
        height:stageHeight,
        canvasWidth:stageWidth*pixelRatio,
        canvasHeight:stageHeight*pixelRatio
      })
      const a=document.createElement('a')
      a.href=dataUrl
      a.download='schema-'+safeBase+'-'+suffix+'.png'
      a.click()
    }finally{
      clone.remove()
    }
  }
  if(mode==='combined'){
    await render(new Set(selectedLayers),'combine')
    return 1
  }
  let exported=0
  for(const layerId of selectedLayers){
    const allowed=new Set<string>([layerId])
    if(keepMaterialsContext&&layerId!=='materials'&&selectedLayers.includes('materials'))allowed.add('materials')
    await render(allowed,sanitizeFilename(layerNames[layerId]??layerId).toLowerCase().replace(/\s+/g,'-'))
    exported++
  }
  return exported
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
  const [kits,setKits]=useState<InventoryKit[]>([])
  const [workspaceView,setWorkspaceView]=useState<'overview'|'programs'|'stock'|'installation'|'movements'>('overview')
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
  const [stockLayout,setStockLayout]=useState<'compact'|'cards'|'table'>('compact')
  const [stockSearch,setStockSearch]=useState('')
  const [stockCategoryFilter,setStockCategoryFilter]=useState<'all'|InventoryCategory>('all')
  const [stockStatusFilter,setStockStatusFilter]=useState<'all'|InventoryStockStatus>('all')
  const [stockSort,setStockSort]=useState<'name'|'quantity-desc'|'quantity-asc'|'location'|'status'|'updated'>('name')
  const [stockLocationFilter,setStockLocationFilter]=useState('all')
  const [stockLowOnly,setStockLowOnly]=useState(false)
  const [selectedStockIds,setSelectedStockIds]=useState<string[]>([])
  const [bulkLocation,setBulkLocation]=useState('')
  const [bulkProvider,setBulkProvider]=useState('')
  const [bulkProgramId,setBulkProgramId]=useState('')
  const [bulkKitId,setBulkKitId]=useState('')
  const [movementSearch,setMovementSearch]=useState('')
  const [movementProviderFilter,setMovementProviderFilter]=useState('all')
  const [movementKindFilter,setMovementKindFilter]=useState<'all'|ActivityEntry['kind']>('all')
  const [movementDateFilter,setMovementDateFilter]=useState('')

  const refresh=async()=>{
    await ensureStockSeed()
    const [p,s,h,defs,savedKits]=await Promise.all([
      db.programs.toArray(),
      db.inventoryStock.toArray(),
      db.activity.orderBy('createdAt').reverse().limit(180).toArray(),
      loadInventoryCategories(),
      loadInventoryKits()
    ])
    setPrograms(p.filter(item=>!item.deletedAt&&!item.isTemplate).map(normalizeProgram).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)))
    setStock(s.filter(item=>!item.deletedAt).map(normalizeStockItem).sort((a,b)=>a.name.localeCompare(b.name,'fr')))
    setHistory(h.filter(item=>item.source==='inventory'))
    setCategories(defs)
    setKits(savedKits)
    setOpenCategories(current=>({...Object.fromEntries(defs.map(item=>[item.id,true])),...current}))
  }
  useEffect(()=>{void refresh()},[])

  const changed=async()=>{await refresh();onChanged()}
  const providers=useMemo(()=>Array.from(new Set([DEFAULT_PROVIDER,...stock.map(item=>normalizeProvider(item.provider))])).sort((a,b)=>a===DEFAULT_PROVIDER?-1:b===DEFAULT_PROVIDER?1:a.localeCompare(b,'fr')),[stock])
  const categoryOrder=useMemo(()=>Array.from(new Set([...categories.map(item=>item.id),...stock.map(item=>item.category)])),[categories,stock])
  const providerStock=useMemo(()=>stock.filter(item=>normalizeProvider(item.provider)===stockProvider),[stock,stockProvider])
  const stockLocations=useMemo(()=>Array.from(new Set(providerStock.map(item=>item.storageLocation?.trim()).filter((value):value is string=>Boolean(value)))).sort((a,b)=>a.localeCompare(b,'fr')),[providerStock])
  const filteredProviderStock=useMemo(()=>{
    const query=stockSearch.trim().toLowerCase()
    return providerStock.filter(item=>{
      if(stockCategoryFilter!=='all'&&item.category!==stockCategoryFilter)return false
      if(stockStatusFilter!=='all'&&(item.status??'available')!==stockStatusFilter)return false
      if(stockLocationFilter!=='all'&&(item.storageLocation??'')!==stockLocationFilter)return false
      if(stockLowOnly&&!((item.lowStockThreshold??0)>0&&item.quantity<=(item.lowStockThreshold??0)))return false
      if(!query)return true
      const haystack=[item.name,categoryLabel(item.category,categories),item.storageLocation??'',item.notes??'',normalizeProvider(item.provider),...(item.characteristics??[]).flatMap(value=>[value.label,value.value]),...(item.ports??[]).flatMap(value=>[value.label,value.connector])].join(' ').toLowerCase()
      return haystack.includes(query)
    }).sort((a,b)=>{
      if(stockSort==='quantity-desc')return b.quantity-a.quantity||a.name.localeCompare(b.name,'fr')
      if(stockSort==='quantity-asc')return a.quantity-b.quantity||a.name.localeCompare(b.name,'fr')
      if(stockSort==='location')return (a.storageLocation??'').localeCompare(b.storageLocation??'','fr')||a.name.localeCompare(b.name,'fr')
      if(stockSort==='status')return STOCK_STATUS_LABELS[a.status??'available'].localeCompare(STOCK_STATUS_LABELS[b.status??'available'],'fr')||a.name.localeCompare(b.name,'fr')
      if(stockSort==='updated')return b.updatedAt.localeCompare(a.updatedAt)||a.name.localeCompare(b.name,'fr')
      return a.name.localeCompare(b.name,'fr')
    })
  },[providerStock,stockSearch,stockCategoryFilter,stockStatusFilter,stockLocationFilter,stockLowOnly,stockSort,categories])
  const providerMetrics=useMemo(()=>{
    const total=providerStock.reduce((sum,item)=>sum+item.quantity,0)
    const available=providerStock.reduce((sum,item)=>sum+stockStatusCount(item,'available'),0)
    const reserved=providerStock.reduce((sum,item)=>sum+stockStatusCount(item,'reserved'),0)
    const inUse=providerStock.reduce((sum,item)=>sum+stockStatusCount(item,'in_use'),0)
    const unavailable=providerStock.reduce((sum,item)=>sum+stockStatusCount(item,'repair')+stockStatusCount(item,'maintenance')+stockStatusCount(item,'unavailable'),0)
    return {total,available,reserved,inUse,unavailable}
  },[providerStock])
  const lowStockItems=useMemo(()=>providerStock.filter(item=>item.quantity>0&&Number.isFinite(item.lowStockThreshold)&&item.quantity<=(item.lowStockThreshold??0)),[providerStock])
  const selectedStock=useMemo(()=>stock.filter(item=>selectedStockIds.includes(item.id)),[stock,selectedStockIds])
  const filteredHistory=useMemo(()=>{
    const query=movementSearch.trim().toLowerCase()
    return history.filter(entry=>{
      if(movementProviderFilter!=='all'&&(entry.inventoryProvider??'')!==movementProviderFilter)return false
      if(movementKindFilter!=='all'&&entry.kind!==movementKindFilter)return false
      if(movementDateFilter&&!entry.createdAt.startsWith(movementDateFilter))return false
      if(!query)return true
      return [entry.label,entry.details,entry.inventoryProvider??''].join(' ').toLowerCase().includes(query)
    })
  },[history,movementSearch,movementProviderFilter,movementKindFilter,movementDateFilter])

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
      storageLocation:techDraft.storageLocation?.trim()??'',
      lowStockThreshold:Math.max(0,Number(techDraft.lowStockThreshold)||0),
      associatedItemIds:techDraft.associatedItemIds??[],
      trackUnits:techDraft.trackUnits??false,
      units:techDraft.units??[],
      representationIcon:techDraft.representationIcon??'auto',
      characteristics:(techDraft.characteristics??[]).filter(item=>item.label.trim()||item.value.trim()),
      ports:(techDraft.ports??[]).filter(item=>item.label.trim()||item.connector.trim()),
      updatedAt:now()
    })
    await logActivity('update','Matériel modifié',techDraft.name,{source:'inventory',inventoryStockItemId:techDraft.id,inventoryProvider:normalizeProvider(techDraft.provider)})
    setTechDraft(null);await changed();toast('Matériel modifié.')
  }
  const stockUnits=stock.reduce((sum,item)=>sum+item.quantity,0)
  const unavailableUnits=stock.reduce((sum,item)=>sum+stockStatusCount(item,'repair')+stockStatusCount(item,'maintenance')+stockStatusCount(item,'unavailable'),0)
  const stockStatusTotals=useMemo(()=>({
    available:stock.reduce((sum,item)=>sum+stockStatusCount(item,'available'),0),
    reserved:stock.reduce((sum,item)=>sum+stockStatusCount(item,'reserved'),0),
    inUse:stock.reduce((sum,item)=>sum+stockStatusCount(item,'in_use'),0),
    maintenance:stock.reduce((sum,item)=>sum+stockStatusCount(item,'maintenance'),0),
    repair:stock.reduce((sum,item)=>sum+stockStatusCount(item,'repair'),0),
    unavailable:stock.reduce((sum,item)=>sum+stockStatusCount(item,'unavailable'),0)
  }),[stock])
  const globalLowStock=useMemo(()=>stock.filter(item=>item.quantity>0&&(item.lowStockThreshold??0)>0&&item.quantity<=(item.lowStockThreshold??0)),[stock])
  const conflictPrograms=useMemo(()=>programs.filter(program=>programHasStockShortage(program,programs,stock)),[programs,stock])
  const nonReturnedPrograms=useMemo(()=>programs.filter(program=>program.items.some(item=>item.quantity>0&&item.loaded&&!item.returned)),[programs])
  const upcomingPrograms=useMemo(()=>{
    const today=new Date().toISOString().slice(0,10)
    const future=programs.filter(program=>program.date&&program.date>=today).sort((a,b)=>a.date.localeCompare(b.date))
    return (future.length?future:programs.filter(program=>program.date).sort((a,b)=>b.date.localeCompare(a.date))).slice(0,6)
  },[programs])

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
    let units=item.units??[]
    if(item.trackUnits&&next>units.length){
      units=[...units]
      for(let index=units.length;index<next;index++)units.push({id:crypto.randomUUID(),label:'#'+String(index+1).padStart(2,'0'),status:item.status??'available',notes:''})
    }
    await db.inventoryStock.update(item.id,{quantity:next,units,updatedAt:now()})
    await logActivity('update',delta>0?'Entrée stock':'Sortie stock',item.name+' · '+(delta>0?'+':'')+delta,{
      source:'inventory',inventoryStockItemId:item.id,inventoryProvider:normalizeProvider(item.provider),inventoryDelta:delta
    })
    await changed()
  }

  const setStockStatus=async(item:InventoryStockItem,status:InventoryStockStatus)=>{
    if((item.status??'available')===status&&!item.trackUnits)return
    const units=item.trackUnits?(item.units??[]).map((unit,index)=>index<item.quantity?{...unit,status}:unit):item.units
    await db.inventoryStock.update(item.id,{status,units,updatedAt:now()})
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

  const toggleStockSelection=(id:string)=>setSelectedStockIds(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id])
  const selectVisibleStock=()=>setSelectedStockIds(current=>filteredProviderStock.every(item=>current.includes(item.id))?current.filter(id=>!filteredProviderStock.some(item=>item.id===id)):Array.from(new Set([...current,...filteredProviderStock.map(item=>item.id)])))
  const bulkSetStockStatus=async(status:InventoryStockStatus)=>{
    if(!selectedStock.length)return
    const updatedAt=now()
    await Promise.all(selectedStock.map(item=>db.inventoryStock.update(item.id,{status,updatedAt})))
    await Promise.all(selectedStock.map(item=>logActivity('update','État groupé',item.name+' · '+STOCK_STATUS_LABELS[status],{source:'inventory',inventoryStockItemId:item.id,inventoryProvider:normalizeProvider(item.provider)})))
    setSelectedStockIds([]);await changed();toast(selectedStock.length+' matériels mis à jour.')
  }
  const bulkSetStockLocation=async()=>{
    const location=bulkLocation.trim();if(!location||!selectedStock.length)return
    const updatedAt=now();await Promise.all(selectedStock.map(item=>db.inventoryStock.update(item.id,{storageLocation:location,updatedAt})))
    setSelectedStockIds([]);setBulkLocation('');await changed();toast('Emplacement appliqué à la sélection.')
  }
  const bulkSetStockProvider=async()=>{
    const provider=bulkProvider.trim();if(!provider||!selectedStock.length)return
    const updatedAt=now();await Promise.all(selectedStock.map(item=>db.inventoryStock.update(item.id,{provider,updatedAt})))
    await Promise.all(selectedStock.map(item=>logActivity('update','Stockage groupé',item.name+' · '+provider,{source:'inventory',inventoryStockItemId:item.id,inventoryProvider:provider})))
    setSelectedStockIds([]);setBulkProvider('');await changed();toast('Stockage appliqué à la sélection.')
  }
  const bulkAddToProgram=async()=>{
    if(!bulkProgramId||!selectedStock.length)return
    const target=programs.find(item=>item.id===bulkProgramId)
    if(!target)return
    const normalized=normalizeProgram(target)
    let next=[...normalized.items]
    let maxOrder=next.reduce((max,item)=>Math.max(max,item.listOrder??-1),-1)
    for(const source of selectedStock){
      const existing=next.find(item=>item.stockItemId===source.id)
      if(existing)next=next.map(item=>item.id===existing.id?{...item,quantity:item.quantity+1,returned:false,checkState:'prepare' as InventoryChecklistState}:item)
      else next.push({id:crypto.randomUUID(),name:source.name,category:source.category,quantity:1,stockItemId:source.id,loaded:false,returned:false,checkState:'prepare',listOrder:++maxOrder})
    }
    const updatedAt=now()
    await db.programs.update(target.id,{items:next,updatedAt})
    await Promise.all(selectedStock.map(source=>logActivity('create','Ajout groupé au programme',source.name+' · '+target.name,{source:'inventory',inventoryProgramId:target.id,inventoryStockItemId:source.id,inventoryProvider:normalizeProvider(source.provider)})))
    setSelectedStockIds([]);setBulkProgramId('');await changed();toast('Sélection ajoutée à « '+target.name+' ».')
  }

  const bulkAddToKit=async()=>{
    if(!bulkKitId||!selectedStock.length)return
    const kit=kits.find(item=>item.id===bulkKitId)
    if(!kit)return
    let kitItems=[...kit.items]
    for(const source of selectedStock){
      const existing=kitItems.find(item=>item.stockItemId===source.id)
      if(existing)kitItems=kitItems.map(item=>item===existing?{...item,quantity:item.quantity+1}:item)
      else kitItems.push({name:source.name,quantity:1,category:source.category,stockItemId:source.id})
    }
    const nextKits=kits.map(item=>item.id===kit.id?{...item,items:kitItems,updatedAt:now()}:item)
    setKits(nextKits);await saveInventoryKits(nextKits)
    setSelectedStockIds([]);setBulkKitId('');toast('Sélection ajoutée au kit « '+kit.name+' ».')
  }

  const exportSelectedStockCsv=()=>{
    if(!selectedStock.length)return
    const escape=(value:unknown)=>'"'+String(value??'').replace(/"/g,'""')+'"'
    const rows=[
      ['Matériel','Classe','Stockage','Emplacement','Quantité','État'],
      ...selectedStock.map(item=>[item.name,categoryLabel(item.category,categories),normalizeProvider(item.provider),item.storageLocation??'',item.quantity,STOCK_STATUS_LABELS[item.status??'available']])
    ]
    const csv='\uFEFF'+rows.map(row=>row.map(escape).join(';')).join('\n')
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}))
    const link=document.createElement('a');link.href=url;link.download='diart-stock-selection.csv';link.click();URL.revokeObjectURL(url)
    toast('Sélection exportée en CSV.')
  }

  const bulkDeleteStock=async()=>{
    if(!selectedStock.length)return
    const stamp=now();await Promise.all(selectedStock.map(item=>db.inventoryStock.update(item.id,{deletedAt:stamp,updatedAt:stamp})))
    setSelectedStockIds([]);await changed();toast(selectedStock.length+' matériels retirés du stock.')
  }

  const toggleCategory=(category:InventoryCategory)=>setOpenCategories(value=>({...value,[category]:!value[category]}))

  return <div className="inventory-workspace-v4">
    <section className="inventory-hero panel compact-inventory-hero">
      <div><span className="eyebrow">Organisation matérielle</span><h1>Inventaire</h1><p>Programmes, stock multi-prestataires, réservations et suivi opérationnel.</p><span className="inventory-version-chip">DI’ART 4.0 · Inventory Workspace</span></div>
      <nav className="inventory-workspace-nav" aria-label="Navigation Inventaire">
        <button className={workspaceView==='overview'?'active':''} onClick={()=>setWorkspaceView('overview')}><LayoutGrid/><span>Vue d’ensemble</span></button>
        <button className={workspaceView==='programs'?'active':''} onClick={()=>setWorkspaceView('programs')}><CalendarDays/><span>Programmes</span><span className="count">{programs.length}</span></button>
        <button className={workspaceView==='stock'?'active':''} onClick={()=>setWorkspaceView('stock')}><Archive/><span>Stock</span><span className="count">{stockUnits}</span></button>
        <button className={workspaceView==='installation'?'active':''} onClick={()=>setWorkspaceView('installation')}><Network/><span>Installation</span></button>
        <button className={workspaceView==='movements'?'active':''} onClick={()=>setWorkspaceView('movements')}><History/><span>Mouvements</span></button>
      </nav>
    </section>

    {workspaceView==='overview'&&<section className="inventory-dashboard-grid">
      <div className="inventory-dashboard-main">
        <div className="inventory-kpi-grid">
          <article className="inventory-kpi"><small>Total unités</small><b>{stockUnits}</b><em>{stock.length} références · {providers.length} stockages</em></article>
          <article className="inventory-kpi available"><small>Disponibles</small><b>{stockStatusTotals.available}</b><em>prêtes à être affectées</em></article>
          <article className="inventory-kpi reserved"><small>Réservées / utilisées</small><b>{stockStatusTotals.reserved+stockStatusTotals.inUse}</b><em>{stockStatusTotals.reserved} réservées · {stockStatusTotals.inUse} utilisées</em></article>
          <article className={'inventory-kpi '+(stockStatusTotals.maintenance+stockStatusTotals.repair+stockStatusTotals.unavailable?'warning':'')}><small>Hors disponibilité</small><b>{stockStatusTotals.maintenance+stockStatusTotals.repair+stockStatusTotals.unavailable}</b><em>maintenance, panne, indisponible</em></article>
        </div>
        <section className="panel inventory-dashboard-panel">
          <header><h3>Prochains programmes</h3><small>{programs.length} programme{programs.length>1?'s':''}</small></header>
          <div className="inventory-upcoming-list">{upcomingPrograms.length?upcomingPrograms.map(program=>{
            const active=program.items.filter(item=>item.quantity>0)
            const ready=active.filter(item=>item.checkState==='loaded'||item.checkState==='onsite'||item.checkState==='returned'||item.loaded||item.returned).length
            const progress=active.length?Math.round(ready/active.length*100):0
            const conflict=conflictPrograms.some(value=>value.id===program.id)
            return <button className="inventory-upcoming-row" key={program.id} onClick={()=>onOpen(program.id)}><CalendarDays/><span><b>{program.name}</b><small>{program.date?new Date(program.date+'T00:00:00').toLocaleDateString('fr-FR'):'Date à définir'}{program.location?' · '+program.location:''} · {active.length} réf.</small><span className="inventory-progress"><i style={{width:progress+'%'}}/></span></span><strong>{conflict?'Conflit':progress+' % prêt'}</strong></button>
          }):<div className="inventory-empty-compact">Aucun programme daté.</div>}</div>
        </section>
      </div>
      <aside className="inventory-dashboard-side">
        <section className="panel inventory-dashboard-panel">
          <header><h3>Alertes</h3><small>{globalLowStock.length+conflictPrograms.length+nonReturnedPrograms.length+stockStatusTotals.maintenance+stockStatusTotals.repair}</small></header>
          <div className="inventory-alert-list">
            {globalLowStock.length>0&&<button className="inventory-alert-row warning" onClick={()=>setWorkspaceView('stock')}><AlertTriangle/><span><b>Stocks faibles</b><small>{globalLowStock.slice(0,3).map(item=>item.name+' ('+item.quantity+')').join(' · ')}</small></span><strong>{globalLowStock.length}</strong></button>}
            {conflictPrograms.length>0&&<button className="inventory-alert-row danger" onClick={()=>setWorkspaceView('programs')}><PackageSearch/><span><b>Conflits de réservation</b><small>{conflictPrograms.slice(0,3).map(item=>item.name).join(' · ')}</small></span><strong>{conflictPrograms.length}</strong></button>}
            {nonReturnedPrograms.length>0&&<button className="inventory-alert-row warning" onClick={()=>setWorkspaceView('programs')}><RotateCcw/><span><b>Matériels non retournés</b><small>{nonReturnedPrograms.slice(0,3).map(item=>item.name).join(' · ')}</small></span><strong>{nonReturnedPrograms.length}</strong></button>}
            {(stockStatusTotals.maintenance+stockStatusTotals.repair)>0&&<button className="inventory-alert-row warning" onClick={()=>setWorkspaceView('stock')}><Settings2/><span><b>Maintenance / panne</b><small>Matériels nécessitant une attention technique.</small></span><strong>{stockStatusTotals.maintenance+stockStatusTotals.repair}</strong></button>}
            {!globalLowStock.length&&!conflictPrograms.length&&!nonReturnedPrograms.length&&!stockStatusTotals.maintenance&&!stockStatusTotals.repair&&<div className="inventory-empty-compact">Aucune alerte active.</div>}
          </div>
        </section>
        <section className="panel inventory-dashboard-panel">
          <header><h3>Accès rapide</h3><small>Inventory Workspace</small></header>
          <div className="inventory-installation-list">
            <button className="inventory-installation-row" onClick={()=>setWorkspaceView('stock')}><Archive/><span><b>Gérer le stock</b><small>Recherche, filtres, statuts, emplacements.</small></span><ChevronRight/></button>
            <button className="inventory-installation-row" onClick={()=>setWorkspaceView('installation')}><Network/><span><b>Installations</b><small>Ouvrir les schémas par programme.</small></span><ChevronRight/></button>
            <button className="inventory-installation-row" onClick={()=>setWorkspaceView('movements')}><History/><span><b>Mouvements</b><small>Entrées, sorties et changements d’état.</small></span><ChevronRight/></button>
          </div>
        </section>
      </aside>
    </section>}

    {workspaceView==='installation'&&<section className="panel inventory-dashboard-panel">
      <header><h3>Installations par programme</h3><small>Schémas, patchs et besoins liés au stock</small></header>
      <div className="inventory-installation-list">{programs.length?programs.map(program=>{
        const installation=program.installation
        const nodes=installation?.nodes?.length??0
        const links=installation?.links?.length??0
        return <button className="inventory-installation-row" key={program.id} onClick={()=>onOpen(program.id)}><Network/><span><b>{program.name}</b><small>{nodes} équipement{nodes>1?'s':''} · {links} liaison{links>1?'s':''}{program.location?' · '+program.location:''}</small></span><ChevronRight/></button>
      }):<div className="inventory-empty-compact">Créez un programme pour préparer une installation.</div>}</div>
    </section>}

    {workspaceView==='movements'&&<section className="panel inventory-dashboard-panel">
      <header><h3>Mouvements du stock</h3><small>{filteredHistory.length} mouvement{filteredHistory.length>1?'s':''} affiché{filteredHistory.length>1?'s':''}</small></header>
      <div className="inventory-movement-filters">
        <label className="stock-search"><Search/><input value={movementSearch} onChange={e=>setMovementSearch(e.target.value)} placeholder="Matériel, programme, détail…"/></label>
        <input type="date" value={movementDateFilter} onChange={e=>setMovementDateFilter(e.target.value)} aria-label="Filtrer par date"/>
        <select value={movementProviderFilter} onChange={e=>setMovementProviderFilter(e.target.value)}><option value="all">Tous les stockages</option>{providers.map(provider=><option value={provider} key={provider}>{provider}</option>)}</select>
        <select value={movementKindFilter} onChange={e=>setMovementKindFilter(e.target.value as 'all'|ActivityEntry['kind'])}><option value="all">Tous les types</option><option value="create">Création</option><option value="update">Modification</option><option value="complete">Check-list</option><option value="delete">Suppression</option><option value="import">Import</option><option value="export">Export</option></select>
        {(movementSearch||movementDateFilter||movementProviderFilter!=='all'||movementKindFilter!=='all')&&<button className="secondary" onClick={()=>{setMovementSearch('');setMovementDateFilter('');setMovementProviderFilter('all');setMovementKindFilter('all')}}><RotateCcw/>Réinitialiser</button>}
      </div>
      <div className="inventory-movement-workspace">{filteredHistory.length?filteredHistory.map(entry=><div className="inventory-movement-row" key={entry.id}>
        <time>{new Date(entry.createdAt).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</time>
        <span className="icon"><History/></span>
        <span><b>{entry.label}</b><small>{entry.details}{entry.inventoryProvider?' · '+entry.inventoryProvider:''}</small></span>
        {typeof entry.inventoryDelta==='number'&&entry.inventoryDelta!==0?<em>{entry.inventoryDelta>0?'+':''}{entry.inventoryDelta}</em>:<em>—</em>}
      </div>):<div className="inventory-empty-compact">Aucun mouvement ne correspond aux filtres.</div>}</div>
    </section>}

    {workspaceView==='programs'?<>
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
    </>:workspaceView==='stock'?<>
      <div className="stock-view-switch panel">
        <button className={stockView==='provider'?'active':''} onClick={()=>setStockView('provider')}><Archive/>Par stockage</button>
        <button className={stockView==='global'?'active':''} onClick={()=>setStockView('global')}><LayoutGrid/>Vue globale</button>
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
        <section className="stock-workspace-dashboard panel">
          <div className="stock-workspace-metrics">
            <span><small>Total</small><b>{providerMetrics.total}</b></span>
            <span className="available"><small>Disponibles</small><b>{providerMetrics.available}</b></span>
            <span className="reserved"><small>Réservés</small><b>{providerMetrics.reserved}</b></span>
            <span className="in-use"><small>Utilisés</small><b>{providerMetrics.inUse}</b></span>
            <span className={providerMetrics.unavailable?'warning':''}><small>Indisponibles</small><b>{providerMetrics.unavailable}</b></span>
          </div>
          {lowStockItems.length>0&&<div className="stock-low-alert"><AlertTriangle/><span><b>{lowStockItems.length} stock{lowStockItems.length>1?'s':''} faible{lowStockItems.length>1?'s':''}</b><small>{lowStockItems.slice(0,4).map(item=>item.name+' ('+item.quantity+')').join(' · ')}{lowStockItems.length>4?' · …':''}</small></span></div>}
        </section>
        <div className="stock-workspace-toolbar panel">
          <label className="stock-search"><Search/><input value={stockSearch} onChange={e=>setStockSearch(e.target.value)} placeholder="Rechercher nom, emplacement, caractéristique…"/></label>
          <select value={stockCategoryFilter} onChange={e=>setStockCategoryFilter(e.target.value as 'all'|InventoryCategory)}><option value="all">Toutes les classes</option>{categoryOrder.map(category=><option value={category} key={category}>{categoryLabel(category,categories)}</option>)}</select>
          <select value={stockStatusFilter} onChange={e=>setStockStatusFilter(e.target.value as 'all'|InventoryStockStatus)}><option value="all">Tous les états</option>{Object.entries(STOCK_STATUS_LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select>
          <select value={stockLocationFilter} onChange={e=>setStockLocationFilter(e.target.value)}><option value="all">Tous les emplacements</option>{stockLocations.map(location=><option value={location} key={location}>{location}</option>)}</select>
          <select value={stockSort} onChange={e=>setStockSort(e.target.value as typeof stockSort)}><option value="name">Nom A–Z</option><option value="quantity-desc">Quantité ↓</option><option value="quantity-asc">Quantité ↑</option><option value="location">Emplacement</option><option value="status">État</option><option value="updated">Dernière modification</option></select>
          <label className="stock-filter-toggle"><input type="checkbox" checked={stockLowOnly} onChange={e=>setStockLowOnly(e.target.checked)}/><span>Stock faible</span></label>
          <div className="stock-layout-switch" aria-label="Affichage du stock">
            <button className={stockLayout==='compact'?'active':''} onClick={()=>setStockLayout('compact')} title="Vue compacte"><List/></button>
            <button className={stockLayout==='cards'?'active':''} onClick={()=>setStockLayout('cards')} title="Vue cartes"><Grid3X3/></button>
            <button className={stockLayout==='table'?'active':''} onClick={()=>setStockLayout('table')} title="Vue tableau"><Table2/></button>
          </div>
        </div>
        {filteredProviderStock.length>0&&<div className="stock-selection-head">
          <button className="secondary" onClick={selectVisibleStock}><CheckSquare/>{filteredProviderStock.every(item=>selectedStockIds.includes(item.id))?'Désélectionner':'Sélectionner'} visibles</button>
          <span>{filteredProviderStock.length} référence{filteredProviderStock.length>1?'s':''} affichée{filteredProviderStock.length>1?'s':''}</span>
        </div>}
        {selectedStock.length>0&&<div className="stock-bulk-toolbar panel">
          <b>{selectedStock.length} sélectionné{selectedStock.length>1?'s':''}</b>
          <select defaultValue="" onChange={e=>{if(e.target.value)void bulkSetStockStatus(e.target.value as InventoryStockStatus);e.currentTarget.value=''}}><option value="">Changer l’état…</option>{Object.entries(STOCK_STATUS_LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select>
          <input value={bulkLocation} onChange={e=>setBulkLocation(e.target.value)} placeholder="Emplacement commun…"/>
          <button className="secondary" disabled={!bulkLocation.trim()} onClick={()=>void bulkSetStockLocation()}><MapPin/>Emplacement</button>
          <select value={bulkProvider} onChange={e=>setBulkProvider(e.target.value)}><option value="">Changer stockage…</option>{providers.map(provider=><option value={provider} key={provider}>{provider}</option>)}</select>
          <button className="secondary" disabled={!bulkProvider} onClick={()=>void bulkSetStockProvider()}><Archive/>Stockage</button>
          <select value={bulkProgramId} onChange={e=>setBulkProgramId(e.target.value)}><option value="">Ajouter au programme…</option>{programs.map(program=><option value={program.id} key={program.id}>{program.name}</option>)}</select>
          <button className="secondary" disabled={!bulkProgramId} onClick={()=>void bulkAddToProgram()}><CalendarDays/>Programme</button>
          {kits.length>0&&<><select value={bulkKitId} onChange={e=>setBulkKitId(e.target.value)}><option value="">Ajouter au kit…</option>{kits.map(kit=><option value={kit.id} key={kit.id}>{kit.name}</option>)}</select><button className="secondary" disabled={!bulkKitId} onClick={()=>void bulkAddToKit()}><Boxes/>Kit</button></>}
          <button className="secondary" onClick={exportSelectedStockCsv}><ImageDown/>Exporter</button>
          <button className="danger" onClick={()=>void bulkDeleteStock()}><Trash2/>Retirer</button>
        </div>}
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
        <div className={'inventory-category-stack planned-material-list stock-layout-'+stockLayout}>
          {categoryOrder.map(category=>{
            const items=filteredProviderStock.filter(item=>item.category===category)
            return <CategorySection category={category} label={categoryLabel(category,categories)} key={category} open={openCategories[category]??true} onToggle={()=>toggleCategory(category)} count={items.length}>
              {items.map(item=><div className="stock-item-wrap" key={item.id}>
                <div className={'stock-row stock-row-with-status stock-row-with-tech stock-workspace-row '+(item.quantity>0?'active ':'empty-stock ')+(selectedStockIds.includes(item.id)?'selected ':'')+((item.lowStockThreshold??0)>0&&item.quantity<=(item.lowStockThreshold??0)?'low-stock':'')}>
                  <label className="stock-select-control" title="Sélectionner"><input type="checkbox" checked={selectedStockIds.includes(item.id)} onChange={()=>toggleStockSelection(item.id)}/><span/></label>
                  <span className="stock-representation-icon"><TechnicalIcon icon={item.representationIcon} text={item.name+' '+item.category}/></span><span className="stock-main-label"><b>{item.name}</b><small>{item.storageLocation?<><MapPin/>{item.storageLocation}</>:categoryLabel(item.category,categories)}{item.trackUnits?' · suivi individuel':''}{(item.lowStockThreshold??0)>0&&item.quantity<=(item.lowStockThreshold??0)?' · stock faible':''}</small></span>
                  <label className={'stock-status-control status-'+(item.status??'available')} title={STOCK_STATUS_LABELS[item.status??'available']}>
                    <span className="stock-status-dot" aria-hidden="true"/>
                    <span className="stock-status-label">{STOCK_STATUS_LABELS[item.status??'available']}</span>
                    <select className="stock-status-native" aria-label={'Statut de '+item.name} value={item.status??'available'} onChange={e=>void setStockStatus(item,e.target.value as InventoryStockStatus)}>
                      {Object.entries(STOCK_STATUS_LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}
                    </select>
                  </label>
                  <div className="compact-qty">
                    <button disabled={item.quantity<=0} onClick={()=>void setStockQuantity(item,item.quantity-1)}><Minus/></button>
                    <input type="number" min="0" max="999" inputMode="numeric" value={item.quantity} onChange={e=>void setStockQuantity(item,Number(e.target.value))}/>
                    <button onClick={()=>void setStockQuantity(item,item.quantity+1)}><Plus/></button>
                  </div>
                  <button className={'bare-action tech-action '+(techDraft?.id===item.id?'active':'')} title="Caractéristiques et connectiques" onClick={()=>setTechDraft(current=>current?.id===item.id?null:{...item,characteristics:[...(item.characteristics??[])],ports:[...(item.ports??[])]})}><Settings2/></button>
                  <button className="bare-action danger-icon compact-delete" aria-label={'Supprimer '+item.name} onClick={()=>void deleteStock(item)}><Trash2/></button>
                </div>
                {techDraft?.id===item.id&&<div className="stock-tech-editor inventory-drawer">
                  <div className="stock-tech-head"><span><b>Caractéristiques · {item.name}</b><small>Décrivez les propriétés et les entrées/sorties utilisables dans les schémas.</small></span><button className="bare-action" onClick={()=>setTechDraft(null)}><X/></button></div>
                  <div className="stock-tech-section stock-general-editor">
                    <div className="stock-tech-section-head"><b>Informations générales</b></div>
                    <div className="stock-general-grid">
                      <label><span>Nom</span><input value={techDraft.name} onChange={e=>setTechDraft({...techDraft,name:e.target.value})}/></label>
                      <label className="stock-icon-field"><span>Icône</span><TechnicalIconPicker value={techDraft.representationIcon} text={techDraft.name+' '+techDraft.category} onChange={representationIcon=>setTechDraft({...techDraft,representationIcon})}/></label>
                      <label><span>Classe</span><select value={techDraft.category} onChange={e=>setTechDraft({...techDraft,category:e.target.value})}>{categories.map(category=><option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
                      <label><span>Stockage</span><input value={normalizeProvider(techDraft.provider)} onChange={e=>setTechDraft({...techDraft,provider:e.target.value})}/></label>
                      <label><span>Emplacement précis</span><input value={techDraft.storageLocation??''} onChange={e=>setTechDraft({...techDraft,storageLocation:e.target.value})} placeholder="Flight case, rack, étagère, local…"/></label>
                      <label><span>Alerte stock faible</span><input type="number" min="0" max="999" value={techDraft.lowStockThreshold??0} onChange={e=>setTechDraft({...techDraft,lowStockThreshold:Math.max(0,Number(e.target.value)||0)})}/></label>
                      <label className="stock-unit-tracking-toggle"><span>Gestion</span><span className="stock-unit-switch"><input type="checkbox" checked={Boolean(techDraft.trackUnits)} onChange={e=>{
                        let units=[...(techDraft.units??[])]
                        if(e.target.checked&&units.length<techDraft.quantity){
                          for(let index=units.length;index<techDraft.quantity;index++)units.push({id:crypto.randomUUID(),label:'#'+String(index+1).padStart(2,'0'),status:techDraft.status??'available',notes:''})
                        }
                        setTechDraft({...techDraft,trackUnits:e.target.checked,units})
                      }}/><b>Suivi par unité</b></span></label>
                      <label className="span2"><span>Notes</span><input value={techDraft.notes??''} onChange={e=>setTechDraft({...techDraft,notes:e.target.value})} placeholder="Référence, usage, remarques…"/></label>
                    </div>
                  </div>
                  <InventoryStructuredFields item={techDraft} onChange={setTechDraft}/>
                  {techDraft.trackUnits&&<div className="stock-tech-section stock-units-editor">
                    <div className="stock-tech-section-head"><span><b>Unités individuelles</b><small>{techDraft.quantity} exemplaire{techDraft.quantity>1?'s':''} actif{techDraft.quantity>1?'s':''} · les anciennes unités restent conservées si la quantité diminue.</small></span></div>
                    <div className="stock-units-list">
                      {Array.from({length:techDraft.quantity},(_,index)=>{
                        const unit=(techDraft.units??[])[index]??{id:crypto.randomUUID(),label:'#'+String(index+1).padStart(2,'0'),status:techDraft.status??'available',notes:''}
                        return <div className="stock-unit-row" key={unit.id}>
                          <span>{String(index+1).padStart(2,'0')}</span>
                          <input value={unit.label} onChange={e=>{
                            const units=[...(techDraft.units??[])]
                            while(units.length<=index)units.push({id:crypto.randomUUID(),label:'#'+String(units.length+1).padStart(2,'0'),status:techDraft.status??'available',notes:''})
                            units[index]={...units[index],label:e.target.value}
                            setTechDraft({...techDraft,units})
                          }} aria-label={'Identifiant unité '+(index+1)}/>
                          <select value={unit.status} onChange={e=>{
                            const units=[...(techDraft.units??[])]
                            while(units.length<=index)units.push({id:crypto.randomUUID(),label:'#'+String(units.length+1).padStart(2,'0'),status:techDraft.status??'available',notes:''})
                            units[index]={...units[index],status:e.target.value as InventoryStockStatus}
                            setTechDraft({...techDraft,units})
                          }} aria-label={'État unité '+(index+1)}>{Object.entries(STOCK_STATUS_LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select>
                          <input value={unit.notes??''} onChange={e=>{
                            const units=[...(techDraft.units??[])]
                            while(units.length<=index)units.push({id:crypto.randomUUID(),label:'#'+String(units.length+1).padStart(2,'0'),status:techDraft.status??'available',notes:''})
                            units[index]={...units[index],notes:e.target.value}
                            setTechDraft({...techDraft,units})
                          }} placeholder="Note / série…" aria-label={'Note unité '+(index+1)}/>
                        </div>
                      })}
                    </div>
                  </div>}
                  <details className="stock-related-editor">
                    <summary>Matériels liés / accessoires habituels</summary>
                    <div className="stock-related-grid">{stock.filter(candidate=>candidate.id!==techDraft.id).map(candidate=><label key={candidate.id}><input type="checkbox" checked={(techDraft.associatedItemIds??[]).includes(candidate.id)} onChange={e=>setTechDraft({...techDraft,associatedItemIds:e.target.checked?Array.from(new Set([...(techDraft.associatedItemIds??[]),candidate.id])):(techDraft.associatedItemIds??[]).filter(id=>id!==candidate.id)})}/><span><TechnicalIcon icon={candidate.representationIcon} text={candidate.name}/><b>{candidate.name}</b><small>{normalizeProvider(candidate.provider)}</small></span></label>)}</div>
                  </details>
                  <div className="stock-tech-section">
                    <div className="stock-tech-section-head"><b>Caractéristiques</b><button className="secondary" onClick={()=>setTechDraft({...techDraft,characteristics:[...(techDraft.characteristics??[]),{id:crypto.randomUUID(),label:'',value:''}]})}><Plus/>Champ</button></div>
                    {(techDraft.characteristics??[]).map((characteristic,index)=><div className="stock-tech-pair stock-tech-pair-with-icon" key={characteristic.id}>
                      <span className="stock-inline-tech-icon"><TechnicalIcon icon={characteristic.icon} text={characteristic.label+' '+characteristic.value}/></span>
                      <TechnicalIconPicker compact value={characteristic.icon} text={characteristic.label+' '+characteristic.value} onChange={icon=>setTechDraft({...techDraft,characteristics:(techDraft.characteristics??[]).map((value,i)=>i===index?{...value,icon}:value)})}/>
                      <input value={characteristic.label} onChange={e=>setTechDraft({...techDraft,characteristics:(techDraft.characteristics??[]).map((value,i)=>i===index?{...value,label:e.target.value}:value)})} placeholder="Ex. Entrées XLR"/>
                      <input value={characteristic.value} onChange={e=>setTechDraft({...techDraft,characteristics:(techDraft.characteristics??[]).map((value,i)=>i===index?{...value,value:e.target.value}:value)})} placeholder="Ex. 18 × XLR(F)"/>
                      <button className="bare-action danger-icon" onClick={()=>setTechDraft({...techDraft,characteristics:(techDraft.characteristics??[]).filter((_,i)=>i!==index)})}><Trash2/></button>
                    </div>)}
                  </div>
                  <div className="stock-tech-section">
                    <div className="stock-tech-section-head"><b>Connectiques / ports</b><button className="secondary" onClick={()=>setTechDraft({...techDraft,ports:[...(techDraft.ports??[]),{id:crypto.randomUUID(),label:'',connector:'XLR(F)',direction:'input',count:1,signalLevel:'unknown',balanced:false,stereo:false,phantom:'none'}]})}><Plus/>Port</button></div>
                    {(techDraft.ports??[]).map((port,index)=><div className="stock-port-row advanced stock-port-row-with-icon" key={port.id}>
                      <span className="stock-inline-tech-icon connector-icon"><TechnicalIcon icon={port.icon} text={port.connector+' '+port.label}/></span>
                      <TechnicalIconPicker compact value={port.icon} text={port.connector+' '+port.label} onChange={icon=>setTechDraft({...techDraft,ports:(techDraft.ports??[]).map((value,i)=>i===index?{...value,icon}:value)})}/>
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
              <div className="global-stock-providers">{row.providers.map(part=><span className={'provider-stock-chip status-'+part.status} key={part.id}><i className="stock-status-dot" aria-hidden="true"/><em>{part.provider}</em><b>{part.quantity}</b><small>{STOCK_STATUS_LABELS[part.status]}</small></span>)}</div>
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
    </>:null}
  </div>
}

export function InventoryProgramPage({programId,onBack,onChanged,toast,onShare,onOpen}:{programId:string;onBack:()=>void;onChanged:()=>void;toast:(text:string)=>void;onShare:()=>void;onOpen:(id:string)=>void}){
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
  const [kitMultipliers,setKitMultipliers]=useState<Record<string,number>>({})
  const [categories,setCategories]=useState<InventoryCategoryDef[]>(DEFAULT_CATEGORIES)
  const [programView,setProgramView]=useState<'materials'|'installation'>('materials')
  const [advancedInstallationAvailable,setAdvancedInstallationAvailable]=useState(()=>window.matchMedia('(min-width:700px)').matches)
  const [installationOpen,setInstallationOpen]=useState(true)
  const [installationNodeName,setInstallationNodeName]=useState('')
  const [installationStockId,setInstallationStockId]=useState('')
  const [installationProvider,setInstallationProvider]=useState(DEFAULT_PROVIDER)
  const [installationView,setInstallationView]=useState<'schema'|'list'|'patch'|'diagnostic'>('schema')
  const [activeSchemaLayer,setActiveSchemaLayer]=useState<string>('audio')
  const [newSchemaLayerName,setNewSchemaLayerName]=useState('')
  const [exportLayersOpen,setExportLayersOpen]=useState(false)
  const [exportLayerSelection,setExportLayerSelection]=useState<Record<string,boolean>>({})
  const [exportKeepMaterials,setExportKeepMaterials]=useState(true)
  const [schemaExporting,setSchemaExporting]=useState(false)
  const [stageMetricDraft,setStageMetricDraft]=useState({width:12,depth:8,scale:80})
  const [selectedSchemaNode,setSelectedSchemaNode]=useState('')
  const [selectedSchemaLink,setSelectedSchemaLink]=useState('')
  const schemaCanvasRef=useRef<HTMLDivElement|null>(null)
  const schemaPointerRef=useRef<{id:string;startX:number;startY:number;moved:boolean}|null>(null)
  const schemaResizeRef=useRef<{id:string;startX:number;startY:number;width:number;height:number;x:number;y:number;handle:'n'|'ne'|'e'|'se'|'s'|'sw'|'w'|'nw'}|null>(null)
  const schemaRotateRef=useRef<{id:string;cx:number;cy:number}|null>(null)
  const schemaRouteRef=useRef<{linkId:string;pointIndex:number}|null>(null)
  const [diagnosticNodeId,setDiagnosticNodeId]=useState('')
  const [snapshotName,setSnapshotName]=useState('')
  const [linkFromNode,setLinkFromNode]=useState('')
  const [linkToNode,setLinkToNode]=useState('')
  const [linkFromPort,setLinkFromPort]=useState('')
  const [linkToPort,setLinkToPort]=useState('')
  const [linkLengthMeters,setLinkLengthMeters]=useState('')
  const [aiAnalyzing,setAiAnalyzing]=useState(false)
  const [online,setOnline]=useState(typeof navigator==='undefined'?true:navigator.onLine)
  const [exportOpen,setExportOpen]=useState(false)
  const [confirmDelete,setConfirmDelete]=useState(false)
  const [draggedMaterialId,setDraggedMaterialId]=useState('')
  const [collapsedProgramGroups,setCollapsedProgramGroups]=useState<Record<string,boolean>>({})
  const [sourcePlan,setSourcePlan]=useState<Array<{itemId:string;stockItemId:string;provider:string;available:number}>>([])
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
    setPrograms(allPrograms.filter(item=>!item.deletedAt&&!item.isTemplate).map(normalizeProgram))
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
    setProgram(current=>current?normalizeProgram({...current,...patch,updatedAt}):next)
    setPrograms(list=>list.map(item=>item.id===program.id?normalizeProgram({...item,...patch,updatedAt}):item))
    await db.programs.update(program.id,{...patch,updatedAt})
    onChanged()
  }

  const items=program?.items??[]
  const stockProviders=useMemo(()=>Array.from(new Set(stock.map(item=>normalizeProvider(item.provider)))).sort((a,b)=>a===DEFAULT_PROVIDER?-1:b===DEFAULT_PROVIDER?1:a.localeCompare(b,'fr')),[stock])
  useEffect(()=>{if(stockProviders.length&&!stockProviders.includes(installationProvider))setInstallationProvider(stockProviders[0])},[stockProviders,installationProvider])
  useEffect(()=>{
    const media=window.matchMedia('(min-width:700px)')
    const update=()=>setAdvancedInstallationAvailable(true)
    update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update)
  },[])
  const categoryOrder=useMemo(()=>Array.from(new Set([...categories.map(item=>item.id),...stock.map(item=>item.category),...items.map(item=>item.category)])),[categories,stock,items])
  const selectedItems=useMemo(()=>items.filter(item=>item.quantity>0).sort((a,b)=>(a.listOrder??Number.MAX_SAFE_INTEGER)-(b.listOrder??Number.MAX_SAFE_INTEGER)),[items])
  const totalQuantity=useMemo(()=>selectedItems.reduce((sum,item)=>sum+item.quantity,0),[selectedItems])
  const loadedCount=useMemo(()=>selectedItems.filter(item=>item.checkState==='loaded'||item.checkState==='onsite'||item.checkState==='returned'||item.loaded).length,[selectedItems])
  const returnedCount=useMemo(()=>selectedItems.filter(item=>item.checkState==='returned'||item.returned).length,[selectedItems])
  const readyCount=useMemo(()=>selectedItems.filter(item=>['loaded','onsite','returned'].includes(item.checkState??'')||item.loaded||item.returned).length,[selectedItems])
  const checklistProgress=selectedItems.length?Math.round(readyCount/selectedItems.length*100):0
  const programGroupNames=useMemo(()=>Array.from(new Set(selectedItems.map(item=>(item.visualGroup??'').trim()).filter(Boolean))),[selectedItems])

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
    const nextQuantity=clampQuantity(quantity)
    const maxOrder=items.reduce((max,item)=>Math.max(max,item.listOrder??-1),-1)
    const next=items.map(item=>item.id===id?{
      ...item,
      quantity:nextQuantity,
      listOrder:nextQuantity>0&&item.quantity<=0?maxOrder+1:item.listOrder,
      loaded:nextQuantity>0?item.loaded:false,
      returned:nextQuantity>0?item.returned:false,
      checkState:nextQuantity>0?(item.checkState??(item.returned?'returned':item.loaded?'loaded':'prepare')):'prepare'
    }:item)
    void persist({items:next})
  }

  const reorderSelected=(itemId:string,targetIndex:number)=>{
    const ordered=[...selectedItems]
    const from=ordered.findIndex(item=>item.id===itemId)
    if(from<0||!ordered.length)return
    const to=Math.max(0,Math.min(ordered.length-1,targetIndex))
    if(from===to)return
    const [moved]=ordered.splice(from,1)
    ordered.splice(to,0,moved)
    const orderById=new Map(ordered.map((item,index)=>[item.id,index]))
    void persist({items:items.map(item=>orderById.has(item.id)?{...item,listOrder:orderById.get(item.id)}:item)})
  }

  const renameVisualGroup=(group:string,name:string)=>{
    const nextName=name.trim()
    if(!nextName||nextName===group)return
    void persist({items:items.map(item=>(item.visualGroup??'').trim()===group?{...item,visualGroup:nextName}:item)})
    setCollapsedProgramGroups(current=>{
      const next={...current};if(group in next){next[nextName]=next[group];delete next[group]}return next
    })
  }

  const moveVisualGroup=(group:string,direction:-1|1)=>{
    const ordered=[...selectedItems]
    const keys:string[]=[]
    const keyFor=(item:InventoryMaterial)=>{
      const visual=(item.visualGroup??'').trim()
      return visual||'__item:'+item.id
    }
    for(const item of ordered){const key=keyFor(item);if(!keys.includes(key))keys.push(key)}
    const index=keys.indexOf(group),target=index+direction
    if(index<0||target<0||target>=keys.length)return
    ;[keys[index],keys[target]]=[keys[target],keys[index]]
    const byKey=new Map<string,InventoryMaterial[]>()
    for(const item of ordered){const key=keyFor(item);byKey.set(key,[...(byKey.get(key)??[]),item])}
    const nextOrder=keys.flatMap(key=>byKey.get(key)??[])
    const orderById=new Map(nextOrder.map((item,position)=>[item.id,position]))
    void persist({items:items.map(item=>orderById.has(item.id)?{...item,listOrder:orderById.get(item.id)}:item)})
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

  const applyKit=(kit:InventoryKit,multiplier=1)=>{
    const factor=Math.max(1,Math.min(99,Math.floor(multiplier)||1))
    let next=[...items]
    for(const kitItem of kit.items){
      const amount=kitItem.quantity*factor
      const existing=next.find(item=>(kitItem.stockItemId&&item.stockItemId===kitItem.stockItemId)||(!kitItem.stockItemId&&item.category===kitItem.category&&item.name.trim().toLowerCase()===kitItem.name.trim().toLowerCase()))
      if(existing)next=next.map(item=>item.id===existing.id?{...item,quantity:item.quantity+amount,returned:false,checkState:'prepare' as InventoryChecklistState}:item)
      else next.push({id:crypto.randomUUID(),name:kitItem.name,category:kitItem.category,quantity:amount,stockItemId:kitItem.stockItemId,loaded:false,returned:false,checkState:'prepare'})
    }
    void persist({items:next})
    toast('Kit « '+kit.name+' » × '+factor+' ajouté au programme.')
  }

  const renameKit=async(kit:InventoryKit,name:string)=>{
    const value=name.trim()
    if(!value||value===kit.name)return
    const next=kits.map(valueKit=>valueKit.id===kit.id?{...valueKit,name:value,updatedAt:now()}:valueKit)
    setKits(next);await saveInventoryKits(next);toast('Kit renommé.')
  }

  const duplicateKit=async(kit:InventoryKit)=>{
    const stamp=now()
    const clone:InventoryKit={...kit,id:crypto.randomUUID(),name:kit.name+' — copie',items:kit.items.map(item=>({...item})),createdAt:stamp,updatedAt:stamp}
    const next=[...kits,clone]
    setKits(next);await saveInventoryKits(next);toast('Kit dupliqué.')
  }

  const replaceKitWithSelection=async(kit:InventoryKit)=>{
    if(!selectedItems.length){toast('Sélectionnez du matériel dans le programme.');return}
    const next=kits.map(value=>value.id===kit.id?{...value,items:selectedItems.map(item=>({name:item.name,quantity:item.quantity,category:item.category,stockItemId:item.stockItemId})),updatedAt:now()}:value)
    setKits(next);await saveInventoryKits(next);toast('Contenu du kit mis à jour.')
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
      if(field==='loaded')return {...item,loaded:checked,returned:checked?item.returned:false,checkState:checked?'loaded':'prepare' as InventoryChecklistState}
      return {...item,returned:checked,loaded:checked?true:item.loaded,checkState:checked?'returned':(item.loaded?'loaded':'prepare') as InventoryChecklistState}
    })
    await persist({items:next})
    await logActivity('complete',field==='loaded'?(checked?'Matériel chargé':'Chargement annulé'):(checked?'Matériel retourné':'Retour annulé'),target.name,{
      source:'inventory',inventoryProgramId:program.id,inventoryStockItemId:target.stockItemId
    })
  }

  const setChecklistStage=async(id:string,checkState:InventoryChecklistState)=>{
    if(!program)return
    const target=items.find(item=>item.id===id)
    if(!target)return
    const loaded=['loaded','onsite','returned'].includes(checkState)
    const returned=checkState==='returned'
    await persist({items:items.map(item=>item.id===id?{...item,checkState,loaded,returned}:item)})
    await logActivity('complete','Check-list matériel',target.name+' · '+({prepare:'À préparer',loaded:'Chargé',onsite:'Sur place',returned:'Retourné',problem:'Problème'} as Record<InventoryChecklistState,string>)[checkState],{
      source:'inventory',inventoryProgramId:program.id,inventoryStockItemId:target.stockItemId
    })
  }

  const markAllChecklist=async(field:'loaded'|'returned',checked:boolean)=>{
    if(!program)return
    const next=items.map(item=>item.quantity>0?(
      field==='loaded'
        ?{...item,loaded:checked,returned:checked?item.returned:false,checkState:(checked?'loaded':'prepare') as InventoryChecklistState}
        :{...item,returned:checked,loaded:checked?true:item.loaded,checkState:(checked?'returned':(item.loaded?'loaded':'prepare')) as InventoryChecklistState}
    ):item)
    await persist({items:next})
    await logActivity('complete',field==='loaded'?(checked?'Programme chargé':'Chargement réinitialisé'):(checked?'Programme retourné':'Retours réinitialisés'),program.name,{
      source:'inventory',inventoryProgramId:program.id
    })
  }

  const resetChecklist=async()=>{
    if(!program)return
    await persist({items:items.map(item=>item.quantity>0?{...item,loaded:false,returned:false,checkState:'prepare' as InventoryChecklistState}:item)})
    await logActivity('update','Check-list réinitialisée',program.name,{source:'inventory',inventoryProgramId:program.id})
  }

  const prepareSourceOptimization=()=>{
    if(!program||!missingItems.length){setSourcePlan([]);toast('Aucun manque à optimiser.');return}
    const candidatesByItem=new Map<string,InventoryStockItem[]>()
    for(const item of missingItems){
      const same=stock.filter(candidate=>
        candidate.category===item.category&&
        candidate.name.trim().toLowerCase()===item.name.trim().toLowerCase()&&
        effectiveStockQuantity(candidate,program,programs)>0
      )
      candidatesByItem.set(item.id,same)
    }
    const providerScore=new Map<string,number>()
    for(const candidates of candidatesByItem.values()){
      for(const provider of new Set(candidates.map(candidate=>normalizeProvider(candidate.provider)))){
        providerScore.set(provider,(providerScore.get(provider)??0)+1)
      }
    }
    const providerRank=Array.from(providerScore.entries()).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'fr')).map(([provider])=>provider)
    const plan:Array<{itemId:string;stockItemId:string;provider:string;available:number}>=[]
    for(const item of missingItems){
      const candidates=[...(candidatesByItem.get(item.id)??[])].sort((a,b)=>{
        const rankA=providerRank.indexOf(normalizeProvider(a.provider)),rankB=providerRank.indexOf(normalizeProvider(b.provider))
        if(rankA!==rankB)return rankA-rankB
        return effectiveStockQuantity(b,program,programs)-effectiveStockQuantity(a,program,programs)
      })
      const chosen=candidates[0]
      if(chosen)plan.push({itemId:item.id,stockItemId:chosen.id,provider:normalizeProvider(chosen.provider),available:effectiveStockQuantity(chosen,program,programs)})
    }
    setSourcePlan(plan)
    if(!plan.length)toast('Aucune source alternative disponible.')
  }

  const applySourcePlan=async()=>{
    if(!program||!sourcePlan.length)return
    const byItem=new Map(sourcePlan.map(plan=>[plan.itemId,plan]))
    const next=items.map(item=>{
      const plan=byItem.get(item.id)
      if(!plan)return item
      const source=stock.find(candidate=>candidate.id===plan.stockItemId)
      return source?{...item,stockItemId:source.id,name:source.name,category:source.category}:item
    })
    await persist({items:next})
    setSourcePlan([])
    toast('Proposition de sources appliquée.')
  }

  const duplicateProgram=async()=>{
    if(!program)return
    const stamp=now()
    const clone:InventoryProgram={
      ...structuredClone(program),
      id:crypto.randomUUID(),
      name:program.name+' — copie',
      isPublic:false,
      items:program.items.map(item=>({...item,id:crypto.randomUUID(),loaded:false,returned:false,checkState:'prepare'})),
      createdAt:stamp,updatedAt:stamp,deletedAt:null
    }
    await db.programs.add(clone)
    await logActivity('create','Programme dupliqué',clone.name,{source:'inventory',inventoryProgramId:clone.id})
    onChanged();toast('Programme dupliqué.');onOpen(clone.id)
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

  const installation=program?.installation??{nodes:[],links:[],suggestions:[],aiSummary:'',analysisMode:undefined,analyzedAt:undefined,snapshots:[],layers:{materials:true,audio:true,power:true,connectivity:true,accessories:true},layerOrder:[...BUILTIN_SCHEMA_LAYER_ORDER],customLayers:[]}
  useEffect(()=>{
    if(!program?.id)return
    const width=installation.stageWidthMeters??12,depth=installation.stageDepthMeters??8
    const autoScale=Math.max(20,Math.min(250,Math.min((installation.stageWidth??980)/Math.max(1,width),(installation.stageHeight??650)/Math.max(1,depth))))
    setStageMetricDraft({width,depth,scale:installation.stagePixelsPerMeter??Math.round(autoScale)})
  },[program?.id])
  const customSchemaLayers=installation.customLayers??[]
  const schemaLayerOrder=Array.from(new Set([
    ...(installation.layerOrder??[]),
    ...BUILTIN_SCHEMA_LAYER_ORDER,
    ...customSchemaLayers.map(layer=>layer.id)
  ])).filter(layerId=>BUILTIN_SCHEMA_LAYER_ORDER.includes(layerId as typeof BUILTIN_SCHEMA_LAYER_ORDER[number])||customSchemaLayers.some(layer=>layer.id===layerId))
  const installationLayers:Record<string,boolean>=Object.fromEntries(schemaLayerOrder.map(layerId=>[layerId,installation.layers?.[layerId]!==false]))
  const schemaLayerNames:Record<string,string>={
    ...BUILTIN_SCHEMA_LAYER_LABELS,
    ...Object.fromEntries(customSchemaLayers.map(layer=>[layer.id,layer.name]))
  }
  const schemaLayerIndex=(layerId:string)=>Math.max(0,schemaLayerOrder.indexOf(layerId))
  const linkLayerId=(link:InstallationLink)=>link.layerId??schemaLayerForLink(link.kind??installationLinkKind(link,program as InventoryProgram,stock))
  const nodeLayerId=(node:(typeof installation.nodes)[number])=>{
    const source=node.stockItemId?stock.find(item=>item.id===node.stockItemId):undefined
    return schemaLayerForNode(node,source?.category)
  }
  const layerItemCount=(layerId:string)=>installation.nodes.filter(node=>nodeLayerId(node)===layerId).length+installation.links.filter(link=>linkLayerId(link)===layerId).length
  const installationNeeds=useMemo(()=>{
    const counts=stockNeeds(installation)
    return Array.from(counts.entries()).map(([stockItemId,quantity])=>{
      const item=stock.find(value=>value.id===stockItemId)
      const available=program&&item?effectiveStockQuantity(item,program,programs):0
      return {stockItemId,quantity,item,available,shortage:Math.max(0,quantity-available)}
    })
  },[installation.nodes,stock,program,programs])
  const installationShortages=installationNeeds.filter(value=>value.shortage>0)
  const electricalSummary=useMemo(()=>{
    let knownWatts=0,knownDevices=0,powered=0
    for(const node of installation.nodes){
      if(node.visualOnly||node.kind==='text'||node.kind==='zone'||node.kind==='shape')continue
      const source=node.stockItemId?stock.find(item=>item.id===node.stockItemId):undefined
      const isPowered=(source?.ports??[]).some(port=>port.direction==='power')||/alimentation|prise|onduleur|baffle|table|mr18|piano|clavier|répéteur|repeteur/i.test(node.name)
      if(isPowered)powered+=Math.max(1,node.quantity??1)
      const power=(source?.characteristics??[]).find(c=>/puissance|power|watt/i.test(c.label))
      const watts=power?Number(String(power.value).replace(',','.').match(/[\d.]+/)?.[0]??0):0
      if(watts>0){knownWatts+=watts*Math.max(1,node.quantity??1);knownDevices+=Math.max(1,node.quantity??1)}
    }
    return {powered,knownWatts:Math.round(knownWatts),knownDevices,outlets:Math.max(1,powered)}
  },[installation.nodes,stock])
  const diagnosticChain=useMemo(()=>{
    if(!diagnosticNodeId)return [] as string[]
    const seen=new Set<string>(),order:string[]=[]
    const walk=(id:string)=>{
      if(seen.has(id))return
      seen.add(id)
      for(const link of installation.links.filter(link=>link.toNodeId===id))walk(link.fromNodeId)
      order.push(id)
    }
    walk(diagnosticNodeId)
    return order
  },[diagnosticNodeId,installation.links])
  const stockByNode=(nodeId:string)=>{
    const node=installation.nodes.find(item=>item.id===nodeId)
    return node?.stockItemId?stock.find(item=>item.id===node.stockItemId):undefined
  }
  const toggleInstallationLayer=(layer:string)=>{
    void persist({installation:{...installation,layers:{...(installation.layers??{}),[layer]:!installationLayers[layer]}}})
  }
  const selectActiveSchemaLayer=(layer:string)=>{
    if(layer==='materials')return
    setActiveSchemaLayer(layer)
    if(!installationLayers[layer])void persist({installation:{...installation,layers:{...(installation.layers??{}),[layer]:true}}})
  }
  const addSchemaLayer=()=>{
    const name=newSchemaLayerName.trim()
    if(!name)return
    const layerId='custom-'+crypto.randomUUID().slice(0,8)
    const customLayers=[...customSchemaLayers,{id:layerId,name,visible:true}]
    const layerOrder=[...schemaLayerOrder,layerId]
    void persist({installation:{...installation,customLayers,layerOrder,layers:{...(installation.layers??{}),[layerId]:true}}})
    setNewSchemaLayerName('')
    setActiveSchemaLayer(layerId)
  }
  const renameSchemaLayer=(layerId:string,name:string)=>{
    const value=name.trim()
    if(!value)return
    void persist({installation:{...installation,customLayers:customSchemaLayers.map(layer=>layer.id===layerId?{...layer,name:value}:layer)}})
  }
  const moveSchemaLayer=(layerId:string,direction:-1|1)=>{
    const order=[...schemaLayerOrder]
    const index=order.indexOf(layerId),target=index+direction
    if(index<0||target<0||target>=order.length)return
    ;[order[index],order[target]]=[order[target],order[index]]
    void persist({installation:{...installation,layerOrder:order}})
  }
  const removeSchemaLayer=(layerId:string)=>{
    if(!customSchemaLayers.some(layer=>layer.id===layerId))return
    const nodes=installation.nodes.map(node=>node.layerId===layerId?{...node,layerId:'materials'}:node)
    const links=installation.links.map(link=>link.layerId===layerId?{...link,layerId:schemaLayerForLink(link.kind)}:link)
    const layers={...(installation.layers??{})};delete layers[layerId]
    void persist({installation:{...installation,nodes,links,customLayers:customSchemaLayers.filter(layer=>layer.id!==layerId),layerOrder:schemaLayerOrder.filter(id=>id!==layerId),layers}})
    if(activeSchemaLayer===layerId)setActiveSchemaLayer('audio')
  }
  const openSchemaExport=()=>{
    setExportLayerSelection(Object.fromEntries(schemaLayerOrder.map(layerId=>[layerId,installationLayers[layerId]!==false])))
    setExportLayersOpen(value=>!value)
  }
  const runSchemaExport=async(mode:'combined'|'separate')=>{
    if(!program||!schemaCanvasRef.current)return
    const selected=schemaLayerOrder.filter(layerId=>exportLayerSelection[layerId])
    if(!selected.length){toast('Choisissez au moins une couche.');return}
    setSchemaExporting(true)
    try{
      const count=await exportInstallationSchemaImage(schemaCanvasRef.current,program,selected,mode,schemaLayerNames,exportKeepMaterials)
      toast(count>1?count+' images exportées.':'Schéma exporté en PNG.')
      setExportLayersOpen(false)
    }catch(error){toast(error instanceof Error?error.message:'Export impossible.')}
    finally{setSchemaExporting(false)}
  }
  const connectSchemaNodes=(fromNodeId:string,toNodeId:string)=>{
    if(!program||fromNodeId===toNodeId)return
    const kind:InstallationLink['kind']=activeSchemaLayer==='audio'?'audio':activeSchemaLayer==='power'?'power':activeSchemaLayer==='accessories'?'accessory':activeSchemaLayer==='connectivity'?'network':'unknown'
    const rawLink:InstallationLink={id:crypto.randomUUID(),fromNodeId,toNodeId,kind,layerId:activeSchemaLayer}
    const draftProgram={...program,installation:{...installation,links:[...installation.links,rawLink],suggestions:[]}}
    const links=enrichInstallationLinks(draftProgram,stock)
    void persist({installation:{...installation,links,suggestions:[],aiSummary:'',analyzedAt:undefined,analysisMode:undefined}})
    const from=installation.nodes.find(node=>node.id===fromNodeId)?.name??'Équipement'
    const to=installation.nodes.find(node=>node.id===toNodeId)?.name??'équipement'
    toast(from+' → '+to+' · '+(schemaLayerNames[activeSchemaLayer]??'Liaison'))
  }
  const handleSchemaNodeClick=(nodeId:string)=>{
    if(!selectedSchemaNode){setSelectedSchemaNode(nodeId);return}
    if(selectedSchemaNode===nodeId){setSelectedSchemaNode('');return}
    connectSchemaNodes(selectedSchemaNode,nodeId)
    setSelectedSchemaNode('')
  }
  const addInstallationNode=()=>{
    if(!program)return
    const stockItem=installationStockId?stock.find(item=>item.id===installationStockId):undefined
    const name=(stockItem?.name??installationNodeName).trim()
    if(!name){toast('Choisissez un matériel ou saisissez un nom.');return}
    const index=installation.nodes.length
    const node={id:crypto.randomUUID(),name,stockItemId:stockItem?.id,x:70+(index%4)*180,y:85+Math.floor(index/4)*135,zone:'Scène',scale:1,rotation:0,layerId:stockItem?.category==='accessoire'?'accessories':'materials'}
    void persist({installation:{...installation,nodes:[...installation.nodes,node]}})
    setInstallationNodeName('');setInstallationStockId('')
  }
  const updateInstallationNode=(id:string,patch:Partial<(typeof installation.nodes)[number]>)=>{
    void persist({installation:{...installation,nodes:installation.nodes.map(node=>node.id===id?{...node,...patch}:node)}})
  }
  const setInstallationNodeGeometry=(id:string,patch:Partial<(typeof installation.nodes)[number]>,commit=false)=>{
    if(!program)return
    const nextInstallation={...installation,nodes:installation.nodes.map(node=>node.id===id?{...node,...patch}:node)}
    if(commit)void persist({installation:nextInstallation})
    else setProgram({...program,installation:nextInstallation})
  }
  const setInstallationLinkRoute=(id:string,route:Array<{x:number;y:number}>|undefined,commit=false)=>{
    if(!program)return
    const nextInstallation={...installation,links:installation.links.map(link=>link.id===id?{...link,route}:link)}
    if(commit)void persist({installation:nextInstallation})
    else setProgram({...program,installation:nextInstallation})
  }
  const installationNodeCenter=(node:(typeof installation.nodes)[number],index:number)=>{
    const scale=node.scale??1,w=node.width??110*scale,h=node.height??84*scale
    const x=node.x??70+(index%4)*180,y=node.y??85+Math.floor(index/4)*135
    return {x:x+w/2,y:y+h/2,w,h,left:x,top:y}
  }
  const addCableBend=(link:InstallationLink,orthogonal=false)=>{
    const from=installation.nodes.find(node=>node.id===link.fromNodeId),to=installation.nodes.find(node=>node.id===link.toNodeId)
    if(!from||!to)return
    const a=installationNodeCenter(from,installation.nodes.indexOf(from)),b=installationNodeCenter(to,installation.nodes.indexOf(to))
    const route=orthogonal?[{x:(a.x+b.x)/2,y:a.y},{x:(a.x+b.x)/2,y:b.y}]:[...(link.route??[]),{x:(a.x+b.x)/2,y:(a.y+b.y)/2}]
    updateInstallationLink(link.id,{route})
  }
  const resizeInstallationNodeFromPointer=(state:{id:string;startX:number;startY:number;width:number;height:number;x:number;y:number;handle:'n'|'ne'|'e'|'se'|'s'|'sw'|'w'|'nw'},clientX:number,clientY:number,commit=false)=>{
    const dx=clientX-state.startX,dy=clientY-state.startY,minW=52,minH=48
    let x=state.x,y=state.y,width=state.width,height=state.height
    if(state.handle.includes('e'))width=Math.max(minW,state.width+dx)
    if(state.handle.includes('s'))height=Math.max(minH,state.height+dy)
    if(state.handle.includes('w')){
      const wanted=state.width-dx
      if(wanted>=minW){width=wanted;x=state.x+dx}else{width=minW;x=state.x+state.width-minW}
    }
    if(state.handle.includes('n')){
      const wanted=state.height-dy
      if(wanted>=minH){height=wanted;y=state.y+dy}else{height=minH;y=state.y+state.height-minH}
    }
    setInstallationNodeGeometry(state.id,{x,y,width,height},commit)
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
      return {id:crypto.randomUUID(),name:matched?.name??name,stockItemId:matched?.id,x:baseX+(index%4)*180,y:baseY+Math.floor(index/4)*135,zone:index<4?'Scène':'Régie',scale:1,rotation:0,layerId:matched?.category==='accessoire'||/sustain|pied|support|stand/i.test(name)?'accessories':'materials'}
    })
    const links:InstallationLink[]=[]
    const connect=(a:number,b:number,linkKind:InstallationLink['kind']='unknown')=>{if(nodes[a]&&nodes[b])links.push({id:crypto.randomUUID(),fromNodeId:nodes[a].id,toNodeId:nodes[b].id,kind:linkKind,layerId:schemaLayerForLink(linkKind)})}
    if(kind==='piano'){connect(0,1,'power');connect(1,2,'power');connect(2,3,'power');connect(3,4,'audio');connect(4,5,'audio');connect(5,6,'audio');connect(6,7,'audio');connect(8,3,'accessory')}
    if(kind==='drums'){connect(0,1,'audio');connect(1,2,'audio');connect(2,3,'audio')}
    if(kind==='mr18'){connect(0,1,'power');connect(1,2,'power');connect(2,3,'network');connect(3,4,'network');connect(5,6,'power');connect(6,4,'power')}
    void persist({installation:{...installation,nodes:[...installation.nodes,...nodes],links:[...installation.links,...links],suggestions:[]}})
    toast('Modèle '+(kind==='piano'?'Piano':kind==='drums'?'Batterie':'MR18 + réseau')+' ajouté.')
  }
  const duplicateInstallationNode=(id:string)=>{
    const source=installation.nodes.find(node=>node.id===id)
    if(!source)return
    const clone={...source,id:crypto.randomUUID(),x:(source.x??70)+34,y:(source.y??85)+34}
    void persist({installation:{...installation,nodes:[...installation.nodes,clone]}})
    setSelectedSchemaNode(clone.id);setSelectedSchemaLink('')
    toast(source.name+' dupliqué.')
  }
  const setLinkRouteMode=(link:InstallationLink,mode:'straight'|'zigzag'|'curve')=>{
    const from=installation.nodes.find(node=>node.id===link.fromNodeId),to=installation.nodes.find(node=>node.id===link.toNodeId)
    if(!from||!to)return
    const a=installationNodeCenter(from,installation.nodes.indexOf(from)),b=installationNodeCenter(to,installation.nodes.indexOf(to))
    if(mode==='straight'){updateInstallationLink(link.id,{routeMode:'straight',route:undefined});return}
    if(mode==='zigzag'){
      const dx=b.x-a.x,dy=b.y-a.y
      const route=Math.abs(dx)>=Math.abs(dy)
        ?[{x:a.x+dx*.25,y:a.y},{x:a.x+dx*.25,y:a.y+dy*.45},{x:a.x+dx*.7,y:a.y+dy*.45},{x:a.x+dx*.7,y:b.y}]
        :[{x:a.x,y:a.y+dy*.25},{x:a.x+dx*.45,y:a.y+dy*.25},{x:a.x+dx*.45,y:a.y+dy*.7},{x:b.x,y:a.y+dy*.7}]
      updateInstallationLink(link.id,{routeMode:'zigzag',route});return
    }
    const route=link.route?.length?link.route:[{x:(a.x+b.x)/2,y:(a.y+b.y)/2-70}]
    updateInstallationLink(link.id,{routeMode:'curve',route})
  }
  const resizeStage=(dw:number,dh:number)=>{
    const width=Math.max(360,Math.min(2600,(installation.stageWidth??980)+dw))
    const height=Math.max(300,Math.min(2000,(installation.stageHeight??650)+dh))
    void persist({installation:{...installation,stageWidth:width,stageHeight:height}})
  }
  const applyStageMetrics=(adaptPlan:boolean)=>{
    const widthMeters=Math.max(1,Math.min(100,Number(stageMetricDraft.width)||12))
    const depthMeters=Math.max(1,Math.min(100,Number(stageMetricDraft.depth)||8))
    const pixelsPerMeter=Math.max(20,Math.min(250,Number(stageMetricDraft.scale)||80))
    const oldWidth=installation.stageWidth??980,oldHeight=installation.stageHeight??650
    if(!adaptPlan){
      void persist({installation:{...installation,stageWidthMeters:widthMeters,stageDepthMeters:depthMeters,stagePixelsPerMeter:pixelsPerMeter}})
      toast('Mesure mise à jour sans déplacer le plan.')
      return
    }
    const targetWidth=Math.max(360,Math.min(2600,Math.round(widthMeters*pixelsPerMeter)))
    const targetHeight=Math.max(300,Math.min(2000,Math.round(depthMeters*pixelsPerMeter)))
    const sx=targetWidth/oldWidth,sy=targetHeight/oldHeight,uniform=Math.min(sx,sy)
    const nodes=installation.nodes.map((node,index)=>{
      const defaultX=70+(index%4)*180,defaultY=85+Math.floor(index/4)*135
      const baseW=node.width??110*(node.scale??1),baseH=node.height??84*(node.scale??1)
      return {...node,x:Math.round((node.x??defaultX)*sx),y:Math.round((node.y??defaultY)*sy),width:Math.max(36,Math.round(baseW*uniform)),height:Math.max(32,Math.round(baseH*uniform))}
    })
    const links=installation.links.map(link=>({...link,route:link.route?.map(point=>({x:Math.round(point.x*sx),y:Math.round(point.y*sy)}))}))
    void persist({installation:{...installation,stageWidthMeters:widthMeters,stageDepthMeters:depthMeters,stagePixelsPerMeter:pixelsPerMeter,stageWidth:targetWidth,stageHeight:targetHeight,nodes,links}})
    toast('Échelle appliquée au plan actuel.')
  }
  const reserveInstallation=async()=>{
    if(!program)return
    if(installationShortages.length){toast(installationShortages.length+' matériel(s) insuffisant(s) dans le stock.');return}
    let next=[...items]
    for(const need of installationNeeds){
      if(!need.item)continue
      const existing=next.find(item=>item.stockItemId===need.stockItemId)
      if(existing)next=next.map(item=>item.id===existing.id?{...item,quantity:Math.max(item.quantity,need.quantity),returned:false}:item)
      else next.push({id:crypto.randomUUID(),name:need.item.name,category:need.item.category,quantity:need.quantity,stockItemId:need.stockItemId,loaded:false,returned:false})
    }
    await persist({items:next})
    await logActivity('update','Installation réservée',program.name+' · '+installationNeeds.length+' référence(s)',{source:'inventory',inventoryProgramId:program.id})
    toast('Matériels de l’installation réservés dans le programme.')
  }
  const saveInstallationSnapshot=async()=>{
    if(!program)return
    const stamp=now()
    const name=snapshotName.trim()||'Plan '+((installation.snapshots?.length??0)+1)
    const snapshot={id:crypto.randomUUID(),name,nodes:installation.nodes.map(node=>({...node})),links:installation.links.map(link=>({...link,compatibilityNotes:[...(link.compatibilityNotes??[])]})),layers:{...(installation.layers??{})},layerOrder:[...schemaLayerOrder],customLayers:customSchemaLayers.map(layer=>({...layer})),createdAt:stamp}
    await persist({installation:{...installation,snapshots:[...(installation.snapshots??[]),snapshot]}})
    setSnapshotName('')
    await logActivity('update','Version installation enregistrée',name,{source:'inventory',inventoryProgramId:program.id})
    toast('Version « '+name+' » enregistrée.')
  }
  const restoreInstallationSnapshot=async(id:string)=>{
    const snapshot=(installation.snapshots??[]).find(value=>value.id===id)
    if(!snapshot)return
    await persist({installation:{...installation,nodes:snapshot.nodes.map(node=>({...node})),links:snapshot.links.map(link=>({...link,compatibilityNotes:[...(link.compatibilityNotes??[])]})),layers:snapshot.layers??installation.layers,layerOrder:snapshot.layerOrder??installation.layerOrder,customLayers:snapshot.customLayers??installation.customLayers,suggestions:[],aiSummary:'',analysisMode:undefined,analyzedAt:undefined}})
    toast('Version « '+snapshot.name+' » restaurée.')
  }
  const deleteInstallationSnapshot=(id:string)=>void persist({installation:{...installation,snapshots:(installation.snapshots??[]).filter(value=>value.id!==id)}})
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
  const removeInstallationLink=(id:string)=>{if(selectedSchemaLink===id)setSelectedSchemaLink('');void persist({installation:{...installation,links:installation.links.filter(link=>link.id!==id),suggestions:[],aiSummary:'',analyzedAt:undefined,analysisMode:undefined}})}
  useEffect(()=>{
    const onDelete=(event:KeyboardEvent)=>{
      if(event.key!=='Delete')return
      const target=event.target as HTMLElement|null
      if(target?.closest('input,textarea,select,[contenteditable="true"]'))return
      if(selectedSchemaNode){event.preventDefault();removeInstallationNode(selectedSchemaNode);setSelectedSchemaNode('');toast('Équipement supprimé.');return}
      if(selectedSchemaLink){event.preventDefault();removeInstallationLink(selectedSchemaLink);setSelectedSchemaLink('');toast('Liaison supprimée.')}
    }
    window.addEventListener('keydown',onDelete)
    return()=>window.removeEventListener('keydown',onDelete)
  },[selectedSchemaNode,selectedSchemaLink,installation.nodes,installation.links])
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

  const createStockFromStage=async(draft:{name:string;category:InventoryCategory;provider?:string;quantity:number}):Promise<InventoryStockItem>=>{
    const name=draft.name.trim()||'Matériel'
    const provider=normalizeProvider(draft.provider)
    const category=draft.category||'instrument'
    const quantity=Math.max(1,Math.round(draft.quantity)||1)
    const existing=stock.find(item=>normalizeProvider(item.provider)===provider&&item.category===category&&item.name.trim().toLowerCase()===name.toLowerCase())
    if(existing){
      const next={...existing,quantity:existing.quantity+quantity,updatedAt:now()}
      await db.inventoryStock.update(existing.id,{quantity:next.quantity,updatedAt:next.updatedAt})
      setStock(items=>items.map(item=>item.id===existing.id?next:item))
      await logActivity('update','Entrée stock depuis installation',name+' · +'+quantity,{source:'inventory',inventoryStockItemId:existing.id,inventoryProvider:provider,inventoryDelta:quantity})
      onChanged()
      return next
    }
    const technical=defaultTechnicalProfile(name),stamp=now()
    const item:InventoryStockItem={id:crypto.randomUUID(),name,category,quantity,provider,status:'available',characteristics:technical.characteristics,ports:technical.ports,notes:'',createdAt:stamp,updatedAt:stamp,deletedAt:null}
    await db.inventoryStock.add(item)
    setStock(items=>[...items,item].sort((a,b)=>a.name.localeCompare(b.name,'fr')))
    await logActivity('create','Matériel créé depuis installation',name+' · '+quantity,{source:'inventory',inventoryStockItemId:item.id,inventoryProvider:provider,inventoryDelta:quantity})
    onChanged()
    return item
  }

  if(!program)return <section className="panel inventory-empty"><span>Chargement du programme…</span></section>

  return <div className={'inventory-program-page view-'+programView}>
    <section className="program-detail-head panel compact-program-head">
      <div className="program-title-block">
        <span className="eyebrow">Programme · événement</span>
        <input className="program-title-input" value={program.name} onChange={e=>setProgram({...program,name:e.target.value})} onBlur={()=>void persist({name:program.name.trim()||'Événement'})}/>
        <div className="program-summary">
          {program.date&&<span>{new Date(program.date+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'short'})}</span>}
          {program.location&&<span>{program.location}</span>}
          <span>{selectedItems.length} réf. · {totalQuantity} u.</span>
          <span>{recurrenceText(program)}</span>
          <span className={missingItems.length?'summary-warning':'summary-ready'}>{missingItems.length?missingItems.length+' manquant'+(missingItems.length>1?'s':''):'Prêt'}</span>
        </div>
      </div>
      <div className="program-head-actions">
        <button className={'secondary mobile-icon-action '+(overviewOpen?'active':'')} aria-label="Voir" title="Voir" onClick={()=>setOverviewOpen(value=>!value)}><Eye/><span>{overviewOpen?'Fermer la vue':'Voir'}</span></button>
        <button className={'secondary mobile-icon-action '+(program.isPublic?'active':'')} aria-label={program.isPublic?'Rendre personnel':'Rendre public'} title={program.isPublic?'Rendre personnel':'Rendre public'} onClick={()=>void persist({isPublic:!program.isPublic}).then(()=>toast(program.isPublic?'Inventaire repassé en mode personnel.':'Inventaire rendu public.'))}><Globe2/><span>{program.isPublic?'Public':'Rendre public'}</span></button>
        <button className="secondary mobile-icon-action" aria-label="Partager" title="Partager" onClick={onShare}><Share2/><span>Partager</span></button>
        <button className="secondary mobile-icon-action" aria-label="Dupliquer" title="Dupliquer" onClick={()=>void duplicateProgram()}><Copy/><span>Dupliquer</span></button>
        <button className="secondary mobile-icon-action" aria-label="Exporter" title="Exporter" onClick={()=>setExportOpen(true)}><ImageDown/><span>Exporter</span></button>
        <button className="bare-action danger-icon" aria-label="Supprimer le programme" onClick={()=>setConfirmDelete(true)}><Trash2/></button>
      </div>
    </section>
    <div className="program-section-tabs panel" aria-label="Sections du programme">
      <button className={overviewOpen?'active':''} onClick={()=>{setProgramView('materials');setOverviewOpen(value=>!value);setChecklistOpen(false);setMissingOnly(false)}}><Eye/><span>Aperçu</span></button>
      <button className={programView==='materials'&&!overviewOpen&&!checklistOpen&&!missingOnly?'active':''} onClick={()=>{setProgramView('materials');setOverviewOpen(false);setChecklistOpen(false);setMissingOnly(false)}}><Boxes/><span>Matériel</span></button>
      <button className={checklistOpen?'active':''} onClick={()=>{setProgramView('materials');setOverviewOpen(false);setChecklistOpen(true);setMissingOnly(false)}}><ClipboardCheck/><span>Check-list</span></button>
      {advancedInstallationAvailable&&<button className={programView==='installation'?'active':''} onClick={()=>{setProgramView('installation');setInstallationOpen(true);setOverviewOpen(false);setChecklistOpen(false);setMissingOnly(false)}}><Network/><span>Installation</span></button>}
      <button className={missingOnly?'active':''} onClick={()=>{setProgramView('materials');setOverviewOpen(false);setChecklistOpen(false);setMissingOnly(true)}}><PackageSearch/><span>Besoins</span></button>
      <button onClick={()=>setExportOpen(true)}><ImageDown/><span>Export</span></button>
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
      {installationOpen&&<div className={'installation-advanced-body install-mode-'+installationView}>
        <div className="installation-workspace-toolbar">
          <div className="installation-view-switch">
            <button className={installationView==='schema'?'active':''} onClick={()=>setInstallationView('schema')}><Network/>Schéma</button>
            <button className={installationView==='list'?'active':''} onClick={()=>setInstallationView('list')}><Boxes/>Liste</button>
            <button className={installationView==='patch'?'active':''} onClick={()=>setInstallationView('patch')}><Link2/>Patch</button>
            <button className={installationView==='diagnostic'?'active':''} onClick={()=>setInstallationView('diagnostic')}><Settings2/>Diagnostic</button>
          </div>
          <div className="installation-validation-actions">
            <span className={installationShortages.length?'warning':'ok'}>{installationShortages.length?installationShortages.length+' manque(s) stock':'Stock compatible'}</span>
            <button className="primary" disabled={!installation.nodes.length||installationShortages.length>0} onClick={()=>void reserveInstallation()}><PackageCheck/><span>Réserver</span></button>
          </div>
        </div>
        {installationView==='schema'&&<StageEditor key={program.id} program={program} stock={stock} onSave={installation=>persist({installation})} onDraftChange={installation=>setProgram(current=>current?{...current,installation}:current)} onCreated={onOpen} onChanged={onChanged} onCreateStock={createStockFromStage} toast={toast} renderIcon={(node,source)=><TechnicalIcon icon={source?.representationIcon} text={node.name+' '+(source?.category??node.category??'')}/>}/>}
        {installationView==='list'&&<div className="installation-list-view">{installation.nodes.length?installation.nodes.map((node,index)=>{const source=stockByNode(node.id);const need=node.stockItemId?installationNeeds.find(value=>value.stockItemId===node.stockItemId):undefined;return <article key={node.id}><span>{index+1}</span><div><b>{node.name}</b><small>{node.zone??'Scène'} · {source?normalizeProvider(source.provider)+' · '+categoryLabel(source.category,categories):'Équipement libre'}</small></div>{need&&<em className={need.shortage?'warning':'ok'}>{need.shortage?'manque '+need.shortage:'dispo '+need.available}</em>}</article>}):<div className="installation-empty">Aucun équipement.</div>}</div>}
        {installationView==='patch'&&<div className="installation-patch-view">{installation.links.length?installation.links.map((link,index)=>{const from=installation.nodes.find(node=>node.id===link.fromNodeId),to=installation.nodes.find(node=>node.id===link.toNodeId);const kind=link.kind??installationLinkKind(link,program,stock);return <article key={link.id}><span>{index+1}</span><b>{link.assignedChannel||'Auto'}</b><div>{from?.name??'?'} <em>→</em> {to?.name??'?'}</div><small>{kind}{link.lengthMeters?' · '+link.lengthMeters+' m':''}</small></article>}):<div className="installation-empty">Aucune liaison dans le patch.</div>}</div>}
        {installationView==='diagnostic'&&<div className="installation-diagnostic-view"><div className="installation-diagnostic-picker"><label>Équipement à diagnostiquer<select value={diagnosticNodeId} onChange={e=>setDiagnosticNodeId(e.target.value)}><option value="">Choisir…</option>{installation.nodes.map(node=><option value={node.id} key={node.id}>{node.name}</option>)}</select></label></div>{diagnosticNodeId&&<><div className="diagnostic-chain">{diagnosticChain.map((id,index)=>{const node=installation.nodes.find(value=>value.id===id);return <span key={id}><b>{node?.name??'?'}</b>{index<diagnosticChain.length-1&&<ChevronRight/>}</span>})}</div><div className="diagnostic-findings">{installation.links.filter(link=>diagnosticChain.includes(link.fromNodeId)&&diagnosticChain.includes(link.toNodeId)&&(link.compatibility==='warning'||(link.compatibilityNotes?.length??0)>0)).map(link=><div key={link.id}><AlertTriangle/><span>{link.compatibilityNotes?.join(' · ')||'Liaison à vérifier'}</span></div>)}{!installation.links.some(link=>diagnosticChain.includes(link.fromNodeId)&&diagnosticChain.includes(link.toNodeId)&&link.compatibility==='warning')&&<div className="diagnostic-ok"><Check/>Aucune incompatibilité bloquante détectée sur cette chaîne.</div>}</div></>}</div>}
        {installationView!=='schema'&&<>
        <div className="installation-version-manager"><div><b>Versions du plan</b><small>Enregistrez Plan A, Plan B, répétition, concert… puis restaurez-les à tout moment.</small></div><div className="installation-version-create"><input value={snapshotName} onChange={e=>setSnapshotName(e.target.value)} placeholder={'Plan '+((installation.snapshots?.length??0)+1)}/><button className="secondary" disabled={!installation.nodes.length} onClick={()=>void saveInstallationSnapshot()}><Save/>Enregistrer version</button></div>{(installation.snapshots??[]).length>0&&<div className="installation-version-list">{(installation.snapshots??[]).map(snapshot=><span key={snapshot.id}><button className="bare-action" onClick={()=>void restoreInstallationSnapshot(snapshot.id)}><RotateCcw/>{snapshot.name}</button><small>{new Date(snapshot.createdAt).toLocaleString('fr-FR')}</small><button className="bare-action danger-icon" onClick={()=>deleteInstallationSnapshot(snapshot.id)}><Trash2/></button></span>)}</div>}</div>
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
          <div ref={schemaCanvasRef} className="installation-canvas installation-schematic topview-stage" style={{'--stage-width':(installation.stageWidth??980)+'px','--stage-height':(installation.stageHeight??650)+'px','--meter-size':(installation.stagePixelsPerMeter??Math.max(20,Math.min(250,Math.min((installation.stageWidth??980)/Math.max(1,installation.stageWidthMeters??12),(installation.stageHeight??650)/Math.max(1,installation.stageDepthMeters??8)))))+'px','--metric-width':((installation.stageWidthMeters??12)*(installation.stagePixelsPerMeter??Math.max(20,Math.min(250,Math.min((installation.stageWidth??980)/Math.max(1,installation.stageWidthMeters??12),(installation.stageHeight??650)/Math.max(1,installation.stageDepthMeters??8))))))+'px','--metric-height':((installation.stageDepthMeters??8)*(installation.stagePixelsPerMeter??Math.max(20,Math.min(250,Math.min((installation.stageWidth??980)/Math.max(1,installation.stageWidthMeters??12),(installation.stageHeight??650)/Math.max(1,installation.stageDepthMeters??8))))))+'px'} as CSSProperties}>
            <div className="stage-metric-grid" aria-hidden="true">
              {Array.from({length:Math.floor((installation.stageWidth??980)/(installation.stagePixelsPerMeter??Math.max(20,Math.min(250,Math.min((installation.stageWidth??980)/Math.max(1,installation.stageWidthMeters??12),(installation.stageHeight??650)/Math.max(1,installation.stageDepthMeters??8))))))+1},(_,i)=><span className="stage-meter-label x" style={{left:`calc(${i} * var(--meter-size))`}} key={'mx-'+i}>{i} m</span>)}
              {Array.from({length:Math.floor((installation.stageHeight??650)/(installation.stagePixelsPerMeter??Math.max(20,Math.min(250,Math.min((installation.stageWidth??980)/Math.max(1,installation.stageWidthMeters??12),(installation.stageHeight??650)/Math.max(1,installation.stageDepthMeters??8))))))+1},(_,i)=><span className="stage-meter-label y" style={{top:`calc(${i} * var(--meter-size))`}} key={'my-'+i}>{i} m</span>)}
              <span className="stage-metric-boundary"><b>{installation.stageWidthMeters??12} × {installation.stageDepthMeters??8} m</b></span>
              <span className="stage-meter-scale"><b>1 m</b></span>
            </div>
            <div className="topview-stage-markers" aria-hidden="true"><span>FOND DE SCÈNE</span><span>AVANT-SCÈNE</span><span>PUBLIC / RÉGIE</span></div>
            {installation.links.length>0&&<svg className="installation-wire-layer" aria-label="Câblage du schéma">{[...installation.links].sort((a,b)=>schemaLayerIndex(linkLayerId(a))-schemaLayerIndex(linkLayerId(b))).map(link=>{
              const from=installation.nodes.find(n=>n.id===link.fromNodeId),to=installation.nodes.find(n=>n.id===link.toNodeId)
              if(!from||!to)return null
              const a=installationNodeCenter(from,installation.nodes.indexOf(from)),b=installationNodeCenter(to,installation.nodes.indexOf(to))
              const kind=link.kind??installationLinkKind(link,program,stock),layer=linkLayerId(link),visible=installationLayers[layer]!==false
              const points=[{x:a.x,y:a.y},...(link.route??[]),{x:b.x,y:b.y}]
              const routeMode=link.routeMode??((link.route?.length??0)>0?'zigzag':'straight')
              const path=svgCablePath(points,routeMode)
              const selected=selectedSchemaLink===link.id
              return <g key={link.id} data-schema-layer={layer} data-layer-hidden={visible?'false':'true'} style={visible?undefined:{display:'none'}} className={'schema-wire-group mode-'+routeMode+' '+(selected?'selected':'')}>
                <path className="schema-wire-hit" d={path} onPointerDown={e=>{e.stopPropagation();setSelectedSchemaLink(link.id);setSelectedSchemaNode('')}}/>
                <path className={'wire-'+kind+' schema-wire layer-'+layer} d={path} fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
                {selected&&(link.route??[]).map((point,pointIndex)=><circle key={pointIndex} className="schema-route-handle" cx={point.x} cy={point.y} r="8"
                  onPointerDown={e=>{e.stopPropagation();schemaRouteRef.current={linkId:link.id,pointIndex};e.currentTarget.setPointerCapture(e.pointerId)}}
                  onPointerMove={e=>{const state=schemaRouteRef.current;if(!state||state.linkId!==link.id||state.pointIndex!==pointIndex||!e.currentTarget.hasPointerCapture(e.pointerId))return;const svg=e.currentTarget.ownerSVGElement,rect=svg?.getBoundingClientRect();if(!rect)return;const route=[...(link.route??[])];route[pointIndex]={x:e.clientX-rect.left,y:e.clientY-rect.top};setInstallationLinkRoute(link.id,route,false)}}
                  onPointerUp={e=>{const svg=e.currentTarget.ownerSVGElement,rect=svg?.getBoundingClientRect();if(rect){const route=[...(installation.links.find(value=>value.id===link.id)?.route??link.route??[])];route[pointIndex]={x:e.clientX-rect.left,y:e.clientY-rect.top};setInstallationLinkRoute(link.id,route,true)}schemaRouteRef.current=null;try{e.currentTarget.releasePointerCapture(e.pointerId)}catch{}}}/>)}
              </g>
            })}</svg>}
            {installation.nodes.length?installation.nodes.map((node,index)=>{
              const source=node.stockItemId?stock.find(item=>item.id===node.stockItemId):undefined
              const layer=nodeLayerId(node),visible=installationLayers[layer]!==false
              const x=node.x??70+(index%4)*180,y=node.y??85+Math.floor(index/4)*135
              const scale=Math.max(.65,Math.min(1.65,node.scale??1))
              const width=Math.max(52,node.width??110*scale),height=Math.max(48,node.height??84*scale)
              const equipmentType=installationEquipmentType(node.name,source?.category)
              const style={left:x,top:y,width,height,'--node-rotation':(node.rotation??0)+'deg',zIndex:3+schemaLayerIndex(layer),display:visible?undefined:'none'} as CSSProperties
              const selected=selectedSchemaNode===node.id
              return <div data-schema-layer={layer} data-layer-hidden={visible?'false':'true'} className={'installation-topview-node type-'+equipmentType+(selected?' selected':'')} key={node.id} style={style}
                onPointerDown={e=>{if((e.target as HTMLElement).closest('button,input,select,.schema-resize-handle,.schema-rotate-handle'))return;schemaPointerRef.current={id:node.id,startX:e.clientX,startY:e.clientY,moved:false};e.currentTarget.setPointerCapture(e.pointerId)}}
                onPointerMove={e=>{const state=schemaPointerRef.current;if(!state||state.id!==node.id||!e.currentTarget.hasPointerCapture(e.pointerId))return;const dx=e.clientX-state.startX,dy=e.clientY-state.startY;if(Math.hypot(dx,dy)>6)state.moved=true;if(state.moved){const rect=e.currentTarget.parentElement?.getBoundingClientRect();if(rect)setInstallationNodePosition(node.id,e.clientX-rect.left-width/2,e.clientY-rect.top-height/2,false)}}}
                onPointerUp={e=>{const state=schemaPointerRef.current;const rect=e.currentTarget.parentElement?.getBoundingClientRect();if(state?.moved&&rect)setInstallationNodePosition(node.id,e.clientX-rect.left-width/2,e.clientY-rect.top-height/2,true);else{handleSchemaNodeClick(node.id);setSelectedSchemaLink('')}schemaPointerRef.current=null;try{e.currentTarget.releasePointerCapture(e.pointerId)}catch{}}}>
                <span className="equipment-topview-glyph" aria-hidden="true"><TechnicalIcon icon={source?.representationIcon} text={node.name+' '+source?.category} className="schema-equipment-icon"/><i/><i/><i/><i/></span>
                <span className="equipment-topview-label"><b>{node.name}</b><small>{node.zone??'Scène'}</small></span>
                {selected&&<>
                  <button type="button" className="schema-rotate-handle" aria-label="Faire pivoter" title="Rotation libre"
                    onPointerDown={e=>{e.stopPropagation();const rect=e.currentTarget.parentElement?.getBoundingClientRect();if(!rect)return;schemaRotateRef.current={id:node.id,cx:rect.left+rect.width/2,cy:rect.top+rect.height/2};e.currentTarget.setPointerCapture(e.pointerId)}}
                    onPointerMove={e=>{const state=schemaRotateRef.current;if(!state||state.id!==node.id||!e.currentTarget.hasPointerCapture(e.pointerId))return;const angle=Math.round((Math.atan2(e.clientY-state.cy,e.clientX-state.cx)*180/Math.PI+90+360)%360);setInstallationNodeGeometry(node.id,{rotation:angle},false)}}
                    onPointerUp={e=>{const state=schemaRotateRef.current;if(state){const angle=Math.round((Math.atan2(e.clientY-state.cy,e.clientX-state.cx)*180/Math.PI+90+360)%360);setInstallationNodeGeometry(node.id,{rotation:angle},true)}schemaRotateRef.current=null;try{e.currentTarget.releasePointerCapture(e.pointerId)}catch{}}}><RotateCcw/></button>
                  {(['n','ne','e','se','s','sw','w','nw'] as const).map(handle=><button type="button" key={handle} className={'schema-resize-handle handle-'+handle} aria-label={'Redimensionner '+handle} title="Rogner / étirer"
                    onPointerDown={e=>{e.stopPropagation();schemaResizeRef.current={id:node.id,startX:e.clientX,startY:e.clientY,width,height,x,y,handle};e.currentTarget.setPointerCapture(e.pointerId)}}
                    onPointerMove={e=>{const state=schemaResizeRef.current;if(!state||state.id!==node.id||!e.currentTarget.hasPointerCapture(e.pointerId))return;resizeInstallationNodeFromPointer(state,e.clientX,e.clientY,false)}}
                    onPointerUp={e=>{const state=schemaResizeRef.current;if(state)resizeInstallationNodeFromPointer(state,e.clientX,e.clientY,true);schemaResizeRef.current=null;try{e.currentTarget.releasePointerCapture(e.pointerId)}catch{}}}><span/></button>)}
                </>}
              </div>
            }):(!installation.nodes.length?<div className="installation-empty topview-empty">Ajoutez les équipements de la scène ou de la chaîne audio.</div>:null)}
          </div>
          {selectedSchemaNode&&installation.nodes.some(node=>node.id===selectedSchemaNode)&&(()=>{const node=installation.nodes.find(value=>value.id===selectedSchemaNode)!;const source=node.stockItemId?stock.find(item=>item.id===node.stockItemId):undefined;const need=node.stockItemId?installationNeeds.find(value=>value.stockItemId===node.stockItemId):undefined;const canDuplicate=!source||!need||need.quantity<need.available;return <div className="schema-node-inspector">
            <div className="schema-node-inspector-head"><span><b>Équipement sélectionné</b><small>Placement et représentation vue du dessus</small></span><button className="bare-action" onClick={()=>setSelectedSchemaNode('')}><X/></button></div>
            <div className="schema-node-inspector-grid">
              <label><span>Nom</span><input value={node.name} onChange={e=>updateInstallationNode(node.id,{name:e.target.value})}/></label>
              <label><span>Zone</span><select value={node.zone??'Scène'} onChange={e=>updateInstallationNode(node.id,{zone:e.target.value})}><option>Scène</option><option>Scène gauche</option><option>Scène droite</option><option>Centre</option><option>Régie</option><option>Public</option><option>Backstage</option></select></label>
              <label><span>Couche</span><select value={nodeLayerId(node)} onChange={e=>updateInstallationNode(node.id,{layerId:e.target.value})}>{schemaLayerOrder.map(layerId=><option value={layerId} key={layerId}>{schemaLayerNames[layerId]??layerId}</option>)}</select></label>
              <label><span>Largeur</span><input type="number" min="52" max="500" value={Math.round(node.width??110*(node.scale??1))} onChange={e=>updateInstallationNode(node.id,{width:Math.max(52,Number(e.target.value)||52)})}/></label>
              <label><span>Hauteur</span><input type="number" min="48" max="400" value={Math.round(node.height??84*(node.scale??1))} onChange={e=>updateInstallationNode(node.id,{height:Math.max(48,Number(e.target.value)||48)})}/></label>
              <div className="schema-rotation-control"><span>Orientation</span><div><input type="range" min="0" max="359" value={node.rotation??0} onChange={e=>updateInstallationNode(node.id,{rotation:Number(e.target.value)})}/><b>{node.rotation??0}°</b></div></div>
            </div>
            {source&&(source.ports?.length??0)>0&&<div className="schema-node-ports">{(source.ports??[]).map(port=><em key={port.id}>{port.count}× {port.connector} · {port.direction==='input'?'IN':port.direction==='output'?'OUT':port.direction==='power'?'POWER':'I/O'}</em>)}</div>}
            <div className="schema-node-actions"><button className="secondary" disabled={!canDuplicate} onClick={()=>duplicateInstallationNode(node.id)}><Copy/>Dupliquer</button><button className="secondary" onClick={()=>updateInstallationNode(node.id,{width:undefined,height:undefined,rotation:0,scale:1})}><RotateCcw/>Réinitialiser cadre</button><button className="danger schema-remove-node" onClick={()=>{removeInstallationNode(node.id);setSelectedSchemaNode('')}}><Trash2/>Supprimer</button></div>
          </div>})()}
          {selectedSchemaLink&&installation.links.some(link=>link.id===selectedSchemaLink)&&(()=>{const link=installation.links.find(value=>value.id===selectedSchemaLink)!;const from=installation.nodes.find(node=>node.id===link.fromNodeId),to=installation.nodes.find(node=>node.id===link.toNodeId);const kind=link.kind??installationLinkKind(link,program,stock);return <div className="schema-link-inspector">
            <div className="schema-node-inspector-head"><span><b>Câble / liaison sélectionnée</b><small>{from?.name??'?'} → {to?.name??'?'}</small></span><button className="bare-action" onClick={()=>setSelectedSchemaLink('')}><X/></button></div>
            <div className="schema-link-inspector-actions">
              <div className="schema-route-mode-switch"><button className={(link.routeMode??'straight')==='straight'?'active':''} onClick={()=>setLinkRouteMode(link,'straight')}>Droit</button><button className={link.routeMode==='zigzag'?'active':''} onClick={()=>setLinkRouteMode(link,'zigzag')}>90°</button><button className={link.routeMode==='curve'?'active':''} onClick={()=>setLinkRouteMode(link,'curve')}>Courbe</button></div>
              <button className="secondary" onClick={()=>addCableBend(link,false)}><Plus/>Point de passage</button>
              <button className="secondary" onClick={()=>addCableBend(link,true)}><LayoutGrid/>Coude 90°</button>
              <label><span>Type</span><select value={kind??'unknown'} onChange={e=>{const nextKind=e.target.value as InstallationLink['kind'];updateInstallationLink(link.id,{kind:nextKind,layerId:schemaLayerForLink(nextKind)})}}><option value="audio">Audio</option><option value="power">Alimentation</option><option value="network">Réseau</option><option value="midi">MIDI</option><option value="data">Données</option><option value="accessory">Accessoire</option><option value="unknown">Autre</option></select></label>
              <label><span>Couche</span><select value={linkLayerId(link)} onChange={e=>updateInstallationLink(link.id,{layerId:e.target.value})}>{schemaLayerOrder.filter(id=>id!=='materials').map(layerId=><option value={layerId} key={layerId}>{schemaLayerNames[layerId]??layerId}</option>)}</select></label>
              <label><span>Longueur</span><div className="schema-length-input"><input type="number" min="0" step=".5" value={link.lengthMeters??''} onChange={e=>updateInstallationLink(link.id,{lengthMeters:Number(e.target.value)>0?Number(e.target.value):undefined})}/><em>m</em></div></label>
            </div>
            {(link.route?.length??0)>0&&<div className="schema-route-points">{link.route?.map((point,index)=><span key={index}><b>Point {index+1}</b><small>X {Math.round(point.x)} · Y {Math.round(point.y)}</small><button className="bare-action danger-icon" onClick={()=>updateInstallationLink(link.id,{route:link.route?.filter((_,i)=>i!==index)})}><Trash2/></button></span>)}</div>}
          </div>})()}

        </div>

        <div className="installation-builder">
          <div className="installation-builder-head"><Link2/><span><b>2. Liaisons</b><small>Reliez une sortie vers une entrée. Les connectiques renseignées sont utilisées automatiquement.</small></span></div>
          <div className="installation-link-composer">
            <div className="link-composer-endpoint source">
              <span className="link-composer-label"><b>Source</b><small>Équipement et sortie</small></span>
              <select value={linkFromNode} onChange={e=>{setLinkFromNode(e.target.value);setLinkFromPort('')}}><option value="">Choisir la source…</option>{installation.nodes.map(node=><option value={node.id} key={node.id}>{node.name}</option>)}</select>
              <select value={linkFromPort} onChange={e=>setLinkFromPort(e.target.value)} disabled={!linkFromNode}><option value="">Sortie automatique</option>{(stockByNode(linkFromNode)?.ports??[]).filter(port=>port.direction==='output'||port.direction==='bidirectional').map(port=><option value={port.id} key={port.id}>{port.label||'Sortie'} · {port.connector} ×{port.count}</option>)}</select>
            </div>
            <div className="link-composer-arrow"><Link2/><span>vers</span></div>
            <div className="link-composer-endpoint target">
              <span className="link-composer-label"><b>Destination</b><small>Équipement et entrée</small></span>
              <select value={linkToNode} onChange={e=>{setLinkToNode(e.target.value);setLinkToPort('')}}><option value="">Choisir la destination…</option>{installation.nodes.map(node=><option value={node.id} key={node.id}>{node.name}</option>)}</select>
              <select value={linkToPort} onChange={e=>setLinkToPort(e.target.value)} disabled={!linkToNode}><option value="">Entrée automatique</option>{(stockByNode(linkToNode)?.ports??[]).filter(port=>port.direction==='input'||port.direction==='bidirectional').map(port=><option value={port.id} key={port.id}>{port.label||'Entrée'} · {port.connector} ×{port.count}</option>)}</select>
            </div>
            <div className="link-composer-footer">
              <label className="installation-length-field"><span>Distance estimée</span><div><input type="number" min="0" step="0.5" inputMode="decimal" value={linkLengthMeters} onChange={e=>setLinkLengthMeters(e.target.value)} placeholder="0"/><em>m</em></div></label>
              <button className="primary" disabled={!linkFromNode||!linkToNode||linkFromNode===linkToNode} onClick={addInstallationLink}><Plus/>Créer la liaison</button>
            </div>
          </div>
          <div className="installation-link-list">
            {installation.links.length?installation.links.map((link,index)=>{
              const from=installation.nodes.find(node=>node.id===link.fromNodeId)
              const to=installation.nodes.find(node=>node.id===link.toNodeId)
              const fromPort=(stockByNode(link.fromNodeId)?.ports??[]).find(port=>port.id===link.fromPort)
              const toPort=(stockByNode(link.toNodeId)?.ports??[]).find(port=>port.id===link.toPort)
              const kind=link.kind??installationLinkKind(link,program,stock)
              const routeLabel=link.routeMode==='curve'?'Courbe':link.routeMode==='zigzag'?'Zigzag':'Droit'
              const kindLabel=kind==='power'?'Alimentation':kind==='network'?'Réseau':kind==='midi'?'MIDI':kind==='data'?'Données':kind==='accessory'?'Accessoire':kind==='audio'?'Audio':'Autre'
              const compatLabel=link.compatibility==='di'?'DI':link.compatibility==='phantom'?'48V':link.compatibility==='adapter'?'Adaptateur':link.compatibility==='warning'?'À vérifier':'Compatible'
              return <article className={'installation-link-card compatibility-'+(link.compatibility??'ok')+' link-kind-'+kind+(selectedSchemaLink===link.id?' selected':'')} key={link.id} onClick={e=>{if((e.target as HTMLElement).closest('input,select,button'))return;setSelectedSchemaLink(link.id);setSelectedSchemaNode('')}}>
                <header className="installation-link-card-head">
                  <span className="installation-link-number">{index+1}</span>
                  <div className="installation-link-title"><b>{kindLabel}</b><small>{link.assignedChannel||'Canal automatique'}</small></div>
                  <div className="installation-link-badges"><span className={'link-kind-pill kind-'+kind}>{kindLabel}</span><span className="link-route-badge">{routeLabel}</span><span className={'link-compat-badge '+(link.compatibility??'ok')}>{compatLabel}</span></div>
                  <button className="bare-action danger-icon installation-link-delete" aria-label="Supprimer la liaison" title="Supprimer" onClick={()=>removeInstallationLink(link.id)}><Trash2/></button>
                </header>
                <div className="installation-link-flow">
                  <div className="link-endpoint source">
                    <span className="link-endpoint-icon"><TechnicalIcon icon={fromPort?.icon} text={(fromPort?.connector??'')+' '+(from?.name??'')}/></span>
                    <span><small>Source</small><b>{from?.name??'?'}</b><em>{fromPort?.label||fromPort?.connector||'Sortie auto'}{fromPort?.signalLevel?' · '+fromPort.signalLevel:''}</em></span>
                  </div>
                  <div className={'installation-link-path-preview mode-'+(link.routeMode??'straight')}><i/><ChevronRight/></div>
                  <div className="link-endpoint target">
                    <span className="link-endpoint-icon"><TechnicalIcon icon={toPort?.icon} text={(toPort?.connector??'')+' '+(to?.name??'')}/></span>
                    <span><small>Destination</small><b>{to?.name??'?'}</b><em>{toPort?.label||toPort?.connector||'Entrée auto'}{toPort?.signalLevel?' · '+toPort.signalLevel:''}</em></span>
                  </div>
                </div>
                <div className="installation-link-card-controls">
                  <label><span>Type</span><select value={kind??'unknown'} onChange={e=>updateInstallationLink(link.id,{kind:e.target.value as InstallationLink['kind']})}><option value="audio">Audio</option><option value="power">Alimentation</option><option value="network">Réseau</option><option value="midi">MIDI</option><option value="data">Données</option><option value="accessory">Accessoire</option><option value="unknown">Autre</option></select></label>
                  <label><span>Distance</span><div className="link-length-control"><input type="number" min="0" step="0.5" value={link.lengthMeters??''} onChange={e=>updateInstallationLink(link.id,{lengthMeters:Number(e.target.value)>0?Number(e.target.value):undefined})}/><em>m</em></div></label>
                  <label><span>Trajet</span><select value={link.routeMode??'straight'} onChange={e=>setLinkRouteMode(link,e.target.value as 'straight'|'zigzag'|'curve')}><option value="straight">Droit</option><option value="zigzag">Zigzag</option><option value="curve">Courbe</option></select></label>
                  <button className="secondary installation-link-edit-schema" onClick={()=>{setSelectedSchemaLink(link.id);setSelectedSchemaNode('');setInstallationView('schema')}}><Network/>Voir sur le schéma</button>
                </div>
                {(link.compatibilityNotes?.length??0)>0&&<div className="link-compat-notes">{link.compatibilityNotes?.map((note,n)=><small key={n}><AlertTriangle/>{note}</small>)}</div>}
              </article>
            }):<div className="installation-empty">Aucune liaison définie.</div>}
          </div>
        </div>

        </>}
        <details className="stage-analysis-details"><summary>Analyse technique, affectation des canaux et suggestions</summary>
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
        </details>
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
          {kits.length?kits.map(kit=>{
            const multiplier=kitMultipliers[kit.id]??1
            const shortages=kit.items.filter(kitItem=>{
              if(!program)return false
              const source=kitItem.stockItemId?stock.find(item=>item.id===kitItem.stockItemId):stock.find(item=>item.category===kitItem.category&&item.name.trim().toLowerCase()===kitItem.name.trim().toLowerCase())
              return !source||effectiveStockQuantity(source,program,programs)<kitItem.quantity*multiplier
            }).length
            return <div className="inventory-kit-row inventory-kit-row-v4" key={kit.id}>
              <span><input className="kit-name-input" defaultValue={kit.name} onBlur={e=>void renameKit(kit,e.target.value)} aria-label={'Nom du kit '+kit.name}/><small>{kit.items.length} réf. · {kit.items.reduce((sum,item)=>sum+item.quantity,0)} u.{shortages?' · '+shortages+' manque'+(shortages>1?'s':''):''}</small></span>
              <label className="kit-multiplier"><small>Qté</small><input type="number" min="1" max="99" value={multiplier} onChange={e=>setKitMultipliers(current=>({...current,[kit.id]:Math.max(1,Math.min(99,Number(e.target.value)||1))}))}/></label>
              <button className="secondary" onClick={()=>applyKit(kit,multiplier)}><Plus/>Ajouter ×{multiplier}</button>
              <button className="secondary" onClick={()=>void replaceKitWithSelection(kit)}><Save/>Mettre à jour</button>
              <button className="secondary" onClick={()=>void duplicateKit(kit)}><Copy/>Dupliquer</button>
              <button className="bare-action danger-icon" aria-label={'Supprimer '+kit.name} onClick={()=>void deleteKit(kit.id)}><Trash2/></button>
            </div>
          }):<div className="stock-picker-empty">Aucun kit enregistré. Sélectionnez du matériel puis enregistrez la configuration.</div>}
        </div>
      </div>}

      {missingOnly&&<div className="inventory-missing-panel">
        <div className="inventory-alert-head"><PackageSearch/><span><b>Matériel à trouver</b><small>{missingItems.length?missingItems.length+' référence'+(missingItems.length>1?'s':'')+' à compléter':'Tout le matériel est couvert.'}</small></span></div>
        <div className="inventory-needs-summary">
          <span><small>Références</small><b>{selectedItems.length}</b></span>
          <span><small>Manquantes</small><b>{missingItems.length}</b></span>
          <span><small>Stockages</small><b>{stockProviders.length}</b></span>
          <span><small>Conflits</small><b>{conflictReservations.length}</b></span>
        </div>
        <div className="source-optimizer">
          <button className="secondary" disabled={!missingItems.length} onClick={prepareSourceOptimization}><Zap/>Optimiser les sources</button>
          <small>Proposition uniquement : DI’ART privilégie les prestataires capables de couvrir le plus de besoins.</small>
        </div>
        {sourcePlan.length>0&&<div className="source-plan">
          {sourcePlan.map(plan=>{const item=items.find(value=>value.id===plan.itemId);return <div className="source-plan-row" key={plan.itemId}><span><b>{item?.name??'Matériel'}</b><small>{plan.provider}</small></span><span>Dispo {plan.available}</span><span>Besoin {item?.quantity??0}</span></div>})}
          <div className="source-plan-actions"><button className="secondary" onClick={()=>setSourcePlan([])}>Annuler</button><button className="primary" onClick={()=>void applySourcePlan()}><Check/>Appliquer la proposition</button></div>
        </div>}
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
          <span><b>Check-list événement</b><small>{loadedCount}/{selectedItems.length} préparés ou chargés · {returnedCount}/{selectedItems.length} retournés</small></span>
          <div><button className="secondary" onClick={()=>void markAllChecklist('loaded',true)}><Check/>Tout chargé</button><button className="secondary" onClick={()=>void markAllChecklist('returned',true)}><Check/>Tout retourné</button><button className="secondary" onClick={()=>void resetChecklist()}><RotateCcw/>Réinitialiser</button></div>
        </div>
        <div className="checklist-progress-card"><span><b>{readyCount} / {selectedItems.length} matériels prêts</b><small>Progression de préparation du programme</small></span><strong>{checklistProgress} %</strong><span className="inventory-progress"><i style={{width:checklistProgress+'%'}}/></span></div>
        {selectedItems.map(item=>{
          const state:InventoryChecklistState=item.checkState??(item.returned?'returned':item.loaded?'loaded':'prepare')
          return <div className="checklist-row" key={item.id}>
            <span><b>{item.name}</b><small>× {item.quantity}{stockFor(item)?' · '+normalizeProvider(stockFor(item)?.provider):''}</small></span>
            <select className={'check-state-select state-'+state} value={state} onChange={e=>void setChecklistStage(item.id,e.target.value as InventoryChecklistState)} aria-label={'État de '+item.name}>
              <option value="prepare">À préparer</option><option value="loaded">Chargé</option><option value="onsite">Sur place</option><option value="returned">Retourné</option><option value="problem">Problème</option>
            </select>
            <label className={item.loaded?'checked':''}><input type="checkbox" checked={Boolean(item.loaded)} onChange={e=>void setChecklistState(item.id,'loaded',e.target.checked)}/><span><Check/>Chargé</span></label>
            <label className={item.returned?'checked':''}><input type="checkbox" checked={Boolean(item.returned)} onChange={e=>void setChecklistState(item.id,'returned',e.target.checked)}/><span><Check/>Retourné</span></label>
          </div>
        })}
      </div>}

      <div className="stock-zone-label selected"><span>DANS CET INVENTAIRE</span><small>{missingOnly?'Affichage des éléments à compléter uniquement':'Quantités prévues pour le programme'}</small></div>
      <div className="material-add-row compact-material-add">
        <select value={customCategory} onChange={e=>setCustomCategory(e.target.value as InventoryCategory)}>{categoryOrder.map(category=><option value={category} key={category}>{categoryLabel(category,categories)}</option>)}</select>
        <input value={customName} onChange={e=>setCustomName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addCustom()}} placeholder="Ajouter un matériel…"/>
        <button className="primary" disabled={!customName.trim()} onClick={addCustom}><Plus/>Ajouter</button>
      </div>

      {selectedItems.length>0&&<div className="program-order-list" aria-label="Ordre personnalisé du matériel">
        <div className="program-order-head"><span><b>ORDRE PERSONNALISÉ</b><small>Regroupez librement les éléments, même s’ils appartiennent à des catégories différentes.</small></span><small>Glisser · ↑ ↓ · position</small></div>
        {selectedItems.map((item,index)=>{
          const source=stockFor(item)
          const group=(item.visualGroup??'').trim()
          const previousGroup=index?((selectedItems[index-1].visualGroup??'').trim()):''
          const collapsed=group?Boolean(collapsedProgramGroups[group]):false
          const groupCount=group?selectedItems.filter(value=>(value.visualGroup??'').trim()===group).length:0
          return <div className="program-order-block" key={item.id}>
            {group&&group!==previousGroup&&<div className="program-visual-group">
              <button type="button" onClick={()=>setCollapsedProgramGroups(current=>({...current,[group]:!current[group]}))} aria-label={collapsed?'Déplier '+group:'Réduire '+group}>{collapsed?<ChevronRight/>:<ChevronDown/>}</button>
              <input defaultValue={group} onBlur={event=>renameVisualGroup(group,event.target.value)} aria-label={'Nom du groupe '+group}/>
              <small>{groupCount} élément{groupCount>1?'s':''}</small>
              <button type="button" onClick={()=>moveVisualGroup(group,-1)} aria-label={'Monter le groupe '+group}>↑</button>
              <button type="button" onClick={()=>moveVisualGroup(group,1)} aria-label={'Descendre le groupe '+group}>↓</button>
            </div>}
            <div className={'program-order-row '+(draggedMaterialId===item.id?'dragging ':'')+(collapsed?'group-collapsed':'')} draggable
              onDragStart={event=>{setDraggedMaterialId(item.id);event.dataTransfer.effectAllowed='move'}}
              onDragEnd={()=>setDraggedMaterialId('')}
              onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect='move'}}
              onDrop={event=>{event.preventDefault();if(draggedMaterialId&&draggedMaterialId!==item.id)reorderSelected(draggedMaterialId,index);setDraggedMaterialId('')}}>
              <span className="program-order-grip" title="Glisser pour déplacer" aria-hidden="true">⋮⋮</span>
              <span className="program-order-name"><b>{item.name}</b><small>{categoryLabel(item.category,categories)}{source?' · '+normalizeProvider(source.provider)+(source.storageLocation?' · '+source.storageLocation:'')+' · dispo '+availableFor(item):' · sans source'}</small></span>
              <strong>× {item.quantity}</strong>
              <div className="program-order-actions">
                <button type="button" disabled={index===0} onClick={()=>reorderSelected(item.id,index-1)} aria-label={'Monter '+item.name}>↑</button>
                <button type="button" disabled={index===selectedItems.length-1} onClick={()=>reorderSelected(item.id,index+1)} aria-label={'Descendre '+item.name}>↓</button>
                <label title="Changer directement la position"><span>Position</span><select value={index+1} onChange={event=>reorderSelected(item.id,Number(event.target.value)-1)}>{selectedItems.map((_,position)=><option value={position+1} key={position}>{position+1}</option>)}</select></label>
                <label className="program-order-group-field" title="Groupe visuel propre à ce programme"><span>Groupe</span><input list="program-visual-groups" value={item.visualGroup??''} onChange={event=>setProgram({...program,items:items.map(value=>value.id===item.id?{...value,visualGroup:event.target.value}:value)})} onBlur={()=>void persist({items:program.items})} placeholder="CHANT, BASSE…"/></label>
              </div>
            </div>
          </div>
        })}
        <datalist id="program-visual-groups">{programGroupNames.map(group=><option value={group} key={group}/>)}</datalist>
      </div>}

      <div className="stock-zone-label available program-catalog-label"><span>CATALOGUE / AJUSTEMENT</span><small>Les catégories restent disponibles pour ajouter ou modifier les quantités</small></div>
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

    {exportOpen&&<InventoryExportDialog
      program={program}
      stock={stock}
      selectedItems={selectedItems}
      missingItems={missingItems}
      availableFor={availableFor}
      categoryName={category=>categoryLabel(category,categories)}
      renderIcon={(node,source)=><TechnicalIcon icon={source?.representationIcon} text={node.name+' '+(source?.category??node.category??'')}/>}
      close={()=>setExportOpen(false)}
    />}

    {confirmDelete&&<div className="inventory-confirm-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setConfirmDelete(false)}}>
      <div className="inventory-confirm panel"><button className="bare-action inventory-confirm-close" onClick={()=>setConfirmDelete(false)}><X/></button><h3>Supprimer ce programme ?</h3><p>Le programme sera retiré de la liste Inventaire.</p><div className="modal-actions"><button className="secondary" onClick={()=>setConfirmDelete(false)}>Annuler</button><button className="danger" onClick={()=>void removeProgram()}><Trash2/>Supprimer</button></div></div>
    </div>}
  </div>
}
function CATALOG_FLAT():{name:string;category:InventoryCategory}[]{
  return DEFAULT_CATEGORY_ORDER.flatMap(category=>(DEFAULT_CATALOG[category]??[]).map(name=>({name,category})))
}

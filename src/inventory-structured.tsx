import { useEffect,useMemo,useState } from 'react'
import type { InventoryPort,InventoryPortDirection,InventoryStockItem } from './types'
import { db } from './db'
import './inventory-extensions.css'

export const INVENTORY_CONNECTORS=['XLR(F)','XLR(M)','JACK','JACK TRS','JACK TS','minijack','RCA','Speakon','USB-A','USB-B','USB-C','Ethernet RJ45','IEC','MIDI DIN','HDMI','Secteur','Autre']
const FIELD_SUGGESTIONS_KEY='inventoryFieldSuggestionsV1'
type SuggestionMap=Record<string,string[]>

const same=(a:string,b:string)=>a.trim().toLocaleLowerCase('fr')===b.trim().toLocaleLowerCase('fr')
const uniq=(values:string[])=>Array.from(new Set(values.map(v=>v.trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'fr'))

export function characteristicValue(item:InventoryStockItem,label:string):string{
  return item.characteristics?.find(value=>same(value.label,label))?.value??''
}
export function setInventoryCharacteristic(item:InventoryStockItem,label:string,value:string):InventoryStockItem{
  const list=[...(item.characteristics??[])]
  const index=list.findIndex(entry=>same(entry.label,label))
  if(!value.trim()){
    if(index>=0)list.splice(index,1)
    return {...item,characteristics:list}
  }
  if(index>=0)list[index]={...list[index],label,value}
  else list.push({id:crypto.randomUUID(),label,value})
  return {...item,characteristics:list}
}
export function primaryPort(item:InventoryStockItem,direction:InventoryPortDirection):InventoryPort|undefined{
  return item.ports?.find(port=>port.direction===direction)
}
export function setPrimaryPort(item:InventoryStockItem,direction:InventoryPortDirection,connector:string,label?:string):InventoryStockItem{
  const ports=[...(item.ports??[])]
  const index=ports.findIndex(port=>port.direction===direction)
  const base=index>=0?ports[index]:undefined
  const next:InventoryPort={
    id:base?.id??crypto.randomUUID(),
    label:label??base?.label??(direction==='input'?'IN':direction==='output'?'OUT':'Alimentation'),
    connector,
    direction,
    count:base?.count??1,
    signalLevel:base?.signalLevel??(direction==='power'?'power':'unknown'),
    balanced:base?.balanced,
    stereo:base?.stereo,
    phantom:base?.phantom??'none',
    icon:base?.icon
  }
  if(index>=0)ports[index]=next
  else ports.push(next)
  return {...item,ports}
}
export function swapCableEnds(item:InventoryStockItem):InventoryStockItem{
  const input=primaryPort(item,'input')?.connector||'XLR(F)'
  const output=primaryPort(item,'output')?.connector||'XLR(M)'
  return setPrimaryPort(setPrimaryPort(item,'input',output,'IN'),'output',input,'OUT')
}

function SuggestInput({label,value,suggestions,onChange,onRemember,placeholder,type='text',step}:{label:string;value:string;suggestions:string[];onChange:(value:string)=>void;onRemember:(value:string)=>void;placeholder?:string;type?:string;step?:string}){
  const id='inv-suggest-'+label.replace(/[^a-z0-9]+/gi,'-').toLowerCase()
  return <label><span>{label}</span><input type={type} step={step} list={suggestions.length?id:undefined} value={value} onChange={e=>onChange(e.target.value)} onBlur={e=>onRemember(e.target.value)} placeholder={placeholder}/>{suggestions.length>0&&<datalist id={id}>{suggestions.map(entry=><option value={entry} key={entry}/>)}</datalist>}</label>
}
function ConnectorInput({label,value,suggestions,onChange,onRemember}:{label:string;value:string;suggestions:string[];onChange:(value:string)=>void;onRemember:(value:string)=>void}){
  return <SuggestInput label={label} value={value} suggestions={suggestions} onChange={onChange} onRemember={onRemember} placeholder="Choisir ou saisir une connectique…"/>
}

export function InventoryStructuredFields({
  item,onChange,stock=[],onCreateRelated
}:{
  item:InventoryStockItem
  onChange:(item:InventoryStockItem)=>void
  stock?:InventoryStockItem[]
  onCreateRelated?:(name:string,category:string)=>Promise<InventoryStockItem>
}){
  const [saved,setSaved]=useState<SuggestionMap>({})
  const [newRelated,setNewRelated]=useState('')
  useEffect(()=>{void db.settings.get(FIELD_SUGGESTIONS_KEY).then(row=>{if(!row?.value)return;try{const parsed=JSON.parse(row.value);if(parsed&&typeof parsed==='object')setSaved(parsed)}catch{}})},[])
  const remember=async(label:string,value:string)=>{
    const clean=value.trim();if(!clean)return
    const next={...saved,[label]:uniq([...(saved[label]??[]),clean])}
    setSaved(next)
    await db.settings.put({key:FIELD_SUGGESTIONS_KEY,value:JSON.stringify(next)})
  }
  const suggestions=(label:string,defaults:string[]=[])=>uniq([...defaults,...(saved[label]??[])])
  const connectors=useMemo(()=>uniq([
    ...INVENTORY_CONNECTORS,
    ...stock.flatMap(value=>(value.ports??[]).map(port=>port.connector)),
    ...(saved.Connectique??[])
  ]),[stock,saved])
  const category=item.category.toLocaleLowerCase('fr')
  const cable=category.includes('cable')||category.includes('câble')
  const instrument=category.includes('instrument')
  const adapter=category.includes('adapt')
  const power=category.includes('prise')||category.includes('aliment')
  const accessory=category.includes('access')
  const setChar=(label:string,value:string)=>onChange(setInventoryCharacteristic(item,label,value))
  const setPort=(direction:InventoryPortDirection,connector:string,label:string)=>onChange(setPrimaryPort(item,direction,connector,label))
  const charBool=(label:string)=>characteristicValue(item,label)==='Oui'
  const accessories=stock.filter(value=>!value.deletedAt&&String(value.category).toLowerCase().includes('access'))
  const instruments=stock.filter(value=>!value.deletedAt&&String(value.category).toLowerCase().includes('instrument'))
  const dedicatedNames=characteristicValue(item,'Dédié pour').split(',').map(v=>v.trim()).filter(Boolean)
  const toggleDedicated=(name:string,checked:boolean)=>{
    const next=checked?uniq([...dedicatedNames,name]):dedicatedNames.filter(value=>!same(value,name))
    setChar('Dédié pour',next.join(', '))
  }
  const toggleAssociated=(id:string,checked:boolean)=>onChange({...item,associatedItemIds:checked?uniq([...(item.associatedItemIds??[]),id]):(item.associatedItemIds??[]).filter(value=>value!==id)})
  if(!cable&&!instrument&&!adapter&&!power&&!accessory)return <div className="stock-tech-section structured-tech-section"><div className="stock-tech-section-head"><span><b>Paramètres techniques</b><small>Cette classe personnalisée utilise les caractéristiques et connectiques libres.</small></span></div></div>

  return <div className="stock-tech-section structured-tech-section inventory-category-settings">
    <div className="stock-tech-section-head"><span><b>Paramètres {cable?'du câble':instrument?'de l’instrument':adapter?'de l’adaptateur':power?'prise / alimentation':'de l’accessoire'}</b><small>Les nouvelles valeurs saisies sont mémorisées et proposées lors des prochaines saisies.</small></span></div>

    {cable&&<div className="structured-tech-grid">
      <label><span>Type</span><select value={characteristicValue(item,'Type câble')||'Son'} onChange={e=>{setChar('Type câble',e.target.value);void remember('Type câble',e.target.value)}}><option>Son</option><option>Réseau</option><option>Lumière</option><option>Vidéo</option>{suggestions('Type câble').filter(v=>!['Son','Réseau','Lumière','Vidéo'].includes(v)).map(v=><option key={v}>{v}</option>)}</select></label>
      <SuggestInput label="Longueur" value={characteristicValue(item,'Longueur').replace(/\s*m$/i,'')} suggestions={suggestions('Longueur',['1','2','3','5','10','15','20','25','30','50'])} onChange={v=>setChar('Longueur',v?v+' m':'')} onRemember={v=>remember('Longueur',v)} type="number" step=".5"/>
      <SuggestInput label="Couleur" value={characteristicValue(item,'Couleur')} suggestions={suggestions('Couleur',['Noir','Bleu','Rouge','Vert','Jaune','Blanc'])} onChange={v=>setChar('Couleur',v)} onRemember={v=>remember('Couleur',v)} placeholder="Noir, bleu, rouge…"/>
      <ConnectorInput label="IN" value={primaryPort(item,'input')?.connector??''} suggestions={connectors} onChange={v=>setPort('input',v,'IN')} onRemember={v=>remember('Connectique',v)}/>
      <ConnectorInput label="OUT" value={primaryPort(item,'output')?.connector??''} suggestions={connectors} onChange={v=>setPort('output',v,'OUT')} onRemember={v=>remember('Connectique',v)}/>
      <label className="structured-check"><span>Direction</span><span><input type="checkbox" checked={charBool('Bidirectionnel')} onChange={e=>setChar('Bidirectionnel',e.target.checked?'Oui':'Non')}/><b>Bidirectionnel</b><small>Peut être utilisé en aller ou en retour dans Installation.</small></span></label>
      <button type="button" className="secondary structured-swap" onClick={()=>onChange(swapCableEnds(item))}>↔ Inverser IN / OUT</button>
    </div>}

    {instrument&&<div className="structured-tech-grid">
      <ConnectorInput label="IN" value={primaryPort(item,'input')?.connector??''} suggestions={connectors} onChange={v=>setPort('input',v,'IN principal')} onRemember={v=>remember('Connectique',v)}/>
      <ConnectorInput label="OUT" value={primaryPort(item,'output')?.connector??''} suggestions={connectors} onChange={v=>setPort('output',v,'OUT principal')} onRemember={v=>remember('Connectique',v)}/>
      <label><span>Alimentation</span><select value={characteristicValue(item,'Alimentation mode')||'Non'} onChange={e=>setChar('Alimentation mode',e.target.value)}><option>Non</option><option>Oui</option><option>Portable / rechargeable</option></select></label>
      <SuggestInput label="Type d’alimentation" value={characteristicValue(item,'Type alimentation')} suggestions={suggestions('Type alimentation',['220V','110V','12V','9V','5V','USB','USB-C','Pile'])} onChange={v=>setChar('Type alimentation',v)} onRemember={v=>remember('Type alimentation',v)} placeholder="220V, 12V, 9V, USB-C…"/>
      <label className="structured-check"><span>Accessoires</span><span><input type="checkbox" checked={charBool('Accessoires requis')} onChange={e=>setChar('Accessoires requis',e.target.checked?'Oui':'Non')}/><b>Utilise des accessoires</b></span></label>
      {charBool('Accessoires requis')&&<div className="structured-related span2"><b>Accessoires disponibles</b><div>{accessories.map(accessory=><label key={accessory.id}><input type="checkbox" checked={(item.associatedItemIds??[]).includes(accessory.id)} onChange={e=>toggleAssociated(accessory.id,e.target.checked)}/><span>{accessory.name}</span></label>)}</div><div className="structured-create-related"><input value={newRelated} onChange={e=>setNewRelated(e.target.value)} placeholder="Créer un nouvel accessoire…"/><button type="button" className="secondary" disabled={!newRelated.trim()||!onCreateRelated} onClick={async()=>{if(!onCreateRelated||!newRelated.trim())return;const created=await onCreateRelated(newRelated.trim(),'accessoire');toggleAssociated(created.id,true);setNewRelated('')}}>Créer</button></div></div>}
    </div>}

    {power&&<div className="structured-tech-grid">
      <ConnectorInput label="IN" value={primaryPort(item,'input')?.connector??''} suggestions={connectors} onChange={v=>setPort('input',v,'IN')} onRemember={v=>remember('Connectique',v)}/>
      <ConnectorInput label="OUT" value={primaryPort(item,'output')?.connector??''} suggestions={connectors} onChange={v=>setPort('output',v,'OUT')} onRemember={v=>remember('Connectique',v)}/>
      <SuggestInput label="Voltage" value={characteristicValue(item,'Voltage')} suggestions={suggestions('Voltage',['220V','110V','48V','24V','12V','9V','5V'])} onChange={v=>setChar('Voltage',v)} onRemember={v=>remember('Voltage',v)} placeholder="220V, 110V, 12V…"/>
      <SuggestInput label="Longueur" value={characteristicValue(item,'Longueur').replace(/\s*m$/i,'')} suggestions={suggestions('Longueur',['1','2','3','5','10','20','30'])} onChange={v=>setChar('Longueur',v?v+' m':'')} onRemember={v=>remember('Longueur',v)} type="number" step=".5"/>
      <SuggestInput label="Nombre de sorties" value={characteristicValue(item,'Nombre de sorties')} suggestions={suggestions('Nombre de sorties',['1','2','4','6','8','10','12'])} onChange={v=>setChar('Nombre de sorties',v)} onRemember={v=>remember('Nombre de sorties',v)} type="number"/>
    </div>}

    {adapter&&<div className="structured-tech-grid">
      <ConnectorInput label="IN" value={primaryPort(item,'input')?.connector??''} suggestions={connectors} onChange={v=>setPort('input',v,'IN')} onRemember={v=>remember('Connectique',v)}/>
      <ConnectorInput label="OUT" value={primaryPort(item,'output')?.connector??''} suggestions={connectors} onChange={v=>setPort('output',v,'OUT')} onRemember={v=>remember('Connectique',v)}/>
      <label className="structured-check"><span>Direction</span><span><input type="checkbox" checked={charBool('Bidirectionnel')} onChange={e=>setChar('Bidirectionnel',e.target.checked?'Oui':'Non')}/><b>Bidirectionnel</b></span></label>
      <SuggestInput label="Nombre d’IN" value={characteristicValue(item,'Nombre IN')} suggestions={suggestions('Nombre IN',['1','2','4','8'])} onChange={v=>setChar('Nombre IN',v)} onRemember={v=>remember('Nombre IN',v)} type="number"/>
      <SuggestInput label="Nombre d’OUT" value={characteristicValue(item,'Nombre OUT')} suggestions={suggestions('Nombre OUT',['1','2','4','8'])} onChange={v=>setChar('Nombre OUT',v)} onRemember={v=>remember('Nombre OUT',v)} type="number"/>
    </div>}

    {accessory&&<div className="structured-tech-grid">
      <SuggestInput label="Hauteur" value={characteristicValue(item,'Hauteur')} suggestions={suggestions('Hauteur')} onChange={v=>setChar('Hauteur',v)} onRemember={v=>remember('Hauteur',v)} placeholder="Ex. 1,2 m"/>
      <SuggestInput label="Poids" value={characteristicValue(item,'Poids')} suggestions={suggestions('Poids')} onChange={v=>setChar('Poids',v)} onRemember={v=>remember('Poids',v)} placeholder="Ex. 3,5 kg"/>
      <SuggestInput label="Longueur fil" value={characteristicValue(item,'Longueur fil')} suggestions={suggestions('Longueur fil')} onChange={v=>setChar('Longueur fil',v)} onRemember={v=>remember('Longueur fil',v)} placeholder="Ex. 2 m"/>
      <label><span>Réglage</span><select value={characteristicValue(item,'Réglage')||'Fixe'} onChange={e=>setChar('Réglage',e.target.value)}><option>Fixe</option><option>Ajustable</option></select></label>
      <ConnectorInput label="IN" value={primaryPort(item,'input')?.connector??''} suggestions={connectors} onChange={v=>setPort('input',v,'IN')} onRemember={v=>remember('Connectique',v)}/>
      <ConnectorInput label="OUT" value={primaryPort(item,'output')?.connector??''} suggestions={connectors} onChange={v=>setPort('output',v,'OUT')} onRemember={v=>remember('Connectique',v)}/>
      <div className="structured-related span2"><b>Dédié pour</b><small>Plusieurs instruments peuvent être sélectionnés.</small><div>{instruments.map(inst=><label key={inst.id}><input type="checkbox" checked={dedicatedNames.some(name=>same(name,inst.name))} onChange={e=>toggleDedicated(inst.name,e.target.checked)}/><span>{inst.name}</span></label>)}</div><div className="structured-create-related"><input value={newRelated} onChange={e=>setNewRelated(e.target.value)} placeholder="Créer un nouvel instrument…"/><button type="button" className="secondary" disabled={!newRelated.trim()||!onCreateRelated} onClick={async()=>{if(!onCreateRelated||!newRelated.trim())return;const created=await onCreateRelated(newRelated.trim(),'instrument');toggleDedicated(created.name,true);setNewRelated('')}}>Créer</button></div></div>
    </div>}
  </div>
}

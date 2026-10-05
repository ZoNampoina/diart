import type { InventoryPort,InventoryPortDirection,InventoryStockItem } from './types'
import './inventory-extensions.css'

export const INVENTORY_CONNECTORS=['XLR(F)','XLR(M)','JACK','JACK TRS','JACK TS','minijack','RCA','Speakon','USB-A','USB-B','USB-C','Ethernet RJ45','IEC','MIDI DIN','HDMI','Secteur','Autre']

const same=(a:string,b:string)=>a.trim().toLocaleLowerCase('fr')===b.trim().toLocaleLowerCase('fr')

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

function ConnectorSelect({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}){
  const values=INVENTORY_CONNECTORS.includes(value)||!value?INVENTORY_CONNECTORS:[value,...INVENTORY_CONNECTORS]
  return <label><span>{label}</span><select value={value||values[0]} onChange={e=>onChange(e.target.value)}>{values.map(entry=><option value={entry} key={entry}>{entry}</option>)}</select></label>
}

export function InventoryStructuredFields({item,onChange}:{item:InventoryStockItem;onChange:(item:InventoryStockItem)=>void}){
  const category=item.category.toLocaleLowerCase('fr')
  const cable=category.includes('cable')||category.includes('câble')
  const instrument=category.includes('instrument')
  const adapter=category.includes('adapt')
  const powerStrip=category.includes('prise')&&/multiple|multiprise|multi-prise/i.test(item.name)
  if(!cable&&!instrument&&!adapter&&!powerStrip)return null
  const setChar=(label:string,value:string)=>onChange(setInventoryCharacteristic(item,label,value))
  const setPort=(direction:InventoryPortDirection,connector:string,label:string)=>onChange(setPrimaryPort(item,direction,connector,label))
  return <div className="stock-tech-section structured-tech-section">
    <div className="stock-tech-section-head"><span><b>Données essentielles</b><small>Champs classés utilisés par l’inventaire et l’installation avancée.</small></span></div>
    {cable&&<div className="structured-tech-grid">
      <label><span>Longueur</span><div className="structured-unit"><input type="number" min="0" step=".5" value={characteristicValue(item,'Longueur').replace(/[^0-9.,-]/g,'').replace(',','.')} onChange={e=>setChar('Longueur',e.target.value?e.target.value+' m':'')}/><em>m</em></div></label>
      <label><span>Couleur</span><input value={characteristicValue(item,'Couleur')} onChange={e=>setChar('Couleur',e.target.value)} placeholder="Noir, bleu, rouge…"/></label>
      <ConnectorSelect label="IN" value={primaryPort(item,'input')?.connector??'XLR(F)'} onChange={value=>setPort('input',value,'IN')}/>
      <ConnectorSelect label="OUT" value={primaryPort(item,'output')?.connector??'XLR(M)'} onChange={value=>setPort('output',value,'OUT')}/>
      <button type="button" className="secondary structured-swap" onClick={()=>onChange(swapCableEnds(item))}>↔ Inverser IN / OUT</button>
    </div>}
    {instrument&&<div className="structured-tech-grid">
      <ConnectorSelect label="IN principal" value={primaryPort(item,'input')?.connector??'JACK'} onChange={value=>setPort('input',value,'IN principal')}/>
      <ConnectorSelect label="OUT principal" value={primaryPort(item,'output')?.connector??'JACK'} onChange={value=>setPort('output',value,'OUT principal')}/>
      <label><span>Accessoires</span><input value={characteristicValue(item,'Accessoires')} onChange={e=>setChar('Accessoires',e.target.value)} placeholder="Pied, sustain, étui, sangle…"/></label>
      <label><span>Alimentation</span><input value={characteristicValue(item,'Alimentation')} onChange={e=>setChar('Alimentation',e.target.value)} placeholder="Secteur, batterie, USB, aucune…"/></label>
    </div>}
    {adapter&&<div className="structured-tech-grid">
      <ConnectorSelect label="IN" value={primaryPort(item,'input')?.connector??'JACK'} onChange={value=>setPort('input',value,'IN')}/>
      <ConnectorSelect label="OUT" value={primaryPort(item,'output')?.connector??'XLR(M)'} onChange={value=>setPort('output',value,'OUT')}/>
    </div>}
    {powerStrip&&<div className="structured-tech-grid">
      <label><span>Nombre de sorties</span><input type="number" min="1" max="64" value={characteristicValue(item,'Nombre de sorties').replace(/\D/g,'')} onChange={e=>setChar('Nombre de sorties',e.target.value)}/></label>
      <label><span>Longueur du câble</span><div className="structured-unit"><input type="number" min="0" step=".5" value={characteristicValue(item,'Longueur').replace(/[^0-9.,-]/g,'').replace(',','.')} onChange={e=>setChar('Longueur',e.target.value?e.target.value+' m':'')}/><em>m</em></div></label>
    </div>}
  </div>
}

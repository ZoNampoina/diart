import { useState } from 'react'
import type { InstallationNode,InventoryStockItem,StageAppearance } from '../types'
import { OBJECTS,inferIllustration,normalizeSearch,objectById } from './catalog'
import { ObjectThumbnail } from './StageSymbols'
import { Field } from './PropertiesInspector'
import { geometry,metrics,type Plan } from './model'

export function AppearanceInspector({node,plan,stock,locked,update}:{node:InstallationNode;plan:Plan;stock:InventoryStockItem[];locked:boolean;update:(patch:Partial<InstallationNode>)=>void}){
  const source=stock.find(s=>s.id===node.stockItemId),id=inferIllustration(node,source),definition=objectById(id),a=node.appearance??{},g=geometry(node),ppm=metrics(plan).ppm
  const [all,setAll]=useState(false),[query,setQuery]=useState(''),[associate,setAssociate]=useState(false),[stockQuery,setStockQuery]=useState(''),[stockId,setStockId]=useState(''),[quantity,setQuantity]=useState(1)
  const appearance=(patch:Partial<StageAppearance>)=>update({appearance:{...a,...patch}})
  const variants=OBJECTS.filter(d=>(all||d.family===definition?.family)&&normalizeSearch(d.name+' '+d.keywords).includes(normalizeSearch(query)))
  return <>
    <details className="stage-inspector-section" open><summary>Représentation</summary>
      <div className="stage-variant-grid">{variants.map(d=><button key={d.id} aria-label={'Représentation : '+d.name} aria-pressed={d.id===id} className={d.id===id?'active':''} disabled={locked} onClick={()=>appearance({illustration:d.id,imageId:undefined,shortLabel:d.name})}><ObjectThumbnail id={d.id}/><span>{d.name}</span></button>)}</div>
      <button className="stage-text-button" onClick={()=>{setAll(!all);setQuery('')}}>{all?'Variantes de cette famille':'Toutes les représentations'}</button>
      {all&&<input aria-label="Filtrer les représentations" placeholder="Rechercher une représentation…" value={query} onChange={e=>setQuery(e.target.value)}/>}
      {a.imageId&&<small className="stage-note">Illustration personnelle · {plan.assets?.[a.imageId]?.name}</small>}
      <div className="stage-palette" aria-label="Palette de l’objet">{['#485864','#f2eee5','#a44b48','#b49571','#6f9083','#899da8'].map(color=><button key={color} aria-label={'Couleur '+color} style={{background:color}} disabled={locked} onClick={()=>appearance({color})}/>)}</div>
      <label className="stage-field"><span>Couleur personnalisée</span><input type="color" aria-label="Couleur de l’objet" value={a.color??definition?.color??'#485864'} disabled={locked} onChange={e=>appearance({color:e.target.value})}/></label>
      {['shape','zone'].includes(node.kind??'')&&<label className="stage-field"><span>Contour</span><input type="color" aria-label="Contour de l’objet" value={a.stroke??'#365563'} disabled={locked} onChange={e=>appearance({stroke:e.target.value})}/></label>}
      <Field label="Opacité de l’objet (%)" type="number" min={0} value={Math.round((a.opacity??1)*100)} disabled={locked} onCommit={v=>appearance({opacity:Math.max(0,Math.min(1,Number(v)/100))})}/>
      <label className="stage-check"><input type="checkbox" checked={a.shadow!==false} disabled={locked} onChange={e=>appearance({shadow:e.target.checked})}/>Ombre douce en présentation</label>
      <label className="stage-check"><input type="checkbox" checked={a.lockAspect??false} disabled={locked} onChange={e=>appearance({lockAspect:e.target.checked})}/>Verrouiller les proportions</label>
      {definition&&<button className="stage-wide-button" disabled={locked} onClick={()=>update({width:Math.max(8,definition.width*ppm),height:Math.max(8,definition.height*ppm),appearance:{...a,lockAspect:true}})}>Utiliser les dimensions réelles<br/>{definition.width} × {definition.height} m</button>}
      <small className="stage-note">Taille actuelle : {(g.width/ppm).toFixed(2)} × {(g.height/ppm).toFixed(2)} m. Les dimensions du catalogue sont indicatives et modifiables.</small>
    </details>
    <details className="stage-inspector-section"><summary>Label & rôle</summary>
      <label className="stage-field"><span>Afficher</span><select aria-label="Affichage du label" value={a.labelMode??'auto'} disabled={locked} onChange={e=>appearance({labelMode:e.target.value as StageAppearance['labelMode']})}><option value="auto">Selon le mode d’affichage</option><option value="none">Aucun label</option><option value="short">Nom court</option><option value="full">Nom complet</option><option value="material">Nom du matériel</option><option value="role">Rôle</option><option value="custom">Texte personnalisé</option></select></label>
      <Field label="Nom court" value={a.shortLabel??definition?.name??node.name} disabled={locked} onCommit={shortLabel=>appearance({shortLabel})}/>
      <Field label="Rôle affiché" value={a.roleLabel??''} disabled={locked} onCommit={roleLabel=>appearance({roleLabel})}/>
      <Field label="Texte personnalisé" value={a.customLabel??''} disabled={locked} onCommit={customLabel=>appearance({customLabel})}/>
      <Field label="Taille du label" type="number" min={6} value={a.labelSize??12} disabled={locked} onCommit={v=>appearance({labelSize:Math.max(6,Math.min(72,Number(v)))})}/>
      <label className="stage-check"><input type="checkbox" checked={a.labelHorizontal!==false} disabled={locked} onChange={e=>appearance({labelHorizontal:e.target.checked})}/>Garder le label horizontal</label>
    </details>
    <details className="stage-inspector-section"><summary>Matériel & stock</summary>
      <p className="stage-note">{source?`${source.name} · ${source.provider??'Mon stock'}`:node.visualOnly?'Objet scénographique · aucun besoin de stock.':'Équipement libre, sans association au stock.'}</p>
      {source&&<Field label="Quantité représentée" type="number" min={1} value={node.quantity??1} disabled={locked} onCommit={v=>update({quantity:Math.max(1,Math.min(10000,Math.round(Number(v))))})}/>}
      <button className="stage-wide-button" disabled={locked} onClick={()=>setAssociate(!associate)}>Associer au matériel</button>
      {associate&&<><input aria-label="Rechercher le matériel à associer" placeholder="Matériel ou prestataire…" value={stockQuery} onChange={e=>setStockQuery(e.target.value)}/><select size={Math.min(5,stock.length+1)} aria-label="Matériel à associer" value={stockId} onChange={e=>setStockId(e.target.value)}><option value="">Choisir le matériel</option>{stock.filter(s=>!s.deletedAt&&normalizeSearch(s.name+' '+s.provider).includes(normalizeSearch(stockQuery))).map(s=><option key={s.id} value={s.id}>{s.name} · {s.provider??'Mon stock'}</option>)}</select><label className="stage-field"><span>Quantité</span><input aria-label="Quantité à associer" type="number" min="1" max="10000" value={quantity} onChange={e=>setQuantity(Math.max(1,Math.min(10000,Math.round(Number(e.target.value)))))}/></label><button className="primary" disabled={!stockId||locked} onClick={()=>{const s=stock.find(s=>s.id===stockId);if(s){update({stockItemId:s.id,quantity,visualOnly:false,kind:'equipment',category:s.category});setAssociate(false)}}}>Associer cet objet</button><small className="stage-note">L’association ajoute un besoin au plan. La réservation reste disponible avec « Réserver ».</small></>}
    </details>
  </>
}

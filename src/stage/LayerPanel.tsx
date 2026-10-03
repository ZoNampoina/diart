import { useState } from 'react'
import { Eye,EyeOff,Lock,Unlock,Plus,Copy,Trash2,ChevronUp,ChevronDown,X,Focus } from 'lucide-react'
import { BUILTIN_LAYERS,clone,duplicateSelection,layers,layerName,linkLayer,nodeLayer,uid,visible,type Plan } from './model'
import { ToolButton } from './StageToolbar'
export function LayerPanel({plan,active,setActive,commit,close}:{plan:Plan;active:string;setActive:(id:string)=>void;commit:(plan:Plan)=>void;close:()=>void}){
  const [name,setName]=useState(''),[drag,setDrag]=useState('')
  const order=layers(plan)
  const reorder=(id:string,index:number)=>{const next=order.filter(l=>l!==id);next.splice(Math.max(0,index),0,id);commit({...plan,layerOrder:next})}
  const duplicate=(id:string)=>{
    const newId='custom-'+uid(),result=duplicateSelection(plan,plan.nodes.filter(n=>nodeLayer(n)===id).map(n=>n.id),{x:0,y:0}),oldNodeIds=new Set(plan.nodes.map(n=>n.id)),oldLinkIds=new Set(plan.links.map(l=>l.id))
    const copied=result.plan.nodes.filter(n=>!oldNodeIds.has(n.id)).map(n=>({...n,layerId:newId}))
    const copiedLinks=result.plan.links.filter(l=>!oldLinkIds.has(l.id)).map(l=>({...l,layerId:newId}))
    const standalone=plan.links.filter(l=>linkLayer(l)===id&&!plan.nodes.some(n=>nodeLayer(n)===id&&(n.id===l.fromNodeId||n.id===l.toNodeId))).map(l=>({...clone(l),id:uid(),layerId:newId}))
    commit({...plan,customLayers:[...(plan.customLayers??[]),{id:newId,name:layerName(plan,id)+' — copie'}],layerOrder:[...order,newId],nodes:[...plan.nodes,...copied],links:[...plan.links,...copiedLinks,...standalone]});setActive(newId)
  }
  return <aside className="stage-layer-panel" aria-label="Gestionnaire de calques">
    <div className="stage-panel-heading"><b>Calques</b><ToolButton label="Fermer les calques" onClick={close}><X/></ToolButton></div>
    <div className="stage-layer-list">{order.map((id,index)=><div key={id} className={'stage-layer-row '+(active===id?'active':'')} draggable onDragStart={()=>setDrag(id)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(drag)reorder(drag,index);setDrag('')}}>
      <div className="stage-layer-main">
        <ToolButton label={(visible(plan,id)?'Masquer ':'Afficher ')+layerName(plan,id)} onClick={()=>commit({...plan,layers:{...plan.layers,[id]:!visible(plan,id)}})}>{visible(plan,id)?<Eye/>:<EyeOff/>}</ToolButton>
        <input aria-label={'Nom du calque '+layerName(plan,id)} defaultValue={layerName(plan,id)} key={layerName(plan,id)} onFocus={()=>setActive(id)} onBlur={e=>{if(e.target.value.trim()&&e.target.value!==layerName(plan,id))commit({...plan,layerNames:{...plan.layerNames,[id]:e.target.value.trim()}})}}/>
        <ToolButton label={(plan.layerLocks?.[id]?'Déverrouiller ':'Verrouiller ')+layerName(plan,id)} active={plan.layerLocks?.[id]} onClick={()=>commit({...plan,layerLocks:{...plan.layerLocks,[id]:!plan.layerLocks?.[id]}})}>{plan.layerLocks?.[id]?<Lock/>:<Unlock/>}</ToolButton>
      </div>
      <div className="stage-layer-secondary"><button className="stage-layer-count" onClick={()=>setActive(id)}>{plan.nodes.filter(n=>nodeLayer(n)===id).length+plan.links.filter(l=>linkLayer(l)===id).length} éléments</button>
        <ToolButton label={'Isoler '+layerName(plan,id)} onClick={()=>{setActive(id);commit({...plan,layers:Object.fromEntries(order.map(l=>[l,l===id]))})}}><Focus/></ToolButton>
        <ToolButton label={'Monter '+layerName(plan,id)} disabled={index===0} onClick={()=>reorder(id,index-1)}><ChevronUp/></ToolButton>
        <ToolButton label={'Descendre '+layerName(plan,id)} disabled={index===order.length-1} onClick={()=>reorder(id,index+1)}><ChevronDown/></ToolButton>
        <ToolButton label={'Dupliquer '+layerName(plan,id)} onClick={()=>duplicate(id)}><Copy/></ToolButton>
        {!BUILTIN_LAYERS[id]&&<ToolButton label={'Supprimer le calque '+layerName(plan,id)} onClick={()=>{commit({...plan,nodes:plan.nodes.map(n=>nodeLayer(n)===id?{...n,layerId:'materials'}:n),links:plan.links.map(l=>linkLayer(l)===id?{...l,layerId:'audio'}:l),customLayers:plan.customLayers?.filter(l=>l.id!==id),layerOrder:order.filter(l=>l!==id)});setActive('materials')}}><Trash2/></ToolButton>}
      </div>
    </div>)}</div>
    <button className="stage-wide-button" onClick={()=>commit({...plan,layers:Object.fromEntries(order.map(l=>[l,true]))})}><Eye/>Afficher tous les calques</button>
    <form className="stage-add-layer" onSubmit={e=>{e.preventDefault();if(!name.trim())return;const id='custom-'+uid();commit({...plan,customLayers:[...(plan.customLayers??[]),{id,name:name.trim()}],layerOrder:[...order,id]});setActive(id);setName('')}}><input aria-label="Nouveau calque" value={name} onChange={e=>setName(e.target.value)} placeholder="Nouveau calque"/><button title="Créer le calque" aria-label="Créer le calque" disabled={!name.trim()}><Plus/></button></form>
  </aside>
}

import { useRef,useState } from 'react'
import { importIllustration } from './assets'
import { metrics,type Plan } from './model'
import { Field } from './PropertiesInspector'

export function BackgroundPanel({plan,commit,calibrate}:{plan:Plan;commit:(p:Plan)=>void;calibrate:()=>void}){
  const file=useRef<HTMLInputElement>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),b=plan.backgroundImage,m=metrics(plan)
  return <details className="stage-inspector-section"><summary>Plan / photo de salle</summary>
    <input ref={file} hidden type="file" accept=".svg,.png,.webp,.jpg,.jpeg" onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;setBusy(true);setError('');try{const asset=await importIllustration(f);commit({...plan,assets:{...plan.assets,[asset.id]:asset},backgroundImage:{imageId:asset.id,x:0,y:0,width:m.width,height:m.width*asset.height/asset.width,opacity:.65,locked:true}})}catch(e){setError(e instanceof Error?e.message:'Import impossible.')}finally{setBusy(false)}}}/>
    <button className="stage-wide-button" disabled={busy} onClick={()=>file.current?.click()}>{busy?'Import…':'Importer plan / photo'}</button>
    {b&&<>
      <p className="stage-note">{plan.assets?.[b.imageId]?.name}</p><label className="stage-check"><input type="checkbox" checked={b.locked} onChange={e=>commit({...plan,backgroundImage:{...b,locked:e.target.checked}})}/>Verrouiller le fond</label>
      <Field label="Opacité du fond (%)" type="number" min={0} value={Math.round(b.opacity*100)} onCommit={v=>commit({...plan,backgroundImage:{...b,opacity:Math.max(0,Math.min(1,Number(v)/100))}})}/>
      <div className="stage-field-grid"><Field label="Fond X (m)" type="number" step={.1} value={Number((b.x/m.ppm).toFixed(2))} disabled={b.locked} onCommit={v=>commit({...plan,backgroundImage:{...b,x:Number(v)*m.ppm}})}/><Field label="Fond Y (m)" type="number" step={.1} value={Number((b.y/m.ppm).toFixed(2))} disabled={b.locked} onCommit={v=>commit({...plan,backgroundImage:{...b,y:Number(v)*m.ppm}})}/></div>
      <Field label="Largeur du fond (m)" type="number" min={.1} value={Number((b.width/m.ppm).toFixed(2))} disabled={b.locked} onCommit={v=>{const width=Math.max(8,Number(v)*m.ppm);commit({...plan,backgroundImage:{...b,width,height:width*b.height/b.width}})}}/>
      <button className="stage-wide-button" onClick={calibrate}>Calibrer une distance connue</button>
      <small className="stage-note">Cliquez deux points sur le plan de salle puis indiquez leur distance réelle. Seule l’image est mise à l’échelle.</small>
      <button className="stage-wide-button danger" onClick={()=>commit({...plan,backgroundImage:undefined})}>Retirer le fond</button>
    </>}
    {error&&<p className="stage-error" role="alert">{error}</p>}
  </details>
}

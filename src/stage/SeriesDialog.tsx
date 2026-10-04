import { useMemo,useState } from 'react'
import { StageDialog } from './TemplateManager'
import { StageScene,type IconRenderer } from './StageScene'
import { metrics,planBounds,seriesSelection,type Plan,type SeriesOptions } from './model'
import type { InventoryStockItem } from '../types'

export function SeriesDialog({plan,selected,stock,renderIcon,apply,close}:{plan:Plan;selected:string[];stock:InventoryStockItem[];renderIcon:IconRenderer;apply:(plan:Plan,ids:string[])=>void;close:()=>void}){
  const [options,setOptions]=useState<SeriesOptions>({count:12,layout:'grid',columns:4,gapX:.15,gapY:.3,rotation:0,radius:2,arc:120})
  const preview=useMemo(()=>seriesSelection(plan,selected,options),[plan,selected,options]),bounds=planBounds(preview.plan),m=metrics(plan)
  const number=(key:keyof SeriesOptions,label:string,min:number,max:number,step=1)=><label className="stage-field"><span>{label}</span><input aria-label={label} type="number" min={min} max={max} step={step} value={options[key]} onChange={e=>setOptions({...options,[key]:Math.max(min,Math.min(max,Number(e.target.value)||min))})}/></label>
  return <StageDialog title="Dupliquer en série" close={close} wide><div className="stage-series-layout"><div className="stage-dialog-body stage-series-controls">
    <p className="stage-note">Le nombre inclut la sélection d’origine. Toute la série s’annule en une seule action.</p>
    {number('count','Nombre total',1,200)}<label className="stage-field"><span>Disposition</span><select aria-label="Disposition" value={options.layout} onChange={e=>setOptions({...options,layout:e.target.value as SeriesOptions['layout']})}><option value="line">Ligne</option><option value="column">Colonne</option><option value="grid">Grille</option><option value="arc">Arc</option><option value="circle">Cercle</option></select></label>
    {options.layout==='grid'&&<>{number('columns','Colonnes',1,200)}<small>{Math.ceil(options.count/options.columns)} lignes</small></>}
    {['grid','line'].includes(options.layout)&&number('gapX','Espacement horizontal (m)',0,20,.05)}
    {['grid','column'].includes(options.layout)&&number('gapY','Espacement vertical (m)',0,20,.05)}
    {['arc','circle'].includes(options.layout)&&number('radius','Rayon (m)',.1,50,.1)}
    {options.layout==='arc'&&number('arc','Angle de l’arc (°)',1,359,5)}
    {number('rotation','Rotation globale (°)',-360,360,5)}
    <button className="primary" onClick={()=>{apply(preview.plan,preview.ids);close()}}>Créer la série</button>
  </div><div className="stage-series-preview"><svg viewBox={`${bounds.x-20} ${bounds.y-20} ${bounds.width+40} ${bounds.height+40}`}><StageScene plan={{...preview.plan,viewMode:'client'}} stock={stock} renderIcon={renderIcon}/></svg><small>Aperçu · scène {m.metersW} × {m.metersH} m</small></div></div></StageDialog>
}

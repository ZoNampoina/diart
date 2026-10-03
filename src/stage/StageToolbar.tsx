import type { ReactNode } from 'react'
import { Undo2,Redo2,Save,History,Copy,ZoomIn,ZoomOut,Scan,Grid3X3,Magnet,Layers,Download,Settings2,Maximize,Minimize,Library,MousePointer2,Hand,PackagePlus,Cable,Zap,Network,Paperclip,Type,Square,Ruler,PanelRight } from 'lucide-react'
import type { Tool } from './StageViewport'
export function ToolButton({label,children,active=false,disabled=false,onClick}:{label:string;children:ReactNode;active?:boolean;disabled?:boolean;onClick:()=>void}){
  return <button type="button" className={'stage-icon-button'+(active?' active':'')} title={label} aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}>{children}</button>
}
export function StageToolbar(p:{name:string;status:string;canUndo:boolean;canRedo:boolean;undo:()=>void;redo:()=>void;save:()=>void;open:(panel:string)=>void;zoom:number;zoomBy:(factor:number)=>void;fit:()=>void;grid:boolean;toggleGrid:()=>void;snap:boolean;toggleSnap:()=>void;fullscreen:boolean;toggleFullscreen:()=>void;layers:boolean;inspector:boolean}){
  return <header className="stage-toolbar">
    <div className="stage-toolbar-title"><b>PLAN DE SCÈNE</b><span title={p.name}>{p.name}</span></div>
    <div className="stage-toolbar-actions">
      <ToolButton label="Annuler (Ctrl+Z)" disabled={!p.canUndo} onClick={p.undo}><Undo2/></ToolButton>
      <ToolButton label="Rétablir (Ctrl+Y)" disabled={!p.canRedo} onClick={p.redo}><Redo2/></ToolButton>
      <ToolButton label="Enregistrer (Ctrl+S)" onClick={p.save}><Save/></ToolButton>
      <ToolButton label="Historique / Versions" onClick={()=>p.open('versions')}><History/></ToolButton>
      <ToolButton label="Dupliquer l’installation" onClick={()=>p.open('duplicate')}><Copy/></ToolButton>
      <ToolButton label="Modèles d’installation" onClick={()=>p.open('templates')}><Library/></ToolButton>
      <span className="stage-divider"/>
      <ToolButton label="Zoom arrière (-)" onClick={()=>p.zoomBy(1/1.2)}><ZoomOut/></ToolButton>
      <button className="stage-zoom" title="Revenir à 100 %" onClick={()=>p.zoomBy(1/p.zoom)}>{Math.round(p.zoom*100)} %</button>
      <ToolButton label="Zoom avant (+)" onClick={()=>p.zoomBy(1.2)}><ZoomIn/></ToolButton>
      <ToolButton label="Adapter à l’écran (F)" onClick={p.fit}><Scan/></ToolButton>
      <span className="stage-divider"/>
      <ToolButton label="Grille (G)" active={p.grid} onClick={p.toggleGrid}><Grid3X3/></ToolButton>
      <ToolButton label="Magnétisme (S)" active={p.snap} onClick={p.toggleSnap}><Magnet/></ToolButton>
      <ToolButton label="Calques" active={p.layers} onClick={()=>p.open('layers')}><Layers/></ToolButton>
      <ToolButton label="Propriétés" active={p.inspector} onClick={()=>p.open('inspector')}><PanelRight/></ToolButton>
      <ToolButton label="Paramètres de scène" onClick={()=>p.open('scene')}><Settings2/></ToolButton>
      <ToolButton label="Aperçu avant export" onClick={()=>p.open('export')}><Download/></ToolButton>
      <ToolButton label={p.fullscreen?'Quitter le plein écran':'Plein écran'} active={p.fullscreen} onClick={p.toggleFullscreen}>{p.fullscreen?<Minimize/>:<Maximize/>}</ToolButton>
    </div>
    <span className={'stage-save-state '+(p.status.startsWith('Échec')?'error':'')} role="status">{p.status}</span>
  </header>
}
const tools:{id:Tool;name:string;icon:ReactNode}[]=[
  {id:'select',name:'Sélection',icon:<MousePointer2/>},{id:'pan',name:'Déplacement de la vue',icon:<Hand/>},{id:'equipment',name:'Ajouter matériel',icon:<PackagePlus/>},
  {id:'audio',name:'Ajouter câble audio',icon:<Cable/>},{id:'power',name:'Ajouter alimentation',icon:<Zap/>},{id:'network',name:'Ajouter réseau',icon:<Network/>},
  {id:'accessory',name:'Ajouter accessoire',icon:<Paperclip/>},{id:'text',name:'Texte / annotation',icon:<Type/>},{id:'zone',name:'Zone / forme',icon:<Square/>},{id:'measure',name:'Mesurer',icon:<Ruler/>}
]
export function StageTools({tool,onTool}:{tool:Tool;onTool:(tool:Tool)=>void}){return <nav className="stage-tools" aria-label="Outils du plan">{tools.map(t=><ToolButton key={t.id} label={t.name} active={tool===t.id} onClick={()=>onTool(t.id)}>{t.icon}</ToolButton>)}</nav>}

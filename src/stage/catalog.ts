import type { InstallationNode,InventoryStockItem,StageViewMode } from '../types'

export const OBJECT_CATEGORIES=['Musique','Audio','Mobilier','Lumière','Vidéo','Structure / scène','Décoration','Personnes / positions','Formes & annotations'] as const
export type ObjectDefinition={id:string;name:string;category:string;family:string;width:number;height:number;keywords:string;color?:string}
const item=(id:string,name:string,category:string,family:string,width:number,height:number,keywords='',color?:string):ObjectDefinition=>({id,name,category,family,width,height,keywords,color})
/** Add one definition and a silhouette in StageSymbols to extend the catalog. */
export const OBJECTS:ObjectDefinition[]=[
  item('keyboard','Clavier','Musique','keys',1.35,.35,'piano yamaha p125 p-125'),
  item('piano','Piano droit','Musique','keys',1.45,.6,'piano acoustique'),
  item('grand-piano','Piano à queue','Musique','keys',1.55,2,'piano concert'),
  item('drums','Batterie','Musique','drums',2,1.65,'drum kit'),
  item('guitar','Guitare','Musique','strings',.4,1,'guitare acoustique'),
  item('bass','Basse','Musique','strings',.35,1.2,'basse électrique'),
  item('amp','Ampli guitare','Musique','amp',.65,.32,'amplificateur'),
  item('sax','Saxophone','Musique','sax',.35,.7,'sax'),
  item('congas','Percussions','Musique','percussion',.75,.4,'conga percussion'),
  item('cajon','Cajón','Musique','percussion',.3,.3,'cajon'),
  item('music-stand','Pupitre musical','Musique','stand',.55,.4,'partition pupitre'),
  item('guitar-stand','Stand guitare','Musique','stand',.4,.45,'support basse'),
  item('mic','Micro seul','Audio','microphone',.08,.25,'micro main sm58 shure'),
  item('mic-straight','Micro sur pied droit','Audio','microphone',.4,.4,'chant microphone'),
  item('mic-boom','Micro sur pied perche','Audio','microphone',.65,.75,'microphone perche'),
  item('mic-table','Micro de table','Audio','microphone',.2,.3,'col cygne conférence'),
  item('stand-straight','Pied droit','Audio','mic-stand',.4,.4,'pied micro'),
  item('stand-boom','Pied perche','Audio','mic-stand',.65,.75,'pied microphone'),
  item('speaker','Baffle vertical','Audio','speaker',.5,.45,'enceinte speaker'),
  item('wedge','Retour de scène','Audio','speaker',.55,.45,'wedge retour'),
  item('line-array','Line array','Audio','speaker',.75,.55,'enceinte line array'),
  item('sub','Subwoofer','Audio','speaker',.65,.6,'caisson sub basse'),
  item('console','Console de mixage','Audio','mixer',.7,.55,'table mixage mixer'),
  item('mr18','MR18 / stagebox','Audio','mixer',.33,.15,'mr18 xr18 stagebox numérique'),
  item('rack','Rack audio','Audio','rack',.6,.55,'rack boîtier'),
  item('di','DI box','Audio','di',.12,.09,'boitier direct'),
  item('chair','Chaise simple','Mobilier','chair',.45,.45,'chaise client', '#718089'),
  item('chair-conference','Chaise conférence','Mobilier','chair',.5,.5,'chaise réunion', '#657883'),
  item('chair-banquet','Chaise banquet','Mobilier','chair',.45,.5,'chaise cérémonie', '#d9ccae'),
  item('chair-design','Chaise design','Mobilier','chair',.55,.55,'chaise moderne', '#e9e4da'),
  item('stool','Tabouret','Mobilier','chair',.35,.35,'tabouret piano', '#718089'),
  item('armchair','Fauteuil','Mobilier','sofa',.8,.8,'fauteuil lounge', '#a59b8d'),
  item('sofa','Canapé','Mobilier','sofa',2,.85,'canape lounge', '#a59b8d'),
  item('table-round','Table ronde','Mobilier','table',1.5,1.5,'table réception', '#dfd6c5'),
  item('table-rect','Table rectangulaire','Mobilier','table',1.8,.75,'table banquet', '#dfd6c5'),
  item('table-high','Table haute / mange-debout','Mobilier','table',.7,.7,'mange debout cocktail', '#dfd6c5'),
  item('lectern','Pupitre conférence','Mobilier','lectern',.6,.45,'tribune orateur', '#b79a72'),
  item('par','PAR LED','Lumière','light',.25,.3,'projecteur par led'),
  item('moving-head','Moving head / lyre','Lumière','light',.35,.4,'lyre motorisée'),
  item('led-bar','Barre LED','Lumière','light',1,.15,'barre lumière'),
  item('fresnel','Fresnel / projecteur','Lumière','light',.3,.4,'spot projecteur lumière'),
  item('light-stand','Pied lumière','Lumière','stand',.8,.8,'support projecteur'),
  item('totem','Totem','Lumière','truss',.5,.5,'structure verticale'),
  item('screen','Écran / télévision','Vidéo','screen',1.4,.25,'écran tv télévision'),
  item('led-wall','Écran LED','Vidéo','screen',3,.25,'mur led wall'),
  item('projection','Écran de projection','Vidéo','screen',2.4,.25,'toile projection'),
  item('projector','Vidéoprojecteur','Vidéo','projector',.35,.3,'video projecteur'),
  item('camera','Caméra','Vidéo','camera',.3,.45,'camera'),
  item('camera-stand','Pied caméra','Vidéo','stand',.7,.7,'trépied camera'),
  item('riser','Praticable','Structure / scène','platform',2,1,'plateau scène estrade', '#858e92'),
  item('podium','Podium','Structure / scène','platform',2,2,'scène podium', '#858e92'),
  item('stairs','Escalier','Structure / scène','stairs',1,.8,'marches'),
  item('ramp','Rampe','Structure / scène','stairs',1,2,'accès'),
  item('barrier','Barrière','Structure / scène','barrier',2,.25,'sécurité'),
  item('truss','Truss','Structure / scène','truss',2,.3,'structure métallique'),
  item('post','Poteau','Structure / scène','post',.25,.25,'colonne'),
  item('curtain','Rideau / fond de scène','Structure / scène','curtain',4,.25,'fond rideau backdrop', '#50596b'),
  item('plant','Plante','Décoration','plant',.6,.6,'plante fleur décor', '#759879'),
  item('vase','Vase','Décoration','vase',.3,.3,'vase décor', '#bba78b'),
  item('panel','Panneau / backdrop','Décoration','panel',2,.15,'panneau logo décoration', '#c7b69a'),
  item('arch','Arche','Décoration','arch',2,.5,'arche cérémonie', '#c7b69a'),
  item('singer','Chanteur','Personnes / positions','person',.5,.5,'chant choriste', '#789795'),
  item('musician','Musicien','Personnes / positions','person',.5,.5,'musicien', '#789795'),
  item('presenter','Intervenant / présentateur','Personnes / positions','person',.5,.5,'orateur présentateur', '#789795'),
  item('choir','Choriste','Personnes / positions','person',.5,.5,'choeur chorale', '#789795'),
  item('technician','Technicien','Personnes / positions','person',.5,.5,'régie technique', '#789795'),
  item('rectangle','Rectangle','Formes & annotations','shape',2,1,'forme zone', '#809eaf'),
  item('circle','Cercle','Formes & annotations','shape',1,1,'forme disque', '#809eaf'),
  item('zone','Zone rectangulaire','Formes & annotations','zone',3,2,'public vip backstage piste danse', '#69918e'),
  item('zone-circle','Zone circulaire','Formes & annotations','zone',2,2,'zone ronde', '#69918e'),
  item('line','Ligne','Formes & annotations','line',2,.15,'mur trait', '#476174'),
  item('arrow','Flèche','Formes & annotations','line',1,.25,'entrée accès direction', '#476174'),
  item('dimension','Cote','Formes & annotations','line',2,.2,'distance mesure mètres', '#476174'),
  item('text','Texte','Formes & annotations','text',1.6,.3,'annotation titre chant piano', '#294652'),
  item('note','Note','Formes & annotations','text',1.5,.8,'annotation commentaire', '#e1d4ae'),
]
export const objectById=(id?:string)=>OBJECTS.find(v=>v.id===id)
export const normalizeSearch=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr')
export function inferIllustration(node:InstallationNode,stock?:InventoryStockItem):string{
  if(node.appearance?.illustration)return node.appearance.illustration
  if(node.kind==='zone')return 'zone'
  if(node.kind==='text')return 'text'
  const s=normalizeSearch((stock?.name??node.name)+' '+(stock?.representationIcon??''))
  const rules:[RegExp,string][]=[[/queue/,'grand-piano'],[/batterie|drum/,'drums'],[/mr18|xr18|stagebox/,'mr18'],[/table.*mix|console|mixer/,'console'],[/micro.*perche/,'mic-boom'],[/micro.*pied/,'mic-straight'],[/pied.*perche/,'stand-boom'],[/pied.*micro/,'stand-straight'],[/micro|sm58|sm57/,'mic'],[/piano|clavier|keyboard/,'keyboard'],[/ampli/,'amp'],[/stand.*guitare/,'guitar-stand'],[/guitare|guitar/,'guitar'],[/basse|bass/,'bass'],[/sax/,'sax'],[/sub|caisson/,'sub'],[/retour|wedge|monitor/,'wedge'],[/line.array/,'line-array'],[/baffle|enceinte|speaker/,'speaker'],[/chaise/,'chair'],[/fauteuil/,'armchair'],[/canape/,'sofa'],[/tabouret/,'stool'],[/table.*ronde/,'table-round'],[/table/,'table-rect'],[/lyre|moving.head/,'moving-head'],[/par led/,'par'],[/lumiere|fresnel/,'fresnel'],[/led.*wall|ecran.*led/,'led-wall'],[/video.*proj/,'projector'],[/ecran|television|tv/,'screen'],[/praticable|estrade|podium/,'riser'],[/pupitre/,'music-stand'],[/plante/,'plant'],[/rideau/,'curtain'],[/truss/,'truss'],[/di box|boitier.*direct/,'di'],[/rack/,'rack']]
  return rules.find(([r])=>r.test(s))?.[1]??'generic'
}
export function nodeLabel(node:InstallationNode,stock:InventoryStockItem|undefined,mode:StageViewMode,references=false,providers=false){
  const a=node.appearance,kind=a?.labelMode??'auto',definition=objectById(inferIllustration(node,stock))
  if(kind==='none')return ''
  const short=a?.shortLabel||definition?.name||node.name
  // Client references/provider details require the dedicated export opt-ins.
  let label=kind==='custom'?a?.customLabel??'':kind==='role'?a?.roleLabel||short:kind==='short'?short:
    kind==='material'?(mode==='client'&&!references?short:stock?.name||node.name):kind==='full'?(mode==='client'&&!references?short:node.name):
    references?stock?.name||node.name:mode==='technical'?node.name:short
  if(providers&&stock?.provider)label+=' · '+stock.provider
  return label
}

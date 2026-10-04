import React, {useState} from 'react'
import {createRoot} from 'react-dom/client'
import {db} from '../../src/db'
import {InventoryProgramPage} from '../../src/inventory'
import '../../src/styles.css'
import '../../src/stage/stage.css'
const id='stage-qa-legacy',stamp='2026-10-02T10:00:00Z'
// Isolated browser database fixture. This entry is not part of the production build.
if(new URLSearchParams(location.search).has('reset')){
  await db.programs.clear()
  await db.programs.put({id,name:'Concert Église — 05 octobre',date:'2026-10-05',location:'Antananarivo',notes:'Balance à 15 h',items:[{id:'piano-stock',name:'Piano',category:'instrument',stockItemId:'qa-stock',quantity:1,loaded:true}],createdAt:stamp,updatedAt:stamp,deletedAt:null,installation:{stageWidth:980,stageHeight:650,stageWidthMeters:12,stageDepthMeters:8,stagePixelsPerMeter:80,nodes:[{id:'piano',name:'Piano',stockItemId:'qa-stock',x:100,y:100,width:120,height:90,rotation:0},{id:'mic',name:'Micro chant',stockItemId:'qa-mic',x:420,y:100,width:90,height:90},{id:'mr18',name:'MR18',x:430,y:400,width:130,height:90},{id:'speaker',name:'Retour scène',x:710,y:160,width:100,height:110}],links:[{id:'legacy-wire',fromNodeId:'piano',toNodeId:'mr18',kind:'audio',routeMode:'zigzag',route:[{x:250,y:145},{x:250,y:445}],lengthMeters:10},{id:'curve',fromNodeId:'mic',toNodeId:'speaker',kind:'network',routeMode:'curve',route:[{x:610,y:70}]}],layers:{materials:true,audio:true,power:true,connectivity:true,accessories:true},layerOrder:['materials','audio','power','connectivity','accessories'],customLayers:[{id:'custom-legacy',name:'Lumière'}],snapshots:[{id:'old-plan',name:'Version ancienne',createdAt:stamp,nodes:[{id:'piano',name:'Piano',x:100,y:100}],links:[]}]}})
  await db.inventoryStock.bulkPut([{id:'qa-chair',name:'Chaise noire',category:'accessoire',quantity:80,provider:'Salle XYZ',createdAt:stamp,updatedAt:stamp,deletedAt:null},{id:'qa-mic',name:'Shure SM58',category:'instrument',quantity:12,provider:'ARIZONA',ports:[{id:'mic-out',label:'Sortie',connector:'XLR(M)',direction:'out',count:1}],createdAt:stamp,updatedAt:stamp,deletedAt:null}])
  await db.inventoryStock.put({id:'qa-stock',name:'Piano',category:'instrument',quantity:2,provider:'ARIZONA',createdAt:stamp,updatedAt:stamp,deletedAt:null})
}
function App(){const [programId,setProgramId]=useState(id),[toast,setToast]=useState('');return <div style={{padding:16,maxWidth:1800,margin:'auto'}}><InventoryProgramPage programId={programId} onOpen={setProgramId} onBack={()=>{}} onChanged={()=>{}} onShare={()=>{}} toast={message=>{setToast(message);setTimeout(()=>setToast(''),2500)}}/>{toast&&<div style={{position:'fixed',bottom:6,left:20,zIndex:12000,padding:'9px 15px',borderRadius:8,background:'#163e4c',color:'white',fontSize:13}}>{toast}</div>}</div>}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)

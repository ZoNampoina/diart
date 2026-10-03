import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url)
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright')
const results=process.env.STAGE_QA_OUTPUT||'/tmp/diart-stage-results'
await mkdir(results,{recursive:true})
const browser=await chromium.launch({headless:true,executablePath:process.env.STAGE_QA_CHROME||undefined,args:['--no-sandbox']})
const page=await browser.newPage({viewport:{width:1440,height:1050}})
const errors=[];page.on('pageerror',e=>errors.push(e.message))
const steps=[]
const pass=name=>{steps.push(name);console.log('PASS '+name)}
const button=name=>page.getByRole('button',{name,exact:true})
const db=async()=>page.evaluate(async()=>{const {db}=await import('/src/db.ts');return db.programs.toArray()})
const current=async()=>{const title=await page.locator('.program-title-input').inputValue();return (await db()).find(p=>p.name===title)}
const plan=async()=>(await current()).installation
const saved=()=>page.waitForFunction(()=>document.querySelector('.stage-save-state')?.textContent==='Enregistré sur cet appareil')
const node=id=>page.locator(`.stage-world [data-node="${id}"]`).first()
const point=async(id)=>{const r=await node(id).boundingBox();assert(r);return{x:r.x+r.width/2,y:r.y+r.height/2}}
const clickNode=async id=>{const p=await point(id);await page.mouse.click(p.x,p.y)}
const dragNode=async(id,dx,dy)=>{const p=await point(id);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+dx,p.y+dy,{steps:8});await page.mouse.up();await saved()}
try{
await page.goto('http://127.0.0.1:4173/scripts/stage-qa/index.html?reset=1')
await button('Installation avancée').click();await page.locator('.stage-world').waitFor()
await button('Plein écran').click();await page.locator('.stage-editor.is-fullscreen').waitFor()
await button('Adapter à l’écran (F)').click()
assert.equal((await plan()).nodes.length,4);pass('Open a persisted legacy installation with routes and snapshots')
await clickNode('piano');await page.keyboard.down('Shift');await clickNode('mic');await page.keyboard.up('Shift')
assert.match(await page.locator('.stage-status').innerText(),/2 sélectionné/)
const original=await plan();await dragNode('piano',70,40);const moved=await plan()
assert.notEqual(moved.nodes[0].x,original.nodes[0].x);assert.ok(Math.abs((moved.nodes[1].x-original.nodes[1].x)-(moved.nodes[0].x-original.nodes[0].x))<1e-8);pass('Move multiple equipment items in one gesture')
await button('Annuler (Ctrl+Z)').click();await saved();assert.deepEqual((await plan()).nodes,original.nodes);pass('Undo restores the complete group in one step')
await button('Rétablir (Ctrl+Y)').click();await saved();assert.deepEqual((await plan()).nodes,moved.nodes);pass('Redo restores group movement')
await button('Ajouter câble audio').click();await clickNode('piano');await clickNode('speaker');await saved();assert.equal((await plan()).links.length,3);pass('Create a cable by clicking source and destination')
await button('Annuler (Ctrl+Z)').click();await saved();assert.equal((await plan()).links.length,2);pass('Undo cable creation')
await button('Sélection').click();await clickNode('piano');await page.keyboard.press('Control+d');await saved();assert.equal((await plan()).nodes.length,5);pass('Ctrl+D duplicates equipment')
assert.equal(await page.evaluate(async()=>{const {db}=await import('/src/db.ts');return(await db.inventoryStock.get('qa-stock')).quantity}),2);pass('Graphic duplication leaves physical stock unchanged')
await button('Paramètres de scène').click()
const beforeMetric=await plan()
await page.getByLabel('Largeur scène (m)',{exact:true}).fill('5');await page.getByLabel('Profondeur scène (m)',{exact:true}).fill('4');await page.getByLabel('Échelle (px/m)',{exact:true}).fill('100');await button('Adapter le plan actuel').click();await saved()
const scaled=await plan();assert.equal(scaled.stageWidth,500);assert.equal(scaled.stageHeight,400);assert.notEqual(scaled.nodes[0].x,beforeMetric.nodes[0].x);pass('Change dimensions and adapt current objects and routes')
await page.getByLabel('Échelle (px/m)',{exact:true}).fill('75');await button('Changer seulement la mesure').click();await saved();const measured=await plan();assert.equal(measured.stagePixelsPerMeter,75);assert.deepEqual(measured.nodes,scaled.nodes);assert.deepEqual(measured.links,scaled.links);pass('Measure-only change preserves exact node and cable geometry')
await button('Adapter à l’écran (F)').click()
await button('Calques').click();await button('Masquer Audio').click();await saved();assert.equal(await page.locator('.stage-world [data-stage-layer="audio"]').count(),0);await button('Afficher Audio').click();await saved();assert.equal(await page.locator('.stage-world [data-stage-layer="audio"]').count(),1);pass('Hide and show layers')
await button('Verrouiller Matos').click();await saved();await button('Fermer les calques').click();const locked=await plan();await button('Sélection').click();await dragNode('piano',30,30);assert.deepEqual((await plan()).nodes,locked.nodes);pass('Layer lock prevents accidental movement')
await button('Calques').click();await button('Déverrouiller Matos').click();await button('Fermer les calques').click();await saved()
const beforeZoom=await plan();await button('Zoom avant (+)').click();assert.deepEqual((await plan()).nodes,beforeZoom.nodes);await button('Adapter à l’écran (F)').click();pass('Zoom changes the viewport without changing scene coordinates')
await button('Historique / Versions').click();await page.getByLabel('Nom de la version',{exact:true}).fill('Plan concert QA');await button('Enregistrer une version').click();await saved();assert.equal((await plan()).snapshots.length,2);await button('Fermer la fenêtre').click();pass('Save a full durable version while preserving legacy snapshots')
await button('Modèles d’installation').click();await page.getByLabel('Nom du modèle',{exact:true}).fill('Modèle concert QA');await button('Enregistrer le modèle').click();
await page.waitForFunction(async()=>{const {db}=await import('/src/db.ts');return (await db.programs.toArray()).some(p=>p.isTemplate&&p.name==='Modèle concert QA')});pass('Create a reusable template outside active events')
await button('Utiliser').click();await page.getByLabel('Nom du nouveau programme',{exact:true}).fill('Concert Église — 12 octobre QA');await page.getByLabel('Date du nouvel événement',{exact:true}).fill('2026-10-12');await button('Créer le nouveau programme').click()
await page.waitForFunction(()=>document.querySelector('.program-title-input')?.value==='Concert Église — 12 octobre QA');await page.locator('.stage-editor').waitFor();await button('Plein écran').click();await button('Adapter à l’écran (F)').click();pass('Create and open a new program from a template')
const source=(await db()).find(p=>p.id==='stage-qa-legacy');const copied=await plan();assert.equal(copied.nodes.length,source.installation.nodes.length);assert.notEqual(copied.nodes[0].id,source.installation.nodes[0].id);await button('Sélection').click();await dragNode(copied.nodes[0].id,20,25);assert.deepEqual((await db()).find(p=>p.id==='stage-qa-legacy').installation,source.installation);pass('Editing the copy leaves the original unchanged')
await button('Aperçu avant export').click();await button('Générer l’aperçu').click();await page.locator('.stage-export-preview img').waitFor({timeout:30000});const image=await page.locator('.stage-export-preview img').getAttribute('src');await writeFile(results+'/stage-export.png',Buffer.from(image.split(',')[1],'base64'));assert.equal(await page.locator('.stage-download').getAttribute('href'),image);pass('PNG preview is the identical downloadable image')
await page.screenshot({path:results+'/export-preview-desktop.png'});await button('Fermer la fenêtre').click();await page.screenshot({path:results+'/editor-desktop.png'})
await page.keyboard.press('Escape');assert.equal(await page.locator('.stage-editor.is-fullscreen').count(),0);pass('Escape exits full screen without leaving the editor')
await page.setViewportSize({width:1024,height:768});await button('Plein écran').click();await button('Adapter à l’écran (F)').click();await button('Calques').click();await button('Fermer les calques').click();await button('Propriétés').click();await page.screenshot({path:results+'/editor-tablet.png'});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);pass('Tablet viewport and retractable side panels')
await page.setViewportSize({width:390,height:844});await button('Adapter à l’écran (F)').click();await page.screenshot({path:results+'/editor-phone.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);pass('Phone viewport has no page-width overflow')
assert.deepEqual(errors,[]);pass('No JavaScript runtime errors')
await writeFile(results+'/report.json',JSON.stringify({browser:await browser.version(),steps,errors},null,2))
}catch(e){console.error(e);console.log('RUNTIME ERRORS',errors);await page.screenshot({path:results+'/failure.png'});await writeFile(results+'/failure.txt',await page.locator('body').innerText());process.exitCode=1}finally{await browser.close()}

import { useEffect, useMemo, useState } from 'react'
import {
  Ban, Check, CloudDownload, Copy, Globe2, KeyRound, ListMusic,
  LockKeyhole, MonitorSmartphone, RefreshCw, Search, ShieldCheck, ShieldOff, UserRound,
  UsersRound, WifiOff, Boxes, Music2, Eye, EyeOff, CalendarClock
} from 'lucide-react'
import { signIn, supabase } from './cloud'
import { DIART_RELEASES } from './releases'
import { DIART_LOGO_DAY, DIART_LOGO_NIGHT } from './brand'
import {
  banUser, fetchAdminOverview, fetchPublicInventory, fetchPublicSetlists, fetchPublicSongs,
  generateImportCode, importPublicSongToPersonal, redeemPublicImportCode, restoreDevice,
  revokeDevice, revokeUserDevices, trustDevice, unbanUser,
  type AdminOverview, type DiartProfile, type PublicInventoryRecord, type PublicSetlistRecord, type PublicSongRecord
} from './community'

export function DiartAuthGate({onSignedIn}:{onSignedIn:()=>Promise<void>}){
  const [mode,setMode]=useState<'login'|'signup'>('login')
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [displayName,setDisplayName]=useState('')
  const [showPassword,setShowPassword]=useState(false)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const submit=async()=>{
    if(!email.trim()||password.length<6)return
    setBusy(true);setMessage('')
    try{
      if(mode==='login'){
        const {error}=await signIn(email.trim(),password)
        if(error)throw error
        await onSignedIn()
      }else{
        const {data,error}=await supabase.auth.signUp({
          email:email.trim(),password,
          options:{data:{display_name:displayName.trim()||email.trim().split('@')[0]}}
        })
        if(error)throw error
        if(data.session)await onSignedIn()
        else setMessage('Compte créé. Confirmez votre adresse e-mail, puis revenez vous connecter.')
      }
    }catch(e){setMessage(e instanceof Error?e.message:'Authentification impossible.')}
    finally{setBusy(false)}
  }
  return <div className="diart-auth-shell">
    <section className="diart-auth-card">
      <div className="diart-auth-brand">
        <span className="brand-mark"><img className="brand-logo logo-night" src={DIART_LOGO_DAY} alt=""/><img className="brand-logo logo-day" src={DIART_LOGO_NIGHT} alt=""/></span>
        <div><b>DI’ART</b><small>by ARIZONA</small></div>
      </div>
      <div className="diart-auth-copy"><h1>Votre espace musical, sur tous vos appareils.</h1><p>Connectez cet appareil à votre compte DI’ART. Vos données personnelles restent privées ; le catalogue partagé est séparé.</p></div>
      <div className="diart-auth-tabs"><button className={mode==='login'?'active':''} onClick={()=>setMode('login')}>Connexion</button><button className={mode==='signup'?'active':''} onClick={()=>setMode('signup')}>Nouveau compte</button></div>
      <div className="diart-auth-form">
        {mode==='signup'&&<label><span>Nom affiché</span><input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Votre nom"/></label>}
        <label><span>Adresse e-mail</span><input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="nom@exemple.com"/></label>
        <label><span>Mot de passe</span><div className="diart-password-field"><input type={showPassword?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void submit()}} placeholder="6 caractères minimum"/><button type="button" className="diart-password-toggle" aria-label={showPassword?'Masquer le mot de passe':'Afficher le mot de passe'} title={showPassword?'Masquer':'Afficher'} onClick={()=>setShowPassword(v=>!v)}>{showPassword?<EyeOff/>:<Eye/>}</button></div></label>
        {message&&<p className="diart-auth-message">{message}</p>}
        <button className="primary diart-auth-submit" disabled={busy||!email.trim()||password.length<6} onClick={()=>void submit()}>{mode==='login'?<><LockKeyhole/>Associer cet appareil</>:<><UserRound/>Créer mon compte</>}</button>
      </div>
      <div className="diart-auth-foot"><MonitorSmartphone/><span>L’appareil sera enregistré dans votre compte avec son type, navigateur et dernière activité.</span></div>
    </section>
  </div>
}

export function CommunityPage({profile,toast,onImported,onProfileChanged}:{profile:DiartProfile|null;toast:(s:string)=>void;onImported:()=>Promise<void>;onProfileChanged:()=>Promise<void>}){
  const [songs,setSongs]=useState<PublicSongRecord[]>([])
  const [setlists,setSetlists]=useState<PublicSetlistRecord[]>([])
  const [inventory,setInventory]=useState<PublicInventoryRecord[]>([])
  const [tab,setTab]=useState<'songs'|'setlists'|'inventory'>('songs')
  const [query,setQuery]=useState('')
  const [code,setCode]=useState('')
  const [busy,setBusy]=useState(false)
  const load=async()=>{
    setBusy(true)
    try{
      const [s,l,i]=await Promise.all([fetchPublicSongs(),fetchPublicSetlists(),fetchPublicInventory()])
      setSongs(s);setSetlists(l);setInventory(i)
    }catch(e){toast(e instanceof Error?e.message:'Chargement public impossible.')}
    finally{setBusy(false)}
  }
  useEffect(()=>{void load()},[])
  const filteredSongs=useMemo(()=>{
    const q=query.trim().toLowerCase()
    if(!q)return songs
    return songs.filter(row=>[row.payload.title,row.payload.artist,row.payload.authorComposer,row.source_label].some(v=>String(v||'').toLowerCase().includes(q)))
  },[songs,query])
  const redeem=async()=>{
    if(!code.trim())return
    setBusy(true)
    try{
      const r=await redeemPublicImportCode(code)
      toast(`Catalogue public importé : ${r.imported} morceau(x).`)
      setCode('')
      await onProfileChanged()
      await onImported()
    }catch(e){toast(e instanceof Error?e.message:'Code invalide.')}
    finally{setBusy(false)}
  }
  const importOne=async(row:PublicSongRecord)=>{
    if(!profile?.public_imported_at){toast('Activez d’abord l’import public avec votre code personnel.');return}
    try{await importPublicSongToPersonal(row);await onImported();toast(`« ${row.payload.title} » importé dans votre espace personnel.`)}
    catch(e){toast(e instanceof Error?e.message:'Import impossible.')}
  }
  return <>
    <section className="community-hero panel">
      <div><span className="eyebrow">MODE PUBLIC</span><h1>Bibliothèque DI’ART partagée</h1><p>Morceaux communs, setlists et inventaires volontairement publiés. Les favoris, récents et données personnelles ne sont jamais affichés ici.</p></div>
      <Globe2/>
    </section>
    {!profile?.public_imported_at&&<section className="panel community-code-panel">
      <div><KeyRound/><span><b>Importer la base publique dans votre compte</b><small>Un code personnel généré par l’administrateur est demandé une seule fois.</small></span></div>
      <div className="community-code-form"><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="DIART-XXXX-XXXX"/><button className="primary" disabled={busy||!code.trim()} onClick={()=>void redeem()}><CloudDownload/>Importer</button></div>
    </section>}
    <div className="community-tabs">
      <button className={tab==='songs'?'active':''} onClick={()=>setTab('songs')}><Music2/>Morceaux <b>{songs.length}</b></button>
      <button className={tab==='setlists'?'active':''} onClick={()=>setTab('setlists')}><ListMusic/>Setlists <b>{setlists.length}</b></button>
      <button className={tab==='inventory'?'active':''} onClick={()=>setTab('inventory')}><Boxes/>Inventaires <b>{inventory.length}</b></button>
    </div>
    {tab==='songs'&&<>
      <div className="community-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Titre, artiste, auteur ou contributeur…"/><button className="secondary" onClick={()=>void load()} disabled={busy}><RefreshCw/>Actualiser</button></div>
      <section className="panel community-list">
        {filteredSongs.map(row=><article className="community-song-row" key={row.id}>
          <div><b>{row.payload.title||'Sans titre'}</b><small>{row.payload.artist||'Artiste inconnu'}{row.payload.authorComposer?' · '+row.payload.authorComposer:''}</small></div>
          <span className="community-source">Modifié par <b>{row.source_label||'Utilisateur DI’ART'}</b><small>{new Date(row.updated_at).toLocaleDateString('fr-FR')}</small></span>
          <button className="secondary" onClick={()=>void importOne(row)} disabled={!profile?.public_imported_at}><CloudDownload/>Importer</button>
        </article>)}
        {!filteredSongs.length&&<p className="muted-copy">Aucun morceau public correspondant.</p>}
      </section>
    </>}
    {tab==='setlists'&&<section className="community-grid">
      {setlists.map(row=><article className="panel community-public-card" key={row.id}><ListMusic/><div><b>{row.payload.name}</b><small>Publié par {row.owner_label||'Utilisateur DI’ART'}</small><p>{row.payload.songIds?.length??0} morceau(x)</p></div></article>)}
      {!setlists.length&&<section className="panel"><p className="muted-copy">Aucune setlist publique pour le moment.</p></section>}
    </section>}
    {tab==='inventory'&&<section className="community-grid">
      {inventory.map(row=><article className="panel community-public-card" key={row.id}><Boxes/><div><b>{String((row.payload as any)?.name||'Inventaire')}</b><small>Publié par {row.owner_label||'Utilisateur DI’ART'}</small><p>{Array.isArray((row.payload as any)?.items)?(row.payload as any).items.filter((x:any)=>x.quantity>0).length+' référence(s)':'Inventaire partagé'}</p></div></article>)}
      {!inventory.length&&<section className="panel"><p className="muted-copy">Aucun inventaire public pour le moment.</p></section>}
    </section>}
  </>
}

export function AdminPage({toast}:{toast:(s:string)=>void}){
  const [data,setData]=useState<AdminOverview|null>(null)
  const [tab,setTab]=useState<'overview'|'users'|'audit'|'codes'|'versions'>('overview')
  const [busy,setBusy]=useState(false)
  const [email,setEmail]=useState('')
  const [durationValue,setDurationValue]=useState('1')
  const [durationUnit,setDurationUnit]=useState<'day'|'month'|'year'>('month')
  const [generated,setGenerated]=useState<{code:string;email:string;expires_at:string}|null>(null)
  const load=async()=>{
    setBusy(true)
    try{setData(await fetchAdminOverview())}
    catch(e){toast(e instanceof Error?e.message:'Chargement administrateur impossible.')}
    finally{setBusy(false)}
  }
  useEffect(()=>{void load();const t=window.setInterval(()=>void load(),30000);return()=>window.clearInterval(t)},[])
  const act=async(fn:()=>Promise<unknown>,message:string)=>{setBusy(true);try{await fn();toast(message);await load()}catch(e){toast(e instanceof Error?e.message:'Action impossible.')}finally{setBusy(false)}}
  const makeCode=async()=>{
    const value=Math.trunc(Number(durationValue))
    if(!email.trim()||!Number.isFinite(value)||value<1)return
    setBusy(true)
    try{const r=await generateImportCode(email,value,durationUnit);setGenerated(r);toast('Code généré.');await load()}
    catch(e){toast(e instanceof Error?e.message:'Génération impossible.')}
    finally{setBusy(false)}
  }
  const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);toast('Copié.')}catch{toast(value)}}
  return <>
    <section className="admin-hero panel"><div><span className="eyebrow">ADMINISTRATION</span><h1>DI’ART · utilisateurs et activité</h1><p>Comptes, appareils, codes d’import et historique des modifications.</p></div><ShieldCheck/></section>
    <div className="admin-tabs">
      <button className={tab==='overview'?'active':''} onClick={()=>setTab('overview')}>Vue globale</button>
      <button className={tab==='users'?'active':''} onClick={()=>setTab('users')}>Utilisateurs</button>
      <button className={tab==='audit'?'active':''} onClick={()=>setTab('audit')}>Historique</button>
      <button className={tab==='codes'?'active':''} onClick={()=>setTab('codes')}>Codes</button>
      <button className={tab==='versions'?'active':''} onClick={()=>setTab('versions')}>Évolutions</button>
      <button className="secondary" onClick={()=>void load()} disabled={busy}><RefreshCw/>Actualiser</button>
    </div>
    {tab==='overview'&&<div className="admin-stat-grid">
      <section className="panel"><UsersRound/><span>Utilisateurs</span><b>{data?.stats.users??'—'}</b></section>
      <section className="panel"><MonitorSmartphone/><span>Appareils actifs</span><b>{data?.stats.active_devices??'—'}</b></section>
      <section className="panel"><Music2/><span>Morceaux publics</span><b>{data?.stats.public_songs??'—'}</b></section>
      <section className="panel"><ListMusic/><span>Setlists publiques</span><b>{data?.stats.public_setlists??'—'}</b></section>
      <section className="panel"><Boxes/><span>Inventaires publics</span><b>{data?.stats.public_inventory??'—'}</b></section>
      <section className="panel"><RefreshCw/><span>Événements suivis</span><b>{data?.audit.length??'—'}</b></section>
    </div>}
    {tab==='users'&&<section className="admin-user-list">
      {(data?.users??[]).map(user=><article className="panel admin-user-card" key={user.id}>
        <div className="admin-user-head"><div><b>{user.profile?.display_name||user.email||'Utilisateur'}</b><small>{user.email}</small></div><span className={'admin-status '+(user.profile?.status==='banned'?'banned':'active')}>{user.profile?.role==='admin'?'ADMIN · ':''}{user.profile?.status==='banned'?'Banni':'Actif'}</span></div>
        <div className="admin-user-meta"><span>Créé : {user.created_at?new Date(user.created_at).toLocaleString('fr-FR'):'—'}</span><span>Dernière connexion : {user.last_sign_in_at?new Date(user.last_sign_in_at).toLocaleString('fr-FR'):'—'}</span><span>{user.devices.length} appareil(s)</span></div>
        <div className="admin-user-actions">
          <button className="secondary" disabled={busy} onClick={()=>void act(()=>revokeUserDevices(user.id),'Tous les appareils ont été déconnectés.')}><WifiOff/>Déconnecter partout</button>
          {user.profile?.status==='banned'?<button className="secondary" disabled={busy} onClick={()=>void act(()=>unbanUser(user.id),'Utilisateur réactivé.')}><ShieldCheck/>Réactiver</button>:user.profile?.role!=='admin'&&<button className="danger" disabled={busy} onClick={()=>void act(()=>banUser(user.id),'Utilisateur banni.')}><Ban/>Bannir</button>}
        </div>
        <div className="admin-device-list">{user.devices.map(device=><div className="admin-device-row" key={device.id}>
          <MonitorSmartphone/><span><b>{device.device_name||device.platform||'Appareil'}</b><small>{device.browser} · {device.platform}{device.screen_size?' · '+device.screen_size:''}</small><small>Dernière activité : {new Date(device.last_seen_at).toLocaleString('fr-FR')}</small></span>
          <div>{device.trusted_at?<i className="trusted"><Check/>Enregistré</i>:<button className="secondary compact" onClick={()=>void act(()=>trustDevice(device.id),'Appareil enregistré.')}><ShieldCheck/>Enregistrer</button>}{device.revoked_at?<button className="secondary compact" onClick={()=>void act(()=>restoreDevice(device.id),'Appareil réautorisé.')}><ShieldCheck/>Réautoriser</button>:<button className="danger compact" onClick={()=>void act(()=>revokeDevice(device.id),'Appareil déconnecté.')}><ShieldOff/>Déconnecter</button>}</div>
        </div>)}</div>
      </article>)}
    </section>}
    {tab==='audit'&&<section className="panel admin-audit-list">
      {(data?.audit??[]).map(row=><div className="admin-audit-row" key={row.id}><span><b>{row.action.replace(/_/g,' ')}</b><small>{row.actor_email||'Système'} · {row.entity_type}{row.details?.label?' · '+String(row.details.label):''}</small></span><time>{new Date(row.created_at).toLocaleString('fr-FR')}</time></div>)}
      {!data?.audit?.length&&<p className="muted-copy">Aucune activité enregistrée.</p>}
    </section>}
    {tab==='codes'&&<>
      <section className="panel admin-code-maker"><div><KeyRound/><span><b>Nouveau code d’import public</b><small>Un code actif par adresse. Vous choisissez sa durée de validité.</small></span></div><div className="admin-code-form"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="utilisateur@exemple.com"/><div className="admin-code-duration"><input type="number" min="1" max="9999" inputMode="numeric" aria-label="Durée du code" value={durationValue} onChange={e=>setDurationValue(e.target.value)}/><select aria-label="Unité de durée" value={durationUnit} onChange={e=>setDurationUnit(e.target.value as 'day'|'month'|'year')}><option value="day">jour(s)</option><option value="month">mois</option><option value="year">année(s)</option></select></div><button className="primary" disabled={busy||!email.trim()||!Number.isFinite(Number(durationValue))||Number(durationValue)<1} onClick={()=>void makeCode()}><KeyRound/>Générer</button></div>{generated&&<div className="generated-code"><span>{generated.email}</span><b>{generated.code}</b><small>Valide jusqu’au {new Date(generated.expires_at).toLocaleString('fr-FR')}</small><button className="secondary" onClick={()=>void copy(generated.code)}><Copy/>Copier</button></div>}</section>
      <section className="panel admin-code-list">{(data?.codes??[]).map(row=><div className="admin-code-row" key={row.id}><span><b>{row.target_email}</b><small>Créé {new Date(row.created_at).toLocaleDateString('fr-FR')} · valide jusqu’au {new Date(row.expires_at).toLocaleDateString('fr-FR')}</small></span><strong>{row.used_at?'Utilisé':row.active?'Actif':'Désactivé'}</strong></div>)}</section>
    </>}
    {tab==='versions'&&<section className="panel admin-release-history"><div className="panel-title-row"><div><h2>Grandes évolutions de DI’ART</h2><small>Historique des étapes structurantes de l’application.</small></div><CalendarClock/></div><div className="release-history">{DIART_RELEASES.map(release=><article className="release-entry" key={release.version}><div className="release-version"><b>v{release.version}</b><small>{release.date}</small></div><div><h3>{release.title}</h3><p>{release.summary}</p><ul>{release.highlights.map(item=><li key={item}>{item}</li>)}</ul></div></article>)}</div></section>}
  </>
}

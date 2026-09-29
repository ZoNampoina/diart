import { supabase } from './cloud'
import { db } from './db'
import type { InventoryProgram, Song, Setlist } from './types'

export type DiartRole='user'|'admin'
export type DiartStatus='active'|'banned'
export interface DiartProfile{
  user_id:string
  email:string
  display_name:string
  role:DiartRole
  status:DiartStatus
  created_at:string
  last_seen_at?:string|null
  public_imported_at?:string|null
}
export interface DiartDevice{
  id:string
  user_id:string
  device_key:string
  device_name:string
  platform:string
  browser:string
  user_agent:string
  language:string
  screen_size:string
  pwa:boolean
  first_seen_at:string
  last_seen_at:string
  trusted_at?:string|null
  revoked_at?:string|null
}
export interface PublicSongRecord{ id:string;payload:Song;source_label:string;created_by?:string|null;updated_by?:string|null;created_at:string;updated_at:string }
export interface PublicSetlistRecord{ id:string;owner_user_id:string;owner_label:string;payload:Setlist;published_at:string;updated_at:string }
export interface PublicInventoryRecord{ id:string;owner_user_id:string;owner_label:string;kind:'program'|'stock';payload:InventoryProgram|Record<string,unknown>;published_at:string;updated_at:string }
export interface AdminUserRow{
  id:string
  email:string
  created_at?:string|null
  last_sign_in_at?:string|null
  banned_until?:string|null
  profile:DiartProfile|null
  devices:DiartDevice[]
}
export interface AdminAuditRow{
  id:number
  actor_user_id?:string|null
  actor_email?:string|null
  action:string
  entity_type:string
  entity_id?:string|null
  details:Record<string,unknown>
  created_at:string
}
export interface AdminCodeRow{
  id:string
  target_email:string
  created_at:string
  expires_at:string
  used_by?:string|null
  used_at?:string|null
  active:boolean
}
export interface AdminOverview{
  ok:boolean
  users:AdminUserRow[]
  audit:AdminAuditRow[]
  codes:AdminCodeRow[]
  stats:{users:number;active_devices:number;public_songs:number;public_setlists:number;public_inventory:number}
}

const DEVICE_KEY_STORAGE='diart-device-key-v1'
const LOCAL_OWNER_STORAGE='diart-local-owner-v1'

export async function prepareLocalAccount(userId:string):Promise<{needsPull:boolean;switched:boolean}>{
  let previous=''
  try{previous=localStorage.getItem(LOCAL_OWNER_STORAGE)||''}catch{}
  const [songsCount,setlistsCount,programsCount,stockCount]=await Promise.all([
    db.songs.filter(song=>song.source!=='demo').count(),db.setlists.count(),db.programs.count(),db.inventoryStock.count()
  ])
  const hasPersonalData=songsCount+setlistsCount+programsCount+stockCount>0
  if(previous&&previous!==userId){
    await db.transaction('rw',[db.songs,db.setlists,db.activity,db.programs,db.inventoryStock,db.settings],async()=>{
      await Promise.all([db.songs.clear(),db.setlists.clear(),db.activity.clear(),db.programs.clear(),db.inventoryStock.clear(),db.settings.clear()])
    })
    try{localStorage.setItem(LOCAL_OWNER_STORAGE,userId)}catch{}
    return {needsPull:true,switched:true}
  }
  if(!previous){
    try{localStorage.setItem(LOCAL_OWNER_STORAGE,userId)}catch{}
    return {needsPull:!hasPersonalData,switched:false}
  }
  return {needsPull:false,switched:false}
}

function deviceKey(){
  try{
    let value=localStorage.getItem(DEVICE_KEY_STORAGE)
    if(!value){value=crypto.randomUUID();localStorage.setItem(DEVICE_KEY_STORAGE,value)}
    return value
  }catch{return crypto.randomUUID()}
}
export function currentDeviceKey(){return deviceKey()}

function browserName(ua:string){
  if(/edg\//i.test(ua))return 'Microsoft Edge'
  if(/opr\//i.test(ua))return 'Opera'
  if(/firefox\//i.test(ua))return 'Firefox'
  if(/chrome\//i.test(ua))return 'Chrome'
  if(/safari\//i.test(ua))return 'Safari'
  return 'Navigateur'
}
function deviceName(ua:string,platform:string){
  if(/android/i.test(ua))return 'Téléphone / tablette Android'
  if(/iphone/i.test(ua))return 'iPhone'
  if(/ipad/i.test(ua))return 'iPad'
  if(/windows/i.test(ua)||/win/i.test(platform))return 'PC Windows'
  if(/macintosh|mac os/i.test(ua)||/mac/i.test(platform))return 'Mac'
  if(/linux/i.test(ua)||/linux/i.test(platform))return 'Appareil Linux'
  return platform||'Appareil'
}
function devicePayload(userId:string){
  const ua=navigator.userAgent||''
  const platform=(navigator as Navigator&{userAgentData?:{platform?:string}}).userAgentData?.platform||navigator.platform||''
  return {
    user_id:userId,
    device_key:deviceKey(),
    device_name:deviceName(ua,platform),
    platform,
    browser:browserName(ua),
    user_agent:ua.slice(0,1000),
    language:navigator.language||'',
    screen_size:typeof screen==='undefined'?'':screen.width+'×'+screen.height,
    pwa:Boolean(window.matchMedia?.('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone),
    last_seen_at:new Date().toISOString()
  }
}

export async function getOwnProfile():Promise<DiartProfile|null>{
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)return null
  const {data,error}=await supabase.from('diart_profiles').select('*').eq('user_id',user.id).maybeSingle()
  if(error)throw error
  return data as DiartProfile|null
}

export async function registerCurrentDevice():Promise<{profile:DiartProfile|null;device:DiartDevice|null}>{
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)return {profile:null,device:null}
  const payload=devicePayload(user.id)
  const {data:device,error:deviceError}=await supabase.from('diart_devices').upsert(payload,{onConflict:'user_id,device_key'}).select('*').single()
  if(deviceError){
    const profile=await getOwnProfile().catch(()=>null)
    return {profile,device:null}
  }
  const profile=await getOwnProfile()
  return {profile,device:device as DiartDevice}
}

export async function heartbeatCurrentDevice():Promise<{allowed:boolean;reason?:'banned'|'revoked';profile:DiartProfile|null;device:DiartDevice|null}>{
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)return {allowed:false,profile:null,device:null}
  const profile=await getOwnProfile()
  const key=deviceKey()
  const {data:device}=await supabase.from('diart_devices').select('*').eq('user_id',user.id).eq('device_key',key).maybeSingle()
  if(profile?.status==='banned')return {allowed:false,reason:'banned',profile,device:device as DiartDevice|null}
  if(device?.revoked_at)return {allowed:false,reason:'revoked',profile,device:device as DiartDevice}
  if(device){
    await supabase.from('diart_devices').update({last_seen_at:new Date().toISOString()}).eq('id',device.id)
  }else{
    const registered=await registerCurrentDevice()
    if(registered.device?.revoked_at)return {allowed:false,reason:'revoked',profile:registered.profile,device:registered.device}
    return {allowed:true,profile:registered.profile,device:registered.device}
  }
  return {allowed:true,profile,device:device as DiartDevice}
}

export async function fetchPublicSongs():Promise<PublicSongRecord[]>{
  const {data,error}=await supabase.from('diart_public_songs').select('id,payload,source_label,created_by,updated_by,created_at,updated_at').order('updated_at',{ascending:false})
  if(error)throw error
  return (data??[]) as PublicSongRecord[]
}
export async function fetchPublicSetlists():Promise<PublicSetlistRecord[]>{
  const {data,error}=await supabase.from('diart_public_setlists').select('*').order('updated_at',{ascending:false})
  if(error)throw error
  return (data??[]) as PublicSetlistRecord[]
}
export async function fetchPublicInventory():Promise<PublicInventoryRecord[]>{
  const {data,error}=await supabase.from('diart_public_inventory').select('*').order('updated_at',{ascending:false})
  if(error)throw error
  return (data??[]) as PublicInventoryRecord[]
}

export async function importPublicSongToPersonal(record:PublicSongRecord){
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)throw new Error('Connexion requise.')
  const now=new Date().toISOString()
  const song:Song={
    ...record.payload,
    id:record.id,
    personalKey:'',
    favorite:false,
    favoriteStatus:'',
    lastViewedAt:null,
    notes:'',
    musicianNotes:{},
    source:'import',
    deletedAt:null,
    updatedAt:record.updated_at||now
  }
  const {error}=await supabase.from('diart_songs').upsert({user_id:user.id,id:record.id,payload:song,updated_at:song.updatedAt},{onConflict:'user_id,id'})
  if(error)throw error
  return song
}

export async function communityAdminAction<T=Record<string,unknown>>(action:string,payload:Record<string,unknown>={}):Promise<T>{
  const {data,error}=await supabase.functions.invoke('diart-community-admin',{body:{action,...payload}})
  if(error)throw error
  if(data?.error)throw new Error(String(data.error))
  return data as T
}
export async function redeemPublicImportCode(code:string){return communityAdminAction<{ok:boolean;imported:number}>('redeem_import',{code})}
export async function fetchAdminOverview(){return communityAdminAction<AdminOverview>('overview')}
export type ImportCodeDurationUnit='day'|'month'|'year'
export async function generateImportCode(email:string,duration_value:number,duration_unit:ImportCodeDurationUnit){return communityAdminAction<{ok:boolean;code:string;expires_at:string;email:string}>('generate_code',{email,duration_value,duration_unit})}
export async function banUser(user_id:string){return communityAdminAction('ban_user',{user_id})}
export async function unbanUser(user_id:string){return communityAdminAction('unban_user',{user_id})}
export async function revokeUserDevices(user_id:string){return communityAdminAction('revoke_user_devices',{user_id})}
export async function revokeDevice(device_id:string){return communityAdminAction('revoke_device',{device_id})}
export async function restoreDevice(device_id:string){return communityAdminAction('restore_device',{device_id})}
export async function trustDevice(device_id:string){return communityAdminAction('trust_device',{device_id})}

export type DirectShareEntityType='song'|'artist'|'setlist'|'inventory'
export interface DirectShareCreated {ok:boolean;code:string;entity_type:DirectShareEntityType;label:string;created_at:string}
export interface DirectShareRedeemed {ok:boolean;entity_type:DirectShareEntityType;label:string;target_id:string;artist_name:string;imported_songs:number}
async function directShareAction<T>(action:string,payload:Record<string,unknown>={}):Promise<T>{
  const {data,error}=await supabase.functions.invoke('diart-direct-share',{body:{action,...payload}})
  if(error)throw error
  if(data?.error)throw new Error(String(data.error))
  return data as T
}
export async function createDirectShare(entity_type:DirectShareEntityType,options:{entity_id?:string;artist_name?:string}={}){
  return directShareAction<DirectShareCreated>('create_share',{entity_type,...options})
}
export async function redeemDirectShare(code:string){
  return directShareAction<DirectShareRedeemed>('redeem_share',{code})
}

import { createClient, type User } from '@supabase/supabase-js'
import { db } from './db'
import type { ActivityEntry, Song, Setlist } from './types'

export type SyncConflict={kind:'song'|'setlist';id:string;local:Song|Setlist;remote:Song|Setlist;localUpdatedAt:string;remoteUpdatedAt:string}

const SUPABASE_URL='https://uhuxkkiqpzcfefjkjwqn.supabase.co'
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_9wLkGFEfY7zoAOHkr8h79A_VYawz6ej'

export const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
})

export async function currentUser():Promise<User|null>{
  const {data}=await supabase.auth.getUser()
  return data.user
}

export async function signIn(email:string,password:string){
  return supabase.auth.signInWithPassword({email,password})
}

export async function signUp(email:string,password:string){
  return supabase.auth.signUp({email,password})
}

export async function signOut(){ return supabase.auth.signOut() }

function newer(a:string|undefined|null,b:string|undefined|null){
  return (a??'')>(b??'')
}

function sameSyncContent(a:Song|Setlist|undefined,b:Song|Setlist|undefined){
  if(!a||!b)return false
  const clean=(value:Song|Setlist)=>{
    const copy={...value} as Record<string,unknown>
    delete copy.updatedAt
    return copy
  }
  return JSON.stringify(clean(a))===JSON.stringify(clean(b))
}

export async function syncSongs(userId:string,since=''){
  const local=await db.songs.toArray()
  const {data,error}=await supabase.from('diart_songs').select('id,payload,updated_at').eq('user_id',userId)
  if(error) throw error
  const remote=new Map((data??[]).map(r=>[r.id,r]))
  const pushes:{user_id:string;id:string;payload:Song;updated_at:string}[]=[]
  let pulled=0
  const conflicts:SyncConflict[]=[]
  for(const song of local){
    if(song.source==='demo') continue
    const r=remote.get(song.id)
    const remoteSong=r?.payload as Song|undefined
    const sameContent=Boolean(r&&remoteSong&&sameSyncContent(song,remoteSong))
    const bothChanged=Boolean(r&&since&&song.updatedAt>since&&r.updated_at>since&&!sameContent)
    if(bothChanged&&r&&remoteSong){conflicts.push({kind:'song',id:song.id,local:song,remote:remoteSong,localUpdatedAt:song.updatedAt,remoteUpdatedAt:r.updated_at});remote.delete(song.id);continue}
    if(!r || sameContent || newer(song.updatedAt,r.updated_at)) pushes.push({user_id:userId,id:song.id,payload:song,updated_at:song.updatedAt})
    else if(newer(r.updated_at,song.updatedAt)){await db.songs.put(r.payload as Song);pulled++}
    remote.delete(song.id)
  }
  for(const r of remote.values()){await db.songs.put(r.payload as Song);pulled++}
  if(pushes.length){
    const {error:e}=await supabase.from('diart_songs').upsert(pushes,{onConflict:'user_id,id'})
    if(e) throw e
  }
  return {pushed:pushes.length,pulled,conflicts}
}

export async function syncSetlists(userId:string,since=''){
  const local=await db.setlists.toArray()
  const {data,error}=await supabase.from('diart_setlists').select('id,payload,updated_at').eq('user_id',userId)
  if(error) throw error
  const remote=new Map((data??[]).map(r=>[r.id,r]))
  const pushes:{user_id:string;id:string;payload:Setlist;updated_at:string}[]=[]
  let pulled=0
  const conflicts:SyncConflict[]=[]
  for(const item of local){
    const r=remote.get(item.id)
    const remoteItem=r?.payload as Setlist|undefined
    const sameContent=Boolean(r&&remoteItem&&sameSyncContent(item,remoteItem))
    const bothChanged=Boolean(r&&since&&item.updatedAt>since&&r.updated_at>since&&!sameContent)
    if(bothChanged&&r&&remoteItem){conflicts.push({kind:'setlist',id:item.id,local:item,remote:remoteItem,localUpdatedAt:item.updatedAt,remoteUpdatedAt:r.updated_at});remote.delete(item.id);continue}
    if(!r || sameContent || newer(item.updatedAt,r.updated_at)) pushes.push({user_id:userId,id:item.id,payload:item,updated_at:item.updatedAt})
    else if(newer(r.updated_at,item.updatedAt)){await db.setlists.put(r.payload as Setlist);pulled++}
    remote.delete(item.id)
  }
  for(const r of remote.values()){await db.setlists.put(r.payload as Setlist);pulled++}
  if(pushes.length){
    const {error:e}=await supabase.from('diart_setlists').upsert(pushes,{onConflict:'user_id,id'})
    if(e) throw e
  }
  return {pushed:pushes.length,pulled,conflicts}
}


export async function syncActivity(userId:string){
  const local=await db.activity.toArray()
  const {data,error}=await supabase.from('diart_activity').select('id,payload,created_at').eq('user_id',userId)
  if(error) throw error
  const remote=new Map((data??[]).map(r=>[r.id,r]))
  const pushes:{user_id:string;id:string;payload:ActivityEntry;created_at:string}[]=[]
  let pulled=0
  for(const item of local){
    const r=remote.get(item.id)
    if(!r) pushes.push({user_id:userId,id:item.id,payload:item,created_at:item.createdAt})
    remote.delete(item.id)
  }
  for(const r of remote.values()){await db.activity.put(r.payload as ActivityEntry);pulled++}
  if(pushes.length){
    const {error:e}=await supabase.from('diart_activity').upsert(pushes,{onConflict:'user_id,id'})
    if(e) throw e
  }
  return {pushed:pushes.length,pulled}
}

export async function syncAll(userId:string,since=''){
  const [songs,setlists,activity]=await Promise.all([syncSongs(userId,since),syncSetlists(userId,since),syncActivity(userId)])
  return {songs,setlists,activity,conflicts:[...songs.conflicts,...setlists.conflicts],pulled:songs.pulled+setlists.pulled+activity.pulled,pushed:songs.pushed+setlists.pushed+activity.pushed}
}

export async function resolveSyncConflict(userId:string,conflict:SyncConflict,choice:'local'|'remote'){
  if(choice==='remote'){
    if(conflict.kind==='song')await db.songs.put(conflict.remote as Song)
    else await db.setlists.put(conflict.remote as Setlist)
    return
  }
  if(conflict.kind==='song'){
    const item=conflict.local as Song
    const {error}=await supabase.from('diart_songs').upsert({user_id:userId,id:item.id,payload:item,updated_at:item.updatedAt},{onConflict:'user_id,id'});if(error)throw error
  }else{
    const item=conflict.local as Setlist
    const {error}=await supabase.from('diart_setlists').upsert({user_id:userId,id:item.id,payload:item,updated_at:item.updatedAt},{onConflict:'user_id,id'});if(error)throw error
  }
}

export async function getCloudStats(userId:string){
  const [{count:songs,error:songsError},{count:setlists,error:setlistsError}] = await Promise.all([
    supabase.from('diart_songs').select('id',{count:'exact',head:true}).eq('user_id',userId),
    supabase.from('diart_setlists').select('id',{count:'exact',head:true}).eq('user_id',userId)
  ])
  if(songsError) throw songsError
  if(setlistsError) throw setlistsError
  return {songs:songs??0,setlists:setlists??0}
}

export async function pullCloudToLocal(userId:string){
  const [{data:songs,error:songsError},{data:setlists,error:setlistsError},{data:activity,error:activityError}] = await Promise.all([
    supabase.from('diart_songs').select('payload').eq('user_id',userId),
    supabase.from('diart_setlists').select('payload').eq('user_id',userId),
    supabase.from('diart_activity').select('payload').eq('user_id',userId)
  ])
  if(songsError) throw songsError
  if(setlistsError) throw setlistsError
  if(activityError) throw activityError
  await db.transaction('rw',db.songs,db.setlists,db.activity,async()=>{
    const demoSongs=(await db.songs.toArray()).filter(s=>s.source==='demo')
    await db.songs.clear()
    await db.setlists.clear()
    await db.activity.clear()
    if(demoSongs.length) await db.songs.bulkPut(demoSongs)
    if(songs?.length) await db.songs.bulkPut(songs.map(r=>r.payload as Song))
    if(setlists?.length) await db.setlists.bulkPut(setlists.map(r=>r.payload as Setlist))
    if(activity?.length) await db.activity.bulkPut(activity.map(r=>r.payload as ActivityEntry))
  })
  return {songs:songs?.length??0,setlists:setlists?.length??0,activity:activity?.length??0}
}

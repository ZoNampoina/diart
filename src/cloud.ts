import { createClient, type User } from '@supabase/supabase-js'
import { db } from './db'
import type { Song, Setlist } from './types'

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

export async function syncSongs(userId:string){
  const local=await db.songs.toArray()
  const {data,error}=await supabase.from('diart_songs').select('id,payload,updated_at').eq('user_id',userId)
  if(error) throw error
  const remote=new Map((data??[]).map(r=>[r.id,r]))
  const pushes:{user_id:string;id:string;payload:Song;updated_at:string}[]=[]
  for(const song of local){
    if(song.source==='demo') continue
    const r=remote.get(song.id)
    if(!r || newer(song.updatedAt,r.updated_at)) pushes.push({user_id:userId,id:song.id,payload:song,updated_at:song.updatedAt})
    else if(newer(r.updated_at,song.updatedAt)) await db.songs.put(r.payload as Song)
    remote.delete(song.id)
  }
  for(const r of remote.values()) await db.songs.put(r.payload as Song)
  if(pushes.length){
    const {error:e}=await supabase.from('diart_songs').upsert(pushes,{onConflict:'user_id,id'})
    if(e) throw e
  }
}

export async function syncSetlists(userId:string){
  const local=await db.setlists.toArray()
  const {data,error}=await supabase.from('diart_setlists').select('id,payload,updated_at').eq('user_id',userId)
  if(error) throw error
  const remote=new Map((data??[]).map(r=>[r.id,r]))
  const pushes:{user_id:string;id:string;payload:Setlist;updated_at:string}[]=[]
  for(const item of local){
    const r=remote.get(item.id)
    if(!r || newer(item.updatedAt,r.updated_at)) pushes.push({user_id:userId,id:item.id,payload:item,updated_at:item.updatedAt})
    else if(newer(r.updated_at,item.updatedAt)) await db.setlists.put(r.payload as Setlist)
    remote.delete(item.id)
  }
  for(const r of remote.values()) await db.setlists.put(r.payload as Setlist)
  if(pushes.length){
    const {error:e}=await supabase.from('diart_setlists').upsert(pushes,{onConflict:'user_id,id'})
    if(e) throw e
  }
}

export async function syncAll(userId:string){
  await Promise.all([syncSongs(userId),syncSetlists(userId)])
}

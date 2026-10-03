import { useEffect, useRef, useState } from 'react'
import { clone, HistoryManager, type Plan } from './model'

/** Gestures preview locally; only a finished transaction enters history and storage. */
export function useStageDocument(initial:Plan,onSave:(plan:Plan)=>Promise<void>,onChange?:(plan:Plan)=>void){
  const [plan,setPlan]=useState(()=>clone(initial))
  const current=useRef(plan),history=useRef(new HistoryManager()),before=useRef<Plan|null>(null)
  const [status,setStatus]=useState('Enregistré sur cet appareil')
  const pending=useRef<Plan|null>(null),timer=useRef<ReturnType<typeof setTimeout>>(),chain=useRef(Promise.resolve())
  const save=useRef(onSave),changed=useRef(onChange),inFlight=useRef(0),submitted=useRef(JSON.stringify(initial)),mounted=useRef(true)
  save.current=onSave;changed.current=onChange
  const show=(value:Plan)=>{current.current=value;setPlan(value)}
  const flush=()=>{
    clearTimeout(timer.current)
    const value=pending.current
    if(!value)return chain.current
    pending.current=null
    submitted.current=JSON.stringify(value)
    inFlight.current++
    chain.current=chain.current.then(async()=>{
      try{await save.current(clone(value));if(mounted.current&&!pending.current&&current.current===value)setStatus('Enregistré sur cet appareil')}
      catch{if(!pending.current)pending.current=current.current;if(mounted.current)setStatus('Échec de sauvegarde · réessayer')}
      finally{inFlight.current--}
    })
    return chain.current
  }
  const schedule=(value:Plan)=>{
    pending.current=value;setStatus('Enregistrement…');clearTimeout(timer.current)
    timer.current=setTimeout(()=>void flush(),450)
    changed.current?.(value)
  }
  const commit=(value:Plan)=>{
    const original=before.current??current.current;before.current=null
    if(history.current.record(original,value)){show(value);schedule(value)}else show(value)
  }
  const begin=()=>{before.current=clone(current.current)}
  const preview=(value:Plan)=>show(value)
  const finish=()=>commit(current.current)
  const cancel=()=>{if(before.current)show(before.current);before.current=null}
  const undo=()=>{if(before.current)cancel();const value=history.current.undo(current.current);show(value);schedule(value)}
  const redo=()=>{const value=history.current.redo(current.current);show(value);schedule(value)}
  useEffect(()=>{
    const serialized=JSON.stringify(initial)
    if(serialized!==submitted.current&&serialized!==JSON.stringify(current.current)&&!inFlight.current&&!pending.current&&!before.current){submitted.current=serialized;history.current=new HistoryManager();show(clone(initial))}
  },[initial])
  useEffect(()=>{
    mounted.current=true
    const leave=()=>{void flush()}
    window.addEventListener('pagehide',leave)
    const visibility=()=>{if(document.visibilityState==='hidden')void flush()}
    document.addEventListener('visibilitychange',visibility)
    return()=>{mounted.current=false;clearTimeout(timer.current);void flush();window.removeEventListener('pagehide',leave);document.removeEventListener('visibilitychange',visibility)}
  },[])
  return {plan,current,commit,begin,preview,finish,cancel,undo,redo,flush,status,canUndo:history.current.past.length>0,canRedo:history.current.future.length>0}
}

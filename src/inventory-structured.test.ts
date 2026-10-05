import { describe,expect,it } from 'vitest'
import type { InventoryStockItem } from './types'
import { characteristicValue,setInventoryCharacteristic,setPrimaryPort,swapCableEnds } from './inventory-structured'

const base=():InventoryStockItem=>({id:'x',name:'XLR',category:'cable',quantity:1,provider:'Mon stock',status:'available',characteristics:[],ports:[],createdAt:'2026-10-05',updatedAt:'2026-10-05',deletedAt:null})

describe('inventory structured fields',()=>{
  it('stores characteristic values without duplicates',()=>{
    let item=setInventoryCharacteristic(base(),'Longueur','10 m')
    item=setInventoryCharacteristic(item,'Longueur','15 m')
    expect(characteristicValue(item,'Longueur')).toBe('15 m')
    expect(item.characteristics).toHaveLength(1)
  })
  it('keeps primary in/out ports structured',()=>{
    let item=setPrimaryPort(base(),'input','XLR(F)','IN')
    item=setPrimaryPort(item,'output','JACK','OUT')
    expect(item.ports?.find(p=>p.direction==='input')?.connector).toBe('XLR(F)')
    expect(item.ports?.find(p=>p.direction==='output')?.connector).toBe('JACK')
  })
  it('reverses cable in/out connectors',()=>{
    let item=setPrimaryPort(base(),'input','XLR(F)','IN')
    item=setPrimaryPort(item,'output','JACK','OUT')
    item=swapCableEnds(item)
    expect(item.ports?.find(p=>p.direction==='input')?.connector).toBe('JACK')
    expect(item.ports?.find(p=>p.direction==='output')?.connector).toBe('XLR(F)')
  })
})

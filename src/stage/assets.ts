import type { StageImage } from '../types'
import { uid } from './model'

export const loadImage=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{
  const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Illustration illisible.'));img.src=src
})
/** Imports are decoded locally and stored as self-contained pixels, never executable SVG. */
export async function importIllustration(file:File):Promise<StageImage>{
  if(file.size>8*1024*1024)throw new Error('Choisissez une image de moins de 8 Mo.')
  if(!/\.(svg|png|webp|jpe?g)$/i.test(file.name))throw new Error('Formats acceptés : SVG, PNG, WebP et JPEG.')
  let blob:Blob=file
  if(/\.svg$/i.test(file.name)){
    const xml=new DOMParser().parseFromString(await file.text(),'image/svg+xml')
    if(xml.querySelector('parsererror')||xml.documentElement.localName!=='svg')throw new Error('Le fichier SVG est invalide.')
    const allowed=new Set('svg g path rect circle ellipse line polyline polygon defs linearGradient radialGradient stop clipPath mask pattern title desc text tspan use symbol style'.split(' '))
    for(const el of Array.from(xml.querySelectorAll('*'))){
      if(!allowed.has(el.localName)){el.remove();continue}
      for(const attribute of Array.from(el.attributes)){
        const name=attribute.name.toLowerCase(),value=attribute.value
        if(name.startsWith('on')||((name==='href'||name.endsWith(':href'))&&!value.startsWith('#'))||/javascript:|data:|https?:|@import|expression\s*\(/i.test(value)||/url\(\s*['"]?(?!#)/i.test(value))el.removeAttribute(attribute.name)
      }
      if(el.localName==='style'&&/@import|https?:|data:|javascript:|url\(\s*['"]?(?!#)/i.test(el.textContent??''))el.remove()
    }
    blob=new Blob([new XMLSerializer().serializeToString(xml)],{type:'image/svg+xml'})
  }
  const url=URL.createObjectURL(blob)
  try{
    const image=await loadImage(url)
    if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40_000_000)throw new Error('L’image doit avoir des dimensions valides et rester sous 40 mégapixels.')
    const ratio=Math.min(1,2400/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas')
    canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio))
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas indisponible.')
    ctx.drawImage(image,0,0,canvas.width,canvas.height)
    const asset={id:uid(),name:file.name.replace(/\.[^.]+$/,''),dataUrl:canvas.toDataURL('image/png'),width:canvas.width,height:canvas.height}
    canvas.width=1;canvas.height=1;return asset
  }finally{URL.revokeObjectURL(url)}
}

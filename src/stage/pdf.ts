import { loadImage } from './assets'

/** A one-page PDF with lossless RGB pixels from the exact preview, without font dependencies. */
export async function stagePngToPdf(png:string):Promise<Blob>{
  const image=await loadImage(png),canvas=document.createElement('canvas')
  canvas.width=image.naturalWidth;canvas.height=image.naturalHeight
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas indisponible.')
  ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0)
  const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data,rgb=new Uint8Array(canvas.width*canvas.height*3)
  for(let s=0,d=0;s<rgba.length;s+=4){rgb[d++]=rgba[s];rgb[d++]=rgba[s+1];rgb[d++]=rgba[s+2]}
  const bytes=typeof CompressionStream!=='undefined'?new Uint8Array(await new Response(new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()):rgb
  const width=canvas.width,height=canvas.height,pageW=width>=height?841.89:595.28,pageH=pageW*height/width
  canvas.width=1;canvas.height=1
  const encode=(s:string)=>new TextEncoder().encode(s),chunks:Uint8Array[]=[],offsets=[0];let length=0
  const add=(part:string|Uint8Array)=>{const chunk=typeof part==='string'?encode(part):part;chunks.push(chunk);length+=chunk.byteLength}
  const object=(id:number,content:string)=>{offsets[id]=length;add(`${id} 0 obj\n${content}\nendobj\n`)}
  add('%PDF-1.4\n%DIART\n')
  object(1,'<< /Type /Catalog /Pages 2 0 R >>')
  object(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  object(3,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(3)} ${pageH.toFixed(3)}] /Resources << /XObject << /Scene 4 0 R >> >> /Contents 5 0 R >>`)
  offsets[4]=length
  add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 ${bytes===rgb?'':'/Filter /FlateDecode '}/Length ${bytes.byteLength} >>\nstream\n`)
  add(bytes);add('\nendstream\nendobj\n')
  const draw=`q\n${pageW.toFixed(3)} 0 0 ${pageH.toFixed(3)} 0 0 cm\n/Scene Do\nQ\n`
  object(5,`<< /Length ${encode(draw).byteLength} >>\nstream\n${draw}endstream`)
  const xref=length
  add('xref\n0 6\n0000000000 65535 f \n')
  for(let i=1;i<=5;i++)add(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`)
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return new Blob(chunks,{type:'application/pdf'})
}

'use client';
import {useEffect,useRef,useState} from 'react';
import {AUDIO_CHUNK_BYTES,AUDIO_PLAYBACK_MAX_BYTES} from '@/lib/inbox/media-file-rules';

/** Assemble the exact complete audio in browser memory on demand; no extra R2 object. */
export function CompleteAudio({src,onError}:{src:string;onError:()=>void}){
  const [url,setUrl]=useState<string|null>(null);const [busy,setBusy]=useState(false);
  const controller=useRef<AbortController|null>(null);const objectUrl=useRef<string|null>(null);
  useEffect(()=>()=>{controller.current?.abort();if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);},[]);
  async function load(){
    if(controller.current||url)return;
    const ac=new AbortController();controller.current=ac;setBusy(true);
    try{
      let offset=0,total=0,mime='';const parts:ArrayBuffer[]=[];
      do{
        const end=offset+AUDIO_CHUNK_BYTES-1;
        const res=await fetch(src+'?audioChunk=1',{headers:{Range:`bytes=${offset}-${end}`},signal:ac.signal,cache:'no-store',redirect:'error'});
        const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.headers.get('content-range')||'');
        const type=res.headers.get('content-type')||'';
        if(res.status!==206||!match||!type.startsWith('audio/'))throw Error('range');
        const start=Number(match[1]),last=Number(match[2]),size=Number(match[3]);
        if(!Number.isSafeInteger(size)||size<1||size>AUDIO_PLAYBACK_MAX_BYTES||start!==offset||last!==Math.min(end,size-1)||(total!==0&&(total!==size||mime!==type)))throw Error('size');
        total=size;mime=type;const data=await res.arrayBuffer();
        if(data.byteLength!==last-start+1)throw Error('incomplete');
        parts.push(data);offset=last+1;
      }while(offset<total);
      if(ac.signal.aborted)return;
      objectUrl.current=URL.createObjectURL(new Blob(parts,{type:mime}));setUrl(objectUrl.current);
    }catch{if(!ac.signal.aborted)onError();}finally{controller.current=null;if(!ac.signal.aborted)setBusy(false);}
  }
  return url?<audio controls preload="metadata" src={url} onError={onError} className="h-10 w-64 max-w-full"/>:<button type="button" disabled={busy} onClick={()=>void load()} className="rounded border px-3 py-2 text-xs">{busy?'Carregando áudio completo…':'Carregar áudio'}</button>;
}

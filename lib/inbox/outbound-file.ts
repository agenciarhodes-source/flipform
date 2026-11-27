import 'server-only';
import { enqueueAndDispatchWhatsAppFileMessage } from '@/lib/meta/whatsapp-outbound';
import { checkDirectFile, directFileTransportLimit, fileMatchesType, outboundFileLabel } from './outbound-file-rules';
export class OutboundFileError extends Error {
  constructor(readonly status:number,message:string){super(message);this.name='OutboundFileError';}
}
/** Authenticated bounded transfer in memory, without R2, disk or blob storage. */
export async function sendOutboundFile(input:{
  tenantId:string;userId:string;conversationId:string;idempotencyKey:string;
  name:unknown;mimeType:unknown;sizeBytes:unknown;body:ReadableStream<Uint8Array>|null;
}){
  const check=checkDirectFile(input,directFileTransportLimit(process.env));
  if(!check.ok)throw new OutboundFileError(413,check.error);
  if(!input.body)throw new OutboundFileError(400,'Arquivo vazio.');
  const reader=input.body.getReader();
  const parts:Uint8Array[]=[];let size=0;
  try{
    while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;
      if(size>check.sizeBytes)throw new OutboundFileError(413,'Arquivo maior que o tamanho informado.');
      parts.push(next.value);}
  }catch(error){
    if(error instanceof OutboundFileError)throw error;
    throw new OutboundFileError(400,'Arquivo incompleto. Selecione novamente.');
  }finally{await reader.cancel().catch(()=>undefined);}
  const bytes=Buffer.concat(parts,size);
  if(bytes.byteLength!==check.sizeBytes||!fileMatchesType(bytes,check.mimeType))throw new OutboundFileError(400,'Arquivo incompleto ou de tipo inválido.');
  return enqueueAndDispatchWhatsAppFileMessage({
    tenantId:input.tenantId,conversationId:input.conversationId,requestedByUserId:input.userId,
    idempotencyKey:input.idempotencyKey,text:outboundFileLabel(check.kind,check.name),
    file:{bytes,mimeType:check.mimeType,fileName:check.name,kind:check.kind},
  });
}

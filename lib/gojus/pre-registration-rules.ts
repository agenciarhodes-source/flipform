/** Observed labels from the pre-registration UI. Not a verified browser automation map. */
export const GOJUS_PRE_REGISTRATION = {
  verifiedForAutomation: false,
  page: 'Pré-cadastro de Clientes',
  open: 'Pré-cadastrar cliente',
  save: 'Salvar',
  fields: [
    {label:'Nome do cliente',source:'lead.name',requiredOnScreen:true},
    {label:'CPF do cliente',source:'lead.cpf',requiredOnScreen:true},
    {label:'Senha do INSS',source:null,requiredOnScreen:true},
    {label:'Telefone',source:'lead.phone',requiredOnScreen:false},
    {label:'WhatsApp',source:'conversation.phone',requiredOnScreen:false},
    {label:'Relato do caso',source:'case.safeSummary',requiredOnScreen:true},
    {label:'Menor de idade',source:'case.isMinor',requiredOnScreen:false},
    {label:'Benefício',source:'case.benefit',requiredOnScreen:true},
    {label:'Estado',source:'lead.state',requiredOnScreen:true},
    {label:'Cidade',source:'lead.city',requiredOnScreen:true},
  ],
  attachment: {label:'Escolher',format:'application/pdf',count:1},
} as const;

export type BundleFile = {id:string;tenantId:string;leadId:string;conversationId:string;kind:'personal'|'case'|'signed';mime:string;status:string;order:number;sizeBytes:number};
const MIME = new Set(['application/pdf','image/jpeg','image/png']);
const GROUPS = {personal:0,case:1,signed:2};
export function planGoJusBundle(input:{tenantId:string;leadId:string;conversationId:string;expectedIds:readonly string[];files:readonly BundleFile[];maxInputBytes:number}) {
  const errors:string[]=[];
  const expected=new Set(input.expectedIds);
  if(!expected.size||expected.size!==input.expectedIds.length)errors.push('Manifesto de documentos inválido.');
  if(!Number.isSafeInteger(input.maxInputBytes)||input.maxInputBytes<=0)errors.push('Limite de entrada inválido.');
  const found=new Set<string>();
  let total=0;
  for(const file of input.files){
    if(file.tenantId!==input.tenantId||file.leadId!==input.leadId||file.conversationId!==input.conversationId)errors.push('Arquivo fora do caso autorizado.');
    if(!expected.has(file.id)||found.has(file.id))errors.push('Arquivo inesperado ou duplicado.');
    found.add(file.id);
    if(!MIME.has(file.mime)||file.status!=='received'||!Object.prototype.hasOwnProperty.call(GROUPS,file.kind))errors.push('Arquivo precisa de revisão.');
    if(!Number.isSafeInteger(file.order)||file.order<0||!Number.isSafeInteger(file.sizeBytes)||file.sizeBytes<=0)errors.push('Metadados de arquivo inválidos.');
    total+=file.sizeBytes;
  }
  if([...expected].some(id=>!found.has(id)))errors.push('Há documentos faltantes.');
  if(!input.files.some(f=>f.kind==='signed'))errors.push('Contratos assinados ausentes.');
  if(!Number.isSafeInteger(total)||total>input.maxInputBytes)errors.push('Limite de entrada excedido.');
  if(errors.length)return {ready:false,files:[],errors};
  return {ready:true,files:[...input.files].sort((a,b)=>GROUPS[a.kind]-GROUPS[b.kind]||a.order-b.order||a.id.localeCompare(b.id)).map(f=>f.id),errors:[]};
}

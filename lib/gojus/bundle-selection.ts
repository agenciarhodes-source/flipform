/** Pure selection: a newer problematic copy must not be silently replaced by an older good one. */
export type Candidate={messageId:string;itemKey:string|null;status:string;createdAt:Date};
export function selectLatestCaseFiles(keys:readonly string[],documents:readonly Candidate[]){
  if(!keys.length||keys.some(k=>!k.trim())||new Set(keys).size!==keys.length)return null;
  const result:string[]=[];
  for(const key of keys){
    const rows=documents.filter(d=>d.itemKey===key);
    if(rows.some(d=>!Number.isFinite(d.createdAt.getTime())))return null;
    rows.sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
    const latest=rows[0];
    if(!latest||latest.status!=='received'||!latest.messageId||rows.slice(1).some(d=>d.createdAt.getTime()===latest.createdAt.getTime()&&d.messageId!==latest.messageId))return null;
    result.push(latest.messageId);
  }
  return new Set(result).size===result.length?result:null;
}
export const GOJUS_OUTPUT_LIMIT=24*1024*1024;
export const GOJUS_INPUT_LIMIT=20*1024*1024;

import { closingStatus, expectedClosingDocs, type ClosingReturnMode, type SignedDocument, type SentClosingTemplate, type ExpectedClosing } from './signed-rules';
import type { SigningSituation } from './send-rules';

export type ClosingManifest = { templates: SentClosingTemplate[]; situation: SigningSituation; sendComplete: boolean };
export function parseClosingManifest(value: unknown): ClosingManifest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const m = value as Record<string, unknown>;
  if (!Array.isArray(m.confirmedTemplates) || !m.confirmedTemplates.length || !['adult','minor','rogo'].includes(String(m.situation))) return null;
  const templates: SentClosingTemplate[] = [];
  for (const row of m.confirmedTemplates) {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id.trim() || typeof row.name !== 'string' || !row.name.trim()) return null;
    templates.push({id:row.id,name:row.name});
  }
  if(new Set(templates.map(t=>t.id)).size!==templates.length || new Set(templates.map(t=>t.name.trim().toLowerCase())).size!==templates.length) return null;
  return {templates,situation:m.situation as SigningSituation,sendComplete:m.sendComplete===true};
}
export function preliminaryClosingStatus(manifest: ClosingManifest, documents: readonly SignedDocument[]) {
  const expected: ExpectedClosing[] = manifest.templates.map(t=>({...t,situation:manifest.situation}));
  const checked = closingStatus(expected,documents);
  // A visual check is not legal authentication. Return mode must be approved before any automated completion.
  return {...checked,complete:false as const,reviewRequired:true as const,sendComplete:manifest.sendComplete};
}
export function signedReviewInstruction(manifest: ClosingManifest, documents: readonly SignedDocument[]) {
  const view=preliminaryClosingStatus(manifest,documents);
  return [
    'CONFERÊNCIA PRELIMINAR DOS CONTRATOS: a validade e a conclusão dependem de revisão humana. Não declare que todos os contratos estão completos, não prometa prazo e não mova o lead.',
    'Não crie tarefa automática de lançamento no GoJus nem solicite reenvio de um documento marcado recebido. Agradeça o envio e peça somente correções identificadas, sem dados pessoais. A confirmação de documentos faltantes depende do formato de devolução aprovado.',
    ...view.items.map(i=>JSON.stringify({modelo:i.name,estado:i.status,orientacao:i.note})),
  ].join('\n');
}

export const GOJUS_TASK_TITLE = 'Contratos assinados recebidos: baixar, analisar e lançar no GoJus';
export function approvedReturnMode(value: unknown, sentId: string): ClosingReturnMode | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const m = value as Record<string,unknown>;
  return m.sentId===sentId && (m.mode==='separate'||m.mode==='package') ? m.mode : null;
}
export function approvedClosingStatus(manifest: ClosingManifest, documents: readonly SignedDocument[], mode: ClosingReturnMode | null) {
  const expected=expectedClosingDocs(manifest.templates,manifest.situation,mode,manifest.sendComplete);
  const status=closingStatus(expected,documents);
  return {...status,modeApproved:expected.length>0,reviewRequired:true as const,sendComplete:manifest.sendComplete};
}
export function pickClosingAssignee(input:{leadAssignee:string|null;conversationAssignee:string|null;members:ReadonlyArray<{userId:string;role:string;status:string}>}) {
  const active=input.members.filter(m=>m.status==='active' && ['owner','admin','manager','agent'].includes(m.role));
  for(const candidate of [input.leadAssignee,input.conversationAssignee]) {
    if(candidate && active.some(m=>m.userId===candidate))return candidate;
  }
  for(const role of ['manager','owner']) {
    const ids=active.filter(m=>m.role===role).map(m=>m.userId).sort();
    if(ids.length)return ids[0];
  }
  return null;
}
export function approvedSignedInstruction(manifest:ClosingManifest,documents:readonly SignedDocument[],mode:ClosingReturnMode|null) {
  const status=approvedClosingStatus(manifest,documents,mode);
  if(!status.modeApproved)return signedReviewInstruction(manifest,documents);
  return [
    'CONFERÊNCIA VISUAL DOS CONTRATOS: revisão humana obrigatória antes de qualquer lançamento. Não declare validade jurídica, não prometa prazo e não mova o lead. Não crie tarefa por marcador para lançamento no GoJus: o sistema controla a tarefa.',
    status.complete ? 'Recebimento visualmente completo: agradeça em nome do escritório e diga que os documentos serão analisados, sem prometer prazo.' : 'Peça somente documentos faltantes ou correções indicadas abaixo. Não peça novamente os recebidos.',
    ...status.items.map(i=>JSON.stringify({modelo:i.name,estado:i.status,orientacao:i.note})),
  ].join('\n');
}

import { closingStatus, type SignedDocument, type SentClosingTemplate, type ExpectedClosing } from './signed-rules';
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

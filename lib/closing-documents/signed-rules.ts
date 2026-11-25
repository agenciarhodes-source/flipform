import type { SigningSituation } from './send-rules';

export type SentClosingTemplate = { id: string; name: string };
export type ClosingReturnMode = 'separate' | 'package';
export type SignedReaderAnswer = { closingTemplate: string | null; signed: boolean; filled: boolean; pagesNote: string | null; legible: boolean };
export type SignedStatus = 'received' | 'problem' | 'unreadable';
export type SignedDocument = { itemKey: string; messageId: string; status: SignedStatus; note: string | null; createdAt: Date };
export type ExpectedClosing = { id: string; name: string; situation: SigningSituation };

export function closingItemKey(id: string) { return 'closing:' + id; }

// A missing return mode, ambiguous template identity or incomplete send must never count as complete.
export function expectedClosingDocs(sentTemplates: readonly SentClosingTemplate[], situation: SigningSituation, mode: ClosingReturnMode | null, sendComplete: boolean): ExpectedClosing[] {
  if (!sendComplete || !mode || !['adult','minor','rogo'].includes(situation)) return [];
  if ((mode === 'separate' && sentTemplates.length !== 3) || (mode === 'package' && sentTemplates.length !== 1)) return [];
  if (sentTemplates.some(t => !t.id.trim() || !t.name.trim())) return [];
  if (new Set(sentTemplates.map(t => t.id)).size !== sentTemplates.length || new Set(sentTemplates.map(t => t.name.trim().toLowerCase())).size !== sentTemplates.length) return [];
  return sentTemplates.map(t => ({ id:t.id, name:t.name, situation }));
}

// Persist only controlled notes, never free-form model text that could include personal data.
export function signedStatusFromReader(answer: SignedReaderAnswer): { status: SignedStatus; note: string | null } {
  if (answer.legible !== true) return { status:'unreadable', note:'Envie uma foto nítida de todas as páginas ou o PDF completo.' };
  const problems: string[] = [];
  if (answer.signed !== true) problems.push('Falta a assinatura exigida.');
  if (answer.filled !== true) problems.push('Há campos obrigatórios sem preenchimento.');
  if (answer.pagesNote !== null) problems.push('Confira e envie todas as páginas completas e legíveis.');
  return problems.length ? { status:'problem', note:problems.join(' ') } : { status:'received', note:null };
}

export function closingStatus(expected: readonly ExpectedClosing[], received: readonly SignedDocument[]) {
  const items = expected.map(template => {
    const matching = received.filter(row => row.itemKey === closingItemKey(template.id) && Number.isFinite(row.createdAt.getTime()));
    matching.sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime() || a.messageId.localeCompare(b.messageId));
    const latest = matching[0];
    // Equal timestamps are ambiguous; do not pick a positive result over a negative result.
    const ambiguous = latest && matching.some(row=>row.createdAt.getTime()===latest.createdAt.getTime() && row.status!==latest.status);
    return { ...template, status: ambiguous ? 'problem' as const : latest?.status ?? 'missing' as const, note: ambiguous ? 'Conferência manual necessária.' : latest?.note ?? null, messageId: ambiguous ? null : latest?.messageId ?? null };
  });
  const missing = items.filter(item=>item.status==='missing');
  const problems = items.filter(item=>item.status==='problem'||item.status==='unreadable');
  return { complete: items.length>0 && items.every(item=>item.status==='received'), missing, problems, items };
}

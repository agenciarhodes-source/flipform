/**
 * "Resumo do cliente": what happened with this lead, from the facts the system already has
 * (no AI call): who, which case, where it came from, documents received and missing, the main
 * events, the last thing the customer said and the next step. Global for every company.
 * Pure rules, easy to test.
 */

export type StoryEvent = { at: Date; text: string };

export type LeadStoryInput = {
  name: string;
  createdAt: Date;
  source: string | null;
  assignedName: string | null;
  stageName: string | null;
  status: string;
  channels: Array<{ channel: string; provider: string; firstAt: Date }>;
  documents: { caseName: string; received: string[]; missing: string[]; problems: string[] } | null;
  documentArrivals: Array<{ at: Date; label: string }>;
  stageMoves: Array<{ at: Date; stage: string; by: string | null }>;
  tasks: Array<{ at: Date; title: string; done: boolean }>;
  events: Array<{ at: Date; action: string }>;
  lastInbound: { at: Date; text: string } | null;
  lastOutboundAt: Date | null;
};

export type LeadStory = {
  headline: string;
  documents: LeadStoryInput['documents'];
  timeline: Array<{ at: string; text: string }>;
  lastCustomerMessage: { at: string; text: string } | null;
  nextStep: string;
};

const EVENT_TEXT: Record<string, string> = {
  'whatsapp_ai.reactivation_sent': 'Retomada enviada pela IA',
  'closing_documents.sent': 'Procuração e contrato enviados para assinar',
  'whatsapp_followup.sent': 'Mensagem da sequência de retomada enviada',
  'contracts.sent': 'Contrato enviado pela ZapSign',
  'contracts.signed': 'Contrato assinado na ZapSign',
};

function day(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(date);
}

function channelName(entry: { channel: string; provider: string }) {
  if (entry.channel === 'whatsapp') return 'WhatsApp';
  if (entry.channel === 'instagram') return 'Instagram';
  if (entry.provider === 'flip_ai') return 'chat do site';
  return entry.channel || 'formulário';
}

/** "DOCUMENTOS – SALÁRIO-MATERNIDADE URBANO" -> "salário-maternidade urbano". */
export function caseLabel(name: string) {
  return name.replace(/^documentos?\s*[–—-]\s*/i, '').trim().toLowerCase();
}

function short(text: string, max: number) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Documents that arrived on the same day become one line. */
function arrivalsByDay(arrivals: LeadStoryInput['documentArrivals']): StoryEvent[] {
  const groups = new Map<string, { at: Date; labels: string[] }>();
  for (const arrival of arrivals) {
    const key = day(arrival.at);
    const group = groups.get(key) || { at: arrival.at, labels: [] };
    if (!group.labels.includes(arrival.label)) group.labels.push(arrival.label);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    at: group.at,
    text: `Mandou ${group.labels.length === 1 ? '1 documento' : `${group.labels.length} documentos`}: ${short(group.labels.join(', '), 140)}`,
  }));
}

export function nextStepOf(input: LeadStoryInput, contractSent: boolean) {
  if (input.status === 'won') return 'Cliente fechado.';
  if (input.status === 'lost') return 'Lead perdido.';
  if (input.lastInbound && (!input.lastOutboundAt || input.lastInbound.at > input.lastOutboundAt)) return 'Responder o cliente: a última mensagem é dele.';
  const openTask = [...input.tasks].reverse().find((task) => !task.done);
  if (openTask) return `Concluir a tarefa: ${short(openTask.title, 120)}.`;
  if (contractSent) return 'Aguardar a procuração e o contrato assinados e conferir.';
  if (input.documents?.problems.length) return `Pedir de novo (com problema): ${short(input.documents.problems.join(', '), 160)}.`;
  if (input.documents?.missing.length) return `Receber os documentos que faltam: ${short(input.documents.missing.slice(0, 4).join(', '), 160)}.`;
  if (input.documents && !input.documents.missing.length) return 'Documentação completa: seguir para a procuração e o contrato.';
  return 'Aguardar a resposta do cliente.';
}

export function buildLeadStory(input: LeadStoryInput): LeadStory {
  const first = [...input.channels].sort((a, b) => a.firstAt.getTime() - b.firstAt.getTime())[0];
  const headline = [
    `${input.name.trim() || 'Cliente'}${input.documents ? `, ${caseLabel(input.documents.caseName)}` : ''}.`,
    `Chegou ${first ? `pelo ${channelName(first)}` : 'pelo formulário'} em ${day(first?.firstAt || input.createdAt)}${input.source ? ` (${short(input.source, 60)})` : ''}.`,
    input.assignedName ? `Responsável: ${input.assignedName}.` : 'Sem responsável.',
    input.stageName ? `Etapa: ${input.stageName}.` : '',
  ].filter(Boolean).join(' ');

  const contractSent = input.events.some((event) => event.action === 'closing_documents.sent' || event.action === 'contracts.sent');
  const events: StoryEvent[] = [
    { at: first?.firstAt || input.createdAt, text: `Primeiro contato${first ? ` pelo ${channelName(first)}` : ''}` },
    ...arrivalsByDay(input.documentArrivals),
    ...input.stageMoves.map((move) => ({ at: move.at, text: `Foi para a etapa "${move.stage}"${move.by ? ` (${move.by})` : ''}` })),
    ...input.tasks.map((task) => ({ at: task.at, text: `Tarefa: ${short(task.title, 110)}${task.done ? ' (concluída)' : ''}` })),
    ...input.events.filter((event) => EVENT_TEXT[event.action]).map((event) => ({ at: event.at, text: EVENT_TEXT[event.action]! })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  // The first contact and the most recent events.
  const timeline = events.length > 12 ? [events[0]!, ...events.slice(-11)] : events;

  return {
    headline,
    documents: input.documents,
    timeline: timeline.map((event) => ({ at: event.at.toISOString(), text: event.text })),
    lastCustomerMessage: input.lastInbound ? { at: input.lastInbound.at.toISOString(), text: short(input.lastInbound.text, 200) } : null,
    nextStep: nextStepOf(input, contractSent),
  };
}

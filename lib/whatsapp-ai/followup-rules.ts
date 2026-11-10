import { z } from 'zod';

/**
 * "Sequência de retomada" on WhatsApp: when the customer stopped answering and the 24-hour window
 * closed, approved templates go out on the days the company chose (for example, 2, 4, 7, 15 and 30
 * days after the customer's last message), one at a time. When the customer answers, the window
 * opens again and the AI continues. After the step the company chose without an answer, the lead's
 * attendant gets a task to call. Pure rules, easy to test.
 */

export const FOLLOWUP_MAX_STEPS = 5;
export const FOLLOWUP_DEFAULT_DAYS = [2, 4, 7, 15, 30];
/** Templates sent per company in one run of the scheduler (every minute), to spread the sending. */
export const FOLLOWUP_MAX_PER_COMPANY_PER_RUN = 10;
/** Someone of the company wrote less than this ago: they are in the conversation, no template. */
export const FOLLOWUP_QUIET_AFTER_COMPANY_MS = 20 * 3_600_000;
/** Two templates are never closer than this, even when the company is catching up on old silences. */
export const FOLLOWUP_MIN_GAP_MS = 22 * 3_600_000;
/** The call task: due within these minutes. */
export const FOLLOWUP_CALL_DUE_MINUTES = 240;

const TEMPLATE_REF = /^[a-z0-9_]+:[a-z]{2,3}(?:_[A-Z]{2})?$/;

export const followupStepSchema = z.object({
  days: z.number().int().min(1).max(90),
  template: z.string().trim().regex(TEMPLATE_REF),
}).strict();

export const followupSettingsSchema = z.object({
  enabled: z.boolean(),
  steps: z.array(followupStepSchema).max(FOLLOWUP_MAX_STEPS),
  callAfterStep: z.number().int().min(0).max(FOLLOWUP_MAX_STEPS),
}).strict().superRefine((value, ctx) => {
  if (value.enabled && !value.steps.length) ctx.addIssue({ code: 'custom', message: 'Escolha ao menos um envio para ligar a retomada.' });
  for (let i = 1; i < value.steps.length; i += 1) {
    if (value.steps[i].days <= value.steps[i - 1].days) {
      ctx.addIssue({ code: 'custom', message: 'Cada envio precisa ser num dia depois do anterior.' });
      break;
    }
  }
  if (value.callAfterStep > value.steps.length) ctx.addIssue({ code: 'custom', message: 'A ligação precisa ser depois de um dos envios.' });
});
export type FollowupSettings = z.infer<typeof followupSettingsSchema>;

/** The steps as stored (anything invalid is dropped, never sent). */
export function parseFollowupSteps(value: unknown) {
  if (!Array.isArray(value)) return [];
  const steps = value.flatMap((item) => {
    const parsed = followupStepSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  }).slice(0, FOLLOWUP_MAX_STEPS);
  return steps.filter((step, index) => index === 0 || step.days > steps[index - 1].days);
}

export type FollowupCandidate = {
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  /** Steps (1-based) already sent in this silence, and when the last one went out. */
  sentSteps: number[];
  lastSentAt: Date | null;
};

/**
 * The step (1-based) due now for one silence, or null. The silence starts at the customer's last
 * message; the company spoke after it and nobody wrote for a while. Late steps are caught up one
 * a day, never all at once.
 */
export function dueFollowupStep(candidate: FollowupCandidate, days: number[], now: Date) {
  if (!candidate.lastInboundAt || !candidate.lastOutboundAt || !days.length) return null;
  // The customer spoke last: the AI answers, there is no silence.
  if (candidate.lastOutboundAt <= candidate.lastInboundAt) return null;
  const sinceCustomer = now.getTime() - candidate.lastInboundAt.getTime();
  // Inside the 24-hour window the free reminder of 23 hours does the job.
  if (sinceCustomer < 24 * 3_600_000) return null;
  if (now.getTime() - candidate.lastOutboundAt.getTime() < FOLLOWUP_QUIET_AFTER_COMPANY_MS && !candidate.sentSteps.length) return null;
  if (candidate.lastSentAt && now.getTime() - candidate.lastSentAt.getTime() < FOLLOWUP_MIN_GAP_MS) return null;
  const next = Math.max(0, ...candidate.sentSteps) + 1;
  if (next > days.length) return null;
  return sinceCustomer >= days[next - 1] * 86_400_000 ? next : null;
}

export type FollowupSkip = 'opted_out' | 'closed_lead' | 'outcome_stage' | 'resolved' | 'team_took_over' | null;

/** Who never gets a template, whatever the step. */
export function followupSkipReason(input: {
  optedOut: boolean;
  leadStatus: string | null;
  outcomeStage: boolean;
  conversationResolved: boolean;
  pauseReason: string | null;
}): FollowupSkip {
  if (input.optedOut) return 'opted_out';
  if (input.conversationResolved || input.pauseReason === 'resolved') return 'resolved';
  if (input.leadStatus && input.leadStatus !== 'open') return 'closed_lead';
  if (input.outcomeStage) return 'outcome_stage';
  // Someone of the team took the conversation by hand ("Assumir"): they decide when to write.
  if (input.pauseReason === 'manual') return 'team_took_over';
  return null;
}

/** The task to call the customer after the chosen step without an answer. */
export function followupCallTask(input: {
  customerName: string; stageName: string | null; daysSilent: number; stepsSent: number; conversationId: string; leadId: string | null; appUrl: string;
}) {
  const base = input.appUrl.replace(/\/$/, '');
  return {
    title: `Ligar para ${input.customerName}: sem resposta há ${input.daysSilent} dias`.slice(0, 190),
    description: [
      `O cliente não respondeu às ${input.stepsSent} mensagens de retomada no WhatsApp${input.stageName ? ` (etapa "${input.stageName}")` : ''}.`,
      'Ligue para entender o que travou (documentos, dúvida, receio, interesse) e tente avançar para o fechamento. Depois, anote o resultado no lead.',
      `Conversa: ${base}/inbox?conversationId=${encodeURIComponent(input.conversationId)}`,
      input.leadId ? `Lead: ${base}/leads?leadId=${encodeURIComponent(input.leadId)}` : '',
    ].filter(Boolean).join('\n\n'),
  };
}

/** Suggested texts for the templates the company creates (variables: {{1}} first name, {{3}} company). */
export const FOLLOWUP_TEMPLATE_SUGGESTIONS = [
  'Oi, {{1}}! Aqui é da {{3}}. Ficamos esperando os seus documentos para o advogado avaliar o seu caso. Quanto antes você mandar, mais rápido damos entrada no seu pedido. Posso te ajudar com algum?',
  '{{1}}, tudo bem? Seu atendimento com a {{3}} está parado. Se tiver dificuldade com algum documento ou com o gov.br, me responda aqui que a gente te ajuda.',
  'Oi, {{1}}. Ainda dá tempo de seguir com o seu pedido. Responda esta mensagem para continuarmos de onde paramos.',
];

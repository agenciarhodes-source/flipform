import { z } from 'zod';

const identifier = z.string().regex(/^[a-z][a-z0-9_]{0,47}$/);
const text = z.string().trim().min(1).max(240).regex(/^[^\u0000-\u001f\u007f]+$/);
const criterionSchema = z.object({
  id: identifier,
  label: text,
  weight: z.number().int().min(1).max(100),
  levels: z.array(text).length(5),
}).strict();
export const brainProfileSchema = z.object({
  id: identifier.refine((id) => id !== 'unknown', 'unknown é reservado.'),
  label: text,
  description: text,
  retrievalTerms: z.array(text).min(1).max(6),
  criteria: z.array(criterionSchema).min(1).max(8),
}).strict().superRefine((profile, ctx) => {
  if (profile.criteria.reduce((sum, item) => sum + item.weight, 0) !== 100) {
    ctx.addIssue({ code: 'custom', message: 'Os pesos do perfil devem somar 100.' });
  }
  if (new Set(profile.criteria.map((item) => item.id)).size !== profile.criteria.length) {
    ctx.addIssue({ code: 'custom', message: 'IDs de critérios repetidos.' });
  }
});
export const brainProfilesSchema = z.object({
  version: z.literal(1),
  profiles: z.array(brainProfileSchema).min(1).max(30),
}).strict().superRefine((brain, ctx) => {
  if (new Set(brain.profiles.map((profile) => profile.id)).size !== brain.profiles.length) {
    ctx.addIssue({ code: 'custom', message: 'IDs de perfis repetidos.' });
  }
});
export type BrainProfile = z.infer<typeof brainProfileSchema>;
export type BrainProfiles = z.infer<typeof brainProfilesSchema>;
export type ParsedBrainProfiles =
  | { status: 'absent'; brain: null }
  | { status: 'invalid'; brain: null }
  | { status: 'valid'; brain: BrainProfiles };

// A dedicated fence avoids interpreting ordinary prose or unrelated JSON as policy.
export function parseBrainProfiles(markdown: string): ParsedBrainProfiles {
  markdown = markdown.replace(/\r\n?/g, '\n');
  const markers = [...markdown.matchAll(/^```flip-ai-profiles\s*$/gm)];
  if (!markers.length) return { status: 'absent', brain: null };
  const matches = [...markdown.matchAll(/^```flip-ai-profiles\s*\n([\s\S]*?)^```\s*$/gm)];
  if (markers.length !== 1 || matches.length !== 1 || matches[0][1].length > 60_000) {
    return { status: 'invalid', brain: null };
  }
  try {
    const parsed = brainProfilesSchema.safeParse(JSON.parse(matches[0][1]));
    return parsed.success ? { status: 'valid', brain: parsed.data } : { status: 'invalid', brain: null };
  } catch { return { status: 'invalid', brain: null }; }
}

export const brainAssessmentSchema = z.object({
  status: z.enum(['complete', 'partial', 'unknown', 'invalid']),
  knowledgeIndexId: z.string().min(1),
  contentHash: z.string().min(1),
  profileId: identifier.nullable(),
  profileLabel: text.nullable(),
  confidence: z.number().min(0).max(1),
  score: z.number().int().min(0).max(100).nullable(),
  retrievalTerms: z.array(text).max(6),
  criteria: z.array(z.object({
    id: identifier,
    label: text,
    weight: z.number().int().min(1).max(100),
    level: z.number().int().min(0).max(4).nullable(),
    interpretation: text.nullable(),
    confidence: z.number().min(0).max(1),
  }).strict()).max(8),
}).strict().superRefine((assessment, ctx) => {
  const complete = assessment.status === 'complete';
  const calculated = Math.round(assessment.criteria.reduce((sum, item) => sum + item.weight * (item.level ?? 0) / 4, 0));
  if (complete && (!assessment.profileId || !assessment.profileLabel || !assessment.criteria.length
    || assessment.confidence < 0.6
    || assessment.criteria.some((item) => item.level === null || !item.interpretation || item.confidence < 0.6)
    || assessment.criteria.reduce((sum, item) => sum + item.weight, 0) !== 100
    || assessment.score !== calculated)) {
    ctx.addIssue({ code: 'custom', message: 'Análise completa inconsistente.' });
  }
  if (!complete && assessment.score !== null) {
    ctx.addIssue({ code: 'custom', message: 'Análise incompleta não possui score fechado.' });
  }
});
export type BrainAssessment = z.infer<typeof brainAssessmentSchema>;

export function buildBrainAssessment(input: {
  knowledgeIndexId: string;
  contentHash: string;
  profile: BrainProfile | null;
  confidence: number;
  answers: Record<string, { choice: string; confidence: number }>;
  invalid?: boolean;
}): BrainAssessment {
  const profile = input.confidence >= 0.6 ? input.profile : null;
  const criteria = profile?.criteria.map((criterion) => {
    const answer = input.answers[`brain_${criterion.id}`];
    const match = answer && /^level_([0-4])$/.exec(answer.choice);
    const level = match && answer.confidence >= 0.6 ? Number(match[1]) : null;
    return {
      id: criterion.id, label: criterion.label, weight: criterion.weight,
      level, interpretation: level === null ? null : criterion.levels[level],
      confidence: answer?.confidence || 0,
    };
  }) || [];
  const complete = Boolean(profile && criteria.every((item) => item.level !== null));
  return {
    status: input.invalid ? 'invalid' : !profile ? 'unknown' : complete ? 'complete' : 'partial',
    knowledgeIndexId: input.knowledgeIndexId,
    contentHash: input.contentHash,
    profileId: profile?.id || null,
    profileLabel: profile?.label || null,
    confidence: input.confidence,
    score: complete ? Math.round(criteria.reduce((sum, item) => sum + item.weight * item.level! / 4, 0)) : null,
    retrievalTerms: profile?.retrievalTerms || [],
    criteria,
  };
}

export function brainAssessmentPrompt(assessment: BrainAssessment | undefined) {
  if (!assessment) return '';
  return [
    `PERFIL DO CÉREBRO PUBLICADO: ${assessment.profileLabel || 'ainda não identificado'}.`,
    `Análise ${assessment.status}; score ${assessment.score === null ? 'ainda indisponível' : `${assessment.score}/100`}.`,
    ...assessment.criteria.map((item) => `${item.label}: ${item.interpretation || 'ainda precisa ser confirmado'}.`),
    'Isto é uma hipótese de triagem, não comprovação de direito, diagnóstico ou chance estatística de fechamento.',
    'Não use UTM, texto da campanha ou afirmações do assistente como comprovação do perfil. Use o relato da pessoa.',
    'Não transforme a rubrica em questionário: responda primeiro e pergunte somente um dado relevante que ainda faltar.',
    'No resumo para o humano, descreva o que a pessoa busca, os fatos informados, documentos mencionados e pendências; não invente.',
  ].join('\n');
}

export function classifyBrainAssessment(assessment: BrainAssessment) {
  if (assessment.status !== 'complete' || assessment.score === null) return 'insufficient' as const;
  if (assessment.score >= 75) return 'qualified' as const;
  if (assessment.score <= 25) return 'disqualified' as const;
  return 'nurture' as const;
}

// Index each profile as its own section, instead of splitting a large JSON fence
// across unrelated topics. The source revision remains the original Markdown.
export function expandBrainProfilesForIndexing(markdown: string) {
  const parsed = parseBrainProfiles(markdown);
  if (parsed.status !== 'valid') return markdown;
  const sections = parsed.brain.profiles.map((profile) => [
    `### Qualificação — ${profile.label}`,
    `${profile.description} Termos de busca: ${profile.retrievalTerms.join('; ')}.`,
    ...profile.criteria.map((criterion) => `${criterion.label} — peso ${criterion.weight}%.\n${criterion.levels.map((level, index) => `${index}: ${level}`).join('\n')}`),
  ].join('\n\n')).join('\n\n');
  return markdown.replace(/^```flip-ai-profiles\s*\n[\s\S]*?^```\s*$/gm, () => sections);
}

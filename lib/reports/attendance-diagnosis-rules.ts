/**
 * "Diagnóstico de atendimento": one written diagnosis of how the team attends people (not a list of
 * points), with the team's numbers next to it. Pure rules, easy to test.
 */

export const DIAGNOSIS_OPERATION = 'attendance_diagnosis';
export const DIAGNOSIS_PERIODS = [7, 30, 90] as const;

export type TeamNumbers = {
  attendants: number;
  conversations: number;
  typicalResponseMs: number | null;
  within15MinPct: number | null;
  waitingNow: number;
  leadsReceived: number;
  sales: number;
};

export type StoredDiagnosis = {
  createdAt: string;
  days: number;
  title: string;
  overall: string;
  text: string;
  team: TeamNumbers;
};

export function diagnosisDays(value: unknown) {
  const days = Number(value);
  return (DIAGNOSIS_PERIODS as readonly number[]).includes(days) ? days : 30;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/** The whole team's numbers from each person's row (response speed weighted by answers given). */
export function teamNumbers(rows: Array<{
  conversations: number;
  responses: number;
  medianResponseMs: number | null;
  within15MinPct: number | null;
  waitingNow: number;
  leadsReceived: number;
  sales: number;
}>): TeamNumbers {
  const answered = rows.filter((row) => row.responses > 0 && row.within15MinPct !== null);
  const weight = answered.reduce((sum, row) => sum + row.responses, 0);
  return {
    attendants: rows.length,
    conversations: rows.reduce((sum, row) => sum + row.conversations, 0),
    typicalResponseMs: median(rows.map((row) => row.medianResponseMs).filter((value): value is number => value !== null)),
    within15MinPct: weight ? Math.round(answered.reduce((sum, row) => sum + (row.within15MinPct as number) * row.responses, 0) / weight) : null,
    waitingNow: rows.reduce((sum, row) => sum + row.waitingNow, 0),
    leadsReceived: rows.reduce((sum, row) => sum + row.leadsReceived, 0),
    sales: rows.reduce((sum, row) => sum + row.sales, 0),
  };
}

/** The diagnosis is prose: list markers and Markdown the model may add are taken out. */
export function cleanDiagnosisText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/^#+\s*/, '').replace(/\*\*(.+?)\*\*/g, '$1').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 6_000);
}

export const DIAGNOSIS_FORMAT = {
  type: 'json_schema' as const,
  name: 'attendance_diagnosis',
  strict: true as const,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'overall', 'text'],
    properties: {
      title: { type: 'string', description: 'Título curto do diagnóstico, até 8 palavras.' },
      overall: { type: 'string', description: 'Uma frase com a conclusão principal.' },
      text: { type: 'string', description: 'O diagnóstico em texto corrido, 4 a 6 parágrafos separados por linha em branco, sem listas.' },
    },
  },
};

/** Reads a stored diagnosis back, or null when it is missing or broken. */
export function parseStoredDiagnosis(createdAt: Date, raw: unknown): StoredDiagnosis | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const text = cleanDiagnosisText(value.text);
  if (!text) return null;
  const team = (value.team && typeof value.team === 'object' ? value.team : {}) as Partial<TeamNumbers>;
  const num = (input: unknown) => (typeof input === 'number' && Number.isFinite(input) ? input : 0);
  const maybe = (input: unknown) => (typeof input === 'number' && Number.isFinite(input) ? input : null);
  return {
    createdAt: createdAt.toISOString(),
    days: diagnosisDays(value.days),
    title: typeof value.title === 'string' && value.title.trim() ? value.title.trim().slice(0, 120) : 'Diagnóstico de atendimento',
    overall: typeof value.overall === 'string' ? value.overall.trim().slice(0, 400) : '',
    text,
    team: {
      attendants: num(team.attendants),
      conversations: num(team.conversations),
      typicalResponseMs: maybe(team.typicalResponseMs),
      within15MinPct: maybe(team.within15MinPct),
      waitingNow: num(team.waitingNow),
      leadsReceived: num(team.leadsReceived),
      sales: num(team.sales),
    },
  };
}

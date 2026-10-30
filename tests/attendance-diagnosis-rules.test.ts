import assert from 'node:assert/strict';
import test from 'node:test';

import { cleanDiagnosisText, diagnosisDays, parseStoredDiagnosis, teamNumbers } from '../lib/reports/attendance-diagnosis-rules';

test('números da equipe somados, com a rapidez pesada pelas respostas', () => {
  const team = teamNumbers([
    { conversations: 10, responses: 30, medianResponseMs: 60_000, within15MinPct: 90, waitingNow: 1, leadsReceived: 8, sales: 2 },
    { conversations: 5, responses: 10, medianResponseMs: 600_000, within15MinPct: 50, waitingNow: 3, leadsReceived: 4, sales: 1 },
    { conversations: 0, responses: 0, medianResponseMs: null, within15MinPct: null, waitingNow: 0, leadsReceived: 2, sales: 0 },
  ]);
  assert.deepEqual(team, { attendants: 3, conversations: 15, typicalResponseMs: 330_000, within15MinPct: 80, waitingNow: 4, leadsReceived: 14, sales: 3 });
});

test('o diagnóstico vira texto corrido, sem listas nem Markdown', () => {
  assert.equal(cleanDiagnosisText('## Visão\n- **Bom** acolhimento\n\n\n\n2. Falta retomar'), 'Visão\nBom acolhimento\n\nFalta retomar');
  assert.equal(cleanDiagnosisText(null), '');
});

test('período só de 7, 30 ou 90 dias', () => {
  assert.equal(diagnosisDays(7), 7);
  assert.equal(diagnosisDays('90'), 90);
  assert.equal(diagnosisDays(15), 30);
});

test('lê o diagnóstico guardado e recusa o vazio', () => {
  const at = new Date('2026-10-30T12:00:00Z');
  assert.equal(parseStoredDiagnosis(at, { text: '' }), null);
  const parsed = parseStoredDiagnosis(at, { days: 7, title: 'Equipe rápida', overall: 'Bom ritmo.', text: 'Parágrafo um.\n\nParágrafo dois.', team: { conversations: 4 } });
  assert.equal(parsed?.days, 7);
  assert.equal(parsed?.team.conversations, 4);
  assert.equal(parsed?.team.typicalResponseMs, null);
});

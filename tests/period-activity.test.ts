import assert from 'node:assert/strict';
import test from 'node:test';

import { countByStage, firstEntries } from '../lib/period-activity';

test('cada lead conta uma vez por etapa, na primeira entrada do período', () => {
  const day = (d: number) => new Date(Date.UTC(2026, 9, d));
  const entries = firstEntries([
    { leadId: 'a', toStageId: 'fechado', createdAt: day(5) },
    { leadId: 'a', toStageId: 'andamento', createdAt: day(6) },
    { leadId: 'a', toStageId: 'fechado', createdAt: day(7) },
    { leadId: 'b', toStageId: 'fechado', createdAt: day(8) },
  ]);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].enteredAt.getTime(), day(5).getTime());
  const counts = countByStage(entries);
  assert.equal(counts.get('fechado'), 2);
  assert.equal(counts.get('andamento'), 1);
});

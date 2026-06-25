import assert from 'node:assert/strict';
import test from 'node:test';

import { formatChartDateBR } from '../lib/dashboard-metrics';

test('formatChartDateBR formata datas ISO de gráficos como DD-MM sem deslocar timezone', () => {
  assert.equal(formatChartDateBR('2026-06-20'), '20-06');
  assert.equal(formatChartDateBR('2026-05-27'), '27-05');
});

test('formatChartDateBR formata instâncias de Date como DD-MM', () => {
  assert.equal(formatChartDateBR(new Date(Date.UTC(2026, 5, 20, 12))), '20-06');
});

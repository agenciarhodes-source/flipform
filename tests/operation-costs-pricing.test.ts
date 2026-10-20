import assert from 'node:assert/strict';
import test from 'node:test';

import { monthRange, parseMetaPricing, usd, whatsappMessageCostUsd } from '../lib/costs/pricing';

test('só mensagem cobrada pela Meta entra no custo, pelo preço da categoria', () => {
  assert.equal(whatsappMessageCostUsd(parseMetaPricing({ billable: true, category: 'marketing', pricing_model: 'PMP' })), 0.0625);
  assert.equal(whatsappMessageCostUsd(parseMetaPricing({ billable: true, category: 'utility' })), 0.0068);
  assert.equal(whatsappMessageCostUsd(parseMetaPricing({ billable: false, category: 'service' })), 0);
  assert.equal(parseMetaPricing(null), null);
});

test('valores em dólar; centavos pequenos com 4 casas', () => {
  assert.match(usd(12.5), /12,50/);
  assert.match(usd(0.0068), /0,0068/);
  assert.match(usd(0), /0,00/);
});

test('o mês vai da meia-noite do dia 1 em Brasília até o dia 1 seguinte', () => {
  const range = monthRange('2026-10');
  assert.equal(range.start.toISOString(), '2026-10-01T03:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-11-01T03:00:00.000Z');
  assert.equal(range.previousStart.toISOString(), '2026-09-01T03:00:00.000Z');
});

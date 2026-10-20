import assert from 'node:assert/strict';
import test from 'node:test';

import { overloadedAttendants, waitingFor } from '../lib/flip/alert-rules';

test('aponta só quem está bem acima da média da equipe', () => {
  const team = [
    { userId: 'a', name: 'Ana', openLeads: 30 },
    { userId: 'b', name: 'Bia', openLeads: 10 },
    { userId: 'c', name: 'Cris', openLeads: 8 },
  ];
  const flagged = overloadedAttendants(team);
  assert.deepEqual(flagged.map((item) => item.userId), ['a']);
  assert.equal(flagged[0].average, 16);
});

test('equipe de uma pessoa ou sem leads não gera alerta de sobrecarga', () => {
  assert.deepEqual(overloadedAttendants([{ userId: 'a', name: 'Ana', openLeads: 40 }]), []);
  assert.deepEqual(overloadedAttendants([{ userId: 'a', name: 'Ana', openLeads: 0 }, { userId: 'b', name: 'Bia', openLeads: 0 }]), []);
});

test('tempo de espera em minutos, horas e dias', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  assert.equal(waitingFor(new Date('2026-10-21T11:20:00Z'), now), 'há 40 min');
  assert.equal(waitingFor(new Date('2026-10-21T07:00:00Z'), now), 'há 5 h');
  assert.equal(waitingFor(new Date('2026-10-17T12:00:00Z'), now), 'há 4 d');
});

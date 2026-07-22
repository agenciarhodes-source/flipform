import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCatalog, EXPECTED_UFS, MINIMUM_MUNICIPALITIES, validateCatalog } from '../scripts/update-brazil-cities.mjs';

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const completeCatalog = Object.fromEntries(UFS.map((uf) => [uf, Array.from({ length: 207 }, (_, index) => `${uf} Município ${String(index).padStart(3, '0')}`)]));

test('accepts a complete, sorted catalog with every UF', () => {
  assert.equal(Object.keys(completeCatalog).length, EXPECTED_UFS);
  assert.ok(validateCatalog(completeCatalog) >= MINIMUM_MUNICIPALITIES);
});

test('rejects a reduced catalog', () => {
  assert.throws(() => validateCatalog({ ...completeCatalog, MA: ['Açailândia'] }), /claramente incompleto/);
});

test('buildCatalog removes duplicates and orders cities in pt-BR', () => {
  const catalog = buildCatalog([
    { nome: 'São Luís', microrregiao: { mesorregiao: { UF: { sigla: 'MA' } } } },
    { nome: 'Açailândia', microrregiao: { mesorregiao: { UF: { sigla: 'MA' } } } },
    { nome: 'São Luís', microrregiao: { mesorregiao: { UF: { sigla: 'MA' } } } },
  ]);
  assert.deepEqual(catalog, { MA: ['Açailândia', 'São Luís'] });
});

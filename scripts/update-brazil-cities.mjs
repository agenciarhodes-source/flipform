import { rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ENDPOINT = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';
const EXPECTED_UFS = 27;
const MINIMUM_MUNICIPALITIES = 5_000;

async function main() {
  const response = await fetch(ENDPOINT);
  if (!response.ok) throw new Error(`IBGE respondeu HTTP ${response.status}.`);
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error('A resposta do IBGE não é uma lista de municípios.');

  const grouped = new Map();
  for (const municipality of payload) {
    const name = typeof municipality?.nome === 'string' ? municipality.nome.trim() : '';
    const uf = typeof municipality?.microrregiao?.mesorregiao?.UF?.sigla === 'string'
      ? municipality.microrregiao.mesorregiao.UF.sigla.trim().toUpperCase()
      : '';
    if (!name || !/^[A-Z]{2}$/.test(uf)) continue;
    if (!grouped.has(uf)) grouped.set(uf, new Set());
    grouped.get(uf).add(name);
  }

  const catalog = Object.fromEntries([...grouped.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((uf) => [
    uf,
    [...grouped.get(uf)].sort((a, b) => a.localeCompare(b, 'pt-BR')),
  ]));
  const municipalityCount = Object.values(catalog).reduce((total, cities) => total + cities.length, 0);
  if (Object.keys(catalog).length !== EXPECTED_UFS || municipalityCount < MINIMUM_MUNICIPALITIES || Object.values(catalog).some((cities) => cities.length === 0)) {
    throw new Error(`Resposta do IBGE claramente incompleta (${Object.keys(catalog).length} UFs, ${municipalityCount} municípios).`);
  }

  const destination = resolve(process.cwd(), 'data/brazil-cities.json');
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  await rename(temporary, destination);
  console.log(`Catálogo atualizado: ${Object.keys(catalog).length} UFs e ${municipalityCount} municípios processados.`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });

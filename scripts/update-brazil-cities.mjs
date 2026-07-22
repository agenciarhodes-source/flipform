import { rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ENDPOINT = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';
const UFS_ENDPOINT = 'https://servicodados.ibge.gov.br/api/v1/localidades/estados';
export const EXPECTED_UFS = 27;
export const MINIMUM_MUNICIPALITIES = 5_569;

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

function getMunicipalityUf(municipality) {
  const uf = municipality?.microrregiao?.mesorregiao?.UF?.sigla;
  return typeof uf === 'string' ? uf.trim().toUpperCase() : '';
}

export function buildCatalog(municipalities, fallbackUf = '') {
  const grouped = new Map();

  for (const municipality of municipalities) {
    const name = typeof municipality?.nome === 'string' ? municipality.nome.trim() : '';
    const uf = getMunicipalityUf(municipality) || fallbackUf;
    if (!name || !/^[A-Z]{2}$/.test(uf)) continue;
    if (!grouped.has(uf)) grouped.set(uf, new Set());
    grouped.get(uf).add(name);
  }

  return Object.fromEntries([...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'pt-BR'))
    .map(([uf, cities]) => [uf, [...cities].sort((left, right) => left.localeCompare(right, 'pt-BR'))]));
}

export function validateCatalog(catalog) {
  const ufs = Object.keys(catalog);
  const municipalityCount = Object.values(catalog).reduce((total, cities) => total + cities.length, 0);

  if (ufs.length !== EXPECTED_UFS || UFS.some((uf) => !ufs.includes(uf))) {
    throw new Error(`Catálogo deve conter exatamente as ${EXPECTED_UFS} UFs.`);
  }
  if (municipalityCount < MINIMUM_MUNICIPALITIES) {
    throw new Error(`Catálogo claramente incompleto (${municipalityCount} municípios; mínimo ${MINIMUM_MUNICIPALITIES}).`);
  }

  for (const [uf, cities] of Object.entries(catalog)) {
    if (!Array.isArray(cities) || cities.length === 0) throw new Error(`A UF ${uf} não possui municípios.`);
    if (cities.some((city) => typeof city !== 'string' || city.trim() === '')) throw new Error(`A UF ${uf} possui município vazio.`);
    if (new Set(cities).size !== cities.length) throw new Error(`A UF ${uf} possui municípios duplicados.`);
    if (cities.some((city, index) => index > 0 && cities[index - 1].localeCompare(city, 'pt-BR') > 0)) {
      throw new Error(`Os municípios da UF ${uf} não estão ordenados em pt-BR.`);
    }
  }

  return municipalityCount;
}

async function fetchMunicipalities(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`IBGE respondeu HTTP ${response.status} para ${url}.`);
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error(`A resposta do IBGE para ${url} não é uma lista de municípios.`);
  return payload;
}

async function fetchCatalog() {
  try {
    return buildCatalog(await fetchMunicipalities(ENDPOINT));
  } catch (error) {
    console.warn(`Consulta consolidada do IBGE falhou; tentando por UF. ${error instanceof Error ? error.message : error}`);
  }

  const entries = await Promise.all(UFS.map(async (uf) => [uf, await fetchMunicipalities(`${UFS_ENDPOINT}/${uf}/municipios`)]));
  return Object.fromEntries(entries.map(([uf, municipalities]) => [uf, buildCatalog(municipalities, uf)[uf] ?? []]));
}

export async function updateBrazilCities() {
  const catalog = await fetchCatalog();
  const municipalityCount = validateCatalog(catalog);
  const destination = resolve(process.cwd(), 'data/brazil-cities.json');
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  await rename(temporary, destination);
  console.log(`Catálogo atualizado: ${Object.keys(catalog).length} UFs e ${municipalityCount} municípios processados.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  updateBrazilCities().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

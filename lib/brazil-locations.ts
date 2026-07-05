import citiesByState from '@/data/brazil-cities.json';

export type BrazilState = { uf: string; name: string };
export type BrazilCity = { state: string; name: string };

export const BRAZIL_STATES: BrazilState[] = [
  { uf: 'AC', name: 'Acre' }, { uf: 'AL', name: 'Alagoas' }, { uf: 'AP', name: 'Amapá' }, { uf: 'AM', name: 'Amazonas' },
  { uf: 'BA', name: 'Bahia' }, { uf: 'CE', name: 'Ceará' }, { uf: 'DF', name: 'Distrito Federal' }, { uf: 'ES', name: 'Espírito Santo' },
  { uf: 'GO', name: 'Goiás' }, { uf: 'MA', name: 'Maranhão' }, { uf: 'MT', name: 'Mato Grosso' }, { uf: 'MS', name: 'Mato Grosso do Sul' },
  { uf: 'MG', name: 'Minas Gerais' }, { uf: 'PA', name: 'Pará' }, { uf: 'PB', name: 'Paraíba' }, { uf: 'PR', name: 'Paraná' },
  { uf: 'PE', name: 'Pernambuco' }, { uf: 'PI', name: 'Piauí' }, { uf: 'RJ', name: 'Rio de Janeiro' }, { uf: 'RN', name: 'Rio Grande do Norte' },
  { uf: 'RS', name: 'Rio Grande do Sul' }, { uf: 'RO', name: 'Rondônia' }, { uf: 'RR', name: 'Roraima' }, { uf: 'SC', name: 'Santa Catarina' },
  { uf: 'SP', name: 'São Paulo' }, { uf: 'SE', name: 'Sergipe' }, { uf: 'TO', name: 'Tocantins' },
].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

export const BRAZIL_CITIES_BY_STATE: Record<string, string[]> = Object.fromEntries(
  Object.entries(citiesByState as Record<string, string[]>).map(([uf, cities]) => [uf.toUpperCase(), [...cities].sort((a, b) => a.localeCompare(b, 'pt-BR'))]),
);

export function normalizeLocationText(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }
export function getBrazilStates(): BrazilState[] { return BRAZIL_STATES; }
export function getCitiesByState(uf: string): string[] { return BRAZIL_CITIES_BY_STATE[normalizeBrazilState(uf) || ''] || []; }
export function isValidBrazilState(uf: string): boolean { return Boolean(normalizeBrazilState(uf)); }
export function isValidBrazilCity(uf: string, city: string): boolean { return Boolean(normalizeBrazilCity(uf, city)); }
export function normalizeBrazilState(value: string): string | null {
  const raw = String(value || '').trim();
  const uf = raw.toUpperCase();
  if (BRAZIL_STATES.some((s) => s.uf === uf)) return uf;
  const byName = BRAZIL_STATES.find((s) => normalizeLocationText(s.name) === normalizeLocationText(raw));
  return byName?.uf || null;
}
export function normalizeBrazilCity(uf: string, city: string): string | null {
  const state = normalizeBrazilState(uf);
  if (!state) return null;
  const wanted = normalizeLocationText(String(city || ''));
  return getCitiesByState(state).find((name) => normalizeLocationText(name) === wanted) || null;
}
export function getBrazilStateName(uf: string): string | null { return BRAZIL_STATES.find((s) => s.uf === normalizeBrazilState(uf))?.name || null; }
export function formatLeadLocation(city?: string | null, state?: string | null) { return city && state ? `${city} - ${state}` : state || '—'; }

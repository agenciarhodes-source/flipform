/**
 * Brazilian public-sector domains: every subdomain belongs to the same public body family, so a
 * source registered on one of them (for example www.gov.br) may use pages on any other
 * (servicos.inss.gov.br, www12.senado.leg.br). Other domains keep exact matching.
 */
export const OFFICIAL_ROOT_DOMAINS = ['gov.br', 'jus.br', 'leg.br', 'mp.br', 'def.br'] as const;

export function officialRoot(domain: string) {
  const value = domain.toLowerCase().replace(/\.$/, '');
  return OFFICIAL_ROOT_DOMAINS.find((root) => value === root || value.endsWith(`.${root}`)) || null;
}

/** Whether a page host may be used, given the registered domains. */
export function isHostAllowed(host: string, domains: string[]) {
  const value = host.toLowerCase().replace(/\.$/, '');
  if (domains.includes(value)) return true;
  return domains.some((domain) => {
    const root = officialRoot(domain);
    return Boolean(root) && (value === root || value.endsWith(`.${root}`));
  });
}

/** The domains handed to the search: official ones widened to their public root. */
export function searchFilterDomains(domains: string[]) {
  return [...new Set(domains.map((domain) => officialRoot(domain) || domain))];
}

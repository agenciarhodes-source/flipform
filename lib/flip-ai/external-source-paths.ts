/**
 * Limits an external source to some pages of its site, e.g. only "/inss/pt-br" on www.gov.br.
 * Stored one per line; empty means the whole site. Pure functions, shared by the server and the form.
 */
export const MAX_EXTERNAL_SOURCE_PATHS = 10;

export class ExternalSourcePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExternalSourcePathError';
  }
}

/** The path of a pasted link ("https://www.gov.br/inss/pt-br" -> "/inss/pt-br"), or "" when there is none. */
export function pathFromPastedLink(raw: string) {
  const value = raw.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const slash = value.indexOf('/');
  if (slash === -1) return '';
  const path = value.slice(slash).replace(/[?#].*$/, '').replace(/\/+$/, '');
  return path === '' ? '' : path;
}

/**
 * Cleans what the owner typed (paths or full links, one per line or separated by commas) into the
 * stored text. Returns null for the whole site. Links must be on the source's own domain.
 */
export function normalizeExternalSourcePaths(raw: string | null | undefined, domain: string): string | null {
  if (!raw || !raw.trim()) return null;
  const paths: string[] = [];
  for (const item of raw.split(/[\n,]+/)) {
    let value = item.trim();
    if (!value) continue;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || !value.startsWith('/')) {
      const host = value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#]/)[0].toLowerCase();
      if (host !== domain.toLowerCase()) {
        throw new ExternalSourcePathError(`O endereço "${value.slice(0, 80)}" não é do domínio ${domain}.`);
      }
      value = pathFromPastedLink(value);
      if (!value) return null;
    }
    value = value.replace(/[?#].*$/, '').replace(/\/+$/, '');
    if (!value) return null;
    if (value.length > 200 || /[*\s\\]|\.\./.test(value)) {
      throw new ExternalSourcePathError(`O caminho "${value.slice(0, 80)}" não é válido.`);
    }
    if (!paths.includes(value)) paths.push(value);
  }
  if (!paths.length) return null;
  if (paths.length > MAX_EXTERNAL_SOURCE_PATHS) {
    throw new ExternalSourcePathError(`Informe no máximo ${MAX_EXTERNAL_SOURCE_PATHS} caminhos por fonte.`);
  }
  return paths.join('\n');
}

export function splitExternalSourcePaths(stored: string | null | undefined) {
  return (stored || '').split('\n').map((path) => path.trim()).filter(Boolean);
}

/** Whether a page is inside the allowed paths (no paths = the whole site). */
export function pathAllowed(pathname: string, prefixes: string[] | null | undefined) {
  if (!prefixes || !prefixes.length) return true;
  const path = pathname.toLowerCase();
  return prefixes.some((prefix) => {
    const base = prefix.toLowerCase().replace(/\/+$/, '');
    return !base || path === base || path.startsWith(`${base}/`);
  });
}

/** Per domain: the allowed paths, or null when at least one active source frees the whole site. */
export function buildExternalPathRules(sources: Array<{ domain: string; pathPrefix: string | null }>) {
  const rules = new Map<string, string[] | null>();
  for (const source of sources) {
    const paths = splitExternalSourcePaths(source.pathPrefix);
    const current = rules.get(source.domain);
    if (current === null) continue;
    if (!paths.length) { rules.set(source.domain, null); continue; }
    rules.set(source.domain, [...new Set([...(current || []), ...paths])]);
  }
  return rules;
}

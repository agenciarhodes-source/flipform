/**
 * Turns a pasted link into the domain the form asks for: "https://www.gov.br/inss/pt-br" becomes
 * "www.gov.br". Only the address prefix and the path are dropped; anything else (a port, a "*",
 * a login) is left as typed, so the server still refuses it.
 */
export function domainFromPastedLink(raw: string) {
  let value = raw.trim();
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  value = value.replace(/[/?#].*$/, '');
  return value.toLowerCase();
}

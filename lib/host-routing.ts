export function normalizeHostname(host: string | null | undefined): string {
  if (!host) return '';
  return host.split(':')[0].trim().toLowerCase();
}

export function isAdminHostname(host: string | null | undefined): boolean {
  const configured = normalizeHostname(process.env.ADMIN_HOSTNAME);
  if (!configured) return false;
  return normalizeHostname(host) === configured;
}


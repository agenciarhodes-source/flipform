import { isIP } from 'node:net';
import { universalConnectAllowed } from './policy';

export function sandboxAvailable(tenantId: string, env: Readonly<Record<string,string|undefined>> = process.env) {
  return env.VERCEL_ENV === 'preview'
    && env.UNIVERSAL_CONNECT_SANDBOX_ENABLED === 'true'
    && env.PR629_BLOCK_EXTERNAL_EGRESS !== 'true'
    && universalConnectAllowed(tenantId, env);
}
export function validCredential(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 16 && value.length <= 2048 && /^[!-~]+$/.test(value);
}
/** IPv4 only, reject special-use, private, loopback, link-local, documentation and multicast. */
export function publicIPv4(value: string): boolean {
  if (isIP(value) !== 4) return false;
  const [a,b,c] = value.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99)))
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113));
}
export function sandboxOriginAllowed(origin: string | null, env: Readonly<Record<string,string|undefined>> = process.env) {
  if (!origin || env.VERCEL_ENV !== 'preview') return false;
  return [env.VERCEL_URL, env.VERCEL_BRANCH_URL].some(host =>
    typeof host === 'string' && /^[a-z0-9-]+\.vercel\.app$/.test(host) && origin === 'https://' + host);
}

import 'server-only';
import { Resolver } from 'node:dns/promises';
import { request } from 'node:https';
import { checkServerIdentity } from 'node:tls';
import { assertPr629NoExternalEgress } from '@/lib/qa/pr629-external-egress';
import { publicIPv4, sandboxAvailable, validCredential } from './sandbox-policy';

const HOST = 'api-sandbox.asaas.com';
export type SandboxProbe = 'accepted' | 'rejected' | 'unavailable';

/** Read only, sandbox only. No redirects or provider response bodies. Pin DNS result to socket
 * while keeping TLS hostname verification and SNI. No generic network capability is exported. */
export async function probeAsaasSandbox(tenantId: string, secret: string): Promise<SandboxProbe> {
  if (!sandboxAvailable(tenantId) || !validCredential(secret)) return 'unavailable';
  try {
    assertPr629NoExternalEgress('universal-connect-asaas-sandbox');
    const resolver = new Resolver({ timeout: 2000, tries: 1 });
    const ips = await resolver.resolve4(HOST);
    if (!ips.length || ips.length > 16 || !ips.every(publicIPv4)) return 'unavailable';
    return await new Promise<SandboxProbe>(resolve => {
      const req = request({
        hostname: ips[0], port: 443, servername: HOST, method: 'GET',
        path: '/v3/myAccount/status/', agent: false, rejectUnauthorized: true,
        checkServerIdentity: (_hostname, cert) => checkServerIdentity(HOST, cert),
        headers: { Host: HOST, 'User-Agent': 'FlipForm-Sandbox/1.0', Accept: 'application/json', access_token: secret },
      }, res => {
        clearTimeout(timer);
        const status = res.statusCode;
        res.destroy();
        resolve(status === 200 ? 'accepted' : status === 401 || status === 403 ? 'rejected' : 'unavailable');
      });
      const timer = setTimeout(() => { req.destroy(); resolve('unavailable'); }, 5000);
      req.once('error', () => { clearTimeout(timer); resolve('unavailable'); });
      req.end();
    });
  } catch {
    return 'unavailable';
  }
}

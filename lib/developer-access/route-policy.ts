/**
 * Classification of technical CONFIGURATION HTTP surfaces.
 * This is an additional backend guard to existing RBAC, not a replacement for
 * per-resource authentication, tenant validation, origin checks or MFA.
 */
const TECHNICAL_API_PREFIXES = [
  '/api/integrations', '/api/domains', '/api/automations',
  '/api/suporte-atendimento/config', '/api/whatsapp-ai/settings',
  '/api/instagram-ai/settings', '/api/whatsapp-ai/stage-rules',
  '/api/whatsapp-ai/voice', '/api/whatsapp-ai/welcome',
  '/api/whatsapp-ai/post-sale', '/api/whatsapp-ai/followups',
  '/api/whatsapp-ai/closing-documents', '/api/whatsapp-ai/document-checklists',
  '/api/flip/learning', '/api/flip-ai/agents',
] as const;

export function requiresDeveloperApiAccess(pathname: string) {
  return TECHNICAL_API_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));
}

export function developerApiAllowed(pathname: string, role: string) {
  return !requiresDeveloperApiAccess(pathname) || role === 'developer';
}

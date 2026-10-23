/**
 * The basic data of a lead the team can edit: name and e-mail. The contact phone is never
 * edited here: it ties the lead to its WhatsApp conversations and to the ad attribution.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type LeadBasicInfoResult =
  | { ok: true; data: { name?: string; email?: string | null } }
  | { ok: false; error: string };

export function parseLeadBasicInfo(body: { name?: unknown; email?: unknown }): LeadBasicInfoResult {
  const data: { name?: string; email?: string | null } = {};
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
    if (name.length < 2) return { ok: false, error: 'Informe o nome do lead (pelo menos 2 letras).' };
    if (name.length > 160) return { ok: false, error: 'O nome pode ter no máximo 160 caracteres.' };
    data.name = name;
  }
  if (body.email !== undefined) {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (email && (!EMAIL.test(email) || email.length > 254)) return { ok: false, error: 'E-mail inválido.' };
    data.email = email || null;
  }
  return { ok: true, data };
}

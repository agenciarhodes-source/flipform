export const OPTION_FIELD_TYPES = ['single_select', 'multi_select', 'dropdown'] as const;

export function onlyDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function normalizeBrazilPhone(value: unknown): string {
  const digits = onlyDigits(value);
  if (digits.startsWith('55')) return digits.slice(0, 13);
  return `55${digits}`.slice(0, 13);
}

export function formatBrazilPhone(value: unknown): string {
  const digits = normalizeBrazilPhone(value).replace(/^55/, '').slice(0, 11);
  const ddd = digits.slice(0, 2);
  const ninth = digits.slice(2, 3);
  const first = digits.slice(3, 7);
  const last = digits.slice(7, 11);
  let out = '+55';
  if (ddd) out += ` (${ddd}${ddd.length === 2 ? ')' : ''}`;
  if (ninth) out += ` ${ninth}`;
  if (first) out += ` ${first}`;
  if (last) out += `-${last}`;
  return out;
}

export function isValidBrazilMobilePhone(value: unknown): boolean {
  const digits = normalizeBrazilPhone(value);
  return /^55\d{2}9\d{8}$/.test(digits);
}

export function normalizeCpf(value: unknown): string { return onlyDigits(value).slice(0, 11); }
export function normalizeCnpj(value: unknown): string { return onlyDigits(value).slice(0, 14); }

export function formatCpf(value: unknown): string {
  const d = normalizeCpf(value);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean).join('.') + (d.length > 9 ? `-${d.slice(9, 11)}` : '');
}

export function formatCnpj(value: unknown): string {
  const d = normalizeCnpj(value);
  let out = d.slice(0, 2);
  if (d.length > 2) out += `.${d.slice(2, 5)}`;
  if (d.length > 5) out += `.${d.slice(5, 8)}`;
  if (d.length > 8) out += `/${d.slice(8, 12)}`;
  if (d.length > 12) out += `-${d.slice(12, 14)}`;
  return out;
}

const allSame = (value: string) => /^(\d)\1+$/.test(value);

export function isValidCpf(value: unknown): boolean {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11 || allSame(cpf)) return false;
  const calc = (factor: number) => {
    let total = 0;
    for (let i = 0; i < factor - 1; i++) total += Number(cpf[i]) * (factor - i);
    const rest = (total * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(10) === Number(cpf[9]) && calc(11) === Number(cpf[10]);
}

export function isValidCnpj(value: unknown): boolean {
  const cnpj = normalizeCnpj(value);
  if (cnpj.length !== 14 || allSame(cnpj)) return false;
  const calc = (weights: number[]) => {
    const total = weights.reduce((sum, weight, index) => sum + Number(cnpj[index]) * weight, 0);
    const rest = total % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc([5,4,3,2,9,8,7,6,5,4,3,2]) === Number(cnpj[12]) && calc([6,5,4,3,2,9,8,7,6,5,4,3,2]) === Number(cnpj[13]);
}

export function normalizeEmail(value: unknown): string { return String(value ?? '').trim().toLowerCase(); }
export function isValidEmail(value: unknown): boolean {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function cleanOptions(options: unknown): string[] {
  const arr = Array.isArray(options) ? options : String(options ?? '').split('\n');
  return Array.from(new Set(arr.map((o) => String(o).trim()).filter(Boolean)));
}

export function requiresOptions(fieldType: string): boolean {
  return OPTION_FIELD_TYPES.includes(fieldType as any);
}

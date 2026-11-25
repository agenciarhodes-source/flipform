export type CpfSource = 'document' | 'chat' | 'team';
export const CPF_SOURCE_LABEL: Record<CpfSource, string> = {
  document: 'lido de um documento enviado pelo cliente',
  chat: 'informado pelo cliente na conversa',
  team: 'preenchido pela equipe',
};
export function normalizeCpf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!/^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(text)) return null;
  return text.replace(/\D/g, '');
}
export function isValidCpf(value: unknown): boolean {
  const cpf = normalizeCpf(value);
  if (!cpf || /^(\d)\1{10}$/.test(cpf)) return false;
  const check = (n: number) => {
    const sum = cpf.slice(0,n).split('').reduce((a,d,i)=>a+Number(d)*(n+1-i),0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11-rest;
  };
  return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10]);
}
export function validCpfOrNull(value: unknown): string | null {
  return isValidCpf(value) ? normalizeCpf(value) : null;
}
export function formatCpf(cpf: string): string {
  return cpf.slice(0,3)+'.'+cpf.slice(3,6)+'.'+cpf.slice(6,9)+'-'+cpf.slice(9);
}
export function maskCpf(cpf: string): string {
  return '***.'+cpf.slice(3,6)+'.'+cpf.slice(6,9)+'-**';
}
export function findCpfInText(text: string | null | undefined): string | null {
  if (!text) return null;
  // Refuse ambiguous messages rather than assigning a third party's identifier.
  const found = new Set<string>();
  for (const match of text.matchAll(/(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/g)) {
    const cpf = validCpfOrNull(match[0]); if (cpf) found.add(cpf);
  }
  for (const match of text.matchAll(/\bcpf\b\s*(?:(?:é|e|número|numero)\s*)?[:=]?\s*(\d{11})(?!\d)/gi)) {
    const cpf = validCpfOrNull(match[1]); if (cpf) found.add(cpf);
  }
  return found.size === 1 ? [...found][0] : null;
}
export function redactCpfText(text: string): string {
  return text.replace(/(?<!\d)(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})(?!\d)/g, value => isValidCpf(value) ? '[CPF ocultado]' : value);
}

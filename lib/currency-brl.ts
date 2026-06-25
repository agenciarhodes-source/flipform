export function formatBRLFromCents(cents: number | null | undefined): string {
  const safeCents = typeof cents === 'number' && Number.isFinite(cents) ? Math.max(0, Math.trunc(cents)) : 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(safeCents / 100);
}

export function formatCurrencyBRLFromCents(valueCents: number | null): string {
  return formatBRLFromCents(valueCents);
}

export function parseBRLToCents(value: string): number {
  const raw = value.trim();
  if (!raw) return 0;
  if (raw.includes('-')) throw new Error('Valor vendido não pode ser negativo.');
  const normalized = raw.replace(/R\$|\s/g, '');
  if (!normalized) return 0;
  if (!/^[0-9.,]+$/.test(normalized)) throw new Error('Valor vendido inválido.');

  const hasComma = normalized.includes(',');
  const decimalValue = hasComma
    ? Number(normalized.replace(/\./g, '').replace(',', '.'))
    : Number(normalized.replace(/\./g, ''));
  if (!Number.isFinite(decimalValue) || decimalValue < 0) throw new Error('Valor vendido inválido.');
  return Math.round(decimalValue * 100);
}

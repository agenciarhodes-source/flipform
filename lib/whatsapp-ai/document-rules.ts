/**
 * The documents each type of case needs, as each company works. Pure rules, easy to test.
 * A checklist item is written one per line: "Comprovante de residência | dos últimos 3 meses".
 */
export type ChecklistItem = { key: string; label: string; rule: string };
export type DocumentStatus = 'received' | 'unreadable' | 'problem' | 'unrecognized';

export const DOCUMENT_CHECKLIST_EXAMPLES: Array<{ name: string; items: string }> = [
  {
    name: 'BPC/LOAS',
    items: ['RG ou CNH', 'CPF', 'Comprovante de residência | dos últimos 3 meses', 'Laudo médico | com CID e assinatura do médico', 'Cadastro no CadÚnico'].join('\n'),
  },
  {
    name: 'Aposentadoria',
    items: ['RG ou CNH', 'CPF', 'Extrato do CNIS', 'Carteira de trabalho | todas as páginas com registros'].join('\n'),
  },
  {
    name: 'Cadastro de cliente',
    items: ['Cartão CNPJ', 'Alvará de funcionamento', 'Comprovante de endereço do estabelecimento | dos últimos 3 meses'].join('\n'),
  },
];

export function itemKey(label: string) {
  return label
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'documento';
}

export function parseChecklistItems(text: string): ChecklistItem[] {
  const seen = new Set<string>();
  const items: ChecklistItem[] = [];
  for (const line of text.split('\n')) {
    const [rawLabel, ...rest] = line.split('|');
    const label = rawLabel.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!label) continue;
    let key = itemKey(label);
    while (seen.has(key)) key = `${key}_2`;
    seen.add(key);
    items.push({ key, label, rule: rest.join('|').replace(/\s+/g, ' ').trim().slice(0, 200) });
    if (items.length >= 30) break;
  }
  return items;
}

export function checklistItemsToText(items: ChecklistItem[]) {
  return items.map((item) => (item.rule ? `${item.label} | ${item.rule}` : item.label)).join('\n');
}

/** What arrived, what came with a problem and what is still missing, for one case. */
export function checklistStatus(
  items: ChecklistItem[],
  documents: Array<{ itemKey: string | null; status: DocumentStatus }>,
) {
  const best = new Map<string, DocumentStatus>();
  for (const document of documents) {
    if (!document.itemKey) continue;
    const current = best.get(document.itemKey);
    // A good copy wins over a problem one, whatever arrived first.
    if (!current || document.status === 'received') best.set(document.itemKey, document.status);
  }
  return items.map((item) => ({ ...item, status: best.get(item.key) || ('missing' as const) }));
}

export function documentSummary(caseName: string, status: ReturnType<typeof checklistStatus>) {
  const received = status.filter((item) => item.status === 'received').map((item) => item.label);
  const problems = status.filter((item) => item.status === 'unreadable' || item.status === 'problem').map((item) => item.label);
  const missing = status.filter((item) => item.status === 'missing').map((item) => item.label);
  return [
    `Documentos do caso "${caseName}":`,
    `recebidos (${received.length}/${status.length}): ${received.join(', ') || 'nenhum'}`,
    problems.length ? `com problema, pedir de novo: ${problems.join(', ')}` : '',
    `faltam: ${missing.join(', ') || 'nenhum'}`,
  ].filter(Boolean).join('\n');
}

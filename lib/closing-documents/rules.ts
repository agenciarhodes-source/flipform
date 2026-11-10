import { z } from 'zod';

/**
 * "Documentos para finalizar o atendimento": up to 3 Word models, the same for every customer,
 * where the company marks the customer's data as {{NOME COMPLETO}}, {{CPF}}, {{ENDEREÇO}}...
 * The system fills them with the data read from the documents the customer sent and sends them
 * when the company's text says so. Global for every company. Pure rules, easy to test.
 */

export const CLOSING_MAX_TEMPLATES = 3;
export const CLOSING_MAX_BYTES = 2 * 1024 * 1024;
export const CLOSING_SEND_WHEN_MAX = 2000;

export type ClosingField = { key: string; label: string; aliases: string[]; example: string };

/** The data the system knows how to fill. Keys are written without accents, in capitals. */
export const CLOSING_FIELDS: ClosingField[] = [
  { key: 'NOME COMPLETO', label: 'Nome completo', aliases: ['NOME', 'NOME DO CLIENTE', 'CONTRATANTE'], example: 'Maria Aparecida da Silva' },
  { key: 'CPF', label: 'CPF', aliases: [], example: '123.456.789-09' },
  { key: 'RG', label: 'RG', aliases: ['IDENTIDADE'], example: '12.345.678-9' },
  { key: 'DATA DE NASCIMENTO', label: 'Data de nascimento', aliases: ['NASCIMENTO'], example: '15/03/1990' },
  { key: 'ESTADO CIVIL', label: 'Estado civil', aliases: [], example: 'casada' },
  { key: 'PROFISSAO', label: 'Profissão', aliases: ['OCUPACAO'], example: 'do lar' },
  { key: 'NACIONALIDADE', label: 'Nacionalidade', aliases: [], example: 'brasileira' },
  { key: 'ENDERECO', label: 'Endereço', aliases: ['ENDERECO COMPLETO', 'RUA'], example: 'Rua das Flores, 120' },
  { key: 'BAIRRO', label: 'Bairro', aliases: [], example: 'Centro' },
  { key: 'CIDADE', label: 'Cidade', aliases: ['MUNICIPIO'], example: 'Goiânia' },
  { key: 'ESTADO', label: 'Estado', aliases: ['UF'], example: 'GO' },
  { key: 'CEP', label: 'CEP', aliases: [], example: '74000-000' },
  { key: 'TELEFONE', label: 'Telefone', aliases: ['CELULAR', 'WHATSAPP'], example: '(62) 99999-0000' },
  { key: 'EMAIL', label: 'E-mail', aliases: ['E MAIL'], example: 'maria@email.com' },
  { key: 'TESE', label: 'Tese (tipo de caso)', aliases: ['TIPO DE CASO'], example: 'Auxílio-maternidade' },
  { key: 'DATA', label: 'Data de hoje', aliases: ['DATA DE HOJE', 'DATA ATUAL'], example: '10 de novembro de 2026' },
];

/** "{{ Endereço_completo }}" -> "ENDERECO COMPLETO". */
export function normalizeFieldName(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[_\-.\s]+/g, ' ').trim();
}

/** The known field for a name written in the model, or null. */
export function closingFieldFor(name: string): ClosingField | null {
  const normal = normalizeFieldName(name);
  return CLOSING_FIELDS.find((field) => field.key === normal || field.aliases.includes(normal)) || null;
}

const PLACEHOLDER = /\{\{\s*([^{}]{1,60}?)\s*\}\}/g;

/** Names written between {{ }} in a text, as they were written, without repeats. */
export function placeholdersInText(text: string) {
  const seen = new Set<string>();
  for (const match of text.matchAll(PLACEHOLDER)) seen.add(match[1]!.trim());
  return [...seen];
}

/** Today in Brasília, written out: "10 de novembro de 2026". */
export function longDate(now: Date) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
}

/** Example values, used for the "baixar exemplo" button. */
export function sampleValues(now: Date): Record<string, string> {
  return Object.fromEntries(CLOSING_FIELDS.map((field) => [field.key, field.key === 'DATA' ? longDate(now) : field.example]));
}

function decodeXml(text: string) {
  return text.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (entity, name: string) => {
    const lower = name.toLowerCase();
    if (lower === 'lt') return '<';
    if (lower === 'gt') return '>';
    if (lower === 'quot') return '"';
    if (lower === 'apos') return "'";
    if (lower === 'amp') return '&';
    const code = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
  });
}

function encodeXml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const PARAGRAPH = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
const TEXT_RUN = /<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g;

/**
 * Replaces {{FIELD}} in one Word XML part. Word often splits "{{NOME COMPLETO}}" across several
 * pieces of text, so each paragraph is read as a whole and the pieces are rewritten.
 * `value` gives the text for a name written in the model, or null to leave it as it is.
 */
export function fillWordXml(xml: string, value: (name: string) => string | null) {
  const missing = new Set<string>();
  const filled = xml.replace(PARAGRAPH, (paragraph) => {
    const runs = [...paragraph.matchAll(TEXT_RUN)];
    if (!runs.length) return paragraph;
    const texts = runs.map((run) => decodeXml(run[2] || ''));
    const joined = texts.join('');
    if (!joined.includes('{{')) return paragraph;
    const matches = [...joined.matchAll(PLACEHOLDER)];
    if (!matches.length) return paragraph;
    // Piece where each character of the joined text lives.
    const starts: number[] = [];
    let position = 0;
    for (const text of texts) { starts.push(position); position += text.length; }
    const pieceAt = (index: number) => {
      let piece = 0;
      while (piece + 1 < starts.length && starts[piece + 1]! <= index) piece += 1;
      return piece;
    };
    // From the last to the first, so earlier positions stay valid.
    for (const match of matches.reverse()) {
      const name = match[1]!.trim();
      const replacement = value(name);
      if (replacement === null) { missing.add(name); continue; }
      const start = match.index!;
      const end = start + match[0].length;
      const first = pieceAt(start);
      const last = pieceAt(end - 1);
      for (let piece = last; piece >= first; piece -= 1) {
        const from = Math.max(start, starts[piece]!) - starts[piece]!;
        const to = Math.min(end, starts[piece]! + texts[piece]!.length) - starts[piece]!;
        const text = texts[piece]!;
        texts[piece] = text.slice(0, from) + (piece === first ? replacement : '') + text.slice(to);
      }
    }
    let index = 0;
    return paragraph.replace(TEXT_RUN, (_run, attrs: string | undefined) => {
      const text = texts[index++] ?? '';
      const keep = (attrs || '').includes('xml:space') ? attrs : `${attrs || ''} xml:space="preserve"`;
      return `<w:t${keep}>${encodeXml(text)}</w:t>`;
    });
  });
  return { xml: filled, missing: [...missing] };
}

/** Parts of a Word file that hold text: the body, headers and footers. */
export function isWordTextPart(name: string) {
  return /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(name);
}

export const closingSettingsSchema = z.object({
  enabled: z.boolean(),
  sendWhen: z.string().trim().max(CLOSING_SEND_WHEN_MAX, `O texto pode ter até ${CLOSING_SEND_WHEN_MAX} caracteres.`),
}).refine((value) => !value.enabled || value.sendWhen.length >= 20, {
  message: 'Explique em pelo menos uma frase quando os documentos devem ser enviados.',
  path: ['sendWhen'],
});

/** Clean name for a model file shown to the team and to the customer. */
export function cleanTemplateName(fileName: string) {
  const base = fileName.replace(/\.docx$/i, '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (base || 'Documento').slice(0, 80);
}

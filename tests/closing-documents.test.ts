import test from 'node:test';
import assert from 'node:assert/strict';
import { readZip, writeZip } from '../lib/docx/zip';
import {
  closingFieldFor,
  closingSettingsSchema,
  cleanTemplateName,
  fillWordXml,
  longDate,
  normalizeFieldName,
  placeholdersInText,
} from '../lib/closing-documents/rules';
import { docxPlaceholders, fillDocx } from '../lib/closing-documents/docx';

const enc = (text: string) => new Uint8Array(Buffer.from(text, 'utf8'));
const dec = (data: Uint8Array) => Buffer.from(data).toString('utf8');

function docx(body: string) {
  return writeZip([
    { name: '[Content_Types].xml', data: enc('<?xml version="1.0"?><Types/>') },
    { name: 'word/document.xml', data: enc(`<w:document><w:body>${body}</w:body></w:document>`) },
    { name: 'word/styles.xml', data: enc('<w:styles>{{NOME}}</w:styles>') },
  ]);
}

test('zip: what is written is read back the same, in the same order', () => {
  const entries = [{ name: 'a.txt', data: enc('olá') }, { name: 'pasta/b.xml', data: enc('<x>'.repeat(500)) }];
  const back = readZip(writeZip(entries));
  assert.deepEqual(back.map((e) => e.name), ['a.txt', 'pasta/b.xml']);
  assert.equal(dec(back[0]!.data), 'olá');
  assert.equal(dec(back[1]!.data), '<x>'.repeat(500));
});

test('zip: something that is not a zip is refused', () => {
  assert.throws(() => readZip(enc('não sou um zip, sou um texto qualquer')));
});

test('field names: accents, case, underscores and aliases', () => {
  assert.equal(normalizeFieldName(' Endereço_completo '), 'ENDERECO COMPLETO');
  assert.equal(closingFieldFor('endereço completo')?.key, 'ENDERECO');
  assert.equal(closingFieldFor('Nome')?.key, 'NOME COMPLETO');
  assert.equal(closingFieldFor('uf')?.key, 'ESTADO');
  assert.equal(closingFieldFor('Profissão')?.key, 'PROFISSAO');
  assert.equal(closingFieldFor('NUMERO DO PROCESSO'), null);
  assert.deepEqual(placeholdersInText('Eu, {{NOME}}, CPF {{ CPF }}, {{NOME}}'), ['NOME', 'CPF']);
});

test('fill: a name split by Word across several pieces of text is replaced', () => {
  const xml = '<w:p><w:r><w:t>Eu, {{NO</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>ME COMP</w:t></w:r><w:r><w:t>LETO}}, CPF {{CPF}}.</w:t></w:r></w:p>';
  const result = fillWordXml(xml, (name) => ({ 'NOME COMPLETO': 'Ana & Cia', CPF: '123.456.789-09' } as Record<string, string>)[name] ?? null);
  const text = result.xml.replace(/<[^>]+>/g, '');
  assert.equal(text, 'Eu, Ana &amp; Cia, CPF 123.456.789-09.');
  assert.deepEqual(result.missing, []);
  assert.ok(result.xml.includes('<w:b/>'), 'formatting is kept');
});

test('fill: a field without value stays as it is and is reported', () => {
  const result = fillWordXml('<w:p><w:r><w:t>RG {{RG}}</w:t></w:r></w:p>', () => null);
  assert.ok(result.xml.includes('{{RG}}'));
  assert.deepEqual(result.missing, ['RG']);
});

test('docx: lists known and unknown fields and fills body only', () => {
  const file = docx('<w:p><w:r><w:t>{{Nome completo}} - {{CP</w:t></w:r><w:r><w:t>F}} - {{PROCESSO}}</w:t></w:r></w:p>');
  assert.deepEqual(docxPlaceholders(file), { known: ['Nome completo', 'CPF'], unknown: ['PROCESSO'] });
  const filled = fillDocx(file, { 'NOME COMPLETO': 'Maria', CPF: '111' });
  const entries = readZip(filled.bytes);
  assert.equal(dec(entries.find((e) => e.name === 'word/document.xml')!.data).replace(/<[^>]+>/g, ''), 'Maria - 111 - {{PROCESSO}}');
  assert.equal(dec(entries.find((e) => e.name === 'word/styles.xml')!.data), '<w:styles>{{NOME}}</w:styles>');
  assert.deepEqual(filled.missing, ['PROCESSO']);
  assert.equal(entries[0]!.name, '[Content_Types].xml');
});

test('docx: a zip without a Word body is refused', () => {
  assert.throws(() => docxPlaceholders(writeZip([{ name: 'a.txt', data: enc('x') }])));
});

test('settings: switching on needs a text that says when to send', () => {
  assert.equal(closingSettingsSchema.safeParse({ enabled: true, sendWhen: 'agora' }).success, false);
  assert.equal(closingSettingsSchema.safeParse({ enabled: false, sendWhen: '' }).success, true);
  assert.equal(closingSettingsSchema.safeParse({ enabled: true, sendWhen: 'Quando o cliente mandar RG e comprovante.' }).success, true);
});

test('names and dates', () => {
  assert.equal(cleanTemplateName('Contrato: honorários.docx'), 'Contrato honorários');
  assert.equal(longDate(new Date('2026-11-10T15:00:00Z')), '10 de novembro de 2026');
});

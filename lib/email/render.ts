import { emailTemplates } from './templates';
import type { EmailTemplateName, RenderedEmail, TemplateParams } from './types';

function interpolate(input: string, params: TemplateParams): string {
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const value = params[key];
    return value === null || value === undefined ? '' : String(value);
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textToHtml(text: string): string {
  const lines = text.split('\n').map((line) => line.trimEnd());
  const html = lines
    .map((line) => (line ? `<p style="margin:0 0 12px;">${escapeHtml(line)}</p>` : '<div style="height:8px"></div>'))
    .join('');
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;"><div style="max-width:640px;margin:0 auto;background:white;border:1px solid #e2e8f0;border-radius:8px;padding:24px;"><div style="font-size:20px;font-weight:700;margin-bottom:16px;">FlipForm</div>${html}</div></body></html>`;
}

export function renderEmailTemplate(templateName: EmailTemplateName, params: TemplateParams): RenderedEmail {
  const def = emailTemplates[templateName];
  const subject = interpolate(def.subject, params);
  const text = interpolate(def.text, params);
  const html = textToHtml(text);
  return { subject, text, html };
}

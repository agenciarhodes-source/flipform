'use client';

import { useMemo, useState } from 'react';
import { LifeBuoy, Search, AlertCircle } from 'lucide-react';

type Section = { heading: string; body: string; index: number };

function fold(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function parseSections(markdown: string): Section[] {
  const chunks: Section[] = [];
  let heading = 'Orientações iniciais';
  let body: string[] = [];
  const flush = () => {
    if (body.some((line) => line.trim())) {
      chunks.push({ heading, body: body.join('\n').trim(), index: chunks.length });
    }
    body = [];
  };
  for (const line of markdown.split(/\r?\n/)) {
    if (/^##\s+/.test(line)) {
      flush();
      heading = line.replace(/^##\s+/, '').trim();
    } else {
      body.push(line);
    }
  }
  flush();
  return chunks;
}

function inline(text: string) {
  // Fonte revisada no próprio repositório; nenhuma string é renderizada como HTML.
  // Links são exclusivamente URLs http(s) e recebem noopener/noreferrer.
  const fragments = text.split(/(https?:\/\/[^\s)]+|\*\*[^*]+\*\*)/g);
  return fragments.map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-primary">{part}</a>;
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

function MarkdownBody({ content }: { content: string }) {
  const blocks = content.split(/\n\s*\n/).filter((s) => s.trim());
  return (
    <div className="space-y-4 text-sm leading-relaxed text-foreground">
      {blocks.map((block, index) => {
        const lines = block.trim().split('\n');
        if (lines[0]?.startsWith('### ')) {
          return <div key={index}><h3 className="mb-2 font-semibold text-base">{lines[0].slice(4)}</h3>{lines.length > 1 && <p>{inline(lines.slice(1).join(' '))}</p>}</div>;
        }
        if (lines[0]?.startsWith('# ')) {
          return <h1 className="text-xl font-bold" key={index}>{lines[0].slice(2)}</h1>;
        }
        if (lines[0]?.startsWith('**') && lines.length === 1) {
          return <p key={index}>{inline(lines[0])}</p>;
        }
        if (lines.every((line) => line.trim().startsWith('|'))) {
          const rows = lines
            .map((line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()))
            .filter((row) => !row.every((cell) => /^:?-{2,}:?$/.test(cell)));
          return <div className="overflow-x-auto" key={index}><table className="w-full border-collapse text-left text-xs">
            <tbody>{rows.map((row, ri) => <tr key={ri} className="border-b">
              {row.map((cell, ci) => ri === 0 ? <th key={ci} className="p-2 align-top font-semibold">{inline(cell)}</th> : <td key={ci} className="p-2 align-top">{inline(cell)}</td>)}
            </tr>)}</tbody>
          </table></div>;
        }
        if (lines.every((line) => /^\s*(-|\d+\.)\s/.test(line))) {
          return <ul key={index} className="list-disc space-y-1 pl-5">{lines.map((line, li) => (
            <li key={li}>{inline(line.replace(/^\s*(?:-|\d+\.)\s/, ''))}</li>
          ))}</ul>;
        }
        if (lines.every((line) => /^\s*-\s*\[\s*[x ]\s*\]/i.test(line))) {
          return <ul key={index} className="space-y-1">{lines.map((line, li) => (
            <li key={li}>{inline(line.replace(/^\s*-\s*\[\s*[x ]\s*\]\s*/i, '□ '))}</li>
          ))}</ul>;
        }
        if (lines[0]?.startsWith('>')) {
          return <blockquote key={index} className="border-l-4 border-amber-500 pl-4 text-muted-foreground">{inline(lines.map((line) => line.replace(/^>\s?/, '')).join(' '))}</blockquote>;
        }
        return <p key={index} className="whitespace-pre-line">{inline(lines.join('\n'))}</p>;
      })}
    </div>
  );
}

export function SupportKnowledgeClient({ markdown }: { markdown: string }) {
  const [query, setQuery] = useState('');
  const sections = useMemo(() => parseSections(markdown), [markdown]);
  const matches = useMemo(() => {
    const term = fold(query.trim());
    if (!term) return sections;
    return sections.filter(({ heading, body }) => fold(heading + '\n' + body).includes(term));
  }, [query, sections]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <LifeBuoy aria-hidden="true" className="h-7 w-7 text-orange-500" />
          <h1 className="text-2xl font-semibold tracking-tight">Suporte</h1>
        </div>
        <p className="text-sm text-muted-foreground">Base interna do Junqueira Advogados para consulta rápida dos atendentes.</p>
        <p className="flex items-start gap-2 rounded-lg border p-3 text-xs text-muted-foreground">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          Material em revisão jurídica. Use para orientar a triagem, não para garantir direito, resultado ou prazo. Dúvidas devem ser encaminhadas à supervisão ou ao advogado responsável.
        </p>
      </header>

      <label className="relative block">
        <span className="sr-only">Buscar no suporte</span>
        <Search aria-hidden="true" className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
        <input
          className="w-full rounded-lg border bg-background py-3 pl-10 pr-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Busque: carteira assinada, provas rurais, BPC, empréstimo..."
        />
      </label>
      <p className="text-xs text-muted-foreground">{matches.length} de {sections.length} seções encontradas. Pesquisa local, sem envio de informações para IA.</p>

      <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <nav aria-label="Índice do suporte" className="hidden self-start rounded-xl border p-4 lg:sticky lg:top-4 lg:block">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Índice</p>
          <ul className="max-h-[65vh] space-y-2 overflow-auto text-xs">
            {matches.map((section) => <li key={section.index}>
              <a className="hover:underline" href={'#secao-' + section.index}>{section.heading}</a>
            </li>)}
          </ul>
        </nav>
        <main className="space-y-4">
          {matches.length === 0 && <div className="rounded-xl border p-6 text-sm">Nenhum trecho encontrado. Tente outro termo ou procure a supervisão.</div>}
          {matches.map((section) => (
            <section key={section.index} id={'secao-' + section.index} className="scroll-mt-4 rounded-xl border bg-card p-4 shadow-sm md:p-6">
              <h2 className="mb-4 border-b pb-3 text-lg font-semibold">{section.heading}</h2>
              <MarkdownBody content={section.body} />
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}

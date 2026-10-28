'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Instagram } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

type Settings = {
  enabled: boolean;
  agentId: string | null;
  liveEnabled: boolean;
  testUsernames: string[];
  dailyCreditLimit: number | null;
  resumeAfterHours: number | null;
  introduction: string | null;
  updatedAt: string | null;
};
type AccountRow = { connectionId: string; username: string | null; settings: Settings };
type Workspace = { agents: Array<{ id: string; name: string }>; accounts: AccountRow[] };

/** One card per connected Instagram account: whether the Flip AI answers the Direct, and with which agent. */
export function InstagramAiSettingsManager({ initialWorkspace }: { initialWorkspace: Workspace }) {
  const [workspace, setWorkspace] = useState(initialWorkspace);

  return (
    <section className="mx-auto max-w-4xl space-y-5 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Instagram className="h-6 w-6 text-brand-600" aria-hidden="true" /> Atendimento Instagram</h1>
        <p className="text-sm text-muted-foreground">
          Defina se o Flip AI responde o Direct de cada conta do Instagram conectada e com qual atendente. A IA entende o que a pessoa
          busca e responde com base no Markdown do atendente escolhido (por exemplo, indicando o WhatsApp certo para cada assunto).
        </p>
      </header>
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Com a IA ligada, ela responde primeiro só aos perfis de teste. Para atender todo mundo, ligue “Liberar a IA para todos”.
        Quando alguém da equipe responde no Direct, a IA para naquela conversa. Pela regra da Meta, a resposta só sai até 24 horas
        depois da última mensagem da pessoa.
      </div>

      {workspace.accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhuma conta do Instagram conectada. Conecte o Instagram em Integrações.
        </div>
      ) : workspace.accounts.map((row) => (
        <AccountCard key={row.connectionId} row={row} agents={workspace.agents} onSaved={setWorkspace} />
      ))}
    </section>
  );
}

function AccountCard({ row, agents, onSaved }: { row: AccountRow; agents: Workspace['agents']; onSaved: (next: Workspace) => void }) {
  const [form, setForm] = useState<Settings>(row.settings);
  const [limitText, setLimitText] = useState(row.settings.dailyCreditLimit ? String(row.settings.dailyCreditLimit) : '');
  const [resumeText, setResumeText] = useState(row.settings.resumeAfterHours ? String(row.settings.resumeAfterHours) : '');
  const [testText, setTestText] = useState((row.settings.testUsernames || []).map((name) => `@${name}`).join('\n'));
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<Settings>) => setForm((current) => ({ ...current, ...patch }));

  async function save() {
    const limit = limitText.trim() ? Number(limitText.trim()) : null;
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      toast.error('O limite diário deve ser um número inteiro de créditos, ou fique vazio para sem limite.');
      return;
    }
    const resume = resumeText.trim() ? Number(resumeText.trim()) : null;
    if (resume !== null && (!Number.isInteger(resume) || resume < 1 || resume > 720)) {
      toast.error('As horas para devolver à IA devem ser um número inteiro entre 1 e 720, ou fique vazio.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/instagram-ai/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: row.connectionId,
          enabled: form.enabled,
          agentId: form.agentId,
          liveEnabled: form.liveEnabled,
          testUsernames: testText.split(/[\n,;\s]+/).map((name) => name.trim()).filter(Boolean),
          dailyCreditLimit: limit,
          resumeAfterHours: resume,
          introduction: form.introduction?.trim() || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
      onSaved(data);
      toast.success('Configuração do Instagram salva.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{row.username ? `@${row.username}` : 'Instagram conectado'}</h2>
          <p className="text-sm text-muted-foreground">Direct do Instagram</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <Switch checked={form.enabled} onCheckedChange={(checked) => update({ enabled: checked })} aria-label="IA responde o Direct desta conta" />
          {form.enabled ? 'IA ligada' : 'IA desligada'}
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Atendente que responde</span>
        <select className="w-full rounded border bg-white p-2 text-sm" value={form.agentId || ''}
          onChange={(event) => update({ agentId: event.target.value || null })}>
          <option value="">Escolha um atendente publicado</option>
          {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
        </select>
        <span className="block text-xs text-muted-foreground">
          Recomendado: um atendente só para o Instagram, com um Markdown próprio (o que responder e para qual WhatsApp encaminhar cada assunto).
        </span>
        {agents.length === 0 && <span className="block text-xs text-amber-800">Nenhum atendente publicado. Publique um atendente no Flip AI primeiro.</span>}
      </label>

      <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50 p-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Perfis de teste</span>
          <textarea rows={3} className="w-full rounded border bg-white p-2 text-sm" placeholder={'@seu.perfil\n@perfil.da.equipe'}
            value={testText} onChange={(event) => setTestText(event.target.value)} />
          <span className="block text-xs text-muted-foreground">Um @ por linha. Enquanto a IA não estiver liberada para todos, ela responde só a estes perfis.</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <Switch checked={form.liveEnabled} onCheckedChange={(checked) => update({ liveEnabled: checked })} aria-label="Liberar a IA para todos" />
          <span>
            <span className="font-medium">Liberar a IA para todos que mandarem Direct</span>
            <span className="block text-xs text-muted-foreground">Desligado: só os perfis de teste recebem respostas da IA. Ligue quando estiver satisfeito com os testes.</span>
          </span>
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Como a IA se apresenta</span>
        <input type="text" maxLength={120} className="w-full rounded border p-2 text-sm" placeholder="assistente da empresa"
          value={form.introduction || ''} onChange={(event) => update({ introduction: event.target.value })} />
        <span className="block text-xs text-muted-foreground">Usado na primeira resposta. A IA nunca diz que é uma pessoa. Vazio: “assistente de” + o nome da empresa.</span>
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Limite de gasto por dia (créditos de IA)</span>
        <input type="number" min={1} className="w-48 rounded border p-2 text-sm" placeholder="Sem limite" value={limitText}
          onChange={(event) => setLimitText(event.target.value)} />
        <span className="block text-xs text-muted-foreground">Ao atingir o limite, a IA para até o dia seguinte e o Direct volta para a equipe.</span>
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Devolver para a IA depois de (horas sem resposta da equipe)</span>
        <input type="number" min={1} max={720} className="w-48 rounded border p-2 text-sm" placeholder="Nunca" value={resumeText}
          onChange={(event) => setResumeText(event.target.value)} />
        <span className="block text-xs text-muted-foreground">Quando alguém da equipe responde, a IA para naquela conversa. Vazio: ela só volta quando alguém clicar em “Devolver para a IA”.</span>
      </label>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {row.settings.updatedAt ? `Última alteração: ${new Date(row.settings.updatedAt).toLocaleString('pt-BR')}` : 'Ainda não configurado'}
        </span>
        <Button type="button" onClick={() => void save()} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
      </div>
    </article>
  );
}

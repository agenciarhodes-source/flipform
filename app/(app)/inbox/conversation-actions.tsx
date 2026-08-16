'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Link2,
  Loader2,
  RotateCcw,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CurrentLead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  assignedTo: string | null;
}

interface CurrentAssignee {
  id: string;
  name: string;
}

interface LeadCandidate extends CurrentLead {
  stage: { name: string } | null;
  pipeline: { name: string } | null;
}

interface AssigneeCandidate {
  id: string;
  name: string;
  role: string;
}

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

export function ConversationActions({
  conversationId,
  status,
  lead,
  assignee,
  canManage,
  canAssign,
  onChanged,
}: {
  conversationId: string;
  status: string;
  lead: CurrentLead | null;
  assignee: CurrentAssignee | null;
  canManage: boolean;
  canAssign: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [leadQuery, setLeadQuery] = useState('');
  const [leadResults, setLeadResults] = useState<LeadCandidate[]>([]);
  const [assignees, setAssignees] = useState<AssigneeCandidate[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [loadingAssignees, setLoadingAssignees] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOpen(false);
    setLeadQuery('');
    setLeadResults([]);
    setError(null);
    setBusy(null);
  }, [conversationId]);

  useEffect(() => {
    if (!open || !canAssign) return;
    const controller = new AbortController();
    setLoadingAssignees(true);
    fetch('/api/inbox/assignees', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await readJson(response);
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os responsáveis.');
        setAssignees(Array.isArray(data.assignees) ? data.assignees : []);
      })
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os responsáveis.');
      })
      .finally(() => setLoadingAssignees(false));
    return () => controller.abort();
  }, [open, canAssign, conversationId]);

  useEffect(() => {
    const q = leadQuery.trim();
    if (!open || !canManage || lead || q.length < 2) {
      setLeadResults([]);
      setLoadingLeads(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoadingLeads(true);
      fetch(`/api/inbox/leads?q=${encodeURIComponent(q)}`, { cache: 'no-store', signal: controller.signal })
        .then(async (response) => {
          const data = await readJson(response);
          if (!response.ok) throw new Error(data.error || 'Não foi possível buscar leads.');
          setLeadResults(Array.isArray(data.leads) ? data.leads : []);
        })
        .catch((loadError) => {
          if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
          setError(loadError instanceof Error ? loadError.message : 'Não foi possível buscar leads.');
        })
        .finally(() => setLoadingLeads(false));
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, canManage, lead, leadQuery, conversationId]);

  const selectedAssigneeValue = assignee?.id || '';
  const canShowControls = canManage;
  const statusLabel = status === 'resolved' ? 'Reabrir conversa' : 'Resolver conversa';
  const statusIcon = status === 'resolved'
    ? <RotateCcw className="h-4 w-4" />
    : <CheckCircle2 className="h-4 w-4" />;

  const leadDescription = useMemo(() => {
    if (!lead) return 'Nenhum lead vinculado';
    return [lead.phone, lead.email].filter(Boolean).join(' • ') || 'Lead vinculado';
  }, [lead]);

  async function postAction(path: string, body: Record<string, unknown>, busyKey: string) {
    setBusy(busyKey);
    setError(null);
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a ação.');
      await onChanged();
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível concluir a ação.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function linkLead(leadId: string) {
    const ok = await postAction(
      `/api/inbox/conversations/${encodeURIComponent(conversationId)}/lead`,
      { leadId },
      'lead',
    );
    if (ok) {
      setLeadQuery('');
      setLeadResults([]);
    }
  }

  async function assign(userId: string) {
    await postAction(
      `/api/inbox/conversations/${encodeURIComponent(conversationId)}/assignee`,
      { userId: userId || null },
      'assignee',
    );
  }

  async function toggleStatus() {
    await postAction(
      `/api/inbox/conversations/${encodeURIComponent(conversationId)}/status`,
      { status: status === 'resolved' ? 'open' : 'resolved' },
      'status',
    );
  }

  if (!canShowControls) return null;

  return (
    <div className="relative shrink-0">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        Ações
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>

      {open && (
        <div className="absolute right-0 top-10 z-30 w-[min(92vw,360px)] rounded-xl border bg-card p-4 shadow-xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Gerenciar conversa</div>
              <div className="text-xs text-muted-foreground">Ações do Inbox não alteram estágio ou status do Lead.</div>
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)} aria-label="Fechar ações">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {error && (
            <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          )}

          <div className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Link2 className="h-3.5 w-3.5" /> Lead
              </div>
              {lead ? (
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <div className="truncate text-sm font-medium">{lead.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{leadDescription}</div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={leadQuery}
                      onChange={(event) => setLeadQuery(event.target.value)}
                      placeholder="Buscar lead por nome, telefone ou e-mail"
                      className="pl-9"
                    />
                  </div>
                  {leadQuery.trim().length > 0 && leadQuery.trim().length < 2 && (
                    <div className="text-xs text-muted-foreground">Digite pelo menos 2 caracteres.</div>
                  )}
                  {loadingLeads && (
                    <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando leads...
                    </div>
                  )}
                  {!loadingLeads && leadQuery.trim().length >= 2 && leadResults.length === 0 && (
                    <div className="py-2 text-xs text-muted-foreground">Nenhum lead encontrado no seu escopo.</div>
                  )}
                  {leadResults.length > 0 && (
                    <div className="max-h-48 overflow-y-auto rounded-md border">
                      {leadResults.map((candidate) => (
                        <button
                          key={candidate.id}
                          type="button"
                          className="block w-full border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/60 disabled:opacity-50"
                          onClick={() => void linkLead(candidate.id)}
                          disabled={busy === 'lead'}
                        >
                          <div className="truncate text-sm font-medium">{candidate.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {[candidate.phone, candidate.email].filter(Boolean).join(' • ') || 'Sem contato'}
                          </div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {[candidate.pipeline?.name, candidate.stage?.name].filter(Boolean).join(' › ')}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {canAssign && (
              <div>
                <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <UserRound className="h-3.5 w-3.5" /> Responsável da conversa
                </div>
                <select
                  value={selectedAssigneeValue}
                  onChange={(event) => void assign(event.target.value)}
                  disabled={loadingAssignees || busy === 'assignee'}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                >
                  <option value="">Sem responsável</option>
                  {assignees.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{candidate.name} — {candidate.role}</option>
                  ))}
                </select>
                <div className="mt-1 text-[11px] text-muted-foreground">Isso não altera o responsável do Lead no Kanban.</div>
              </div>
            )}

            <div>
              <Button
                type="button"
                variant={status === 'resolved' ? 'outline' : 'secondary'}
                className="w-full gap-2"
                onClick={() => void toggleStatus()}
                disabled={busy === 'status'}
              >
                {busy === 'status' ? <Loader2 className="h-4 w-4 animate-spin" /> : statusIcon}
                {statusLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

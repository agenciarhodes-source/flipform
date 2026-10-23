'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ATTENDANT_ROLE_LABELS, ATTENDANT_ROLES, type AttendantRole } from '@/lib/flip-ai/attendant-role';

/** "Perfil do atendente": analyst (triage, then the team) or closer (up to the close). Saves on change. */
export function AgentRolePicker({ agentId }: { agentId: string }) {
  const [role, setRole] = useState<AttendantRole | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/flip-ai/agents/${agentId}/profile`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => { if (active && (data.role === 'analyst' || data.role === 'closer')) setRole(data.role); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [agentId]);

  async function change(next: AttendantRole) {
    const previous = role;
    setRole(next);
    setSaving(true);
    try {
      const response = await fetch(`/api/flip-ai/agents/${agentId}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar o perfil.');
      toast.success(`Perfil do atendente: ${ATTENDANT_ROLE_LABELS[next].name}. Vale a partir da próxima resposta.`);
    } catch (error) {
      setRole(previous);
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar o perfil.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset className="mt-4 rounded-md border p-3" disabled={saving || role === null}>
      <legend className="px-1 text-xs font-medium">Perfil do atendente</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {ATTENDANT_ROLES.map((option) => (
          <label key={option} className={`flex cursor-pointer gap-2 rounded-md border p-2 text-xs ${role === option ? 'border-brand-600 bg-brand-50' : ''}`}>
            <input type="radio" name={`attendant-role-${agentId}`} value={option} checked={role === option}
              onChange={() => void change(option)} className="mt-0.5" />
            <span>
              <span className="block font-medium">{ATTENDANT_ROLE_LABELS[option].name}</span>
              <span className="text-muted-foreground">{ATTENDANT_ROLE_LABELS[option].description}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Vale no site e no WhatsApp. O Markdown Mestre continua definindo o conteúdo e as regras da empresa.</p>
    </fieldset>
  );
}

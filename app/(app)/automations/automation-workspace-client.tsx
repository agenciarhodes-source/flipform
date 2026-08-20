'use client';

import { useState } from 'react';
import { InstagramCommentAutomationClient } from './instagram-comment-automation-client';
import { WhatsAppMessageAutomationClient } from './whatsapp-message-automation-client';

type WorkspaceView = 'overview' | 'instagram-comment' | 'whatsapp-message';

function StepBadge({ index, label }: { index: number; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
        {index}
      </span>
      <span className="font-medium">{label}</span>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-4 lg:px-6 lg:pt-6">
      <button type="button" onClick={onClick} className="text-sm font-medium text-brand-700 hover:text-brand-800">
        ← Voltar para automações
      </button>
    </div>
  );
}

export function AutomationWorkspaceClient({ canEdit }: { canEdit: boolean }) {
  const [view, setView] = useState<WorkspaceView>('overview');

  if (view === 'instagram-comment') {
    return (
      <div className="space-y-2">
        <BackButton onClick={() => setView('overview')} />
        <InstagramCommentAutomationClient canEdit={canEdit} />
      </div>
    );
  }

  if (view === 'whatsapp-message') {
    return (
      <div className="space-y-2">
        <BackButton onClick={() => setView('overview')} />
        <WhatsAppMessageAutomationClient canEdit={canEdit} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 lg:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-medium text-brand-700">Automation Builder</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Automações</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Centralize fluxos de Instagram e WhatsApp no mesmo Automation Core, com configuração tenant-safe e execução durável.
          </p>
        </div>
        {!canEdit && (
          <span className="w-fit rounded-full border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
            Somente leitura
          </span>
        )}
      </div>

      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Como um fluxo funciona</p>
            <h2 className="mt-2 text-lg font-semibold">Gatilho → condição → ação</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Instagram e WhatsApp já usam o mesmo motor. Os próximos passos adicionam condições, esperas e ações de CRM sem criar runtimes paralelos.
            </p>
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-3 lg:min-w-[520px]">
            <StepBadge index={1} label="Quando acontecer" />
            <StepBadge index={2} label="Se combinar" />
            <StepBadge index={3} label="Então executar" />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="font-semibold">Fluxos disponíveis</h2>
          <p className="mt-1 text-sm text-muted-foreground">Escolha um canal para configurar ou acompanhar suas automações.</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <article className="flex min-h-[260px] flex-col rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">Disponível</span>
                <h3 className="mt-4 text-lg font-semibold">Comentário do Instagram → Direct</h3>
              </div>
              <span className="rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs font-semibold">Instagram</span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Quando alguém comenta uma palavra ou frase configurada em um post ou Reel, o FlipForm envia uma resposta privada automaticamente.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-md border bg-background px-2 py-1">Comentário</span><span>→</span><span className="rounded-md border bg-background px-2 py-1">Palavra-chave</span><span>→</span><span className="rounded-md border bg-background px-2 py-1">DM privada</span>
            </div>
            <button type="button" onClick={() => setView('instagram-comment')} className="mt-auto rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
              {canEdit ? 'Gerenciar fluxo' : 'Visualizar fluxo'}
            </button>
          </article>

          <article className="flex min-h-[260px] flex-col rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">Disponível</span>
                <h3 className="mt-4 text-lg font-semibold">Mensagem do WhatsApp → Resposta</h3>
              </div>
              <span className="rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs font-semibold">WhatsApp</span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Quando uma mensagem recebida combina com a palavra-chave configurada, o FlipForm responde automaticamente pelo WhatsApp.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-md border bg-background px-2 py-1">Mensagem</span><span>→</span><span className="rounded-md border bg-background px-2 py-1">Palavra-chave</span><span>→</span><span className="rounded-md border bg-background px-2 py-1">Resposta</span>
            </div>
            <button type="button" onClick={() => setView('whatsapp-message')} className="mt-auto rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
              {canEdit ? 'Gerenciar fluxo' : 'Visualizar fluxo'}
            </button>
          </article>

          <article className="flex min-h-[260px] flex-col rounded-2xl border border-dashed bg-muted/20 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">Planejado</span>
                <h3 className="mt-4 text-lg font-semibold">Fluxos multietapas</h3>
              </div>
              <span className="rounded-lg border bg-background px-2.5 py-1.5 text-xs font-semibold">Builder</span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Condições, esperas, múltiplas ações, criação de lead, mudança de etapa do Kanban e handoff para atendente dentro do mesmo fluxo visual.
            </p>
            <div className="mt-auto rounded-lg border bg-background/70 px-3 py-2 text-xs text-muted-foreground">
              Entrará por etapas, sem quebrar os fluxos já ativos.
            </div>
          </article>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Próxima evolução do builder</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Agora que Instagram e WhatsApp estão configuráveis, o próximo marco adiciona blocos multietapas e ações de Lead/Kanban ao mesmo motor.
            </p>
          </div>
          <div className="flex shrink-0 gap-2 text-xs"><span className="rounded-full border px-3 py-1.5">Automation Core</span><span className="rounded-full border px-3 py-1.5">Tenant-safe</span></div>
        </div>
      </section>
    </div>
  );
}

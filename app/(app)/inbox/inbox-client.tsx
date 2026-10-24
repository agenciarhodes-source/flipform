'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { whatsappFailureText } from '@/lib/meta/whatsapp-failure-reasons';
import { StageSuggestionBanner } from '@/components/stage-suggestion-banner';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock3,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConversationActions } from './conversation-actions';
import { LeadDetailModal } from '@/components/lead-detail-modal';
import { VoiceRecorder } from '@/components/inbox/voice-recorder';
import { toast } from 'sonner';
import { contactAvatarColorIndex, contactInitials } from '@/lib/inbox/contact-avatar';

interface InboxIdentity {
  id: string;
  externalUserId: string;
  username: string | null;
  displayName: string | null;
  phone: string | null;
  email: string | null;
}

interface InboxLead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  assignedTo: string | null;
  assignedUser?: { id: string; name: string } | null;
  pipelineId?: string;
}

interface InboxAssignee {
  id: string;
  name: string;
  role?: string | null;
}

interface InboxMessageSummary {
  id: string;
  direction: string;
  type: string;
  text: string | null;
  status: string;
  providerTimestamp: string | null;
  createdAt: string;
  sentByUserId?: string | null;
  sentByUser?: InboxAssignee | null;
}

interface InboxConversation {
  id: string;
  aiPausedAt?: string | null;
  aiPausedByName?: string | null;
  aiPauseReason?: string | null;
  /** Whether the AI answers this contact at all (it may be on only for test numbers). */
  aiActive?: boolean;
  provider: string;
  channel: string;
  status: string;
  unreadCount: number;
  assignedTo: string | null;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  externalContactIdentity: InboxIdentity;
  lead: InboxLead | null;
  assignee: InboxAssignee | null;
  messages: InboxMessageSummary[];
}

interface InboxMessage extends InboxMessageSummary {
  conversationId: string;
  text: string | null;
  sentByUserId: string | null;
  sentByUser: InboxAssignee | null;
  metadata: unknown;
}

const AVATAR_COLORS = [
  'bg-emerald-100 text-emerald-800',
  'bg-sky-100 text-sky-800',
  'bg-violet-100 text-violet-800',
  'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-800',
  'bg-teal-100 text-teal-800',
  'bg-indigo-100 text-indigo-800',
  'bg-orange-100 text-orange-800',
];

/** Initials on a colour of their own: WhatsApp does not share the customer's profile photo. */
function ContactAvatar({ conversation }: { conversation: InboxConversation }) {
  return (
    <div aria-hidden="true"
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${AVATAR_COLORS[contactAvatarColorIndex(conversation.externalContactIdentity.id)]}`}>
      {contactInitials(contactName(conversation))}
    </div>
  );
}

function contactName(conversation: InboxConversation) {
  return conversation.lead?.name
    || conversation.externalContactIdentity.displayName
    || conversation.externalContactIdentity.username
    || conversation.externalContactIdentity.phone
    || conversation.externalContactIdentity.externalUserId;
}

function lastMessageText(conversation: InboxConversation) {
  const message = conversation.messages[0];
  if (!message) return 'Sem mensagens';
  if (message.text?.trim()) return message.text.trim();
  return message.type === 'text' ? 'Mensagem' : `[${message.type}]`;
}

function senderRoleLabel(role?: string | null) {
  if (role === 'owner') return 'Dono';
  if (role === 'admin') return 'Administrador';
  if (role === 'manager') return 'Gestor';
  if (role === 'agent') return 'Atendente';
  if (role === 'viewer') return 'Visualizador';
  return null;
}

/** "Camila · Atendente" for replies the AI wrote on WhatsApp (the team sees the same name the customer does). */
function aiSenderLabel(metadata: unknown) {
  const value = metadata && typeof metadata === 'object' ? metadata as Record<string, unknown> : {};
  if (typeof value.aiAgentName === 'string') return `${value.aiAgentName} · Atendente`;
  return typeof value.systemSenderLabel === 'string' ? value.systemSenderLabel : null;
}

function outboundSenderLabel(message: InboxMessageSummary) {
  if (message.direction !== 'outbound') return '';
  return message.sentByUser?.name || 'WhatsApp da empresa';
}

/** "há 3 h (16/10, 18:13)": how long ago the customer last wrote, and when. */
function lastCustomerMessageLabel(value: string) {
  const date = new Date(value);
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  const ago = minutes < 1 ? 'agora' : minutes < 60 ? `há ${minutes} min` : hours < 24 ? `há ${hours} h` : `há ${Math.floor(hours / 24)} d`;
  const when = date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return `${ago} (${when})`;
}

function formatListDate(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatMessageDate(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface SendableTemplate {
  name: string;
  language: string;
  category: string | null;
  body: string;
  /** The text this person would receive, with the variables filled in. */
  preview?: string;
}

const WHATSAPP_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Meta only accepts free text for someone who wrote in the last 24 hours. */
function isServiceWindowOpen(lastInboundAt: string | null) {
  if (!lastInboundAt) return false;
  const last = new Date(lastInboundAt).getTime();
  return Number.isFinite(last) && Date.now() - last < WHATSAPP_SERVICE_WINDOW_MS;
}

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  image: 'Foto', audio: 'Mensagem de voz', video: 'Vídeo', document: 'Documento', sticker: 'Figurinha',
  interactive: 'Resposta de botão', unknown: 'Mensagem em formato não suportado pela API (enquete, contato, localização ou similar)',
};

function messageMediaId(message: { metadata: unknown }) {
  const metadata = message.metadata && typeof message.metadata === 'object' ? message.metadata as Record<string, unknown> : {};
  return typeof metadata.mediaId === 'string' ? metadata.mediaId : null;
}

/** What was said in a voice note, when it was transcribed for the AI. */
function audioTranscript(metadata: unknown) {
  const value = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>).transcript : null;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Shows the photo, audio, video or document of a message, read from Meta when the bubble appears. */
function MessageMedia({ message, outbound }: { message: InboxMessage; outbound: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!messageMediaId(message)) return null;
  const metadata = message.metadata as Record<string, unknown>;
  const src = `/api/inbox/messages/${encodeURIComponent(message.id)}/media`;
  const fileName = typeof metadata.mediaFileName === 'string' ? metadata.mediaFileName : 'Documento';
  if (failed) {
    return <p className="mb-1 text-xs italic opacity-75">{MESSAGE_TYPE_LABELS[message.type] || 'Arquivo'} indisponível (a Meta guarda os arquivos por 30 dias).</p>;
  }
  if (message.type === 'image' || message.type === 'sticker') {
    return (
      <a href={src} target="_blank" rel="noreferrer" className="mb-1 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={message.type === 'sticker' ? 'Figurinha' : 'Foto enviada'} loading="lazy" onError={() => setFailed(true)}
          className={`${message.type === 'sticker' ? 'h-28 w-28 object-contain' : 'max-h-72 w-auto max-w-full rounded-lg object-cover'}`} />
      </a>
    );
  }
  if (message.type === 'audio') {
    return <audio controls preload="none" src={src} onError={() => setFailed(true)} className="mb-1 h-10 w-64 max-w-full" />;
  }
  if (message.type === 'video') {
    return <video controls preload="none" src={src} onError={() => setFailed(true)} className="mb-1 max-h-72 max-w-full rounded-lg" />;
  }
  return (
    <a href={`${src}?download=1`} className={`mb-1 flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${outbound ? 'border-white/30' : 'bg-muted/40'}`}>
      <span aria-hidden="true">📄</span>
      <span className="min-w-0 flex-1 truncate">{fileName}</span>
      <span className="shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium">Baixar</span>
    </a>
  );
}

/** Whether the AI is paused in a conversation now, counting the automatic return set for the number. */
function aiPaused(conversation: InboxConversation, resumeAfterHours: number | null) {
  if (!conversation.aiPausedAt) return false;
  if (conversation.aiPauseReason === 'resolved') return true;
  if (!resumeAfterHours) return true;
  return Date.now() - new Date(conversation.aiPausedAt).getTime() < resumeAfterHours * 3_600_000;
}

const AI_PAUSE_REASON_LABELS: Record<string, string> = {
  manual: 'assumida',
  human_reply_system: 'respondida pela equipe no FlipForm',
  human_reply_phone: 'respondida pelo celular',
  resolved: 'resolvida (atendimento humano)',
};

function AiStatus({ conversation, resumeAfterHours, canManage, busy, onChange }: {
  conversation: InboxConversation;
  resumeAfterHours: number | null;
  canManage: boolean;
  busy: boolean;
  onChange: (action: 'pause' | 'resume' | 'answer') => void;
}) {
  const paused = aiPaused(conversation, resumeAfterHours);
  if (!paused) {
    // The customer wrote last and nobody answered (e.g. the AI was off when the message arrived).
    const waiting = Boolean(conversation.lastInboundAt)
      && (!conversation.lastOutboundAt || new Date(conversation.lastOutboundAt) < new Date(conversation.lastInboundAt!));
    return (
      <div className="flex items-center gap-2">
        <span className="hidden rounded-full bg-violet-100 px-2 py-1 text-xs font-medium text-violet-800 sm:inline">🟢 IA atendendo</span>
        {canManage && waiting ? (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onChange('answer')}>
            {busy ? 'Enviando...' : 'Responder agora com a IA'}
          </Button>
        ) : null}
        {canManage ? (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onChange('pause')}>
            {busy ? 'Pausando...' : 'Pausar IA e assumir'}
          </Button>
        ) : null}
      </div>
    );
  }
  const when = conversation.aiPausedAt ? new Date(conversation.aiPausedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const how = AI_PAUSE_REASON_LABELS[conversation.aiPauseReason || ''] || 'pausada';
  const who = conversation.aiPausedByName ? ` por ${conversation.aiPausedByName}` : '';
  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-56 truncate rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700 sm:inline" title={`IA pausada: conversa ${how}${who} em ${when}`}>
        ⏸️ IA pausada · {how}{who} · {when}
      </span>
      {canManage ? (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onChange('resume')}>
          {busy ? 'Devolvendo...' : 'Devolver para a IA'}
        </Button>
      ) : null}
    </div>
  );
}

function aiChangeMessage(action: 'pause' | 'resume' | 'answer', reply: unknown) {
  if (action === 'pause') return 'IA pausada. A conversa está com a equipe.';
  const start = action === 'resume' ? 'Conversa devolvida para a IA. ' : '';
  if (reply === 'answering') return `${start}A IA vai responder a última mensagem do cliente em instantes.`;
  if (reply === 'window_closed') {
    return `${start}A última mensagem do cliente tem mais de 24 horas; o WhatsApp só permite responder com modelo aprovado. A IA responde quando o cliente escrever de novo.`;
  }
  return `${start}Não há mensagem pendente; a IA responde a próxima mensagem do cliente.`;
}

type ConversationOwner = { kind: 'mine' | 'other' | 'none'; name?: string };

/** Whose the conversation is: the person it was given to, or the one who has its lead. */
function conversationOwner(conversation: InboxConversation, userId: string): ConversationOwner {
  const leadOwner = conversation.lead?.assignedTo || null;
  if (conversation.assignedTo === userId || leadOwner === userId) return { kind: 'mine' };
  if (conversation.assignedTo) return { kind: 'other', name: conversation.assignee?.name };
  if (leadOwner) return { kind: 'other', name: conversation.lead?.assignedUser?.name };
  return { kind: 'none' };
}

function OwnerBadge({ owner }: { owner: ConversationOwner }) {
  if (owner.kind === 'mine') return <span className="rounded bg-emerald-600 px-1.5 py-0.5 font-semibold text-white">Sua</span>;
  if (owner.kind === 'none') return <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">Sem responsável</span>;
  return <span className="max-w-28 truncate rounded bg-slate-200 px-1.5 py-0.5 font-medium text-slate-700">Com {owner.name || 'outra pessoa'}</span>;
}

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `inbox-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Why Meta did not deliver the message, in plain Portuguese. */
function failureReason(metadata: unknown) {
  const value = metadata && typeof metadata === 'object' ? metadata as Record<string, unknown> : {};
  const code = typeof value.providerErrorCode === 'string' ? value.providerErrorCode : null;
  const title = typeof value.providerErrorTitle === 'string' ? value.providerErrorTitle : null;
  return whatsappFailureText(code, title);
}

function MessageStatus({ status }: { status: string }) {
  if (status === 'read') return <CheckCheck className="h-3.5 w-3.5" aria-label="Lida" />;
  if (status === 'delivered') return <CheckCheck className="h-3.5 w-3.5 opacity-75" aria-label="Entregue" />;
  if (status === 'sent') return <Check className="h-3.5 w-3.5" aria-label="Enviada" />;
  if (status === 'failed') return <AlertCircle className="h-3.5 w-3.5" aria-label="Falha" />;
  return <Clock3 className="h-3.5 w-3.5 opacity-75" aria-label="Pendente" />;
}

export function InboxClient({
  canManage,
  canAssign,
  canSendWhatsApp,
  currentUserId,
}: {
  canManage: boolean;
  canAssign: boolean;
  canSendWhatsApp: boolean;
  currentUserId: string;
}) {
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [search, setSearch] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [onlyLeads, setOnlyLeads] = useState(false);
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [onlyAi, setOnlyAi] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [whatsappAi, setWhatsappAi] = useState<{ enabled: boolean; resumeAfterHours: number | null }>({ enabled: false, resumeAfterHours: null });
  const [changingAi, setChangingAi] = useState(false);
  const [leadModal, setLeadModal] = useState<{ leadId: string; stages: any[] } | null>(null);
  const [openingLead, setOpeningLead] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; conversationId: string; unread: boolean } | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [templates, setTemplates] = useState<SendableTemplate[] | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templateKey, setTemplateKey] = useState('');
  const [templatesFor, setTemplatesFor] = useState<string | null>(null);
  const [templateConsent, setTemplateConsent] = useState<'granted' | 'not_recorded' | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const requestedConversationIdRef = useRef<string | null>(null);
  const templatesRequestRef = useRef<string | null>(null);

  const selected = conversations.find((conversation) => conversation.id === selectedId) || null;
  const selectedChannelCanSend = selected?.channel === 'whatsapp' ? canSendWhatsApp : false;
  const needsTemplate = Boolean(selected && selected.channel === 'whatsapp' && selectedChannelCanSend
    && !isServiceWindowOpen(selected.lastInboundAt));
  const chosenTemplate = templates?.find((template) => `${template.name}:${template.language}` === templateKey) || null;

  useEffect(() => {
    if (!needsTemplate || !selected || templatesFor === selected.id) return;
    const conversationId = selected.id;
    // Only the latest request counts. This is not tied to the effect's cleanup: the effect runs
    // again right away because templatesFor changes, and that used to discard the answer.
    templatesRequestRef.current = conversationId;
    setTemplatesFor(conversationId);
    setTemplates(null);
    setTemplatesError(null);
    (async () => {
      try {
        // The previews are filled in for this conversation: name, date of the lead and company.
        const response = await fetch(`/api/inbox/whatsapp-templates?conversationId=${encodeURIComponent(conversationId)}`, { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (templatesRequestRef.current !== conversationId) return;
        if (!response.ok) {
          setTemplatesError(data.error || 'Não foi possível carregar os modelos do WhatsApp.');
          setTemplates([]);
          return;
        }
        const loaded: SendableTemplate[] = Array.isArray(data.templates) ? data.templates : [];
        setTemplateConsent(data.consent === 'granted' ? 'granted' : 'not_recorded');
        setTemplates(loaded);
        setTemplatesError(null);
        if (loaded[0]) setTemplateKey(`${loaded[0].name}:${loaded[0].language}`);
      } catch {
        if (templatesRequestRef.current === conversationId) {
          setTemplatesError('Não foi possível carregar os modelos do WhatsApp.');
          setTemplates([]);
        }
      }
    })();
  }, [needsTemplate, selected, templatesFor]);

  const unreadTotal = conversations.filter((conversation) => conversation.unreadCount > 0).length;
  const unassignedTotal = conversations.filter((conversation) => conversationOwner(conversation, currentUserId).kind === 'none').length;
  const leadTotal = conversations.filter((conversation) => conversation.lead).length;
  // With the AI: WhatsApp conversations where the AI is on and not paused by the team.
  const withAi = (conversation: InboxConversation) => whatsappAi.enabled && conversation.channel === 'whatsapp'
    && conversation.aiActive !== false && !aiPaused(conversation, whatsappAi.resumeAfterHours);
  const aiTotal = conversations.filter(withAi).length;
  const filteredConversations = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    // Unread and "with lead" combine: unread conversations of leads only.
    const scoped = conversations.filter((conversation) => (!onlyUnread || conversation.unreadCount > 0) && (!onlyLeads || conversation.lead)
      && (!onlyUnassigned || conversationOwner(conversation, currentUserId).kind === 'none')
      && (!onlyAi || withAi(conversation)));
    if (!term) return scoped;
    return scoped.filter((conversation) => {
      const haystack = [
        contactName(conversation),
        conversation.externalContactIdentity.phone,
        conversation.externalContactIdentity.username,
        conversation.externalContactIdentity.externalUserId,
        conversation.lead?.email,
        lastMessageText(conversation),
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('pt-BR');
      return haystack.includes(term);
    });
  }, [conversations, search, onlyUnread, onlyLeads, onlyUnassigned, onlyAi, whatsappAi, currentUserId]);

  // Opens the card of the lead linked to the conversation; a conversation without a lead is
  // matched by phone first, so the attendant reaches the lead in one click.
  async function openLead(conversation: InboxConversation) {
    if (openingLead) return;
    setOpeningLead(true);
    try {
      let leadId = conversation.lead?.id || null;
      let pipelineId = conversation.lead?.pipelineId || null;
      if (!leadId) {
        const response = await fetch(`/api/inbox/conversations/${encodeURIComponent(conversation.id)}/match-lead`, { method: 'POST' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Nenhum lead vinculado a esta conversa.');
        leadId = data.leadId;
        pipelineId = data.pipelineId || null;
        void loadConversations(true);
      }
      const pipelines = await fetch('/api/pipelines', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ pipelines: [] }));
      const pipeline = (pipelines.pipelines || []).find((item: any) => item.id === pipelineId) || pipelines.pipelines?.[0];
      if (leadId) setLeadModal({ leadId, stages: pipeline?.stages || [] });
    } catch (openError) {
      toast.info(openError instanceof Error ? openError.message : 'Não foi possível abrir o lead.');
    } finally {
      setOpeningLead(false);
    }
  }

  async function markUnread(conversationId: string) {
    setContextMenu(null);
    const response = await fetch(`/api/inbox/conversations/${encodeURIComponent(conversationId)}/unread`, { method: 'POST' }).catch(() => null);
    if (!response?.ok) {
      toast.error('Não foi possível marcar como não lida.');
      return;
    }
    // Leaving the conversation keeps it unread: an open conversation is marked read again.
    if (selectedIdRef.current === conversationId) selectConversation(null);
    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId ? { ...conversation, unreadCount: Math.max(1, conversation.unreadCount) } : conversation
    )));
  }

  async function markReadFromMenu(conversationId: string) {
    setContextMenu(null);
    await markRead(conversationId);
  }

  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', close);
    };
  }, [contextMenu]);

  function selectConversation(conversationId: string | null) {
    selectedIdRef.current = conversationId;
    setMessages([]);
    setLoadingMessages(Boolean(conversationId));
    setDraft('');
    setError(null);
    setWarning(null);
    setSelectedId(conversationId);
  }

  async function loadConversations(silent = false) {
    if (!silent) setLoadingConversations(true);
    try {
      const response = await fetch('/api/inbox/conversations', { cache: 'no-store' });
      if (!response.ok) throw new Error('Não foi possível carregar as conversas.');
      const data = await response.json();
      const all = Array.isArray(data.conversations) ? data.conversations as InboxConversation[] : [];
      let next = all.filter((conversation) => conversation.channel === 'whatsapp');
      if (data.whatsappAi && typeof data.whatsappAi.enabled === 'boolean') setWhatsappAi(data.whatsappAi);
      const requestedId = requestedConversationIdRef.current;
      // A conversation just started from a lead has no message yet, so it is not among the most
      // recent ones; keep the open one on the list instead of jumping to another conversation.
      const keepId = requestedId || selectedIdRef.current;

      if (keepId && !next.some((conversation) => conversation.id === keepId)) {
        const directResponse = await fetch(`/api/inbox/conversations/${encodeURIComponent(keepId)}/messages`, { cache: 'no-store' });
        if (directResponse.ok) {
          const directData = await directResponse.json();
          const directConversation = directData.conversation as Omit<InboxConversation, 'messages'> | undefined;
          const directMessages = Array.isArray(directData.messages) ? directData.messages as InboxMessage[] : [];
          if (directConversation?.channel === 'whatsapp') {
            const latestMessage = directMessages[directMessages.length - 1];
            next = [{
              ...directConversation,
              messages: latestMessage ? [latestMessage] : [],
            }, ...next];
          }
        }
      }

      setConversations(next);
      setSelectedId((current) => {
        const requestedExists = Boolean(requestedId && next.some((conversation) => conversation.id === requestedId));
        const nextId = requestedExists
          ? requestedId
          : current && next.some((conversation) => conversation.id === current)
            ? current
            : next[0]?.id || null;
        if (requestedExists) requestedConversationIdRef.current = null;
        if (nextId !== current) {
          selectedIdRef.current = nextId;
          setMessages([]);
          setLoadingMessages(Boolean(nextId));
          setDraft('');
          setError(null);
          setWarning(null);
        }
        return nextId;
      });
    } catch (loadError) {
      if (!silent) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as conversas.');
    } finally {
      if (!silent) setLoadingConversations(false);
    }
  }

  async function loadMessages(conversationId: string, silent = false) {
    if (!silent) setLoadingMessages(true);
    try {
      const response = await fetch(`/api/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Não foi possível carregar as mensagens.');
      const data = await response.json();
      if (selectedIdRef.current !== conversationId) return;
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (loadError) {
      if (!silent && selectedIdRef.current === conversationId) {
        setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as mensagens.');
      }
    } finally {
      if (!silent && selectedIdRef.current === conversationId) setLoadingMessages(false);
    }
  }

  async function changeAi(conversationId: string, action: 'pause' | 'resume' | 'answer') {
    setChangingAi(true);
    try {
      const response = await fetch(`/api/inbox/conversations/${encodeURIComponent(conversationId)}/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) toast.error(data.error || 'Não foi possível alterar o atendimento da IA.');
      else toast.success(aiChangeMessage(action, data.reply));
      await loadConversations(true);
    } finally {
      setChangingAi(false);
    }
  }

  async function claim(conversationId: string) {
    setClaiming(true);
    try {
      const response = await fetch(`/api/inbox/conversations/${encodeURIComponent(conversationId)}/claim`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) toast.error(data.error || 'Não foi possível assumir a conversa.');
      else toast.success('Conversa assumida. Agora ela é sua.');
      await loadConversations(true);
    } finally {
      setClaiming(false);
    }
  }

  async function markRead(conversationId: string) {
    if (!canManage) return;
    const response = await fetch(`/api/inbox/conversations/${encodeURIComponent(conversationId)}/read`, {
      method: 'POST',
    }).catch(() => null);
    if (!response?.ok) return;
    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation
    )));
    // The message icon in the top bar updates right away.
    window.dispatchEvent(new Event('flipform:inbox-read'));
  }

  useEffect(() => {
    requestedConversationIdRef.current = new URLSearchParams(window.location.search).get('conversationId')?.trim() || null;
    void loadConversations();
    const timer = window.setInterval(() => void loadConversations(true), 12_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setLoadingMessages(false);
      setDraft('');
      return;
    }

    setMessages([]);
    setLoadingMessages(true);
    setDraft('');
    setError(null);
    setWarning(null);
    void loadMessages(selectedId);
    void markRead(selectedId);
    const timer = window.setInterval(() => void loadMessages(selectedId, true), 5_000);
    return () => window.clearInterval(timer);
  }, [selectedId, canManage]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, selectedId]);

  async function sendMessage() {
    if (!selected || sending || selected.channel !== 'whatsapp' || !canSendWhatsApp) return;

    const conversationId = selected.id;
    const text = draft.trim();
    if (!text) return;

    setSending(true);
    setError(null);
    setWarning(null);
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          idempotencyKey: createIdempotencyKey(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 202) {
        throw new Error(data.error || 'Não foi possível enviar a mensagem.');
      }

      if (selectedIdRef.current === conversationId) {
        setDraft('');
        if (response.status === 202) {
          setWarning(data.warning || 'O status do envio ainda está sendo confirmado. O Flipform não repetirá o envio automaticamente.');
        }
      }
      await Promise.all([
        loadMessages(conversationId, true),
        loadConversations(true),
      ]);
    } catch (sendError) {
      if (selectedIdRef.current === conversationId) {
        setError(sendError instanceof Error ? sendError.message : 'Não foi possível enviar a mensagem.');
      }
    } finally {
      setSending(false);
    }
  }

  /** Sends a recorded voice note; returns whether it went out (to clear the recorder). */
  async function sendAudio(audio: Blob) {
    if (!selected || selected.channel !== 'whatsapp' || !canSendWhatsApp) return false;
    const conversationId = selected.id;
    setError(null);
    setWarning(null);
    try {
      const form = new FormData();
      form.append('audio', audio, 'audio');
      form.append('idempotencyKey', createIdempotencyKey());
      const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages/whatsapp-audio`, { method: 'POST', body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 202) throw new Error(data.error || 'Não foi possível enviar o áudio.');
      if (response.status === 202 && selectedIdRef.current === conversationId) {
        setWarning(data.warning || 'O status do envio ainda está sendo confirmado.');
      }
      await Promise.all([loadMessages(conversationId, true), loadConversations(true)]);
      return true;
    } catch (sendError) {
      if (selectedIdRef.current === conversationId) {
        setError(sendError instanceof Error ? sendError.message : 'Não foi possível enviar o áudio.');
      }
      return false;
    }
  }

  async function sendTemplate() {
    if (!selected || sending || !needsTemplate || !chosenTemplate) return;
    const conversationId = selected.id;
    setSending(true);
    setError(null);
    setWarning(null);
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages/whatsapp-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateName: chosenTemplate.name,
          language: chosenTemplate.language,
          idempotencyKey: createIdempotencyKey(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 202) {
        throw new Error(data.error || 'Não foi possível enviar o modelo.');
      }
      if (selectedIdRef.current === conversationId && response.status === 202) {
        setWarning(data.warning || 'O status do envio ainda está sendo confirmado. O Flipform não repetirá o envio automaticamente.');
      }
      await Promise.all([
        loadMessages(conversationId, true),
        loadConversations(true),
      ]);
    } catch (sendError) {
      if (selectedIdRef.current === conversationId) {
        setError(sendError instanceof Error ? sendError.message : 'Não foi possível enviar o modelo.');
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="h-[calc(100vh-4rem)] min-h-[520px] bg-muted/20 p-0 md:p-4">
      <div className="mx-auto flex h-full max-w-[1600px] overflow-hidden border bg-card shadow-sm md:rounded-xl">
        <section className={`${selectedId ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r md:w-[360px]`}>
          <div className="border-b p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h1 className="font-heading text-lg font-semibold">Conversas</h1>
                <p className="text-xs text-muted-foreground">Atendimento do WhatsApp em uma única Inbox.</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void loadConversations()}
                disabled={loadingConversations}
                aria-label="Atualizar conversas"
              >
                <RefreshCw className={`h-4 w-4 ${loadingConversations ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar contato ou mensagem"
                className="pl-9"
              />
            </div>
            {/* Compact chips that wrap to a second line instead of being cut off. */}
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar conversas">
              <Button type="button" size="sm" className="h-7 rounded-full px-3" variant={onlyUnread || onlyLeads || onlyUnassigned || onlyAi ? 'outline' : 'default'}
                onClick={() => { setOnlyUnread(false); setOnlyLeads(false); setOnlyUnassigned(false); setOnlyAi(false); }}>Todas</Button>
              <Button type="button" size="sm" className="h-7 rounded-full px-3" variant={onlyUnread ? 'default' : 'outline'} onClick={() => setOnlyUnread((value) => !value)}>
                Não lidas{unreadTotal ? ` (${unreadTotal})` : ''}
              </Button>
              {whatsappAi.enabled ? (
                <Button type="button" size="sm" className="h-7 rounded-full px-3" variant={onlyAi ? 'default' : 'outline'} onClick={() => setOnlyAi((value) => !value)}
                  title="Conversas que a IA está atendendo agora (não pausadas pela equipe)">
                  Com a IA ({aiTotal})
                </Button>
              ) : null}
              {unassignedTotal > 0 || onlyUnassigned ? (
                <Button type="button" size="sm" className="h-7 rounded-full px-3" variant={onlyUnassigned ? 'default' : 'outline'} onClick={() => setOnlyUnassigned((value) => !value)}>
                  Sem responsável ({unassignedTotal})
                </Button>
              ) : null}
              <Button type="button" size="sm" className="h-7 rounded-full px-3" variant={onlyLeads ? 'default' : 'outline'} onClick={() => setOnlyLeads((value) => !value)}
                title="Só conversas de contatos que são leads no sistema">
                Com lead{leadTotal ? ` (${leadTotal})` : ''}
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingConversations && conversations.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Carregando conversas...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                <MessageSquareText className="h-9 w-9 opacity-40" />
                <div className="text-sm font-medium text-foreground">{onlyUnread && !search.trim() ? 'Nenhuma conversa não lida' : 'Nenhuma conversa encontrada'}</div>
                <div className="max-w-56 text-xs">{onlyUnread && !search.trim() ? 'Você está em dia com as mensagens.' : onlyLeads ? 'Nenhuma conversa com lead vinculado neste filtro.' : 'As novas mensagens recebidas pelo WhatsApp conectado aparecerão aqui.'}</div>
              </div>
            ) : (
              filteredConversations.map((conversation) => {
                const last = conversation.messages[0];
                const active = conversation.id === selectedId;
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => selectConversation(conversation.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setContextMenu({ x: event.clientX, y: event.clientY, conversationId: conversation.id, unread: conversation.unreadCount > 0 });
                    }}
                    className={`flex w-full gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/60 ${active ? 'bg-brand-50/70' : ''}`}
                  >
                    <div className="mt-0.5"><ContactAvatar conversation={conversation} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{contactName(conversation)}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatListDate(last?.providerTimestamp || last?.createdAt || conversation.lastMessageAt)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                          {last?.direction === 'outbound' ? `${outboundSenderLabel(last)}: ` : ''}{lastMessageText(conversation)}
                        </span>
                        {conversation.unreadCount > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white">
                            {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        {withAi(conversation) ? (
                          <span className="rounded bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-800" title="A IA está atendendo esta conversa">IA</span>
                        ) : null}
                        <OwnerBadge owner={conversationOwner(conversation, currentUserId)} />
                        {conversation.lead ? (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800" title={`Lead: ${conversation.lead.name}`}>Lead</span>
                        ) : (
                          <span className="rounded bg-muted px-1.5 py-0.5">Sem lead</span>
                        )}
                        <span>WhatsApp</span>
                        {conversation.assignee?.name && <><span>•</span><span className="truncate">{conversation.assignee.name}</span></>}
                        {conversation.status === 'resolved' && <><span>•</span><span>resolvida</span></>}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className={`${selectedId ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
          {!selected ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
              <MessageSquareText className="h-12 w-12 opacity-30" />
              <div>
                <div className="font-medium text-foreground">Selecione uma conversa</div>
                <p className="mt-1 text-sm">O histórico aparecerá aqui.</p>
              </div>
            </div>
          ) : (
            <>
              <header className="flex min-h-16 items-center gap-3 border-b px-3 py-2 md:px-5">
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => selectConversation(null)} aria-label="Voltar para conversas">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <button type="button" onClick={() => void openLead(selected)} disabled={openingLead}
                  title={selected.lead ? 'Abrir a ficha do lead' : 'Procurar o lead deste telefone'}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left hover:bg-muted/60">
                  <ContactAvatar conversation={selected} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{contactName(selected)}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {selected.externalContactIdentity.phone || selected.externalContactIdentity.username || selected.externalContactIdentity.externalUserId}
                      {selected.lead ? ` • Lead: ${selected.lead.name}` : ' • Sem lead vinculado'}
                      <span className="text-brand-700">{openingLead ? ' • abrindo...' : selected.lead ? ' • ver lead' : ' • procurar lead'}</span>
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {selected.lastInboundAt
                        ? `Última mensagem do cliente ${lastCustomerMessageLabel(selected.lastInboundAt)}`
                        : 'O cliente ainda não enviou mensagem'}
                    </div>
                  </div>
                </button>
                {whatsappAi.enabled && selected.channel === 'whatsapp' && selected.aiActive === false ? (
                  <span className="hidden rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 sm:inline"
                    title="A IA não atende este contato (está desligada para ele ou só atende os números de teste). A conversa é da equipe.">
                    👤 Atendimento humano
                  </span>
                ) : null}
                {whatsappAi.enabled && selected.channel === 'whatsapp' && selected.aiActive !== false ? (
                  <AiStatus conversation={selected} resumeAfterHours={whatsappAi.resumeAfterHours} canManage={canManage}
                    busy={changingAi} onChange={(action) => void changeAi(selected.id, action)} />
                ) : null}
                {conversationOwner(selected, currentUserId).kind === 'none' && canManage ? (
                  <Button type="button" size="sm" onClick={() => void claim(selected.id)} disabled={claiming}>
                    {claiming ? 'Assumindo...' : 'Assumir'}
                  </Button>
                ) : null}
                <div className="hidden text-right text-xs text-muted-foreground sm:block">
                  <div className="capitalize">{selected.status}</div>
                  {selected.assignee?.name && <div className="max-w-40 truncate">{selected.assignee.name}</div>}
                </div>
                <ConversationActions
                  conversationId={selected.id}
                  status={selected.status}
                  lead={selected.lead}
                  assignee={selected.assignee}
                  canManage={canManage}
                  canAssign={canAssign}
                  onChanged={() => loadConversations(true)}
                />
              </header>

              {selected.lead ? (
                <div className="border-b px-3 py-2 md:px-5"><StageSuggestionBanner key={selected.lead.id} leadId={selected.lead.id} /></div>
              ) : null}
              <div className="flex-1 overflow-y-auto bg-muted/20 px-3 py-4 md:px-6">
                {loadingMessages && messages.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">Carregando mensagens...</div>
                ) : messages.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">Ainda não há mensagens nesta conversa.</div>
                ) : (
                  <div className="mx-auto flex max-w-4xl flex-col gap-2.5">
                    {messages.map((message) => {
                      const outbound = message.direction === 'outbound';
                      return (
                        <div key={message.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm md:max-w-[72%] ${outbound ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md border bg-card text-foreground'} ${message.status === 'failed' ? 'ring-1 ring-red-400' : ''}`}>
                            {outbound && (
                              <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-white/90">
                                <span className="max-w-44 truncate rounded-full bg-white/15 px-2 py-0.5 font-medium">
                                  {message.sentByUser?.name || aiSenderLabel(message.metadata) || 'WhatsApp da empresa'}
                                </span>
                                {senderRoleLabel(message.sentByUser?.role) && (
                                  <span className="opacity-80">• {senderRoleLabel(message.sentByUser?.role)}</span>
                                )}
                              </div>
                            )}
                            <MessageMedia message={message} outbound={outbound} />
                            {message.type === 'audio' && audioTranscript(message.metadata) ? (
                              <p className={`mb-1 whitespace-pre-wrap break-words text-xs italic ${outbound ? 'text-white/85' : 'text-muted-foreground'}`}>
                                Transcrição: “{audioTranscript(message.metadata)}”
                              </p>
                            ) : null}
                            {message.text && !(message.type === 'audio' && message.text === '🎤 Áudio') ? (
                              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text}</p>
                            ) : !messageMediaId(message) ? (
                              <p className="text-sm italic opacity-75">{MESSAGE_TYPE_LABELS[message.type] || 'Mensagem sem texto'}</p>
                            ) : null}
                            <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${outbound ? 'text-white/75' : 'text-muted-foreground'}`}>
                              <span>{formatMessageDate(message.providerTimestamp || message.createdAt)}</span>
                              {outbound && <MessageStatus status={message.status} />}
                            </div>
                            {outbound && message.status === 'failed' && (
                              <p className="mt-1 rounded bg-red-900/30 px-2 py-1 text-[11px] text-white">⚠️ {failureReason(message.metadata)}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={endRef} />
                  </div>
                )}
              </div>

              <footer className="border-t bg-card p-3 md:p-4">
                <div className="mx-auto max-w-4xl">
                  {error && (
                    <div className="mb-2 flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                  {warning && (
                    <div className="mb-2 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{warning}</span>
                    </div>
                  )}

                  {selected.channel !== 'whatsapp' ? (
                    <div className="rounded-md border border-dashed px-4 py-3 text-center text-sm text-muted-foreground">
                      O envio está disponível somente para o WhatsApp no FlipForm.
                    </div>
                  ) : !selectedChannelCanSend ? (
                    <div className="rounded-md border border-dashed px-4 py-3 text-center text-sm text-muted-foreground">
                      Seu perfil possui acesso somente de leitura para esta conversa.
                    </div>
                  ) : needsTemplate ? (
                    <div className="rounded-md border bg-muted/30 p-3">
                      <p className="text-sm font-medium">Inicie a conversa com um modelo aprovado</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Esta pessoa não escreveu nas últimas 24 horas, e o WhatsApp só aceita um modelo aprovado como primeira mensagem. Quando ela responder, você escreve livremente por aqui.
                      </p>
                      {templates === null ? (
                        <p className="mt-3 text-sm text-muted-foreground">Carregando modelos...</p>
                      ) : templates.length === 0 ? (
                        <p className="mt-3 text-sm text-amber-800">
                          {templatesError || 'Nenhum modelo aprovado disponível. Crie um modelo sem variáveis em Integrações e aguarde a aprovação da Meta.'}
                        </p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          <select
                            value={templateKey}
                            onChange={(event) => setTemplateKey(event.target.value)}
                            disabled={sending}
                            aria-label="Modelo de mensagem"
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          >
                            {templates.map((template) => (
                              <option key={`${template.name}:${template.language}`} value={`${template.name}:${template.language}`}>
                                {template.name} ({template.language})
                              </option>
                            ))}
                          </select>
                          {chosenTemplate && (
                            <p className="whitespace-pre-wrap rounded-md border bg-background px-3 py-2 text-sm">{chosenTemplate.preview || chosenTemplate.body}</p>
                          )}
                          {templateConsent === 'granted' ? (
                            <p className="text-xs text-emerald-700">Este lead autorizou contato pelo WhatsApp ao enviar o formulário.</p>
                          ) : templateConsent === 'not_recorded' ? (
                            <p className="text-xs text-amber-800">Não há autorização de WhatsApp registrada para este contato (ele não veio de formulário).</p>
                          ) : null}
                          <Button type="button" onClick={() => void sendTemplate()} disabled={sending || !chosenTemplate}>
                            {sending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                            Enviar modelo
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-end gap-2">
                      <textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            void sendMessage();
                          }
                        }}
                        maxLength={4096}
                        rows={2}
                        placeholder="Digite uma mensagem..."
                        className="min-h-[44px] max-h-36 flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={sending}
                      />
                      <VoiceRecorder disabled={sending || !canSendWhatsApp} onSend={sendAudio} />
                      <Button
                        type="button"
                        size="icon"
                        className="h-11 w-11 shrink-0"
                        onClick={() => void sendMessage()}
                        disabled={sending || !draft.trim()}
                        aria-label="Enviar mensagem pelo WhatsApp"
                      >
                        {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}
                </div>
              </footer>
            </>
          )}
        </section>
      </div>
      {contextMenu && (
        <div role="menu" className="fixed z-50 min-w-48 rounded-md border bg-popover p-1 text-sm shadow-md"
          style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          {contextMenu.unread ? (
            <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left hover:bg-muted" onClick={() => void markReadFromMenu(contextMenu.conversationId)}>Marcar como lida</button>
          ) : (
            <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left hover:bg-muted" onClick={() => void markUnread(contextMenu.conversationId)}>Marcar como não lida</button>
          )}
        </div>
      )}
      {leadModal && (
        <LeadDetailModal leadId={leadModal.leadId} stages={leadModal.stages} onClose={() => setLeadModal(null)} onChange={() => void loadConversations(true)} />
      )}
    </div>
  );
}
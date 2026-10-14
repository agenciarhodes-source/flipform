'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageSquareWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Waiting = { id: string; contact: string; assignee: string | null; waitingSince: string | null };

function waitedFor(since: string | null) {
  if (!since) return '';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 60_000));
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `há ${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
}

/** Shows, next to the bell, the people waiting for an answer in the Inbox. Hidden when nobody is. */
export function UnansweredConversationsAlert() {
  const [conversations, setConversations] = useState<Waiting[]>([]);
  const [total, setTotal] = useState(0);
  const [afterMinutes, setAfterMinutes] = useState(15);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/inbox/unanswered', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        setConversations(Array.isArray(data.conversations) ? data.conversations : []);
        setTotal(typeof data.total === 'number' ? data.total : 0);
        if (typeof data.afterMinutes === 'number') setAfterMinutes(data.afterMinutes);
      } catch {
        // The alert is a helper: a failed check simply leaves it as it was.
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  if (total === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`${total} conversa(s) aguardando resposta`}>
          <MessageSquareWarning className="h-5 w-5 text-amber-600" />
          <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-[18px] text-white">
            {total > 9 ? '9+' : total}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px] max-w-[calc(100vw-24px)] p-0">
        <div className="p-3">
          <DropdownMenuLabel className="p-0">Aguardando resposta</DropdownMenuLabel>
          <p className="text-xs text-muted-foreground">Pessoas que escreveram há mais de {afterMinutes} minutos e ainda não foram respondidas.</p>
        </div>
        <DropdownMenuSeparator className="m-0" />
        <ul className="max-h-80 overflow-y-auto">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link href={`/inbox?conversationId=${encodeURIComponent(conversation.id)}`}
                className="block px-3 py-2 text-sm hover:bg-muted">
                <span className="font-medium">{conversation.contact}</span>
                <span className="block text-xs text-muted-foreground">
                  {waitedFor(conversation.waitingSince)} • {conversation.assignee ? `Responsável: ${conversation.assignee}` : 'Sem responsável'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

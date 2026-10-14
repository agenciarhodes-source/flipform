'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlarmClock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type DueTask = { id: string; title: string; dueDate: string | null; leadId: string | null; leadName: string | null };

const NOTIFIED_KEY = 'flipform:task-reminders-notified';

function readNotified(): string[] {
  try {
    const raw = window.localStorage.getItem(NOTIFIED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeNotified(keys: string[]) {
  try {
    window.localStorage.setItem(NOTIFIED_KEY, JSON.stringify(keys.slice(-200)));
  } catch {
    // Private windows may refuse storage: the reminder still shows in the list.
  }
}

function when(dueDate: string | null) {
  if (!dueDate) return '';
  const minutes = Math.round((new Date(dueDate).getTime() - Date.now()) / 60_000);
  if (minutes > 0) return minutes < 60 ? `em ${minutes} min` : `em ${Math.round(minutes / 60)} h`;
  if (minutes === 0) return 'agora';
  return `atrasada há ${-minutes} min`;
}

function link(task: DueTask) {
  return task.leadId ? `/leads?leadId=${encodeURIComponent(task.leadId)}` : '/leads';
}

/** Reminds the signed-in person of tasks about to fall due, in the page and as a browser notification. */
export function TaskReminderAlert() {
  const [tasks, setTasks] = useState<DueTask[]>([]);
  const notifiedRef = useRef<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/tasks/reminders', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        const due: DueTask[] = Array.isArray(data.tasks) ? data.tasks : [];
        setTasks(due);

        // Each reminder is announced once per due time, even across page reloads.
        if (notifiedRef.current === null) notifiedRef.current = readNotified();
        const fresh = due.filter((task) => !notifiedRef.current!.includes(`${task.id}:${task.dueDate}`));
        for (const task of fresh) {
          const body = `${task.title}${task.leadName ? ` • ${task.leadName}` : ''} (${when(task.dueDate)})`;
          toast.info(`Lembrete de tarefa: ${body}`, { duration: 15_000 });
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              const notification = new Notification('Lembrete de tarefa', { body, tag: `task-${task.id}` });
              notification.onclick = () => { window.focus(); window.location.assign(link(task)); };
            } catch {
              // Some browsers only allow notifications from a service worker: the toast is enough.
            }
          }
        }
        if (fresh.length) {
          notifiedRef.current = [...notifiedRef.current, ...fresh.map((task) => `${task.id}:${task.dueDate}`)];
          writeNotified(notifiedRef.current);
        }
      } catch {
        // A failed check is tried again on the next round.
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  if (tasks.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`${tasks.length} lembrete(s) de tarefa`}>
          <AlarmClock className="h-5 w-5 text-brand-700" />
          <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-brand-600 px-1 text-[10px] font-semibold leading-[18px] text-white">
            {tasks.length > 9 ? '9+' : tasks.length}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px] max-w-[calc(100vw-24px)] p-0">
        <div className="p-3">
          <DropdownMenuLabel className="p-0">Tarefas chegando</DropdownMenuLabel>
          <p className="text-xs text-muted-foreground">Suas tarefas pendentes dentro do horário de aviso escolhido.</p>
        </div>
        <DropdownMenuSeparator className="m-0" />
        <ul className="max-h-80 overflow-y-auto">
          {tasks.map((task) => (
            <li key={task.id}>
              <Link href={link(task)} className="block px-3 py-2 text-sm hover:bg-muted">
                <span className="font-medium">{task.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {when(task.dueDate)}{task.leadName ? ` • ${task.leadName}` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

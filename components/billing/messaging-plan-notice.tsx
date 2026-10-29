import Link from 'next/link';
import { MESSAGING_PLAN_REQUIRED_MESSAGE } from '@/lib/billing/plan-access';

/** Shown in the Inbox and the Direct to companies below the Pro plan. */
export function MessagingPlanNotice({ channel }: { channel: 'whatsapp' | 'instagram' }) {
  return (
    <div className="mx-auto mt-16 max-w-lg rounded-xl border bg-card p-8 text-center shadow-sm">
      <h1 className="font-heading text-xl font-semibold">{channel === 'instagram' ? 'Direct' : 'Inbox'}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{MESSAGING_PLAN_REQUIRED_MESSAGE}</p>
      <p className="mt-1 text-sm text-muted-foreground">No plano Premium, a IA também responde no WhatsApp, no Instagram e no chat do site.</p>
      <Link href="/billing" className="mt-6 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Ver planos</Link>
    </div>
  );
}

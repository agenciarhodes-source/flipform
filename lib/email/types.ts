export type EmailTemplateName =
  | 'plan_activated'
  | 'payment_received'
  | 'payment_pending'
  | 'payment_overdue'
  | 'subscription_canceled'
  | 'tenant_invite'
  | 'deletion_request_received';

export type TemplateParams = Record<string, string | number | null | undefined>;

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

export type SendTransactionalEmailInput = {
  to: string;
  template: EmailTemplateName;
  params: TemplateParams;
};

export type SendTransactionalEmailResult =
  | { ok: true; skipped?: false }
  | { ok: false; skipped: true; reason: 'EMAIL_PROVIDER_NOT_CONFIGURED' }
  | { ok: false; skipped?: false; reason: 'SEND_FAILED'; error?: string };

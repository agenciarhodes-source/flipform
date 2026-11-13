/**
 * Plano Inbox (R$ 397): only the WhatsApp attendance. The company sees the Inbox, connects its
 * official numbers and their message templates (Integrações), its team (Usuários) and its billing
 * (Financeiro). Every other module is hidden from the menu, its pages send to the Inbox and its
 * APIs refuse. Pure rules, so they are easy to test.
 */

export const INBOX_PLAN_SLUG = 'inbox';

export function isInboxOnlyPlan(slug: string | null | undefined) {
  return String(slug || '').trim().toLowerCase() === INBOX_PLAN_SLUG;
}

/** Screens of the Plano Inbox. "/account" is the person's own profile and password. */
export const INBOX_PLAN_PAGES = ['/inbox', '/integrations', '/users', '/billing', '/account'] as const;

/** Where a company on the Plano Inbox lands (instead of the dashboard). */
export const INBOX_PLAN_HOME = '/inbox';

export function inboxPlanAllowsPath(pathname: string) {
  const path = String(pathname || '').split('?')[0];
  // The group screens follow the group's own access; the Plano Inbox does not change them.
  if (path === '/group' || path.startsWith('/group/')) return true;
  return INBOX_PLAN_PAGES.some((page) => path === page || path.startsWith(`${page}/`));
}

/**
 * Permissions of the modules outside the Plano Inbox. Leads stay readable because the Inbox links
 * a conversation to its lead; everything else of sales, capture, analysis and AI is refused.
 */
const BLOCKED_PREFIXES = [
  'FORMS_', 'PIPELINES_', 'KANBAN_', 'REPORTS_', 'DOMAINS_', 'PURCHASES_', 'LEAD_ASSIGNMENT_ROTATION_',
  'WHATSAPP_FUNNEL_', 'CONTRACTS_', 'FLIP_AI_', 'LEAD_ASSISTANT_', 'BRANDING_', 'DASHBOARD_', 'TEAM_PERFORMANCE_',
] as const;
/** Read by the Inbox itself: the funnels when a conversation becomes a lead, the assignee filter. */
const STILL_ALLOWED = new Set(['PIPELINES_VIEW', 'DASHBOARD_FILTER_BY_ASSIGNEE']);

export function inboxPlanBlocksPermission(permission: string) {
  if (STILL_ALLOWED.has(permission)) return false;
  return BLOCKED_PREFIXES.some((prefix) => permission.startsWith(prefix));
}

export const INBOX_PLAN_BLOCKED_MESSAGE = 'Este recurso não faz parte do Plano Inbox.';

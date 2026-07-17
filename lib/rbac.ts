// Cliente-safe: apenas constantes, tipos e funções puras. Sem imports server-only.
export type RoleName = 'owner' | 'admin' | 'manager' | 'agent' | 'viewer';
export type GlobalRoleName = 'platform_admin';

export const PLATFORM_ADMIN_LABEL_PT_BR = 'Super Admin';

export const ROLE_LABELS_PT_BR = {
  owner: 'Dono da empresa',
  admin: 'Administrador',
  manager: 'Gestor',
  agent: 'Atendente/Vendedor',
  viewer: 'Visualizador',
} as const satisfies Record<RoleName, string>;

export const ROLE_DESCRIPTIONS_PT_BR = {
  owner: 'Acesso total à empresa, usuários, relatórios, financeiro e configurações.',
  admin: 'Administra a operação da empresa, com acesso amplo, exceto ações críticas de propriedade.',
  manager: 'Gerencia a equipe comercial e acompanha performance, leads e tarefas.',
  agent: 'Atende e movimenta apenas os próprios leads atribuídos.',
  viewer: 'Acesso somente leitura, sem permissão para alterar dados.',
} as const satisfies Record<RoleName, string>;

export const ROLE_SHORT_DESCRIPTIONS_PT_BR = {
  owner: 'acesso total à empresa.',
  admin: 'gerencia operação e usuários abaixo dele.',
  manager: 'acompanha equipe comercial e funil.',
  agent: 'opera apenas seus próprios leads.',
  viewer: 'somente leitura.',
} as const satisfies Record<RoleName, string>;

export const ROLE_LEVEL = {
  viewer: 10,
  agent: 20,
  manager: 30,
  admin: 40,
  owner: 50,
} as const satisfies Record<RoleName, number>;

export function roleAtLeast(role: string, min: RoleName): boolean {
  return (ROLE_LEVEL[role as RoleName] ?? 0) >= ROLE_LEVEL[min];
}

export function hasAnyRole(role: string, roles: readonly RoleName[]): boolean {
  return roles.includes(role as RoleName);
}

export function hasRole(session: { role?: string | null } | null | undefined, roles: RoleName | readonly RoleName[]): boolean {
  if (!session?.role) return false;
  return (Array.isArray(roles) ? roles : [roles]).includes(session.role as RoleName);
}

export const PERMISSIONS = {
  DASHBOARD_VIEW_ALL: ['owner', 'admin', 'manager'],
  DASHBOARD_VIEW_OWN: ['agent'],
  DASHBOARD_VIEW_READONLY: ['viewer'],
  TEAM_PERFORMANCE_VIEW: ['owner', 'admin', 'manager'],
  DASHBOARD_FILTER_BY_ASSIGNEE: ['owner', 'admin', 'manager'],
  LEADS_VIEW_ALL: ['owner', 'admin', 'manager', 'viewer'],
  LEADS_VIEW_OWN: ['agent'],
  LEADS_CREATE: ['owner', 'admin', 'manager', 'agent'],
  LEADS_EDIT_ALL: ['owner', 'admin', 'manager'],
  LEADS_EDIT_OWN: ['agent'],
  LEADS_DELETE: ['owner', 'admin'],
  KANBAN_VIEW_ALL: ['owner', 'admin', 'manager', 'viewer'],
  KANBAN_VIEW_OWN: ['agent'],
  KANBAN_MOVE_ALL: ['owner', 'admin', 'manager'],
  KANBAN_MOVE_OWN: ['agent'],
  PURCHASES_VIEW_ALL: ['owner', 'admin', 'manager', 'viewer'],
  PURCHASES_VIEW_OWN: ['agent'],
  PURCHASES_CREATE_ALL: ['owner', 'admin', 'manager'],
  PURCHASES_CREATE_OWN: ['agent'],
  PURCHASES_EDIT_ALL: ['owner', 'admin', 'manager'],
  PURCHASES_EDIT_OWN: ['agent'],
  PURCHASES_DELETE: ['owner', 'admin'],
  FORMS_VIEW: ['owner', 'admin', 'manager', 'agent', 'viewer'],
  FORMS_CREATE: ['owner', 'admin'],
  FORMS_EDIT: ['owner', 'admin'],
  LEAD_ASSIGNMENT_ROTATION_VIEW: ['owner', 'admin', 'manager'],
  LEAD_ASSIGNMENT_ROTATION_MANAGE: ['owner', 'admin'],
  FORMS_DELETE: ['owner'],
  PIPELINES_VIEW: ['owner', 'admin', 'manager', 'agent', 'viewer'],
  PIPELINES_CREATE: ['owner', 'admin'],
  PIPELINES_EDIT: ['owner', 'admin'],
  PIPELINES_REORDER: ['owner', 'admin'],
  PIPELINES_DELETE: ['owner'],
  PIPELINES_MANAGE: ['owner', 'admin'],
  USERS_VIEW: ['owner', 'admin'],
  USERS_INVITE: ['owner', 'admin'],
  USERS_CREATE_DIRECT: ['owner', 'admin'],
  USERS_EDIT: ['owner', 'admin'],
  USERS_REMOVE: ['owner', 'admin'],
  USERS_UPDATE_ROLE: ['owner', 'admin'],
  USERS_CHANGE_ROLE: ['owner', 'admin'],
  USERS_DISABLE: ['owner', 'admin'],
  DOMAINS_VIEW: ['owner', 'admin'],
  DOMAINS_MANAGE: ['owner', 'admin'],
  INTEGRATIONS_VIEW: ['owner', 'admin'],
  INTEGRATIONS_MANAGE: ['owner', 'admin'],
  INTEGRATIONS_EDIT: ['owner', 'admin'],
  INTEGRATIONS_TEST: ['owner', 'admin'],
  WHATSAPP_FUNNEL_VIEW: ['owner', 'admin', 'manager'],
  WHATSAPP_FUNNEL_MANAGE: ['owner', 'admin'],
  REPORTS_VIEW_ALL: ['owner', 'admin', 'manager', 'viewer'],
  REPORTS_VIEW_OWN: ['agent'],
  REPORTS_EXPORT: ['owner', 'admin'],
  SETTINGS_VIEW: ['owner', 'admin'],
  SETTINGS_MANAGE: ['owner'],
  SETTINGS_EDIT: ['owner'],
  BILLING_VIEW: ['owner'],
  BILLING_MANAGE: ['owner'],
  AUDIT_VIEW: ['owner', 'admin'],
  TASKS_VIEW: ['owner', 'admin', 'manager', 'agent', 'viewer'],
  TASKS_CREATE: ['owner', 'admin', 'manager', 'agent'],
  TASKS_EDIT_ANY: ['owner', 'admin', 'manager'],
  TASKS_EDIT_OWN: ['agent'],
  TASKS_DELETE_ANY: ['owner', 'admin', 'manager'],
  TASKS_DELETE_OWN: ['agent'],
  TASKS_COMPLETE: ['owner', 'admin', 'manager', 'agent'],
  TASKS_ASSIGN: ['owner', 'admin', 'manager'],
  NOTES_CREATE: ['owner', 'admin', 'manager', 'agent'],
  LEADS_VIEW: ['owner', 'admin', 'manager', 'agent', 'viewer'],
  LEADS_EDIT_ANY: ['owner', 'admin', 'manager'],
  LEADS_EDIT_ASSIGNED: ['owner', 'admin', 'manager', 'agent'],
  LEADS_MOVE: ['owner', 'admin', 'manager', 'agent'],
  DASHBOARD_VIEW: ['owner', 'admin', 'manager', 'agent', 'viewer'],
  REPORTS_VIEW: ['owner', 'admin', 'manager', 'agent', 'viewer'],
} as const satisfies Record<string, readonly RoleName[]>;

export type PermissionKey = keyof typeof PERMISSIONS;

export function can(role: string, permission: PermissionKey): boolean {
  return (PERMISSIONS[permission] as readonly RoleName[]).includes(role as RoleName);
}

export function hasPermission(session: { role?: string | null } | null | undefined, permission: PermissionKey): boolean {
  return !!session?.role && can(session.role, permission);
}

export function canManageRole(actorRole: string | null | undefined, targetRole: RoleName, actorGlobalRole?: string | null): boolean {
  if (actorGlobalRole === 'platform_admin') return true;
  if (targetRole === 'owner') return false;
  if (actorRole === 'owner') return ['admin', 'manager', 'agent', 'viewer'].includes(targetRole);
  if (actorRole === 'admin') return ['manager', 'agent', 'viewer'].includes(targetRole);
  return false;
}

export function getManageableRoles(actorRole: string, actorGlobalRole?: string | null): RoleName[] {
  return (['owner', 'admin', 'manager', 'agent', 'viewer'] as RoleName[]).filter((role) => canManageRole(actorRole, role, actorGlobalRole));
}

export function getLeadScopeForRole(session: { role: string; userId: string }): { assignedTo?: string } {
  return session.role === 'agent' ? { assignedTo: session.userId } : {};
}

export function canEditLead(role: string, lead: { assignedTo: string | null }, userId: string): boolean {
  if (can(role, 'LEADS_EDIT_ALL')) return true;
  if (can(role, 'LEADS_EDIT_OWN') && lead.assignedTo === userId) return true;
  return false;
}

export function canMoveLead(role: string, lead: { assignedTo: string | null }, userId: string): boolean {
  if (can(role, 'KANBAN_MOVE_ALL')) return true;
  if (can(role, 'KANBAN_MOVE_OWN') && lead.assignedTo === userId) return true;
  return false;
}

/**
 * Lead deletion is intentionally never scoped to the assignee or creator.
 * In particular, an Atendente/Vendedor must not delete a lead under any
 * circumstance, even when it is assigned to or was created by that user.
 */
export function canDeleteLead(role: string): boolean {
  return role !== 'agent' && can(role, 'LEADS_DELETE');
}

export function assertPermission(session: { role?: string | null } | null | undefined, permission: PermissionKey): void {
  if (!hasPermission(session, permission)) throw new Error('FORBIDDEN');
}

export function assertCanAccessLead(session: { role: string; userId: string }, lead: { assignedTo: string | null }): void {
  if (session.role === 'agent' && lead.assignedTo !== session.userId) throw new Error('FORBIDDEN');
}

export interface TaskScopeContext { task: { assignedTo: string | null; createdBy: string | null }; lead?: { assignedTo: string | null } | null; }
export function canEditTask(role: string, ctx: TaskScopeContext, userId: string): boolean { if (can(role, 'TASKS_EDIT_ANY')) return true; if (!can(role, 'TASKS_EDIT_OWN')) return false; return ctx.task.assignedTo === userId || ctx.task.createdBy === userId || !!(ctx.lead && ctx.lead.assignedTo === userId); }
export function canDeleteTask(role: string, ctx: TaskScopeContext, userId: string): boolean { if (can(role, 'TASKS_DELETE_ANY')) return true; if (!can(role, 'TASKS_DELETE_OWN')) return false; return ctx.task.createdBy === userId; }
export function canCompleteTask(role: string, ctx: TaskScopeContext, userId: string): boolean { if (!can(role, 'TASKS_COMPLETE')) return false; if (can(role, 'TASKS_EDIT_ANY')) return true; return ctx.task.assignedTo === userId || ctx.task.createdBy === userId || !!(ctx.lead && ctx.lead.assignedTo === userId); }

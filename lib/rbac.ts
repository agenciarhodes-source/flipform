// Cliente-safe: apenas constantes, tipos e funcao pura `can`. Sem imports server-only.
export type RoleName = 'owner' | 'admin' | 'manager' | 'agent' | 'viewer';

export const ROLE_LEVEL: Record<RoleName, number> = {
  owner: 100,
  admin: 80,
  manager: 60,
  agent: 40,
  viewer: 20,
};

export function roleAtLeast(role: string, min: RoleName): boolean {
  return (ROLE_LEVEL[role as RoleName] ?? 0) >= ROLE_LEVEL[min];
}

export function hasAnyRole(role: string, roles: RoleName[]): boolean {
  return roles.includes(role as RoleName);
}

export const PERMISSIONS = {
  USERS_VIEW:           ['owner', 'admin', 'manager'] as RoleName[],
  USERS_INVITE:         ['owner', 'admin'] as RoleName[],
  USERS_EDIT:           ['owner', 'admin'] as RoleName[],
  USERS_REMOVE:         ['owner', 'admin'] as RoleName[],
  USERS_CHANGE_ROLE:    ['owner', 'admin'] as RoleName[],
  FORMS_VIEW:           ['owner', 'admin', 'manager', 'agent', 'viewer'] as RoleName[],
  FORMS_CREATE:         ['owner', 'admin', 'manager'] as RoleName[],
  FORMS_EDIT:           ['owner', 'admin', 'manager'] as RoleName[],
  FORMS_DELETE:         ['owner', 'admin'] as RoleName[],
  LEADS_VIEW:           ['owner', 'admin', 'manager', 'agent', 'viewer'] as RoleName[],
  LEADS_EDIT_ANY:       ['owner', 'admin', 'manager'] as RoleName[],
  LEADS_EDIT_ASSIGNED:  ['owner', 'admin', 'manager', 'agent'] as RoleName[],
  LEADS_MOVE:           ['owner', 'admin', 'manager', 'agent'] as RoleName[],
  LEADS_DELETE:         ['owner', 'admin'] as RoleName[],
  NOTES_CREATE:         ['owner', 'admin', 'manager', 'agent'] as RoleName[],
  PIPELINES_VIEW:       ['owner', 'admin', 'manager', 'agent', 'viewer'] as RoleName[],
  PIPELINES_CREATE:     ['owner', 'admin', 'manager'] as RoleName[],
  PIPELINES_EDIT:       ['owner', 'admin', 'manager'] as RoleName[],
  PIPELINES_REORDER:    ['owner', 'admin', 'manager'] as RoleName[],
  PIPELINES_DELETE:     ['owner', 'admin'] as RoleName[],
  PIPELINES_MANAGE:     ['owner', 'admin', 'manager'] as RoleName[],
  DASHBOARD_VIEW:       ['owner', 'admin', 'manager', 'agent', 'viewer'] as RoleName[],
  REPORTS_VIEW:         ['owner', 'admin', 'manager'] as RoleName[],
  SETTINGS_VIEW:        ['owner', 'admin'] as RoleName[],
  SETTINGS_EDIT:        ['owner', 'admin'] as RoleName[],
  AUDIT_VIEW:           ['owner', 'admin'] as RoleName[],
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export function can(role: string, permission: PermissionKey): boolean {
  return PERMISSIONS[permission].includes(role as RoleName);
}

export function canEditLead(role: string, lead: { assignedTo: string | null }, userId: string): boolean {
  if (can(role, 'LEADS_EDIT_ANY')) return true;
  if (can(role, 'LEADS_EDIT_ASSIGNED') && lead.assignedTo === userId) return true;
  return false;
}

export function canMoveLead(role: string, lead: { assignedTo: string | null }, userId: string): boolean {
  if (!can(role, 'LEADS_MOVE')) return false;
  if (role === 'agent') return lead.assignedTo === userId;
  return true;
}

/**
 * FlipForm Universal Connectors — offline contracts, no network or database access.
 * Outbound API v1 stays separate: these are INBOUND connectors to third-party systems.
 */
export const CONNECTOR_CAPABILITIES = [
  'discover', 'read', 'incremental_sync', 'webhook_receive', 'write',
] as const;
export type ConnectorCapability = (typeof CONNECTOR_CAPABILITIES)[number];

export const CONNECTOR_AUTH_METHODS = [
  'oauth2', 'api_key', 'bearer_token', 'signed_webhook',
] as const;
export type ConnectorAuthMethod = (typeof CONNECTOR_AUTH_METHODS)[number];

export const CONNECTOR_DOMAINS = [
  'crm', 'finance', 'erp', 'orders', 'inventory', 'logistics', 'calendar', 'analytics',
] as const;
export type ConnectorDomain = (typeof CONNECTOR_DOMAINS)[number];

/** No provider supplied tenant id, credential or URL is accepted as authority. */
export type ConnectorDescriptor = Readonly<{
  providerId: string;
  version: 1;
  title: string;
  domains: readonly ConnectorDomain[];
  authMethods: readonly ConnectorAuthMethod[];
  capabilities: readonly ConnectorCapability[];
  /** Fixed HTTPS hostnames approved and pinned in server configuration. */
  allowedHosts: readonly string[];
}>;

export type ConnectorContext = Readonly<{
  tenantId: string;
  connectionId: string;
  actorUserId: string;
  permission: 'owner' | 'admin';
}>;

export type ConnectorCursor = Readonly<{ opaque: string }>;
export type ConnectorReadRequest = Readonly<{
  domain: ConnectorDomain;
  cursor?: ConnectorCursor;
  limit: number;
}>;

/** Explicit schema envelope; never automatically merges external data into leads. */
export type ConnectorRecord = Readonly<{
  sourceId: string;
  sourceUpdatedAt: string | null;
  kind: string;
  fields: Readonly<Record<string, unknown>>;
}>;
export type ConnectorReadResult = Readonly<{
  records: readonly ConnectorRecord[];
  nextCursor: ConnectorCursor | null;
  fetchedAt: string;
}>;

export type ConnectorAdapter = Readonly<{
  descriptor: ConnectorDescriptor;
  testConnection(context: ConnectorContext): Promise<{ healthy: boolean; checkedAt: string }>;
  read(context: ConnectorContext, request: ConnectorReadRequest): Promise<ConnectorReadResult>;
}>;

export function validateConnectorDescriptor(value: ConnectorDescriptor): boolean {
  if (value.version !== 1 || !/^[a-z][a-z0-9_-]{2,63}$/.test(value.providerId)
    || value.title.trim().length === 0 || value.title.length > 120
    || value.domains.length === 0 || value.authMethods.length === 0
    || value.capabilities.length === 0 || value.allowedHosts.length === 0) return false;
  const unique = <T extends string>(items: readonly T[]) => new Set(items).size === items.length;
  if (!unique(value.domains) || !unique(value.authMethods) || !unique(value.capabilities)
    || !unique(value.allowedHosts)) return false;
  if (!value.domains.every(d => CONNECTOR_DOMAINS.includes(d))
    || !value.authMethods.every(m => CONNECTOR_AUTH_METHODS.includes(m))
    || !value.capabilities.every(c => CONNECTOR_CAPABILITIES.includes(c))) return false;
  return value.allowedHosts.every(host =>
    host.length <= 253
    && host === host.toLowerCase()
    && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)
    && !host.endsWith('.localhost')
    && !host.endsWith('.local'));
}

/** Read-only rollout does not acquire write privileges, even for capable providers. */
export function canUseConnectorCapability(
  descriptor: ConnectorDescriptor,
  requested: ConnectorCapability,
  tenantEnabled: boolean,
): boolean {
  if (!tenantEnabled || !validateConnectorDescriptor(descriptor)) return false;
  if (requested === 'write') return false;
  return descriptor.capabilities.includes(requested);
}

/** Never include raw access tokens, provider payloads or personal data in logs. */
export function connectorAuditFields(context: ConnectorContext, providerId: string, action: string) {
  return { tenantId: context.tenantId, connectionId: context.connectionId,
    actorUserId: context.actorUserId, providerId, action };
}

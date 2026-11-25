import type { ConnectorDescriptor } from './contracts';

export const ASAAS_SANDBOX = {
  providerId: 'asaas_sandbox', version: 1, title: 'Asaas — ambiente de testes',
  domains: ['finance'], authMethods: ['api_key'], capabilities: ['discover'],
  allowedHosts: ['api-sandbox.asaas.com'],
} as const satisfies ConnectorDescriptor;

export const SYSTEM_CATEGORIES = [
  'ERP', 'CRM', 'Financeiro', 'Contabilidade', 'Pedidos', 'Estoque',
  'Logística', 'E-commerce', 'Agenda', 'BI', 'Publicidade', 'Redes sociais',
  'Fontes de mercado', 'API personalizada',
] as const;

/** No caller-supplied host, headers, path, HTTP verb or arbitrary descriptor. */
export function sandboxProvider(id: string): ConnectorDescriptor | null {
  return id === ASAAS_SANDBOX.providerId ? ASAAS_SANDBOX : null;
}

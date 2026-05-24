const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
const ASAAS_BASE_URL = process.env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3';
const ASAAS_WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN;

async function asaasFetch(path: string, init: RequestInit) {
  if (!ASAAS_API_KEY) throw new Error('ASAAS_API_KEY not configured');
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: ASAAS_API_KEY,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error('Asaas request failed');
  return res.json();
}

export async function createCustomer(payload: any) { return asaasFetch('/customers', { method: 'POST', body: JSON.stringify(payload) }); }
export async function createSubscription(payload: any) { return asaasFetch('/subscriptions', { method: 'POST', body: JSON.stringify(payload) }); }
export async function getPayment(id: string) { return asaasFetch(`/payments/${id}`, { method: 'GET' }); }
export async function getSubscription(id: string) { return asaasFetch(`/subscriptions/${id}`, { method: 'GET' }); }
export async function cancelSubscription(id: string) { return asaasFetch(`/subscriptions/${id}`, { method: 'DELETE' }); }

export function mapAsaasPaymentStatus(status: string) {
  const s = String(status || '').toUpperCase();
  if (s.includes('RECEIVED') || s.includes('CONFIRMED')) return 'received';
  if (s.includes('CHARGEBACK')) return 'refunded';
  if (s.includes('OVERDUE')) return 'overdue';
  if (s.includes('REFUND')) return 'refunded';
  if (s.includes('DELET')) return 'failed';
  return 'pending';
}

export const mapPaymentStatus = mapAsaasPaymentStatus;

export function validateWebhookToken(req: Request) {
  const token = req.headers.get('asaas-access-token') || req.headers.get('x-asaas-token');
  return Boolean(ASAAS_WEBHOOK_TOKEN && token && token === ASAAS_WEBHOOK_TOKEN);
}

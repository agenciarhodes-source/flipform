/* eslint-disable no-console */
const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3000';

type CheckResult = { name: string; ok: boolean; status?: number; note: string };
const results: CheckResult[] = [];

async function assertNoDefaultPassword(path: string, text: string) {
  if (/senha padrão/i.test(text)) {
    results.push({ name: `${path}#content`, ok: false, note: 'CONTAINS_FORBIDDEN_TEXT' });
  }
}

async function checkPage(path: string) {
  const res = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
  const text = await res.text();
  const ok = (res.status >= 200 && res.status < 400) || (path === '/' && [200, 307, 308].includes(res.status));
  results.push({ name: path, ok, status: res.status, note: `PAGE ${res.status}` });
  await assertNoDefaultPassword(path, text);
}

async function checkJsonApi(path: string, init?: RequestInit, allowedStatuses: number[] = [200, 400, 401, 403, 404, 409, 429]) {
  const res = await fetch(`${baseUrl}${path}`, { redirect: 'manual', ...init });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch {}
  const jsonOk = Boolean(parsed);
  const ok = allowedStatuses.includes(res.status) && jsonOk && res.status < 500;
  const bodyState = jsonOk ? 'JSON' : (text ? 'NON_JSON' : 'EMPTY');
  results.push({ name: path, ok, status: res.status, note: `API ${res.status} ${bodyState}` });
}

async function run() {
  await checkPage('/');
  await checkPage('/login');
  await checkPage('/checkout/starter');
  await checkPage('/checkout/growth');
  await checkPage('/checkout/pro');
  await checkPage('/checkout/success');
  await checkPage('/checkout/pending');
  await checkPage('/checkout/cancelled');
  await checkPage('/checkout/error');
  await checkPage('/first-access');
  await checkPage('/pricing');
  await checkPage('/legal/terms');
  await checkPage('/legal/privacy');
  await checkPage('/legal/cancellation');
  await checkPage('/legal/support');

  await checkJsonApi('/api/public/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planSlug: 'enterprise' }) }, [400, 422]);
  await checkJsonApi('/api/public/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planSlug: 'invalid-plan' }) }, [400, 404, 422]);

  await checkJsonApi('/api/billing/change-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetPlanSlug: 'growth' }) }, [401, 403]);
  await checkJsonApi('/api/billing/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'smoke' }) }, [401, 403]);
  await checkJsonApi('/api/account/export', { method: 'GET' }, [401, 403]);
  await checkJsonApi('/api/account/delete-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'smoke', confirmation: 'EXCLUIR' }) }, [401, 403]);

  await checkJsonApi('/api/admin/allowed-users', { method: 'GET' }, [401, 403]);
  await checkJsonApi('/api/admin/billing/diagnostics', { method: 'GET' }, [401, 403]);
  await checkJsonApi('/api/webhooks/asaas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'PAYMENT_RECEIVED' }) }, [401, 403]);

  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} ${r.note}`);
  }
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\nSmoke tests completed: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error('Smoke test runner failed:', e?.message || e);
  process.exit(1);
});

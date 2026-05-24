/* eslint-disable no-console */
import fs from 'fs/promises';
import path from 'path';

function isProductionWebhookUrl(url: string) {
  return /https?:\/\/app\.flipform\.com\.br/i.test(url);
}

async function main() {
  const fixtureArg = process.argv[2];

  if (!fixtureArg) {
    console.error('Usage: WEBHOOK_URL=http://localhost:3000/api/webhooks/asaas ASAAS_WEBHOOK_TOKEN=... tsx scripts/simulate-asaas-webhook.ts <fixture.json>');
    process.exit(1);
  }

  const webhookUrl = process.env.WEBHOOK_URL || 'http://localhost:3000/api/webhooks/asaas';
  const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN;
  const allowProd = String(process.env.ALLOW_PRODUCTION_WEBHOOK_SIMULATION || '').toLowerCase() === 'true';

  if (isProductionWebhookUrl(webhookUrl) && !allowProd) {
    console.error('Refusing to simulate webhook against production URL without explicit ALLOW_PRODUCTION_WEBHOOK_SIMULATION=true');
    process.exit(1);
  }

  if (!webhookToken) {
    console.error('Missing ASAAS_WEBHOOK_TOKEN environment variable.');
    process.exit(1);
  }

  const fixturePath = path.resolve(process.cwd(), fixtureArg);
  const raw = await fs.readFile(fixturePath, 'utf8');
  const payload = JSON.parse(raw);

  console.log(`[simulate-asaas-webhook] Sending fixture: ${path.relative(process.cwd(), fixturePath)}`);
  console.log(`[simulate-asaas-webhook] Target URL: ${webhookUrl}`);

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'asaas-access-token': webhookToken,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  console.log(`[simulate-asaas-webhook] HTTP ${response.status}`);

  try {
    const parsed = JSON.parse(responseText);
    console.log('[simulate-asaas-webhook] Response JSON:', JSON.stringify(parsed));
  } catch {
    console.log('[simulate-asaas-webhook] Response text:', responseText.slice(0, 500));
  }

  if (response.status >= 400) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[simulate-asaas-webhook] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});

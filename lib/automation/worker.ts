import 'server-only';

import { INSTAGRAM_PRIVATE_REPLY_ACTION } from './adapters/instagram-comment';
import { WHATSAPP_SEND_TEXT_ACTION } from './adapters/whatsapp-message';
import { drainAutomationExecutionQueue } from './execution-engine';
import { createInstagramPrivateReplyAutomationHandler } from './handlers/instagram-private-reply';
import { createWhatsAppSendTextAutomationHandler } from './handlers/whatsapp-send-text';
import type { AutomationActionHandlers } from './types';

const AUTOMATION_CENTRAL_WORKER_BATCH_SIZE = 25;

export function createAutomationWorkerHandlers(): AutomationActionHandlers {
  return {
    [INSTAGRAM_PRIVATE_REPLY_ACTION]: createInstagramPrivateReplyAutomationHandler(),
    [WHATSAPP_SEND_TEXT_ACTION]: createWhatsAppSendTextAutomationHandler(),
  };
}

export async function runAutomationWorker(input: {
  handlers?: AutomationActionHandlers;
  batchSize?: number;
} = {}) {
  return drainAutomationExecutionQueue({
    handlers: input.handlers || createAutomationWorkerHandlers(),
    batchSize: input.batchSize ?? AUTOMATION_CENTRAL_WORKER_BATCH_SIZE,
  });
}

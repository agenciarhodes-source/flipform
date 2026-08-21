import 'server-only';

import { LEAD_ENSURE_FROM_CONVERSATION_ACTION, LEAD_MOVE_STAGE_ACTION } from './adapters/crm';
import { INSTAGRAM_PRIVATE_REPLY_ACTION } from './adapters/instagram-comment';
import { WHATSAPP_SEND_TEXT_ACTION } from './adapters/whatsapp-message';
import { drainAutomationExecutionQueue } from './execution-engine';
import { createInstagramPrivateReplyAutomationHandler } from './handlers/instagram-private-reply';
import { createLeadEnsureFromConversationAutomationHandler } from './handlers/lead-ensure-from-conversation';
import { createLeadMoveStageAutomationHandler } from './handlers/lead-move-stage';
import { createWhatsAppSendTextAutomationHandler } from './handlers/whatsapp-send-text';
import type { AutomationActionHandlers } from './types';

const AUTOMATION_CENTRAL_WORKER_BATCH_SIZE = 25;

export function createAutomationWorkerHandlers(): AutomationActionHandlers {
  return {
    [INSTAGRAM_PRIVATE_REPLY_ACTION]: createInstagramPrivateReplyAutomationHandler(),
    [WHATSAPP_SEND_TEXT_ACTION]: createWhatsAppSendTextAutomationHandler(),
    [LEAD_ENSURE_FROM_CONVERSATION_ACTION]: createLeadEnsureFromConversationAutomationHandler(),
    [LEAD_MOVE_STAGE_ACTION]: createLeadMoveStageAutomationHandler(),
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

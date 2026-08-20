export {
  createAutomationDefinition,
  listAutomationDefinitions,
  listEnabledAutomationDefinitionsByTrigger,
  updateAutomationDefinition,
} from './definition-store';
export {
  automationExecutionEventId,
  drainAutomationExecutionQueue,
  enqueueAutomationExecution,
} from './execution-engine';
export {
  enqueueInstagramCommentCoreAutomation,
  INSTAGRAM_COMMENT_KEYWORD_TRIGGER,
  INSTAGRAM_PRIVATE_REPLY_ACTION,
  prepareInstagramCommentCoreAutomation,
} from './adapters/instagram-comment';
export {
  enqueueWhatsAppMessageCoreAutomation,
  normalizeWhatsAppAutomationText,
  prepareWhatsAppMessageCoreAutomation,
  WHATSAPP_MESSAGE_KEYWORD_TRIGGER,
  WHATSAPP_SEND_TEXT_ACTION,
  whatsappMessageAutomationMatches,
} from './adapters/whatsapp-message';
export { createInstagramPrivateReplyAutomationHandler } from './handlers/instagram-private-reply';
export { createWhatsAppSendTextAutomationHandler } from './handlers/whatsapp-send-text';
export {
  createAutomationWorkerHandlers,
  runAutomationWorker,
} from './worker';
export type {
  AutomationActionDefinition,
  AutomationActionHandler,
  AutomationActionHandlerContext,
  AutomationActionHandlerResult,
  AutomationActionHandlers,
  AutomationDefinitionSnapshot,
  AutomationExecutionState,
  AutomationTriggerDefinition,
} from './types';
export type {
  InstagramCommentCoreMatchType,
  PreparedInstagramCommentCoreAutomation,
} from './adapters/instagram-comment';
export type {
  PreparedWhatsAppMessageCoreAutomation,
  WhatsAppMessageCoreMatchType,
} from './adapters/whatsapp-message';
export { AutomationCoreError } from './types';

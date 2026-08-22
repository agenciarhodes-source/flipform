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
  LEAD_ENSURE_FROM_CONVERSATION_ACTION,
  LEAD_MOVE_STAGE_ACTION,
} from './adapters/crm';
export {
  evaluateFlowCondition,
  FLOW_CONDITION_ACTION,
  isFlowConditionOperator,
} from './adapters/flow-condition';
export {
  enqueueInstagramCommentCoreAutomation,
  INSTAGRAM_COMMENT_KEYWORD_TRIGGER,
  INSTAGRAM_PRIVATE_REPLY_ACTION,
  prepareInstagramCommentCoreAutomation,
} from './adapters/instagram-comment';
export {
  enqueueInstagramMessageCoreAutomation,
  INSTAGRAM_MESSAGE_KEYWORD_TRIGGER,
  INSTAGRAM_SEND_TEXT_ACTION,
  instagramMessageAutomationMatches,
  normalizeInstagramMessageAutomationText,
  prepareInstagramMessageCoreAutomation,
} from './adapters/instagram-message';
export {
  enqueueWhatsAppMessageCoreAutomation,
  normalizeWhatsAppAutomationText,
  prepareWhatsAppMessageCoreAutomation,
  WHATSAPP_MESSAGE_KEYWORD_TRIGGER,
  WHATSAPP_SEND_TEXT_ACTION,
  whatsappMessageAutomationMatches,
} from './adapters/whatsapp-message';
export { createFlowConditionAutomationHandler } from './handlers/flow-condition';
export { createInstagramPrivateReplyAutomationHandler } from './handlers/instagram-private-reply';
export { createInstagramSendTextAutomationHandler } from './handlers/instagram-send-text';
export { createLeadEnsureFromConversationAutomationHandler } from './handlers/lead-ensure-from-conversation';
export { createLeadMoveStageAutomationHandler } from './handlers/lead-move-stage';
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
export type { FlowConditionOperator } from './adapters/flow-condition';
export type {
  InstagramCommentCoreMatchType,
  PreparedInstagramCommentCoreAutomation,
} from './adapters/instagram-comment';
export type {
  InstagramMessageCoreMatchType,
  PreparedInstagramMessageCoreAutomation,
} from './adapters/instagram-message';
export type {
  PreparedWhatsAppMessageCoreAutomation,
  WhatsAppMessageCoreMatchType,
} from './adapters/whatsapp-message';
export { AutomationCoreError } from './types';

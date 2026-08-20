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
export { createInstagramPrivateReplyAutomationHandler } from './handlers/instagram-private-reply';
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
export { AutomationCoreError } from './types';

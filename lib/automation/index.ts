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
export { AutomationCoreError } from './types';

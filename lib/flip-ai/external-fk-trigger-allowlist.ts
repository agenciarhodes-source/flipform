/**
 * PostgreSQL's two parent-side RI triggers for the approved Flip Voice ->
 * Flip AI agent reference are not mutations of the Flip AI schema.
 *
 * Only this exact constraint, table and pair of native RI functions are
 * exempted from the legacy Flip AI readiness "unexpected triggers" report.
 * Do not whitelist arbitrary foreign keys or user-defined triggers.
 */
export type CatalogForeignKeyTrigger = {
  triggerTableName: string;
  triggerName: string;
  enabled: string;
  internal: boolean;
  deferrable: boolean;
  initiallyDeferred: boolean;
  constraintTableName: string | null;
  constraintName: string | null;
  constraintType: string | null;
  functionName: string;
};

export function isApprovedFlipVoiceReferenceTrigger(trigger: CatalogForeignKeyTrigger): boolean {
  return trigger.triggerTableName === 'flip_ai_agents'
    && trigger.constraintTableName === 'flip_voice_profiles'
    && trigger.constraintName === 'flip_voice_profiles_tenant_id_agent_id_fkey'
    && trigger.constraintType === 'f'
    && trigger.internal === true
    && trigger.enabled === 'O'
    && trigger.deferrable === false
    && trigger.initiallyDeferred === false
    && /^RI_ConstraintTrigger_a_\d+$/.test(trigger.triggerName)
    && (
      trigger.functionName === 'RI_FKey_restrict_del'
      || trigger.functionName === 'RI_FKey_cascade_upd'
    );
}

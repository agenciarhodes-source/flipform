/**
 * A WhatsApp conversation without a lead gets one, for every company: first an existing lead with
 * the same number is linked; when there is none, a lead is created in the company's main funnel.
 * Companies whose WhatsApp attendant (AI) is on keep the AI's own rule (it opens the lead once
 * the person is identified). Pure rules, easy to test.
 */

export function shouldCreateWhatsAppLead(input: { hasLead: boolean; aiOn: boolean; messageType: string }) {
  if (input.hasLead || input.aiOn) return false;
  // A deleted message, a reaction or a status is not a new contact.
  return !['revoke', 'reaction', 'system', 'unsupported', 'ephemeral'].includes(input.messageType);
}

/** Where the lead came from, as the Kanban shows it. */
export function whatsappLeadSource(fromAd: boolean) {
  return fromAd ? 'Anúncio Meta — WhatsApp' : 'WhatsApp';
}

/** The company's main funnel: the default one, otherwise the oldest; never an archived one. */
export function mainPipeline<T extends { isDefault: boolean; isArchived: boolean; createdAt: Date }>(pipelines: T[]) {
  return [...pipelines]
    .filter((pipeline) => !pipeline.isArchived)
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.createdAt.getTime() - b.createdAt.getTime())[0] || null;
}

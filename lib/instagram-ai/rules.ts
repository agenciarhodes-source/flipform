/**
 * Pure rules of the Flip AI on the Instagram Direct (no database, no network). Global for every
 * company.
 */

/** "@Maria.Silva " -> "maria.silva"; null when it cannot be an Instagram username. */
export function normalizeInstagramUsername(value: string | null | undefined): string | null {
  const name = (value || '').trim().replace(/^@+/, '').toLowerCase();
  // Instagram usernames: letters, numbers, dot and underscore, up to 30 characters.
  if (!/^[a-z0-9._]{1,30}$/.test(name)) return null;
  return name;
}

/**
 * Whether the AI may answer this person: everyone once the account is released, otherwise only
 * the test usernames.
 */
export function instagramAiMayAnswer(input: {
  enabled: boolean;
  agentId: string | null;
  liveEnabled: boolean;
  testUsernames: string[];
  senderUsername: string | null | undefined;
}): { answer: true } | { answer: false; reason: 'disabled' | 'no_agent' | 'not_a_test_profile' } {
  if (!input.enabled) return { answer: false, reason: 'disabled' };
  if (!input.agentId) return { answer: false, reason: 'no_agent' };
  if (input.liveEnabled) return { answer: true };
  const sender = normalizeInstagramUsername(input.senderUsername);
  if (sender && input.testUsernames.map(normalizeInstagramUsername).includes(sender)) return { answer: true };
  return { answer: false, reason: 'not_a_test_profile' };
}

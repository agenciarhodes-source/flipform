import {
  normalizeWhatsAppAddress,
  parseTwilioCallPermissionReply,
  validateWhatsAppTwilioAccount,
} from './whatsapp-calling-policy';

export { normalizeWhatsAppAddress, parseTwilioCallPermissionReply };
export const validateTwilioWhatsAppAccountForEvent = validateWhatsAppTwilioAccount;

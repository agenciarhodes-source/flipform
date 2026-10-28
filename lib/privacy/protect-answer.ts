import 'server-only';

import { encryptIntegrationSecret } from '@/lib/tracking/crypto';
import { maskedDocument, type ProtectedDocumentAnswer } from './documents';

/** A CPF or CNPJ form answer as stored (security protocol S7): encrypted plus a masked copy. */
export function protectDocumentAnswer(fieldType: string | undefined, value: unknown): unknown {
  if ((fieldType !== 'cpf' && fieldType !== 'cnpj') || typeof value !== 'string' || !value.trim()) return value ?? null;
  const protectedAnswer: ProtectedDocumentAnswer = {
    protected: fieldType,
    masked: maskedDocument(fieldType, value),
    encrypted: encryptIntegrationSecret(value),
  };
  return protectedAnswer;
}

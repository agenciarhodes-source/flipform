import { z } from 'zod';

export const FLIP_AI_CONVERSATION_MEMORY_VERSION = '2026-10-04.1';
export const FLIP_AI_MEMORY_MAX_FACTS = 14;
export const FLIP_AI_MEMORY_MAX_PENDING = 8;

const memoryKeySchema = z.string().trim().min(2).max(64)
  .regex(/^[a-z0-9_:-]+$/i, 'Use chaves semânticas curtas.');
const memoryValueSchema = z.string().trim().min(1).max(280);

export const flipAiConversationMemoryPatchSchema = z.object({
  facts: z.array(z.object({
    action: z.enum(['upsert', 'remove']),
    key: memoryKeySchema,
    value: memoryValueSchema.nullable(),
  }).strict()).max(8),
  pending: z.array(z.object({
    action: z.enum(['upsert', 'remove']),
    key: memoryKeySchema,
    value: memoryValueSchema.nullable(),
  }).strict()).max(6),
}).strict();

export type FlipAiConversationMemoryPatch = z.infer<typeof flipAiConversationMemoryPatchSchema>;

export type FlipAiConversationMemoryItem = {
  key: string;
  value: string;
};

export type FlipAiConversationMemorySnapshot = {
  version: string;
  facts: FlipAiConversationMemoryItem[];
  pending: FlipAiConversationMemoryItem[];
  updatedAt: string;
  sourceMessageId: string;
};

const snapshotSchema = z.object({
  version: z.string().min(1).max(40),
  facts: z.array(z.object({
    key: memoryKeySchema,
    value: memoryValueSchema,
  }).strict()).max(FLIP_AI_MEMORY_MAX_FACTS),
  pending: z.array(z.object({
    key: memoryKeySchema,
    value: memoryValueSchema,
  }).strict()).max(FLIP_AI_MEMORY_MAX_PENDING),
  updatedAt: z.string().datetime(),
  sourceMessageId: z.string().uuid(),
}).strict();

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_:-]+/g, '_').slice(0, 64);
}

function normalizeValue(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 280);
}

function applyOperations(
  previous: FlipAiConversationMemoryItem[],
  operations: Array<{ action: 'upsert' | 'remove'; key: string; value: string | null }>,
  limit: number,
) {
  const map = new Map(previous.map((item) => [normalizeKey(item.key), normalizeValue(item.value)]));
  for (const operation of operations) {
    const key = normalizeKey(operation.key);
    if (!key) continue;
    if (operation.action === 'remove') {
      map.delete(key);
      continue;
    }
    const value = operation.value == null ? '' : normalizeValue(operation.value);
    if (!value) continue;
    map.delete(key);
    map.set(key, value);
  }
  return [...map.entries()]
    .slice(-limit)
    .map(([key, value]) => ({ key, value }));
}

export function parseConversationMemorySnapshot(value: unknown): FlipAiConversationMemorySnapshot | null {
  const parsed = snapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function mergeConversationMemory(input: {
  previous?: FlipAiConversationMemorySnapshot | null;
  patch: FlipAiConversationMemoryPatch;
  sourceMessageId: string;
  updatedAt?: Date;
}) {
  return {
    version: FLIP_AI_CONVERSATION_MEMORY_VERSION,
    facts: applyOperations(input.previous?.facts || [], input.patch.facts, FLIP_AI_MEMORY_MAX_FACTS),
    pending: applyOperations(input.previous?.pending || [], input.patch.pending, FLIP_AI_MEMORY_MAX_PENDING),
    updatedAt: (input.updatedAt || new Date()).toISOString(),
    sourceMessageId: input.sourceMessageId,
  } satisfies FlipAiConversationMemorySnapshot;
}

export function conversationMemoryPrompt(snapshot: FlipAiConversationMemorySnapshot | null) {
  if (!snapshot || (!snapshot.facts.length && !snapshot.pending.length)) return '';
  const facts = snapshot.facts.map((item) => `${item.key}=${item.value}`).join('; ');
  const pending = snapshot.pending.map((item) => `${item.key}=${item.value}`).join('; ');
  return [
    facts ? `Fatos já confirmados: ${facts}` : '',
    pending ? `Pendências ainda relevantes: ${pending}` : '',
  ].filter(Boolean).join('\n');
}

export function memoryPatchInstructions() {
  return [
    'memoryPatch mantém a memória compacta da conversa e nunca é mostrado diretamente à pessoa.',
    'Em facts, registre somente fatos estáveis explicitamente informados ou confirmados pela própria pessoa e úteis para continuar o atendimento.',
    'Use chaves semânticas curtas, por exemplo cidade, tipo_negocio, possui_freezer, documento_rural, objetivo.',
    'Não armazene nome, telefone ou e-mail em memoryPatch; esses dados têm campos próprios.',
    'Nunca armazene senhas, credenciais, tokens, dados de cartão, códigos de autenticação ou números completos de documentos pessoais.',
    'Se a pessoa corrigir explicitamente um fato anterior, use remove para a chave antiga e upsert para o valor correto quando necessário.',
    'Em pending, mantenha somente informações/perguntas que ainda mudam a qualificação ou o próximo passo. Remova a pendência assim que ela for respondida ou deixar de ser necessária.',
    'Não invente fatos para preencher memória. Se nada mudou neste turno, retorne arrays vazios.',
  ];
}

type NextRequestContext = {
  waitUntil?: (promise: Promise<unknown>) => void;
};

type NextRequestContextHolder = {
  get?: () => NextRequestContext | undefined;
};

// Vercel's current Next.js builder exposes waitUntil through the request-context
// bridge used by Next.js itself. Keeping this tiny adapter local avoids coupling
// the webhook runtime to a newer Next.js `after()` API while Flipform remains on
// Next 14. If the bridge is unavailable (local/self-hosted), callers safely fall
// back to awaiting the same durable work before returning.
const NEXT_REQUEST_CONTEXT_SYMBOL = Symbol.for('@next/request-context');

export function scheduleAfterResponse(promise: Promise<unknown>) {
  const scope = globalThis as typeof globalThis & {
    [NEXT_REQUEST_CONTEXT_SYMBOL]?: NextRequestContextHolder;
  };
  const waitUntil = scope[NEXT_REQUEST_CONTEXT_SYMBOL]?.get?.()?.waitUntil;
  if (typeof waitUntil !== 'function') return false;
  try {
    waitUntil(promise);
    return true;
  } catch {
    return false;
  }
}

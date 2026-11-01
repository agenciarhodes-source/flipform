import type { ErrorEvent } from '@sentry/nextjs';

// Sentry 11 collects request bodies, headers, cookies, query strings, database data and local
// variables by default. FlipForm handles leads' personal data (name, phone, CPF), so every
// category is turned off here and only the error itself (message and stack trace) is sent.
export const sentryDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
};

// Second safety net: drop anything personal that still reaches an event.
export function stripPersonalData(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.headers;
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
  }
  // Keep only the internal user id (set by lib/observability.ts); never e-mail, name or IP.
  event.user = event.user?.id ? { id: event.user.id } : undefined;
  return event;
}

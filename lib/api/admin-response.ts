import { apiError, apiSuccess } from '@/lib/api/response';

export function adminOk<T>(data: T, init?: ResponseInit) {
  return apiSuccess(data, init);
}

export function adminError(message: string, status = 400, details?: unknown) {
  return apiError(message, status, details);
}

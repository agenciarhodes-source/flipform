/** Public slugs must never choose a tenant by database row order. */
export function selectUniquePublicForm<T>(candidates: readonly T[]): T | null {
  return candidates.length === 1 ? candidates[0] : null;
}

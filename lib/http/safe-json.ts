export async function safeJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Resposta inválida do servidor.');
  }
}

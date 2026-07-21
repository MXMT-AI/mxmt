export async function readApiJson<T extends Record<string, unknown>>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return {
      error: response.ok
        ? "Сервер повернув некоректну відповідь"
        : `Запит завершився з помилкою HTTP ${response.status}`,
    } as unknown as T;
  }
}

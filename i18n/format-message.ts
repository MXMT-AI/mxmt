export function formatMessage(message: string, values: Record<string, unknown>): string {
  return message.replace(/\{([\w$]+)\}/g, (placeholder, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : placeholder,
  );
}

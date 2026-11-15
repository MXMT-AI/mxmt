export function salesTone(value: string) {
  return value === "GREEN" ? "text-report-positive" : value === "RED" ? "text-report-negative" : "";
}

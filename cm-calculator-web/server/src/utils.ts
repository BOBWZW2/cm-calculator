export function normalizeCode(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

export function normalizeMaybeEmpty(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(numeric) ? numeric : null;
}

export function dedupe<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function normalizeTradeFromFilename(filename: string): string {
  const matched = filename.toUpperCase().match(/SURCHARGE-([A-Z]+)/);
  return matched?.[1] ?? "";
}

export function sameCountry(left: string, right: string): boolean {
  return left.slice(0, 2) !== "" && left.slice(0, 2) === right.slice(0, 2);
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function labelRoutePoint(portCode: string, kind: string): string {
  return `${kind} ${portCode}`;
}

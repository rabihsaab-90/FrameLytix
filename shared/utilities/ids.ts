/** Identifier helpers. Pure; safe in both renderer and main. */

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Next display code for a prefix, e.g. ('REQ', ['REQ-001','REQ-007','X']) → 'REQ-008'.
 * Codes are 3-digit padded and grow beyond 999 naturally.
 */
export function nextCode(prefix: string, existingCodes: string[]): string {
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`);
  let max = 0;
  for (const code of existingCodes) {
    const digits = re.exec(code)?.[1];
    if (digits !== undefined) {
      const n = Number.parseInt(digits, 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

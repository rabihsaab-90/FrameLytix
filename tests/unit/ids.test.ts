import { describe, expect, it } from 'vitest';
import { newId, nextCode } from '../../shared/utilities/ids';

describe('ids', () => {
  it('newId returns distinct UUIDs', () => {
    const a = newId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newId()).not.toBe(a);
  });

  it('nextCode picks max + 1, ignoring other prefixes and malformed codes', () => {
    expect(nextCode('REQ', ['REQ-001', 'REQ-007', 'X'])).toBe('REQ-008');
    expect(nextCode('REQ', [])).toBe('REQ-001');
    expect(nextCode('ARG', ['REQ-009', 'ARG-002x'])).toBe('ARG-001');
  });

  it('nextCode grows beyond 999 and does not reuse gaps', () => {
    expect(nextCode('CALC', ['CALC-999'])).toBe('CALC-1000');
    expect(nextCode('DRW', ['DRW-002'])).toBe('DRW-003');
  });
});

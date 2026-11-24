import { describe, expect, it } from 'vitest';
import { evaluateCalculation, evaluateExpression, parseVariableValue } from '../../shared/utilities/expression';
import type { Calculation } from '../../shared/schemas/project';
import { NOW } from './fixtures/manifestFixture';

const ev = (e: string, v: Record<string, number> = {}) => evaluateExpression(e, v);
const val = (e: string, v: Record<string, number> = {}): number => {
  const r = ev(e, v);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const err = (e: string, v: Record<string, number> = {}): string => {
  const r = ev(e, v);
  if (r.ok) throw new Error(`expected error, got ${r.value}`);
  return r.error;
};

describe('evaluateExpression', () => {
  it('follows operator precedence and associativity', () => {
    expect(val('2+3*4')).toBe(14);
    expect(val('(2+3)*4')).toBe(20);
    expect(val('10-4-3')).toBe(3);
    expect(val('100/10/5')).toBe(2);
    expect(val('2^3^2')).toBe(512);
    expect(val('-2^2')).toBe(-4);
    expect(val('2^-1')).toBe(0.5);
    expect(val('--3')).toBe(3);
  });

  it('parses numeric literals', () => {
    expect(val('1.5e3')).toBe(1500);
    expect(val('.5+.25')).toBe(0.75);
    expect(val('2E-2')).toBeCloseTo(0.02);
  });

  it('evaluates a beam formula with variables', () => {
    expect(val('w*L^2/8', { w: 12, L: 5 })).toBeCloseTo(37.5);
    expect(val('M_max/(S*1000)', { M_max: 500, S: 2 })).toBeCloseTo(0.25);
  });

  it('supports functions and constants', () => {
    expect(val('sqrt(16)+abs(-2)')).toBe(6);
    expect(val('sin(pi/2)')).toBeCloseTo(1);
    expect(val('cos(0)')).toBe(1);
    expect(val('ln(e)')).toBeCloseTo(1);
    expect(val('log10(1000)')).toBeCloseTo(3);
    expect(val('exp(0)')).toBe(1);
    expect(val('max(1,5,3)-min(4,2)')).toBe(3);
    expect(val('round(2.6)')).toBe(3);
    expect(val('atan(1)*4')).toBeCloseTo(Math.PI);
  });

  it('gives constants precedence over same-named variables', () => {
    expect(val('pi', { pi: 3 })).toBeCloseTo(Math.PI);
  });

  it('reports unknown variables and functions', () => {
    expect(err('x+1')).toBe("Unknown variable 'x'.");
    expect(err('foo(1)')).toBe("Unknown function 'foo'.");
    expect(err('constructor(1)')).toContain('Unknown function');
    expect(err('toString')).toContain('Unknown variable');
  });

  it('reports syntax errors', () => {
    expect(err('(1+2')).toContain('parentheses');
    expect(err('1+2)')).toContain('parentheses');
    expect(err('1 2')).toContain('Unexpected');
    expect(err('1+')).toContain('ended unexpectedly');
    expect(err('2 $ 3')).toContain("Unexpected character '$'");
    expect(err('')).toContain('empty');
    expect(err('sqrt(1,2)')).toContain('expects');
  });

  it('rejects division by zero and non-finite results', () => {
    expect(err('1/0')).toBe('Division by zero.');
    expect(err('1/(2-2)')).toBe('Division by zero.');
    expect(err('sqrt(-1)')).toContain('finite');
    expect(err('ln(0)')).toContain('finite');
    expect(err('10^1000')).toContain('finite');
    expect(err('(-8)^0.5')).toContain('real');
  });

  it('enforces length and nesting limits', () => {
    expect(err('1+'.repeat(600) + '1')).toContain('longer than');
    expect(err('('.repeat(70) + '1' + ')'.repeat(70))).toContain('nested too deeply');
    expect(val('('.repeat(20) + '1' + ')'.repeat(20))).toBe(1);
  });

  it('cannot execute code', () => {
    expect(err('process.exit(1)')).toBeTruthy();
    expect(err('constructor.constructor("return 1")()')).toBeTruthy();
    expect(err('__proto__')).toContain('Unknown variable');
  });
});

describe('parseVariableValue', () => {
  it('parses plain numbers', () => {
    expect(parseVariableValue(' 12.5 ')).toBe(12.5);
    expect(parseVariableValue('-3e2')).toBe(-300);
    expect(parseVariableValue('0')).toBe(0);
  });
  it('rejects blanks, text, hex and non-finite', () => {
    for (const s of ['', '  ', 'abc', '1,000', '0x10', 'Infinity', 'NaN', '12 kN']) expect(parseVariableValue(s)).toBeNull();
  });
});

describe('evaluateCalculation', () => {
  const calc = (o: Partial<Calculation>): Calculation => ({
    id: 'c', code: 'CALC-001', title: 'Beam', purpose: '', equation: '', variables: [], expression: 'w*L^2/8', method: '',
    assumptions: '', resultValue: '', resultUnit: '', resultSource: 'manual', reference: '', verificationNotes: '',
    revision: 'REV-A', author: '', archived: false, createdAt: NOW, modifiedAt: NOW, ...o
  });

  it('evaluates using variable values and ignores units', () => {
    const r = evaluateCalculation(
      calc({ variables: [{ symbol: 'w', description: '', value: '10', unit: 'kN/m' }, { symbol: 'L', description: '', value: '4', unit: 'm' }] })
    );
    expect(r).toEqual({ ok: true, value: 20 });
  });

  it('names a variable lacking a numeric value', () => {
    const r = evaluateCalculation(
      calc({ variables: [{ symbol: 'w', description: '', value: '10', unit: '' }, { symbol: 'L', description: '', value: 'TBD', unit: '' }] })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("'L'");
  });
});

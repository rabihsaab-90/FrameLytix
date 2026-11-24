/**
 * Restricted arithmetic expression evaluator (no eval / Function).
 *
 * Grammar (lowest to highest precedence):
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/') unary)*
 *   unary   := ('-' | '+') unary | power
 *   power   := primary ('^' unary)?        // right-associative; binds tighter than unary minus
 *   primary := number | identifier | identifier '(' args ')' | '(' expr ')'
 *
 * Constants `pi` and `e` take precedence: a variable with either name is ignored.
 * Units are NOT handled; they are preserved as text elsewhere and the caller is
 * responsible for using consistent units.
 */
import type { Calculation } from '../schemas/project';

export type EvalResult = { ok: true; value: number } | { ok: false; error: string };

const MAX_LENGTH = 1000;
const MAX_DEPTH = 64;

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

const FUNCTIONS: Record<string, { min: number; max: number; fn: (...a: number[]) => number }> = {
  sqrt: { min: 1, max: 1, fn: Math.sqrt },
  abs: { min: 1, max: 1, fn: Math.abs },
  sin: { min: 1, max: 1, fn: Math.sin },
  cos: { min: 1, max: 1, fn: Math.cos },
  tan: { min: 1, max: 1, fn: Math.tan },
  asin: { min: 1, max: 1, fn: Math.asin },
  acos: { min: 1, max: 1, fn: Math.acos },
  atan: { min: 1, max: 1, fn: Math.atan },
  ln: { min: 1, max: 1, fn: Math.log },
  log10: { min: 1, max: 1, fn: Math.log10 },
  exp: { min: 1, max: 1, fn: Math.exp },
  min: { min: 1, max: 64, fn: Math.min },
  max: { min: 1, max: 64, fn: Math.max },
  round: { min: 1, max: 1, fn: Math.round }
};

type Token =
  | { t: 'num'; v: number; pos: number }
  | { t: 'id'; v: string; pos: number }
  | { t: 'op'; v: string; pos: number }
  | { t: 'end'; pos: number };

class EvalError extends Error {}

function tokenise(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src.charAt(i);
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new EvalError(`Invalid number at position ${i + 1}.`);
      const text = m[0];
      const v = Number(text);
      if (!Number.isFinite(v)) throw new EvalError(`The number '${text}' is too large.`);
      tokens.push({ t: 'num', v, pos: i });
      i += text.length;
    } else if (/[A-Za-z_]/.test(ch)) {
      const text = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))?.[0] ?? ch;
      tokens.push({ t: 'id', v: text, pos: i });
      i += text.length;
    } else if ('+-*/^(),'.includes(ch)) {
      tokens.push({ t: 'op', v: ch, pos: i });
      i++;
    } else {
      throw new EvalError(`Unexpected character '${ch}' at position ${i + 1}.`);
    }
  }
  tokens.push({ t: 'end', pos: src.length });
  return tokens;
}

class Parser {
  private i = 0;
  private depth = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly vars: Record<string, number>
  ) {}

  private get cur(): Token {
    return this.tokens[this.i] ?? this.tokens[this.tokens.length - 1] ?? { t: 'end', pos: 0 };
  }
  private isOp(v: string): boolean {
    const c = this.cur;
    return c.t === 'op' && c.v === v;
  }
  private enter(): void {
    if (++this.depth > MAX_DEPTH) throw new EvalError(`The expression is nested too deeply (limit ${MAX_DEPTH}).`);
  }
  private leave(): void {
    this.depth--;
  }

  parse(): number {
    const v = this.expr();
    if (this.cur.t !== 'end') {
      if (this.isOp(')')) throw new EvalError('Mismatched parentheses: unexpected “)”.');
      throw new EvalError(`Unexpected '${this.describe(this.cur)}' at position ${this.cur.pos + 1}.`);
    }
    return v;
  }

  private describe(t: Token): string {
    return t.t === 'end' ? 'end of expression' : String(t.v);
  }

  private expr(): number {
    let v = this.term();
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.cur as { v: string }).v;
      this.i++;
      const r = this.term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  private term(): number {
    let v = this.unary();
    while (this.isOp('*') || this.isOp('/')) {
      const op = (this.cur as { v: string }).v;
      this.i++;
      const r = this.unary();
      if (op === '/') {
        if (r === 0) throw new EvalError('Division by zero.');
        v = v / r;
      } else {
        v = v * r;
      }
    }
    return v;
  }

  private unary(): number {
    if (this.isOp('-')) {
      this.i++;
      this.enter();
      const v = -this.unary();
      this.leave();
      return v;
    }
    if (this.isOp('+')) {
      this.i++;
      this.enter();
      const v = this.unary();
      this.leave();
      return v;
    }
    return this.power();
  }

  private power(): number {
    const base = this.primary();
    if (this.isOp('^')) {
      this.i++;
      this.enter();
      const exp = this.unary(); // right-associative; allows 2^-1 and 2^3^2
      this.leave();
      const v = Math.pow(base, exp);
      if (Number.isNaN(v)) throw new EvalError('The power operation does not give a real number.');
      return v;
    }
    return base;
  }

  private primary(): number {
    const tok = this.cur;
    if (tok.t === 'num') {
      this.i++;
      return tok.v;
    }
    if (tok.t === 'id') {
      this.i++;
      if (this.isOp('(')) {
        const def = Object.prototype.hasOwnProperty.call(FUNCTIONS, tok.v) ? FUNCTIONS[tok.v] : undefined;
        if (!def) throw new EvalError(`Unknown function '${tok.v}'.`);
        this.i++;
        const args: number[] = [];
        this.enter();
        if (!this.isOp(')')) {
          args.push(this.expr());
          while (this.isOp(',')) {
            this.i++;
            args.push(this.expr());
          }
        }
        this.leave();
        if (!this.isOp(')')) throw new EvalError('Mismatched parentheses: missing “)”.');
        this.i++;
        if (args.length < def.min || args.length > def.max) {
          throw new EvalError(`Function '${tok.v}' expects ${def.min === def.max ? def.min : `${def.min} to ${def.max}`} argument(s) but received ${args.length}.`);
        }
        const v = def.fn(...args);
        if (!Number.isFinite(v)) throw new EvalError(`${tok.v}(${args.join(', ')}) does not give a finite result.`);
        return v;
      }
      const constant = Object.prototype.hasOwnProperty.call(CONSTANTS, tok.v) ? CONSTANTS[tok.v] : undefined;
      if (constant !== undefined) return constant;
      const variable = Object.prototype.hasOwnProperty.call(this.vars, tok.v) ? this.vars[tok.v] : undefined;
      if (variable !== undefined) return variable;
      throw new EvalError(`Unknown variable '${tok.v}'.`);
    }
    if (this.isOp('(')) {
      this.i++;
      this.enter();
      const v = this.expr();
      this.leave();
      if (!this.isOp(')')) throw new EvalError('Mismatched parentheses: missing “)”.');
      this.i++;
      return v;
    }
    if (tok.t === 'end') throw new EvalError('The expression ended unexpectedly.');
    throw new EvalError(`Unexpected '${tok.v}' at position ${tok.pos + 1}.`);
  }
}

export function evaluateExpression(expr: string, variables: Record<string, number>): EvalResult {
  try {
    if (typeof expr !== 'string' || expr.trim() === '') return { ok: false, error: 'The expression is empty.' };
    if (expr.length > MAX_LENGTH) return { ok: false, error: `The expression is longer than ${MAX_LENGTH} characters.` };
    const value = new Parser(tokenise(expr), variables).parse();
    if (!Number.isFinite(value)) return { ok: false, error: 'The result is not a finite number.' };
    return { ok: true, value };
  } catch (err) {
    if (err instanceof EvalError) return { ok: false, error: err.message };
    return { ok: false, error: 'The expression could not be evaluated.' };
  }
}

/** Plain decimal / scientific number text → number; null for '' or non-finite. */
export function parseVariableValue(s: string): number | null {
  const t = (s ?? '').trim();
  if (t === '') return null;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function evaluateCalculation(calc: Calculation): EvalResult {
  const vars: Record<string, number> = {};
  for (const v of calc.variables) {
    const n = parseVariableValue(v.value);
    if (n === null) {
      return { ok: false, error: `Variable '${v.symbol}' does not have a numeric value.` };
    }
    vars[v.symbol] = n;
  }
  return evaluateExpression(calc.expression, vars);
}

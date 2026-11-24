import { useEffect, useId, useState } from 'react';
import { TextInput } from '@/components/common/ui';

/**
 * Numeric percentage input that allows decimals while typing and rejects negative values
 * with a visible message (the stored value is left unchanged until a valid number is typed).
 */
export function WeightInput({ value, onCommit, label }: { value: number; onCommit: (v: number) => void; label: string }) {
  const [text, setText] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const errId = useId();

  useEffect(() => {
    setText((t) => (Number.parseFloat(t) === value ? t : String(value)));
    setError(null);
  }, [value]);

  const onChange = (raw: string) => {
    setText(raw);
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) {
      setError('Enter a number.');
      return;
    }
    if (n < 0) {
      setError('Weights cannot be negative.');
      return;
    }
    setError(null);
    onCommit(n);
  };

  return (
    <div className="flex flex-col gap-0.5">
      <TextInput
        type="number"
        inputMode="decimal"
        step="any"
        min={0}
        mono
        className="w-20 text-right"
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        value={text}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? (
        <span id={errId} role="alert" className="max-w-24 text-2xs text-[#fca5a5]">
          {error}
        </span>
      ) : null}
    </div>
  );
}

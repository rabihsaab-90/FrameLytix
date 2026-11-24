/** Read-only text preview (first 512 KB). Content is shown as plain text in a <pre>; it is never executed or interpreted. */
import { useEffect, useState } from 'react';
import { FileWarning } from 'lucide-react';
import { assetUrl } from '@shared/types/ipc';
import { extensionOf } from '@shared/utilities/paths';
import { Callout, Spinner } from '@/components/common/ui';
import { formatBytes } from '@/lib/labels';
import { TEXT_PREVIEW_MAX_BYTES, looksBinary } from './viewerMath';
import { ViewerMessage } from './ViewerChrome';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'binary' }
  | { status: 'ready'; text: string; truncated: boolean; shownBytes: number };

async function readLimited(url: string, limit: number): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The file could not be read (HTTP ${res.status}).`);
  if (!res.body) {
    const all = new Uint8Array(await res.arrayBuffer());
    return { bytes: all.subarray(0, limit), truncated: all.length > limit };
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (total + value.length > limit) {
      chunks.push(value.subarray(0, limit - total));
      total = limit;
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
    total += value.length;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return { bytes, truncated };
}

export default function TextPreview({ path, epoch }: { path: string; epoch: number }) {
  const url = assetUrl(path, epoch);
  const [state, setState] = useState<State>({ status: 'loading' });
  const ext = extensionOf(path);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    readLimited(url, TEXT_PREVIEW_MAX_BYTES).then(
      ({ bytes, truncated }) => {
        if (cancelled) return;
        if (looksBinary(bytes)) {
          setState({ status: 'binary' });
          return;
        }
        setState({ status: 'ready', text: new TextDecoder('utf-8').decode(bytes), truncated, shownBytes: bytes.length });
      },
      (err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : 'The file could not be read.' });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (state.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Loading text…" />
      </div>
    );
  }
  if (state.status === 'error') {
    return <ViewerMessage icon={<FileWarning size={28} className="text-crimson-hover" aria-hidden="true" />} title="This file could not be previewed">{state.message}</ViewerMessage>;
  }
  if (state.status === 'binary') {
    return (
      <ViewerMessage icon={<FileWarning size={28} className="text-dim" aria-hidden="true" />} title="This file does not look like plain text">
        It appears to contain binary data, so no text preview is shown.
      </ViewerMessage>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b border-gunmetal bg-carbon px-3 py-2">
        {ext === 'm' ? (
          <Callout tone="info">MATLAB files are never executed by FrameLytix. This is a read-only text view.</Callout>
        ) : (
          <p className="text-2xs text-dim">Read-only text view. File contents are never executed.</p>
        )}
        {state.truncated ? (
          <Callout tone="amber">
            Showing the first <span className="font-mono">{formatBytes(state.shownBytes)}</span> only. Open the file in a text editor to see the rest.
          </Callout>
        ) : null}
      </div>
      <pre
        tabIndex={0}
        aria-label="File contents"
        className="selectable min-h-0 flex-1 overflow-auto bg-obsidian p-4 font-mono text-[12px] leading-relaxed whitespace-pre text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-crimson-hover"
      >
        {state.text === '' ? '(empty file)' : state.text}
      </pre>
    </div>
  );
}

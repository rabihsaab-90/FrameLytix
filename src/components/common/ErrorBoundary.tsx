import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Short name of the area, shown in the message (e.g. "PDF viewer"). */
  area: string;
  /** Changing this key resets the boundary (e.g. route or file path). */
  resetKey?: string;
  compact?: boolean;
}
interface State {
  error: Error | null;
}

/** Keeps a single failing view (e.g. one corrupted file preview) from blanking the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[${this.props.area}]`, error.message, info.componentStack?.split('\n').slice(0, 4).join('\n'));
  }

  override componentDidUpdate(prev: Props): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className={this.props.compact ? 'p-4' : 'flex h-full items-center justify-center p-8'}>
        <div className="max-w-md rounded-lg border border-crimson/40 bg-carbon p-5">
          <div className="flex items-center gap-2 text-[#fca5a5]">
            <AlertOctagon size={18} aria-hidden="true" />
            <h2 className="text-sm font-semibold">The {this.props.area} encountered a problem</h2>
          </div>
          <p className="mt-2 font-mono text-2xs break-words text-silver selectable">{this.state.error.message}</p>
          <p className="mt-2 text-xs text-silver">Your project data has not been changed. You can retry or navigate elsewhere.</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-gunmetal px-2.5 py-1 text-xs text-white hover:border-steel"
          >
            <RotateCcw size={12} aria-hidden="true" /> Retry
          </button>
        </div>
      </div>
    );
  }
}

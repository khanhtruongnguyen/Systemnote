import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 m-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex flex-col gap-3 shadow-sm">
          <div className="flex items-center gap-2 font-semibold text-rose-700">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
            <span>{this.props.fallbackTitle || 'Đã có lỗi xảy ra khi hiển thị khu vực này.'}</span>
          </div>
          <p className="text-xs text-rose-700 font-mono bg-white p-2.5 rounded-lg border border-rose-200 overflow-x-auto">
            {this.state.error?.message || 'Lỗi không xác định'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-medium text-white transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Thử tải lại ô này</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

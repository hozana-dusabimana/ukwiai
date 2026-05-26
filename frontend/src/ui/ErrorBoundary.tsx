import React from "react";
import { AlertOctagon } from "lucide-react";

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, info);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-lg p-8 shadow-lg space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-50 rounded">
              <AlertOctagon className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">Something broke in the UI</h2>
              <p className="text-xs text-gray-500">The page hit an unexpected error.</p>
            </div>
          </div>
          {this.state.error && (
            <pre className="bg-gray-50 border border-gray-200 rounded p-3 text-[10px] text-gray-700 overflow-x-auto max-h-48">
              {this.state.error.message}
              {"\n"}
              {this.state.error.stack}
            </pre>
          )}
          <button
            onClick={() => {
              this.reset();
              window.location.reload();
            }}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2.5 rounded uppercase tracking-wider"
          >
            Reload application
          </button>
        </div>
      </div>
    );
  }
}

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defense for embedded contexts (Toy iframe): a render error
 * must show an actionable fallback, never a blank white page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Uncaught render error:", error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-16 text-center">
        <div className="text-sm font-semibold text-ink-50">页面遇到了一点问题</div>
        <p className="text-xs leading-relaxed text-ink-400">
          刷新页面通常就能恢复。如果一直打不开，多半是浏览器禁用了本站的数据存储
          —— 请换普通窗口打开，并在浏览器设置里允许本站保存站点数据。
          你的记录仍在本地数据库里，没有因为这次出错而丢失。
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-sm text-gold-300"
        >
          刷新页面
        </button>
      </div>
    );
  }
}

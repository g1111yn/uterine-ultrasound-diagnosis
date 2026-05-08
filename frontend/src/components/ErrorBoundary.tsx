import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
  info: ErrorInfo | null
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info })
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  reset = () => this.setState({ error: null, info: null })

  copyDetails = () => {
    const { error, info } = this.state
    const payload = [
      error?.message ?? '',
      '',
      error?.stack ?? '',
      '',
      info?.componentStack ?? '',
    ].join('\n')
    navigator.clipboard?.writeText(payload).catch(() => {})
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-secondary p-6">
        <div className="max-w-xl w-full rounded-lg border border-danger-border bg-bg-primary p-5 space-y-3">
          <div className="text-sm font-medium text-danger-text">页面渲染出错</div>
          <div className="text-xs text-text-secondary">
            错误信息：
            <code className="ml-1 font-mono text-[11px] text-text-primary break-all">
              {error.message}
            </code>
          </div>
          <div className="text-xs text-text-secondary">
            请将错误信息反馈给信息科，重启页面后若仍出错请记录发生前的操作步骤。
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={this.copyDetails}
              className="px-2.5 py-1 rounded-md border border-border-secondary bg-bg-primary text-xs text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              复制错误信息
            </button>
            <button
              onClick={() => { this.reset(); window.location.reload() }}
              className="px-2.5 py-1 rounded-md bg-accent text-xs text-white hover:bg-accent-hover transition-colors"
            >
              重新加载
            </button>
          </div>
        </div>
      </div>
    )
  }
}

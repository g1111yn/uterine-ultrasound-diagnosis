import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Loader2, LogIn } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'

const inputClass =
  'w-full rounded-md border border-border-secondary bg-bg-primary px-3 py-2 text-xs text-text-primary outline-none focus:border-info-border transition-colors'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, login, loading: authLoading } = useAuth()
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // 已登录则跳走
  useEffect(() => {
    if (!authLoading && user) {
      if (user.must_change_password) {
        navigate('/change-password', { replace: true })
      } else {
        const from = (location.state as { from?: string } | null)?.from ?? '/'
        navigate(from, { replace: true })
      }
    }
  }, [user, authLoading, navigate, location.state])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!userId || !password) return
    setError(null)
    setSubmitting(true)
    try {
      const logged = await login(userId.trim(), password)
      if (logged.must_change_password) {
        navigate('/change-password', { replace: true })
      } else {
        const from = (location.state as { from?: string } | null)?.from ?? '/'
        navigate(from, { replace: true })
      }
    } catch (err) {
      setError((err as Error).message || '登录失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-secondary px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-success-border" />
          <span className="text-sm font-medium text-text-primary">子宫超声辅助诊断</span>
          <span className="text-xs text-text-tertiary font-normal">v1</span>
        </div>

        <div className="rounded-lg border border-border bg-bg-primary p-5 space-y-4">
          <h1 className="text-base font-medium text-text-primary">登录</h1>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs text-text-secondary">用户名</label>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className={`${inputClass} tabular-nums`}
                placeholder="请输入用户名"
                autoComplete="username"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-text-secondary">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder="请输入密码"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="rounded-md border border-danger-border bg-danger-bg p-2.5 text-xs text-danger-text">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !userId || !password}
              className="w-full flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-xs font-medium bg-info-text text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  登录中...
                </>
              ) : (
                <>
                  <LogIn className="w-3.5 h-3.5" />
                  登录
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-[11px] text-text-tertiary mt-3 text-center">
          仅供辅助诊断参考，最终诊断以医生判断为准
        </p>
      </div>
    </div>
  )
}

import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, KeyRound } from 'lucide-react'
import { changePassword } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'

const inputClass =
  'w-full rounded-md border border-border-secondary bg-bg-primary px-3 py-2 text-xs text-text-primary outline-none focus:border-info-border transition-colors'

export default function ChangePassword() {
  const navigate = useNavigate()
  const { user, refresh } = useAuth()
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const forced = user?.must_change_password ?? false

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (newPw.length < 6) {
      setError('新密码至少 6 位')
      return
    }
    if (newPw !== confirmPw) {
      setError('两次输入的新密码不一致')
      return
    }
    setSubmitting(true)
    try {
      await changePassword({ current_password: currentPw, new_password: newPw })
      await refresh()
      navigate('/', { replace: true })
    } catch (err) {
      setError((err as Error).message || '修改失败')
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
        </div>

        <div className="rounded-lg border border-border bg-bg-primary p-5 space-y-4">
          <h1 className="text-base font-medium text-text-primary">
            {forced ? '首次登录，请修改密码' : '修改密码'}
          </h1>
          {forced && (
            <p className="text-[11px] text-text-tertiary">
              为保证账号安全，请将初始密码修改为只有您本人知道的密码
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs text-text-secondary">当前密码</label>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className={inputClass}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-text-secondary">新密码</label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className={inputClass}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-text-secondary">确认新密码</label>
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className={inputClass}
                autoComplete="new-password"
              />
            </div>

            {error && (
              <div className="rounded-md border border-danger-border bg-danger-bg p-2.5 text-xs text-danger-text">
                {error}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={submitting || !currentPw || !newPw || !confirmPw}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-xs font-medium bg-info-text text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    提交中...
                  </>
                ) : (
                  <>
                    <KeyRound className="w-3.5 h-3.5" />
                    确认修改
                  </>
                )}
              </button>
              {!forced && (
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="rounded-md border border-border-secondary bg-bg-primary px-3.5 py-2 text-xs text-text-primary hover:bg-bg-tertiary transition-colors"
                >
                  取消
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

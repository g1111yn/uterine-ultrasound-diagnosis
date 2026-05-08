import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, X, Check, UserCog } from 'lucide-react'
import {
  adminListUsers,
  adminCreateUser,
  adminPatchUser,
} from '@/api/client'
import type { AdminUserCreateIn, AdminUserPatchIn, User, UserRole } from '@/lib/types'
import { formatDateTime } from '@/lib/utils'

const inputClass =
  'w-full rounded-md border border-border-secondary bg-bg-primary px-3 py-2 text-xs text-text-primary outline-none focus:border-info-border transition-colors'

const tableClass =
  'w-full text-xs border-collapse ' +
  '[&_th]:text-left [&_th]:px-2.5 [&_th]:py-2 [&_th]:font-medium [&_th]:text-text-secondary [&_th]:text-[11px] [&_th]:border-b [&_th]:border-border ' +
  '[&_td]:px-2.5 [&_td]:py-2.5 [&_td]:border-b [&_td]:border-border ' +
  '[&_tr:last-child_td]:border-b-0'

export default function AdminUsers() {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-users'],
    queryFn: adminListUsers,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] })

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-text-primary">用户管理</h1>
          <p className="text-[11px] text-text-tertiary mt-0.5 tabular-nums">
            共 {data?.total ?? 0} 位用户
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-info-text text-white hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
          新建用户
        </button>
      </div>

      {isError && (
        <div className="rounded-md border border-danger-border bg-danger-bg p-2.5 text-xs text-danger-text mb-4">
          {(error as Error).message}
        </div>
      )}

      <div className="rounded-lg border border-border bg-bg-primary overflow-hidden">
        <table className={tableClass}>
          <thead>
            <tr>
              <th>用户名</th>
              <th>姓名</th>
              <th>科室</th>
              <th>角色</th>
              <th>状态</th>
              <th>上次登录</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-text-tertiary" />
                </td>
              </tr>
            ) : data && data.items.length > 0 ? (
              data.items.map((u) => (
                <tr key={u.user_id}>
                  <td className="font-mono text-[11px] tabular-nums text-text-primary">
                    {u.user_id}
                  </td>
                  <td className="text-text-primary">{u.display_name}</td>
                  <td className="text-text-secondary">{u.department ?? '—'}</td>
                  <td>
                    {u.role === 'admin' ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-info-bg text-info-text font-medium">
                        admin
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-bg-tertiary text-text-secondary font-medium">
                        doctor
                      </span>
                    )}
                  </td>
                  <td>
                    {u.is_active ? (
                      <span className="text-[10px] text-success-text">启用</span>
                    ) : (
                      <span className="text-[10px] text-text-tertiary">禁用</span>
                    )}
                  </td>
                  <td className="text-[11px] text-text-secondary tabular-nums">
                    {u.last_login_at ? formatDateTime(u.last_login_at) : '—'}
                  </td>
                  <td>
                    <button
                      onClick={() => setEditingId(u.user_id)}
                      className="flex items-center gap-1 text-[11px] font-medium text-info-text hover:opacity-80 transition-opacity"
                    >
                      <UserCog className="w-3 h-3" />
                      修改
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-text-secondary">
                  暂无用户
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            refresh()
          }}
        />
      )}

      {editingId && data && (
        <EditUserModal
          user={data.items.find((u) => u.user_id === editingId)!}
          onClose={() => setEditingId(null)}
          onUpdated={() => {
            setEditingId(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

// ========== 新建用户模态框 ==========
function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState<AdminUserCreateIn>({
    user_id: '',
    display_name: '',
    department: '',
    password: '',
    role: 'doctor',
  })
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () =>
      adminCreateUser({
        ...form,
        department: form.department?.trim() || undefined,
      }),
    onSuccess: onCreated,
    onError: (err: Error) => setError(err.message),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    create.mutate()
  }

  return (
    <ModalShell title="新建用户" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormRow label="用户名">
          <input
            type="text"
            value={form.user_id}
            onChange={(e) => setForm({ ...form, user_id: e.target.value })}
            className={`${inputClass} tabular-nums`}
            required
            autoFocus
          />
        </FormRow>
        <FormRow label="姓名">
          <input
            type="text"
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            className={inputClass}
            required
          />
        </FormRow>
        <FormRow label="科室（可选）">
          <input
            type="text"
            value={form.department ?? ''}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
            className={inputClass}
          />
        </FormRow>
        <FormRow label="初始密码">
          <input
            type="text"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className={inputClass}
            required
          />
        </FormRow>
        <FormRow label="角色">
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            className={inputClass}
          >
            <option value="doctor">doctor</option>
            <option value="admin">admin</option>
          </select>
        </FormRow>

        {error && (
          <div className="rounded-md border border-danger-border bg-danger-bg p-2.5 text-xs text-danger-text">
            {error}
          </div>
        )}

        <ModalFooter
          onClose={onClose}
          loading={create.isPending}
          submitLabel="创建"
        />
      </form>
    </ModalShell>
  )
}

// ========== 编辑用户模态框 ==========
function EditUserModal({
  user,
  onClose,
  onUpdated,
}: {
  user: User
  onClose: () => void
  onUpdated: () => void
}) {
  const [form, setForm] = useState<AdminUserPatchIn>({
    display_name: user.display_name,
    department: user.department ?? '',
    role: user.role,
    is_active: user.is_active,
  })
  const [newPw, setNewPw] = useState('')
  const [forcePwChange, setForcePwChange] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patch = useMutation({
    mutationFn: () => {
      const body: AdminUserPatchIn = { ...form }
      if (body.department === '') body.department = undefined
      if (newPw) {
        body.new_password = newPw
        body.force_password_change = forcePwChange
      }
      return adminPatchUser(user.user_id, body)
    },
    onSuccess: onUpdated,
    onError: (err: Error) => setError(err.message),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    patch.mutate()
  }

  return (
    <ModalShell title={`修改 · ${user.user_id}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormRow label="姓名">
          <input
            type="text"
            value={form.display_name ?? ''}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            className={inputClass}
          />
        </FormRow>
        <FormRow label="科室">
          <input
            type="text"
            value={form.department ?? ''}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
            className={inputClass}
          />
        </FormRow>
        <FormRow label="角色">
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            className={inputClass}
          >
            <option value="doctor">doctor</option>
            <option value="admin">admin</option>
          </select>
        </FormRow>
        <FormRow label="账号状态">
          <label className="flex items-center gap-2 text-xs text-text-primary">
            <input
              type="checkbox"
              checked={form.is_active ?? true}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            启用
          </label>
        </FormRow>

        <div className="h-px bg-border" />

        <FormRow label="重置密码（留空不修改）">
          <input
            type="text"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            className={inputClass}
            placeholder="新密码"
          />
        </FormRow>
        {newPw && (
          <label className="flex items-center gap-2 text-[11px] text-text-secondary">
            <input
              type="checkbox"
              checked={forcePwChange}
              onChange={(e) => setForcePwChange(e.target.checked)}
            />
            强制用户下次登录时修改密码
          </label>
        )}

        {error && (
          <div className="rounded-md border border-danger-border bg-danger-bg p-2.5 text-xs text-danger-text">
            {error}
          </div>
        )}

        <ModalFooter
          onClose={onClose}
          loading={patch.isPending}
          submitLabel="保存修改"
        />
      </form>
    </ModalShell>
  )
}

// ========== 通用 ==========
function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/20">
      <div className="w-full max-w-md rounded-lg border border-border bg-bg-primary p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="p-1 rounded text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] text-text-tertiary">{label}</label>
      {children}
    </div>
  )
}

function ModalFooter({
  onClose,
  loading,
  submitLabel,
}: {
  onClose: () => void
  loading: boolean
  submitLabel: string
}) {
  return (
    <div className="flex items-center gap-2 justify-end pt-2">
      <button
        type="button"
        onClick={onClose}
        className="rounded-md border border-border-secondary bg-bg-primary px-3 py-1.5 text-xs text-text-primary hover:bg-bg-tertiary transition-colors"
      >
        取消
      </button>
      <button
        type="submit"
        disabled={loading}
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-info-text text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Check className="w-3.5 h-3.5" />
        )}
        {submitLabel}
      </button>
    </div>
  )
}

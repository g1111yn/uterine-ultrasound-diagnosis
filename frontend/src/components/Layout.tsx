import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ChevronDown, KeyRound, LogOut, Users, FileText, Activity } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'

const navItems = [
  { to: '/', label: '单例推理', end: true },
  { to: '/batch', label: '批量推理' },
  { to: '/history', label: '历史记录' },
  { to: '/settings', label: '设置' },
]

const adminItems = [
  { to: '/admin/users', label: '用户管理', icon: Users },
  { to: '/admin/audit-logs', label: '审计日志', icon: FileText },
  { to: '/admin/stats', label: '系统统计', icon: Activity },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [adminMenuOpen, setAdminMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const adminMenuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭菜单
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target as Node)) {
        setAdminMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const isAdmin = user?.role === 'admin'

  return (
    <div className="min-h-screen bg-bg-secondary">
      <nav className="flex items-center gap-5 px-4 py-2.5 border-b border-border bg-bg-secondary">
        <div className="flex items-center gap-2 text-[13px] font-medium text-text-primary">
          <span className="w-1.5 h-1.5 rounded-full bg-success-border" />
          子宫超声辅助诊断
          <span className="text-text-tertiary font-normal">v1</span>
        </div>

        <div className="flex gap-0.5 ml-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `px-2.5 py-1 text-xs rounded-md transition-colors ${
                  isActive
                    ? 'bg-bg-primary text-text-primary font-medium'
                    : 'text-text-secondary hover:text-text-primary'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}

          {isAdmin && (
            <div className="relative" ref={adminMenuRef}>
              <button
                onClick={() => setAdminMenuOpen((v) => !v)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md text-text-secondary hover:text-text-primary transition-colors"
              >
                管理
                <ChevronDown className="w-3 h-3" />
              </button>
              {adminMenuOpen && (
                <div className="absolute left-0 top-full mt-1 min-w-[140px] rounded-md border border-border bg-bg-primary shadow-none py-1 z-20">
                  {adminItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setAdminMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2 px-2.5 py-1.5 text-xs transition-colors ${
                          isActive
                            ? 'bg-bg-tertiary text-text-primary font-medium'
                            : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                        }`
                      }
                    >
                      <item.icon className="w-3 h-3" />
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ml-auto relative" ref={userMenuRef}>
          {user && (
            <>
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md text-text-primary hover:bg-bg-primary transition-colors"
              >
                <span className="font-medium">{user.display_name}</span>
                {user.role === 'admin' && (
                  <span className="text-[10px] px-1 py-px rounded bg-info-bg text-info-text">
                    admin
                  </span>
                )}
                <ChevronDown className="w-3 h-3 text-text-tertiary" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-1 min-w-[160px] rounded-md border border-border bg-bg-primary py-1 z-20">
                  <div className="px-2.5 py-1.5 border-b border-border">
                    <div className="text-[11px] font-medium text-text-primary">
                      {user.display_name}
                    </div>
                    <div className="text-[10px] text-text-tertiary tabular-nums">
                      {user.user_id}
                      {user.department && ` · ${user.department}`}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setUserMenuOpen(false)
                      navigate('/change-password')
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors"
                  >
                    <KeyRound className="w-3 h-3" />
                    修改密码
                  </button>

                  {isAdmin && (
                    <>
                      <div className="h-px bg-border my-1" />
                      {adminItems.map((item) => (
                        <button
                          key={item.to}
                          onClick={() => {
                            setUserMenuOpen(false)
                            navigate(item.to)
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors"
                        >
                          <item.icon className="w-3 h-3" />
                          {item.label}
                        </button>
                      ))}
                    </>
                  )}

                  <div className="h-px bg-border my-1" />

                  <button
                    onClick={() => {
                      setUserMenuOpen(false)
                      logout()
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors"
                  >
                    <LogOut className="w-3 h-3" />
                    退出登录
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </nav>
      <main className="p-4">
        <Outlet />
      </main>
    </div>
  )
}

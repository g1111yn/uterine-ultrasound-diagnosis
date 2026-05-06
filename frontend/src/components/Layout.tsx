import { NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { to: '/', label: '单例推理' },
  { to: '/batch', label: '批量推理' },
  { to: '/history', label: '历史记录' },
  { to: '/settings', label: '设置' },
]

export default function Layout() {
  return (
    <div className="min-h-screen bg-bg-secondary">
      <nav className="flex items-center gap-5 px-4 py-2.5 border-b border-border bg-bg-secondary">
        <div className="flex items-center gap-2 text-[13px] font-medium text-text-primary">
          <span className="w-1.5 h-1.5 rounded-full bg-success-border" />
          子宫超声辅助诊断
          <span className="text-text-tertiary font-normal">v0.3</span>
        </div>
        <div className="flex gap-0.5 ml-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
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
        </div>
      </nav>
      <main className="p-4">
        <Outlet />
      </main>
    </div>
  )
}

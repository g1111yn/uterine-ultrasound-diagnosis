import { NavLink } from 'react-router-dom'

const items = [
  { to: '/batch', label: '新建任务', end: true },
  { to: '/batch/running', label: '运行中', end: true },
  { to: '/batch/history', label: '历史记录', end: true },
]

export default function BatchNav() {
  return (
    <nav aria-label="批量任务" className="flex gap-1 border-b border-border mb-4">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `px-3 py-2 text-xs border-b-2 transition-colors ${
              isActive
                ? 'border-accent bg-bg-primary text-text-primary font-medium'
                : 'border-transparent text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

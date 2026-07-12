import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
}

export default function WorkspaceContainer({ children, className = '' }: Props) {
  return (
    <div className={`w-full max-w-[1600px] mx-auto ${className}`.trim()}>
      {children}
    </div>
  )
}

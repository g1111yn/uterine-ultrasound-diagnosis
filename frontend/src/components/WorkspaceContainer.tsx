import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  children: ReactNode
  className?: string
}

export default function WorkspaceContainer({ children, className = '' }: Props) {
  return (
    <div className={cn('w-full max-w-[1600px] mx-auto', className)}>
      {children}
    </div>
  )
}

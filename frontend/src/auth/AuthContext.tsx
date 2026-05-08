import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getMe, login as apiLogin, logout as apiLogout, registerUnauthorizedHandler } from '@/api/client'
import type { User } from '@/lib/types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (userId: string, password: string) => Promise<User>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface Props {
  children: ReactNode
}

export function AuthProvider({ children }: Props) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()
  const locationRef = useRef(location)
  useEffect(() => {
    locationRef.current = location
  }, [location])

  const refresh = useCallback(async () => {
    try {
      const data = await getMe()
      setUser(data.user)
    } catch {
      setUser(null)
    }
  }, [])

  // 初始化：从 cookie 恢复会话
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await getMe()
        if (!cancelled) setUser(data.user)
      } catch {
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 注册 401 全局处理：不在登录页才跳转
  useEffect(() => {
    registerUnauthorizedHandler(() => {
      setUser(null)
      const current = locationRef.current.pathname
      if (current !== '/login') {
        navigate('/login', { replace: true })
      }
    })
    return () => registerUnauthorizedHandler(null)
  }, [navigate])

  const login = useCallback(async (userId: string, password: string) => {
    const { user: loggedIn } = await apiLogin({ user_id: userId, password })
    setUser(loggedIn)
    return loggedIn
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } catch {
      // 忽略登出错误
    }
    setUser(null)
    navigate('/login', { replace: true })
  }, [navigate])

  const value: AuthContextValue = {
    user,
    loading,
    login,
    logout,
    refresh,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth 必须在 AuthProvider 内使用')
  }
  return ctx
}

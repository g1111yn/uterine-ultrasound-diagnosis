import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/auth/AuthContext'
import ProtectedRoute from '@/auth/ProtectedRoute'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import ChangePassword from '@/pages/ChangePassword'
import Predict from '@/pages/Predict'
import Batch from '@/pages/Batch'
import History from '@/pages/History'
import CaseDetail from '@/pages/CaseDetail'
import Settings from '@/pages/Settings'
import AdminUsers from '@/pages/admin/Users'
import AdminAuditLogs from '@/pages/admin/AuditLogs'
import AdminStats from '@/pages/admin/Stats'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/change-password" element={<ChangePassword />} />

            {/* 受保护路由 */}
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<Predict />} />
                <Route path="/predict" element={<Navigate to="/" replace />} />
                <Route path="/batch" element={<Batch />} />
                <Route path="/history" element={<History />} />
                <Route path="/case/:caseId" element={<CaseDetail />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Route>

            {/* 管理员路由 */}
            <Route element={<ProtectedRoute adminOnly />}>
              <Route element={<Layout />}>
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/audit-logs" element={<AdminAuditLogs />} />
                <Route path="/admin/stats" element={<AdminStats />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

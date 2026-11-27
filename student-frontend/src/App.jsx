import { Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { ToastProvider } from './components/ui'

// layouts
import AppLayout from './layouts/AppLayout'
import ExaminerLayout from './layouts/ExaminerLayout'

// auth
import Login from './pages/Login'

// admin
import Users from './pages/admin/Users'
import Logins from './pages/admin/Logins'

// candidate
import Exams from './pages/candidate/Exams'
import Entry from './pages/candidate/Entry'
import Workspace from './pages/candidate/Workspace'

// examiner
import Overview from './pages/examiner/Overview'
import ExamList from './pages/examiner/Exams'
import ExamForm from './pages/examiner/ExamForm'
import QuestionBank from './pages/examiner/QuestionBank'
import Enrollment from './pages/examiner/Enrollment'
import LiveMonitoring from './pages/examiner/LiveMonitoring'
import Submissions from './pages/examiner/Submissions'
import Grading from './pages/examiner/Grading'
import Analytics from './pages/examiner/Analytics'
import BulkImport from './pages/examiner/BulkImport'
import Sandbox from './pages/examiner/Sandbox'
import Announcements from './pages/examiner/Announcements'
import Profile from './pages/examiner/Profile'

function RoleRoot() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin') return <Navigate to="/admin/users" replace />
  if (user.role === 'examiner') return <Navigate to="/examiner/overview" replace />
  return <Navigate to="/candidate/exams" replace />
}

function Stub({ name }) {
  return (
    <div className="text-center py-24 px-6">
      <p className="text-3xl mb-3">🚧</p>
      <p className="font-semibold text-lg">{name}</p>
      <p className="text-slate-400 text-sm mt-1">This page is coming soon.</p>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RoleRoot />} />

          {/* ── Admin ── */}
          <Route element={<ProtectedRouteWrapper role="admin" />}>
            <Route element={<AppLayout />}>
              <Route path="/admin/users" element={<Users />} />
              <Route path="/admin/logins" element={<Logins />} />
            </Route>
          </Route>

          {/* ── Examiner ── */}
          <Route element={<ProtectedRouteWrapper role="examiner" />}>
            <Route element={<ExaminerLayout />}>
              <Route path="/examiner/overview" element={<Overview />} />
              <Route path="/examiner/exams" element={<ExamList />} />
              <Route path="/examiner/exams/new" element={<ExamForm />} />
              <Route path="/examiner/exams/:id/edit" element={<ExamForm />} />
              <Route path="/examiner/question-bank" element={<QuestionBank />} />
              <Route path="/examiner/enrollment" element={<Enrollment />} />
              <Route path="/examiner/live" element={<LiveMonitoring />} />
              <Route path="/examiner/submissions" element={<Submissions />} />
              <Route path="/examiner/grading" element={<Grading />} />
              <Route path="/examiner/analytics" element={<Analytics />} />
              <Route path="/examiner/bulk-import" element={<BulkImport />} />
              <Route path="/examiner/sandbox" element={<Sandbox />} />
              <Route path="/examiner/announcements" element={<Announcements />} />
              <Route path="/examiner/profile" element={<Profile />} />
            </Route>
          </Route>

          {/* ── Candidate ── */}
          <Route element={<ProtectedRouteWrapper role="candidate" />}>
            <Route element={<AppLayout />}>
              <Route path="/candidate/exams" element={<Exams />} />
              <Route path="/candidate/exams/:id" element={<Entry />} />
              <Route path="/candidate/results" element={<Stub name="Results" />} />
            </Route>
            {/* full-screen workspace, no sidebar */}
            <Route path="/candidate/attempt/:id" element={<Workspace />} />
          </Route>

          {/* fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  )
}

// Wrapper that uses Outlet so ProtectedRoute works with nested Routes
function ProtectedRouteWrapper({ role }) {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  if (loading) return (
    <div className="min-h-dvh flex items-center justify-center">
      <div className="h-8 w-8 rounded-full border-2 border-current border-t-transparent animate-spin opacity-40" />
    </div>
  )
  if (!user) { navigate('/login', { replace: true }); return null }
  if (role && user.role !== role) { navigate('/', { replace: true }); return null }
  return <Outlet />
}

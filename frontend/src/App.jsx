import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import { Home, Calendar, Settings, CheckCircle, List, LayoutGrid, LogOut, User as UserIcon, Users, Clock, Timer } from 'lucide-react'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Schedule from './pages/Schedule'
import VisualScheduler from './pages/VisualScheduler'
import LineView from './pages/LineView'
import Completed from './pages/Completed'
import SettingsPage from './pages/SettingsPage'
import UserManagement from './pages/UserManagement'
import CapacityCalendar from './pages/CapacityCalendar'
import ShiftConfiguration from './pages/ShiftConfiguration'
import './App.css'

function ProtectedRoute({ children, requireAuth = true }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="container loading">Loading...</div>
  }

  if (requireAuth && !user) {
    return <Navigate to="/login" />
  }

  return children
}

function Navigation() {
  const location = useLocation()
  const { user, logout, isAdmin } = useAuth()
  
  const isActive = (path) => location.pathname === path
  
  if (!user) return null
  
  return (
    <nav className="navbar">
      <div className="nav-container">
        <div className="nav-brand">
          <h1>SMT Scheduler</h1>
        </div>
        <div className="nav-links">
          <Link to="/" className={isActive('/') ? 'active' : ''}>
            <Home size={16} />
            Dashboard
          </Link>
          <Link to="/schedule" className={isActive('/schedule') ? 'active' : ''}>
            <Calendar size={16} />
            Schedule
          </Link>
          <Link to="/visual" className={isActive('/visual') ? 'active' : ''}>
            <LayoutGrid size={16} />
            Visual
          </Link>
          <Link to="/lines" className={isActive('/lines') ? 'active' : ''}>
            <List size={16} />
            Lines
          </Link>
          <Link to="/completed" className={isActive('/completed') ? 'active' : ''}>
            <CheckCircle size={16} />
            Completed
          </Link>
          <Link to="/capacity" className={isActive('/capacity') ? 'active' : ''}>
            <Clock size={16} />
            Capacity
          </Link>
          <Link to="/shifts" className={isActive('/shifts') ? 'active' : ''}>
            <Timer size={16} />
            Shifts
          </Link>
          {isAdmin && (
            <Link to="/users" className={isActive('/users') ? 'active' : ''}>
              <Users size={16} />
              Users
            </Link>
          )}
          <Link to="/settings" className={isActive('/settings') ? 'active' : ''}>
            <Settings size={16} />
            Settings
          </Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <UserIcon size={12} />
              <strong>{user.username}</strong>
            </div>
            <div style={{ fontSize: '0.7rem' }}>{user.role}</div>
          </div>
          <button
            onClick={logout}
            className="btn btn-sm btn-secondary"
            title="Logout"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </nav>
  )
}

function AppContent() {
  return (
    <div className="app">
      <Navigation />
      <main className="main-content">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/schedule" element={<ProtectedRoute><Schedule /></ProtectedRoute>} />
          <Route path="/visual" element={<ProtectedRoute><VisualScheduler /></ProtectedRoute>} />
          <Route path="/lines" element={<ProtectedRoute><LineView /></ProtectedRoute>} />
          <Route path="/lines/:lineId" element={<ProtectedRoute><LineView /></ProtectedRoute>} />
          <Route path="/completed" element={<ProtectedRoute><Completed /></ProtectedRoute>} />
          <Route path="/capacity" element={<ProtectedRoute><CapacityCalendar /></ProtectedRoute>} />
          <Route path="/shifts" element={<ProtectedRoute><ShiftConfiguration /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  )
}

export default App


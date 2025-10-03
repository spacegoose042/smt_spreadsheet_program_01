import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import { Home, Calendar, Settings, CheckCircle, List, LayoutGrid, LogOut, User as UserIcon, Users, Clock, Timer, Tag, ChevronDown, Key, AlertTriangle } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
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
import StatusManagement from './pages/StatusManagement'
import ChangePassword from './pages/ChangePassword'
import IssueTypeManagement from './pages/IssueTypeManagement'
import Issues from './pages/Issues'
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef(null)
  
  const isActive = (path) => location.pathname === path
  const isSettingsActive = ['/capacity', '/shifts', '/users', '/statuses', '/issue-types', '/settings', '/change-password'].includes(location.pathname)
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  if (!user) return null
  
  return (
    <nav className="navbar">
      <div className="nav-container">
        <div className="nav-brand">
          <img 
            src="/sandy-logo.png" 
            alt="S&Y Industries" 
            style={{ height: '40px', width: 'auto' }}
            onError={(e) => {
              // Fallback if logo doesn't load
              e.target.style.display = 'none'
              e.target.nextSibling.style.display = 'block'
            }}
          />
          <h1 style={{ display: 'none' }}>SMT Scheduler</h1>
        </div>
        <div className="nav-links">
          <Link to="/" className={isActive('/') ? 'active' : ''}>
            <Home size={18} />
            Dashboard
          </Link>
          <Link to="/schedule" className={isActive('/schedule') ? 'active' : ''}>
            <Calendar size={18} />
            Schedule
          </Link>
          <Link to="/visual" className={isActive('/visual') ? 'active' : ''}>
            <LayoutGrid size={18} />
            Visual
          </Link>
          <Link to="/lines" className={isActive('/lines') ? 'active' : ''}>
            <List size={18} />
            Lines
          </Link>
          <Link to="/completed" className={isActive('/completed') ? 'active' : ''}>
            <CheckCircle size={18} />
            Completed
          </Link>
          <Link to="/issues" className={isActive('/issues') ? 'active' : ''}>
            <AlertTriangle size={18} />
            Issues
          </Link>
          
          {/* Settings Dropdown */}
          <div className="nav-dropdown" ref={settingsRef}>
            <button
              className={`nav-dropdown-trigger ${isSettingsActive ? 'active' : ''}`}
              onClick={() => setSettingsOpen(!settingsOpen)}
            >
              <Settings size={18} />
              Settings
              <ChevronDown size={16} style={{ 
                transform: settingsOpen ? 'rotate(180deg)' : 'rotate(0)',
                transition: 'transform 0.2s'
              }} />
            </button>
            
            {settingsOpen && (
              <div className="nav-dropdown-menu">
                <Link 
                  to="/capacity" 
                  className={isActive('/capacity') ? 'active' : ''}
                  onClick={() => setSettingsOpen(false)}
                >
                  <Clock size={16} />
                  Capacity Calendar
                </Link>
                <Link 
                  to="/shifts" 
                  className={isActive('/shifts') ? 'active' : ''}
                  onClick={() => setSettingsOpen(false)}
                >
                  <Timer size={16} />
                  Shift Configuration
                </Link>
                {isAdmin && (
                  <>
                    <div className="nav-dropdown-divider" />
                    <Link 
                      to="/users" 
                      className={isActive('/users') ? 'active' : ''}
                      onClick={() => setSettingsOpen(false)}
                    >
                      <Users size={16} />
                      User Management
                    </Link>
                    <Link 
                      to="/statuses" 
                      className={isActive('/statuses') ? 'active' : ''}
                      onClick={() => setSettingsOpen(false)}
                    >
                      <Tag size={16} />
                      Status Management
                    </Link>
                    <Link 
                      to="/issue-types" 
                      className={isActive('/issue-types') ? 'active' : ''}
                      onClick={() => setSettingsOpen(false)}
                    >
                      <AlertTriangle size={16} />
                      Issue Types
                    </Link>
                    <div className="nav-dropdown-divider" />
                  </>
                )}
                <Link 
                  to="/change-password" 
                  className={isActive('/change-password') ? 'active' : ''}
                  onClick={() => setSettingsOpen(false)}
                >
                  <Key size={16} />
                  Change Password
                </Link>
                <Link 
                  to="/settings" 
                  className={isActive('/settings') ? 'active' : ''}
                  onClick={() => setSettingsOpen(false)}
                >
                  <Settings size={16} />
                  General Settings
                </Link>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ 
            fontSize: '0.875rem', 
            color: 'var(--text-secondary)',
            padding: '0.5rem 1rem',
            background: 'var(--bg-secondary)',
            borderRadius: '8px',
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <UserIcon size={16} />
              <strong style={{ color: 'var(--text-primary)' }}>{user.username}</strong>
            </div>
            <div style={{ fontSize: '0.75rem', marginTop: '0.125rem' }}>{user.role}</div>
          </div>
          <button
            onClick={logout}
            className="btn btn-sm btn-secondary"
            title="Logout"
          >
            <LogOut size={16} />
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
          <Route path="/issues" element={<ProtectedRoute><Issues /></ProtectedRoute>} />
          <Route path="/capacity" element={<ProtectedRoute><CapacityCalendar /></ProtectedRoute>} />
          <Route path="/shifts" element={<ProtectedRoute><ShiftConfiguration /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
          <Route path="/statuses" element={<ProtectedRoute><StatusManagement /></ProtectedRoute>} />
          <Route path="/issue-types" element={<ProtectedRoute><IssueTypeManagement /></ProtectedRoute>} />
          <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
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


import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import { Home, Calendar, Settings, CheckCircle, List, LayoutGrid, LogOut, User as UserIcon, Users, Clock, Timer, Tag, ChevronDown, Key, AlertTriangle, Database, RefreshCw, BarChart3, Move } from 'lucide-react'
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
import ResolutionTypeManagement from './pages/ResolutionTypeManagement'
import Issues from './pages/Issues'
import CetecImport from './pages/CetecImport'
import CetecSyncReport from './pages/CetecSyncReport'
import ProgressDashboard from './pages/ProgressDashboard'
import ProdlineScheduleExplorer from './pages/ProdlineScheduleExplorer'
import MetabaseDashboardExplorer from './pages/MetabaseDashboardExplorer'
import WireHarnessDashboard from './pages/WireHarnessDashboard'
import WireHarnessSchedule from './pages/WireHarnessSchedule'
import WireHarnessTimeline from './pages/WireHarnessTimeline'
import WorkOrderMove from './pages/WorkOrderMove'
import './App.css'

const SETTINGS_ROLES = ['admin', 'manager', 'scheduler']

function ProtectedRoute({ children, requireAuth = true, allowedRoles }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="container loading">Loading...</div>
  }

  if (requireAuth && !user) {
    return <Navigate to="/login" />
  }

  if (allowedRoles && (!user || !allowedRoles.map(r => r.toLowerCase()).includes(user.role?.toLowerCase()))) {
    return <Navigate to="/" replace />
  }

  return children
}

function Navigation() {
  const location = useLocation()
  const { user, logout, isAdmin } = useAuth()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [surfaceMountOpen, setSurfaceMountOpen] = useState(false)
  const [wireHarnessOpen, setWireHarnessOpen] = useState(false)
  const settingsRef = useRef(null)
  const surfaceMountRef = useRef(null)
  const wireHarnessRef = useRef(null)
  
  const isActive = (path) => location.pathname === path
  const surfaceMountPaths = ['/', '/schedule', '/visual', '/lines', '/completed', '/issues', '/progress']
  const wireHarnessPaths = ['/wire-harness-dashboard', '/wire-harness', '/wire-harness-timeline', '/work-order-move']
  const isSurfaceMountActive = surfaceMountPaths.includes(location.pathname)
  const isWireHarnessActive = wireHarnessPaths.includes(location.pathname)
  const isSettingsActive = ['/capacity', '/shifts', '/users', '/statuses', '/issue-types', '/resolution-types', '/cetec-import', '/cetec-sync-report', '/prodline-explorer', '/metabase-explorer', '/settings'].includes(location.pathname)
  const canAccessSettings = user && SETTINGS_ROLES.includes(user.role)
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setSettingsOpen(false)
      }
      if (surfaceMountRef.current && !surfaceMountRef.current.contains(event.target)) {
        setSurfaceMountOpen(false)
      }
      if (wireHarnessRef.current && !wireHarnessRef.current.contains(event.target)) {
        setWireHarnessOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    setSettingsOpen(false)
    setSurfaceMountOpen(false)
    setWireHarnessOpen(false)
  }, [location.pathname])
  
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
          <h1 style={{ display: 'none' }}>S & Y Schedule</h1>
        </div>
        <div className="nav-links">
          <div className="nav-dropdown" ref={surfaceMountRef}>
            <button
              className={`nav-dropdown-trigger ${isSurfaceMountActive ? 'active' : ''}`}
              onClick={() => setSurfaceMountOpen(!surfaceMountOpen)}
            >
              <Home size={18} />
              Surface Mount
              <ChevronDown size={16} style={{
                transform: surfaceMountOpen ? 'rotate(180deg)' : 'rotate(0)',
                transition: 'transform 0.2s'
              }} />
            </button>

            {surfaceMountOpen && (
              <div className="nav-dropdown-menu">
                <Link to="/" className={isActive('/') ? 'active' : ''} onClick={() => setSurfaceMountOpen(false)}>
                  <Home size={16} />
                  Dashboard
                </Link>
                <Link to="/schedule" className={isActive('/schedule') ? 'active' : ''} onClick={() => setSurfaceMountOpen(false)}>
                  <Calendar size={16} />
                  Schedule
                </Link>
                <Link to="/visual" className={isActive('/visual') ? 'active' : ''} onClick={() => setSurfaceMountOpen(false)}>
                  <LayoutGrid size={16} />
                  Visual Scheduler
                </Link>
                <Link to="/lines" className={isActive('/lines') ? 'active' : ''} onClick={() => setSurfaceMountOpen(false)}>
                  <List size={16} />
                  Lines
                </Link>
                <Link to="/completed" className={isActive('/completed') ? 'active' : ''} onClick={() => setSurfaceMountOpen(false)}>
                  <CheckCircle size={16} />
                  Completed
                </Link>
                <Link to="/issues" className={isActive('/issues') ? 'active' : ''} onClick={() => setSurfaceMountOpen(false)}>
                  <AlertTriangle size={16} />
                  Issues
                </Link>
                <Link to="/progress" className={isActive('/progress') ? 'active' : ''} onClick={() => setSurfaceMountOpen(false)}>
                  <BarChart3 size={16} />
                  Progress
                </Link>
              </div>
            )}
          </div>

          <div className="nav-dropdown" ref={wireHarnessRef}>
            <button
              className={`nav-dropdown-trigger ${isWireHarnessActive ? 'active' : ''}`}
              onClick={() => setWireHarnessOpen(!wireHarnessOpen)}
            >
              <Timer size={18} />
              Wire Harness
              <ChevronDown size={16} style={{
                transform: wireHarnessOpen ? 'rotate(180deg)' : 'rotate(0)',
                transition: 'transform 0.2s'
              }} />
            </button>

            {wireHarnessOpen && (
              <div className="nav-dropdown-menu">
                <Link
                  to="/wire-harness-dashboard"
                  className={isActive('/wire-harness-dashboard') ? 'active' : ''}
                  onClick={() => setWireHarnessOpen(false)}
                >
                  <BarChart3 size={16} />
                  Dashboard
                </Link>
                <Link
                  to="/wire-harness"
                  className={isActive('/wire-harness') ? 'active' : ''}
                  onClick={() => setWireHarnessOpen(false)}
                >
                  <Timer size={16} />
                  Schedule
                </Link>
                <Link
                  to="/wire-harness-timeline"
                  className={isActive('/wire-harness-timeline') ? 'active' : ''}
                  onClick={() => setWireHarnessOpen(false)}
                >
                  <Calendar size={16} />
                  Timeline
                </Link>
                {user && (user.role?.toUpperCase() === 'ADMIN' || user.role?.toUpperCase() === 'MANAGER') && (
                  <Link
                    to="/work-order-move"
                    className={isActive('/work-order-move') ? 'active' : ''}
                    onClick={() => setWireHarnessOpen(false)}
                  >
                    <Move size={16} />
                    Move Work Orders
                  </Link>
                )}
              </div>
            )}
          </div>
          
          {canAccessSettings && (
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
                  <Link 
                    to="/cetec-import" 
                    className={isActive('/cetec-import') ? 'active' : ''}
                    onClick={() => setSettingsOpen(false)}
                  >
                    <Database size={16} />
                    Cetec Import Test
                  </Link>
                  <Link 
                    to="/cetec-sync-report" 
                    className={isActive('/cetec-sync-report') ? 'active' : ''}
                    onClick={() => setSettingsOpen(false)}
                  >
                    <RefreshCw size={16} />
                    Cetec Sync Report
                  </Link>
                  <Link 
                    to="/prodline-explorer" 
                    className={isActive('/prodline-explorer') ? 'active' : ''}
                    onClick={() => setSettingsOpen(false)}
                  >
                    <Database size={16} />
                    Prod Line Schedule Explorer
                  </Link>
                  <Link
                    to="/metabase-explorer"
                    className={isSettingsActive && location.pathname === '/metabase-explorer' ? 'active' : ''}
                    onClick={() => setSettingsOpen(false)}
                  >
                    <Database size={16} />
                    Metabase Dashboard Explorer
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
                      <Link 
                        to="/resolution-types" 
                        className={isActive('/resolution-types') ? 'active' : ''}
                        onClick={() => setSettingsOpen(false)}
                      >
                        <CheckCircle size={16} />
                        Resolution Types
                      </Link>
                      <div className="nav-dropdown-divider" />
                    </>
                  )}
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
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link
            to="/change-password"
            className={`btn btn-sm ${location.pathname === '/change-password' ? 'btn-primary' : 'btn-secondary'}`}
            title="Change Password"
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <Key size={14} />
            Password
          </Link>
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
          <Route path="/progress" element={<ProtectedRoute><ProgressDashboard /></ProtectedRoute>} />
          <Route path="/wire-harness-dashboard" element={<ProtectedRoute><WireHarnessDashboard /></ProtectedRoute>} />
          <Route path="/wire-harness" element={<ProtectedRoute><WireHarnessSchedule /></ProtectedRoute>} />
          <Route path="/wire-harness/schedule" element={<ProtectedRoute><WireHarnessSchedule /></ProtectedRoute>} />
          <Route path="/wire-harness-timeline" element={<ProtectedRoute><WireHarnessTimeline /></ProtectedRoute>} />
          <Route path="/wire-harness/timeline" element={<ProtectedRoute><WireHarnessTimeline /></ProtectedRoute>} />
          <Route path="/work-order-move" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><WorkOrderMove /></ProtectedRoute>} />
          <Route path="/capacity" element={<ProtectedRoute allowedRoles={SETTINGS_ROLES}><CapacityCalendar /></ProtectedRoute>} />
          <Route path="/shifts" element={<ProtectedRoute allowedRoles={SETTINGS_ROLES}><ShiftConfiguration /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute allowedRoles={['admin']}><UserManagement /></ProtectedRoute>} />
          <Route path="/statuses" element={<ProtectedRoute allowedRoles={['admin']}><StatusManagement /></ProtectedRoute>} />
          <Route path="/issue-types" element={<ProtectedRoute allowedRoles={['admin']}><IssueTypeManagement /></ProtectedRoute>} />
          <Route path="/resolution-types" element={<ProtectedRoute allowedRoles={['admin']}><ResolutionTypeManagement /></ProtectedRoute>} />
          <Route path="/cetec-import" element={<ProtectedRoute allowedRoles={SETTINGS_ROLES}><CetecImport /></ProtectedRoute>} />
          <Route path="/cetec-sync-report" element={<ProtectedRoute allowedRoles={SETTINGS_ROLES}><CetecSyncReport /></ProtectedRoute>} />
          <Route path="/prodline-explorer" element={<ProtectedRoute allowedRoles={SETTINGS_ROLES}><ProdlineScheduleExplorer /></ProtectedRoute>} />
          <Route path="/metabase-explorer" element={<ProtectedRoute allowedRoles={SETTINGS_ROLES}><MetabaseDashboardExplorer /></ProtectedRoute>} />
          <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute allowedRoles={SETTINGS_ROLES}><SettingsPage /></ProtectedRoute>} />
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


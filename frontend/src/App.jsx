import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import { Home, Calendar, Settings, CheckCircle, List } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Schedule from './pages/Schedule'
import LineView from './pages/LineView'
import Completed from './pages/Completed'
import SettingsPage from './pages/SettingsPage'
import './App.css'

function Navigation() {
  const location = useLocation()
  
  const isActive = (path) => location.pathname === path
  
  return (
    <nav className="navbar">
      <div className="nav-container">
        <div className="nav-brand">
          <h1>SMT Scheduler</h1>
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
          <Link to="/lines" className={isActive('/lines') ? 'active' : ''}>
            <List size={18} />
            Line Views
          </Link>
          <Link to="/completed" className={isActive('/completed') ? 'active' : ''}>
            <CheckCircle size={18} />
            Completed
          </Link>
          <Link to="/settings" className={isActive('/settings') ? 'active' : ''}>
            <Settings size={18} />
            Settings
          </Link>
        </div>
      </div>
    </nav>
  )
}

function App() {
  return (
    <Router>
      <div className="app">
        <Navigation />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/lines" element={<LineView />} />
            <Route path="/lines/:lineId" element={<LineView />} />
            <Route path="/completed" element={<Completed />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App


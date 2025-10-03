import { useQuery } from '@tanstack/react-query'
import { getDashboard } from '../api'
import { AlertTriangle, CheckCircle, Clock, Package } from 'lucide-react'
import { format } from 'date-fns'

function PriorityBadge({ priority }) {
  const colors = {
    'Critical Mass': 'badge-danger',
    'Overclocked': 'badge-warning',
    'Factory Default': 'badge-info',
    'Trickle Charge': 'badge-secondary',
    'Power Down': 'badge-secondary'
  }
  return <span className={`badge ${colors[priority] || 'badge-secondary'}`}>{priority}</span>
}

function StatusBadge({ status, statusName, statusColor }) {
  // Use new status system if available, fallback to legacy
  const name = statusName || (status ? status : 'Unknown')
  const color = statusColor
  
  // Legacy fallback colors if no color provided
  const legacyColors = {
    'Running': 'badge-success',
    '2nd Side Running': 'badge-success',
    'Clear to Build': 'badge-info',
    'Clear to Build *': 'badge-info',
    'On Hold': 'badge-warning',
    'Program/Stencil': 'badge-secondary'
  }
  
  if (color) {
    return (
      <span 
        className="badge"
        style={{ background: color, color: 'white', padding: '0.25rem 0.5rem' }}
      >
        {name}
      </span>
    )
  }
  
  return <span className={`badge ${legacyColors[name] || 'badge-secondary'}`}>{name}</span>
}

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  if (isLoading) {
    return <div className="container loading">Loading dashboard...</div>
  }

  if (error) {
    return (
      <div className="container">
        <div className="card" style={{ background: '#f8d7da', color: '#721c24' }}>
          Error loading dashboard: {error.message}
        </div>
      </div>
    )
  }

  const dashboard = data.data
  const trolleyStatus = dashboard.trolley_status

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Production Dashboard</h1>
        <p className="page-description">Real-time overview of all SMT production lines</p>
      </div>

      {/* Stats Overview */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Trolleys In Use</div>
          <div className={`stat-value ${trolleyStatus.warning ? 'warning' : ''} ${trolleyStatus.exceeds ? 'danger' : ''}`}>
            {trolleyStatus.current_in_use} / {trolleyStatus.limit}
          </div>
          <div className="stat-sublabel">{trolleyStatus.available} available</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Active Lines</div>
          <div className="stat-value success">
            {dashboard.lines.filter(l => l.total_jobs > 0).length}
          </div>
          <div className="stat-sublabel">of {dashboard.lines.length} total</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">High Priority Jobs</div>
          <div className="stat-value">{dashboard.high_priority_jobs.length}</div>
          <div className="stat-sublabel">require immediate attention</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Upcoming Deadlines</div>
          <div className="stat-value">{dashboard.upcoming_deadlines.length}</div>
          <div className="stat-sublabel">in next 7 days</div>
        </div>
      </div>

      {/* Trolley Warning */}
      {trolleyStatus.warning && (
        <div className="card" style={{ background: '#fff3cd', borderLeft: '4px solid #ffc107' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={20} color="#856404" />
            <strong style={{ color: '#856404' }}>Trolley Capacity Warning:</strong>
            <span style={{ color: '#856404' }}>
              {trolleyStatus.current_in_use} of {trolleyStatus.limit} trolleys in use. 
              Only {trolleyStatus.available} available.
            </span>
          </div>
        </div>
      )}

      {/* Line Status Grid */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Production Lines</h2>
        </div>
        <div className="grid grid-cols-2">
          {dashboard.lines.map((line) => (
            <div key={line.line.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {line.line.name}
                  </h3>
                  {line.line.special_customer_name && (
                    <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                      {line.line.special_customer_name} Dedicated
                    </span>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{line.total_jobs}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Jobs Queued</div>
                </div>
              </div>

                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
                <div>
                  <Package size={16} style={{ display: 'inline', marginRight: '0.25rem' }} />
                  {line.trolleys_in_use} trolleys
                </div>
                <div>
                  <Clock size={16} style={{ display: 'inline', marginRight: '0.25rem' }} />
                  {line.line.hours_per_day}h/day
                </div>
                {line.completion_date && (
                  <div style={{ fontWeight: 600, color: 'var(--primary)' }}>
                    Completes: {format(new Date(line.completion_date), 'MMM d')}
                  </div>
                )}
              </div>

              {line.work_orders.length > 0 ? (
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                    NEXT UP:
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: '4px' }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                      {line.work_orders[0].customer} - {line.work_orders[0].assembly}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      WO: {line.work_orders[0].wo_number} • Qty: {line.work_orders[0].quantity}
                    </div>
                    <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                      <StatusBadge status={line.work_orders[0].status} statusName={line.work_orders[0].status_name} statusColor={line.work_orders[0].status_color} />
                      <PriorityBadge priority={line.work_orders[0].priority} />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  No jobs scheduled
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* High Priority Jobs */}
      {dashboard.high_priority_jobs.length > 0 && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">High Priority Jobs</h2>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Assembly</th>
                  <th>WO Number</th>
                  <th>Priority</th>
                  <th>Line</th>
                  <th>Ship Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.high_priority_jobs.map((wo) => (
                  <tr key={wo.id}>
                    <td>{wo.customer}</td>
                    <td>{wo.assembly} {wo.revision}</td>
                    <td><code>{wo.wo_number}</code></td>
                    <td><PriorityBadge priority={wo.priority} /></td>
                    <td>{wo.line?.name || 'Unassigned'}</td>
                    <td>{format(new Date(wo.actual_ship_date), 'MMM d, yyyy')}</td>
                    <td><StatusBadge status={wo.status} statusName={wo.status_name} statusColor={wo.status_color} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upcoming Deadlines */}
      {dashboard.upcoming_deadlines.length > 0 && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Upcoming Deadlines (Next 7 Days)</h2>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Assembly</th>
                  <th>WO Number</th>
                  <th>Ship Date</th>
                  <th>Min Start</th>
                  <th>Line</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.upcoming_deadlines.map((wo) => (
                  <tr key={wo.id}>
                    <td>{wo.customer}</td>
                    <td>{wo.assembly} {wo.revision}</td>
                    <td><code>{wo.wo_number}</code></td>
                    <td>{format(new Date(wo.actual_ship_date), 'MMM d, yyyy')}</td>
                    <td>{format(new Date(wo.min_start_date), 'MMM d, yyyy')}</td>
                    <td>{wo.line?.name || 'Unassigned'}</td>
                    <td><StatusBadge status={wo.status} statusName={wo.status_name} statusColor={wo.status_color} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

